#!/usr/bin/env bash
# ================================================================
#  ci-build.sh — CI helper: build 1 lần + deploy
#
#  - Đọc cấu hình compose đã resolve (theo đúng profiles đang bật).
#  - Build MỌI service có "build:" bằng BuildKit cache (gha hoặc local),
#    --load vào docker với ĐÚNG tag mà compose mong đợi.
#  - Sau đó deploy bằng `dc.sh up --no-build` (không build lại lần 2).
#    → Nếu có service build nào thiếu image: name, tự fallback về --build.
#  - Tuỳ chọn: save/load image công khai (non-build) để cache trên runner.
#
#  Env:
#    CACHE_TYPE       = gha | local        (mặc định: gha)
#    LOCAL_CACHE_DIR  = thư mục cache khi type=local (mặc định: $HOME/.buildx-cache)
#    IMAGE_TAR        = đường dẫn tarball để save/load image công khai (tuỳ chọn)
#    COMPOSE_CMD      = lệnh gọi wrapper compose (mặc định: bash docker-compose/scripts/dc.sh)
# ================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DC="${COMPOSE_CMD:-bash docker-compose/scripts/dc.sh}"
CACHE_TYPE="${CACHE_TYPE:-gha}"
LOCAL_CACHE_DIR="${LOCAL_CACHE_DIR:-$HOME/.buildx-cache}"

command -v jq >/dev/null 2>&1 || { echo "❌ Thiếu 'jq' trên runner."; exit 1; }

echo "==> Resolve compose config (CACHE_TYPE=$CACHE_TYPE)"
CONFIG_JSON="$($DC config --format json)"

# ── (1) Nạp image công khai từ cache nếu có ───────────────────
if [ -n "${IMAGE_TAR:-}" ] && [ -f "$IMAGE_TAR" ]; then
  echo "==> Loading cached public images: $IMAGE_TAR"
  docker load -i "$IMAGE_TAR" || true
fi

# ── (2) Lấy danh sách service có build: ───────────────────────
mapfile -t BUILD_ROWS < <(printf '%s' "$CONFIG_JSON" | jq -r '
  .services | to_entries[]
  | select(.value.build != null)
  | [ .key,
      (.value.image // ""),
      (.value.build.context // "."),
      (.value.build.dockerfile // "Dockerfile") ] | @tsv')

ALL_TAGGED=1
NEW_CACHE_DIR="${LOCAL_CACHE_DIR}-new"
[ "$CACHE_TYPE" = "local" ] && mkdir -p "$LOCAL_CACHE_DIR" "$NEW_CACHE_DIR"

for row in "${BUILD_ROWS[@]:-}"; do
  [ -z "$row" ] && continue
  IFS=$'\t' read -r svc image ctx dockerfile <<< "$row"

  if [ -z "$image" ]; then
    echo "⚠️  Service '$svc' không có image: → để compose tự build (fallback --build)."
    ALL_TAGGED=0
    continue
  fi

  # Resolve đường dẫn Dockerfile
  if [[ "$dockerfile" = /* ]]; then df="$dockerfile"; else df="$ctx/$dockerfile"; fi

  echo "==> Build [$svc] → $image"
  if [ "$CACHE_TYPE" = "local" ]; then
    docker buildx build \
      --file "$df" --tag "$image" \
      --cache-from "type=local,src=${LOCAL_CACHE_DIR}/${svc}" \
      --cache-to   "type=local,dest=${NEW_CACHE_DIR}/${svc},mode=max" \
      --provenance=false --load "$ctx"
  else
    docker buildx build \
      --file "$df" --tag "$image" \
      --cache-from "type=gha,scope=${svc}" \
      --cache-to   "type=gha,scope=${svc},mode=max" \
      --provenance=false --load "$ctx"
  fi
done

# Xoay vòng local cache (tránh phình to)
if [ "$CACHE_TYPE" = "local" ] && [ -d "$NEW_CACHE_DIR" ]; then
  rm -rf "$LOCAL_CACHE_DIR"
  mv "$NEW_CACHE_DIR" "$LOCAL_CACHE_DIR"
fi

# ── (3) Deploy ────────────────────────────────────────────────
if [ "$ALL_TAGGED" = "1" ]; then
  echo "==> Tất cả service build đã có sẵn image → up --no-build"
  $DC up -d --no-build --remove-orphans
else
  echo "==> Có service chưa pre-build → up --build (an toàn)"
  $DC up -d --build --remove-orphans
fi

# ── (4) Save image công khai cho lần sau (chỉ khi chưa có tar) ─
if [ -n "${IMAGE_TAR:-}" ] && [ ! -f "$IMAGE_TAR" ]; then
  echo "==> Saving public images → $IMAGE_TAR"
  mapfile -t PUB_IMAGES < <(printf '%s' "$CONFIG_JSON" | jq -r '
    .services | to_entries[]
    | select(.value.build == null)
    | .value.image' | grep -v '^$' | sort -u || true)
  if [ "${#PUB_IMAGES[@]:-0}" -gt 0 ]; then
    mkdir -p "$(dirname "$IMAGE_TAR")"
    docker save "${PUB_IMAGES[@]}" -o "$IMAGE_TAR" || true
  fi
fi

echo "✅ ci-build.sh done."