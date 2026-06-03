#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT_DIR = path.resolve(__dirname, "../..");

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const idx = s.indexOf("=");
    const key = s.slice(0, idx).trim();
    let value = s.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
}

const envPath = path.resolve(ROOT_DIR, ".env");
const envExamplePath = path.resolve(ROOT_DIR, ".env.example");

const env = {
  ...parseEnvFile(envExamplePath),
  ...parseEnvFile(envPath)
};

// 1. Resolve host settings.json path
let settingsPathRaw = env.AGYCLI_SETTINGS_JSON_PATH || "~/.gemini/antigravity-cli/settings.json";
let hostSettingsPath = settingsPathRaw;
if (hostSettingsPath.startsWith("~")) {
  hostSettingsPath = path.join(os.homedir(), hostSettingsPath.slice(1));
} else {
  hostSettingsPath = path.resolve(ROOT_DIR, hostSettingsPath);
}

// 2. Resolve container agy-dev settings.json path on host
const volumeRootRaw = env.DOCKER_VOLUMES_ROOT || "./.docker-volumes";
const volumeRoot = path.resolve(ROOT_DIR, volumeRootRaw);
const containerSettingsPath = path.join(volumeRoot, "agy-dev/gemini/antigravity-cli/settings.json");

const settingsContent = `{
  // ── Giao diện ──────────────────────────────────────────────────
  // colorScheme: "terminal" | "dark" | "light" | "solarized dark" | "solarized light"
  //              "colorblind-friendly dark" | "colorblind-friendly light" | "tokyo night"
  // "terminal" = dùng màu sẵn có của terminal, không override gì cả → skip màn hình chọn
  "colorScheme": "terminal",

  // renderingMode: "alt-screen" (full-screen TUI) | "inline" (stream vào history terminal)
  "renderingMode": "alt-screen",

  // ── Quyền thực thi (YOLO / fine-grained) ──────────────────────
  // Cách 1 — Toàn bộ tự approve (dùng khi chạy trong sandbox an toàn):
  //   Tương đương flag \`agy --dangerously-skip-permissions\`
  "autoApprove": "all",
  //
  // Cách 2 — Whitelist từng lệnh/path (khuyến nghị cho production):
  "permissions": {
    "allow": [
      // Cho phép toàn bộ lệnh git
      "command(git)",
      // Cho phép npm/node
      "command(npm)",
      "command(node)",
      "command(npx)",
      // Cho phép đọc/ghi trong thư mục làm việc
      "read_file(**)",
      "write_file(**)",
      "edit_file(**)"
      // Ví dụ thêm path cụ thể:
      // "read_file(/workspace)",
      // "command(python3)"
    ],
    "deny": [
      // Chặn các lệnh nguy hiểm
      "command(rm -rf /)",
      "command(sudo rm)",
      "command(mkfs)",
      "command(dd)"
    ]
  },

  // ── Model ──────────────────────────────────────────────────────
  // Model mặc định khi khởi động. Có thể đổi trong session bằng /model
  // Ví dụ: "gemini-3-5-flash" | "gemini-3-pro" | "claude-opus-4-6" | ...
  // Để trống = dùng default của CLI (Gemini 3.5 Flash Medium)
  // "model": "gemini-3-5-flash",

  // ── Workspace & project discovery ─────────────────────────────
  // Cho phép truy cập file ngoài workspace hiện tại
  "allowNonWorkspaceAccess": true,

  // ── Telemetry ─────────────────────────────────────────────────
  // false = tắt gửi dữ liệu usage về Google
  "enableTelemetry": false,

  // ── Sandbox (Terminal Sandbox) ────────────────────────────────
  // Bật sandbox OS-level khi AI thực thi shell commands:
  //   Linux  → nsjail
  //   macOS  → sandbox-exec
  // Nên bật nếu chạy agy --dangerously-skip-permissions
  // "sandbox": true,

  // ── LaTeX rendering ───────────────────────────────────────────
  // false = tắt render công thức LaTeX trong terminal (dùng khi terminal không hỗ trợ)
  // Tương đương env: AGY_CLI_DISABLE_LATEX=1
  // "enableLatex": false,

  // ── Account info header ───────────────────────────────────────
  // Ẩn email và plan tier khỏi header của CLI
  // Tương đương env: AGY_CLI_HIDE_ACCOUNT_INFO=1
  // "hideAccountInfo": false,

  // ── Subagents ────────────────────────────────────────────────
  // Giới hạn số subagent chạy song song (mặc định không giới hạn)
  // "maxSubagents": 3,

  // ── Custom status line ────────────────────────────────────────
  // Script nhận JSON metadata (CWD, model, token usage, state...) để tạo status bar
  // "statusLineScript": "/path/to/your/status-script.sh",

  // ── MCP Servers ───────────────────────────────────────────────
  // Khai báo MCP servers để dùng tools bên ngoài
  // "mcpServers": {
  //   "my-server": {
  //     "command": "node",
  //     "args": ["/path/to/mcp-server.js"],
  //     "env": {}
  //   }
  // }
}
`;

function ensureDirAndWrite(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, "utf8");
      console.log(`✅ Created agy CLI settings file at: ${filePath}`);
    } else {
      console.log(`ℹ️ agy CLI settings file already exists at: ${filePath} (skipped)`);
    }
  } catch (err) {
    console.error(`❌ Error writing settings file at ${filePath}: ${err.message}`);
  }
}

console.log("⚙️ Checking agy CLI configurations...");
ensureDirAndWrite(hostSettingsPath, settingsContent);
ensureDirAndWrite(containerSettingsPath, settingsContent);
