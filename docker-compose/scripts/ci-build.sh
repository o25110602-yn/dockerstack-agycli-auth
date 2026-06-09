#!/usr/bin/env bash
# ================================================================
#  ci-build.sh — Build từng service với BuildKit cache, rồi up --no-build
#  - CACHE_TYPE=gha   → dùng GitHub Actions cache (type=gha)
#  - CACHE_TYPE=local → dùng local cache (type=local) cho Azure Cache@2
# ================================================================
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────
CACHE_TYPE="${CACHE_TYPE:-gha}"
LOCAL_CACHE_DIR="${LOCAL_CACHE_DIR:-$HOME/.buildx-cache}"
IMAGE_TAR="${IMAGE_TAR:-}"
COMPOSE_CMD="${COMPOSE_CMD:-bash docker-compose/scripts/dc.sh}"
PROJECT_NAME="${PROJECT_NAME:-myapp}"

# $DC = wrapper compose (dc.sh tự nạp .env + chọn profile)
DC() { $COMPOSE_CMD "$@"; }

command -v jq >/dev/null 2>&1 || { echo "❌ jq chưa được cài"; exit 1; }

echo "── ci-build.sh ──────────────────────────────────"
echo "  CACHE_TYPE : $CACHE_TYPE"
echo "  PROJECT    : $PROJECT_NAME"
[ "$CACHE_TYPE" = "local" ] && echo "  CACHE_DIR  : $LOCAL_CACHE_DIR"
[ -n "$IMAGE_TAR" ] && echo "  IMAGE_TAR  : $IMAGE_TAR"
echo "─────────────────────────────────────────────────"

# ── Lấy config JSON đã resolve (đã thay biến ${...}, đã có :local) ──
CONFIG_JSON="$(DC config --format json)"

# ── (tuỳ chọn) Nạp sẵn public images từ tar cache ─────────────
if [ -n "$IMAGE_TAR" ] && [ -f "$IMAGE_TAR" ]; then
  echo "==> Load public images từ cache: $IMAGE_TAR"
  docker load -i "$IMAGE_TAR" || true
fi

# ── Danh sách service CÓ build ────────────────────────────────
mapfile -t BUILD_SVCS < <(
  printf '%s' "$CONFIG_JSON" \
    | jq -r '.services | to_entries[] | select(.value.build != null) | .key'
)

if [ "${#BUILD_SVCS[@]}" -eq 0 ]; then
  echo "ℹ️  Không có service nào cần build."
else
  for svc in "${BUILD_SVCS[@]}"; do
    # ✅ FIX: lấy tag CHÍNH XÁC như compose sẽ dùng (đã resolve, có :local).
    #    Service không khai báo image: → dùng tên mặc định <project>-<svc>.
    #    Nhờ vậy tag build === tag up, không bao giờ lệch.
    img="$(printf '%s' "$CONFIG_JSON" | jq -r --arg s "$svc" '.services[$s].image // empty')"
    [ -z "$img" ] && img="${PROJECT_NAME}-${svc}"

    ctx="$(printf '%s' "$CONFIG_JSON"        | jq -r --arg s "$svc" '.services[$s].build.context // "."')"
    dockerfile="$(printf '%s' "$CONFIG_JSON" | jq -r --arg s "$svc" '.services[$s].build.dockerfile // "Dockerfile"')"

    # context từ `compose config` thường là absolute; dockerfile có thể tương đối.
    if [[ "$dockerfile" = /* ]]; then
      df="$dockerfile"
    else
      df="$ctx/$dockerfile"
    fi

    echo ""
    echo "==> Build [$svc] → $img"
    echo "    context   : $ctx"
    echo "    dockerfile: $df"

    CACHE_ARGS=()
    if [ "$CACHE_TYPE" = "gha" ]; then
      CACHE_ARGS+=(--cache-from "type=gha,scope=$svc")
      CACHE_ARGS+=(--cache-to   "type=gha,scope=$svc,mode=max")
    else
      mkdir -p "$LOCAL_CACHE_DIR/$svc" "${LOCAL_CACHE_DIR}-new/$svc"
      CACHE_ARGS+=(--cache-from "type=local,src=$LOCAL_CACHE_DIR/$svc")
      CACHE_ARGS+=(--cache-to   "type=local,dest=${LOCAL_CACHE_DIR}-new/$svc,mode=max")
    fi

    docker buildx build \
      --tag "$img" \
      --file "$df" \
      --provenance=false \
      --load \
      "${CACHE_ARGS[@]}" \
      "$ctx"
  done

  # Local cache rotation (tránh cache phình to vô hạn)
  if [ "$CACHE_TYPE" = "local" ] && [ -d "${LOCAL_CACHE_DIR}-new" ]; then
    rm -rf "$LOCAL_CACHE_DIR"
    mv "${LOCAL_CACHE_DIR}-new" "$LOCAL_CACHE_DIR"
  fi
fi

# ── Start toàn bộ stack, KHÔNG build lại (ảnh đã có sẵn) ───────
echo ""
echo "==> docker compose up -d --no-build"
DC up -d --no-build --remove-orphans

# ── (tuỳ chọn) Lưu public images vào tar cache cho lần sau ────
if [ -n "$IMAGE_TAR" ] && [ ! -f "$IMAGE_TAR" ]; then
  echo "==> Save public images vào cache: $IMAGE_TAR"
  mapfile -t PUB_IMAGES < <(
    printf '%s' "$CONFIG_JSON" \
      | jq -r '.services | to_entries[] | select(.value.build == null) | .value.image' \
      | sort -u
  )
  if [ "${#PUB_IMAGES[@]}" -gt 0 ]; then
    docker save "${PUB_IMAGES[@]}" -o "$IMAGE_TAR" || true
  fi
fi

echo "✅ ci-build.sh hoàn tất."