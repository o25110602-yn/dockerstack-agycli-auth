"use strict";

/**
 * Express entry point.
 * Boots HTTP server + serves static frontend at /.
 */

require("dotenv").config();

const path = require("path");
const express = require("express");

const loginRouter = require("./routes/login");
const tokensRouter = require("./routes/tokens");
const firebase = require("./services/firebaseService");
const docker = require("./services/dockerService");

const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();
app.use(express.json({ limit: "256kb" }));

// Health check — reports docker + firebase status with actionable hints
app.get("/health", async (_req, res) => {
  const dockerStatus = await docker.checkDockerEnv();
  const firebaseReady = firebase.isReady();
  const firebaseStatus = firebase.getConfigStatus();
  res.json({
    ok: dockerStatus.daemonOk && firebaseReady,
    firebase: {
      ...firebaseStatus,
      ready: firebaseReady,
    },
    docker: dockerStatus,
    container: process.env.CONTAINER_NAME || "agy-dev",
    timestamp: Date.now(),
  });
});

// API
app.use("/api/login", loginRouter);
app.use("/api/tokens", tokensRouter);

app.get("/api/deploy-info", (req, res) => {
  const envs = process.env;
  const runnerKeys = Object.keys(envs).filter(
    k => k.startsWith("_DOTENVRTDB_RUNNER_") || k.startsWith("CLOUDFLARED_TUNNEL_HOSTNAME_")
  );

  // Parse Repository (Org/Repo)
  let repository = envs._DOTENVRTDB_RUNNER_REPOSITORY || "";
  if (!repository && envs._DOTENVRTDB_RUNNER_WORKFLOW_FILE) {
    const parts = envs._DOTENVRTDB_RUNNER_WORKFLOW_FILE.split("/");
    if (parts.length >= 2) {
      repository = `${parts[0]}/${parts[1]}`;
    }
  }
  const [org, repo] = repository ? repository.split("/") : ["", ""];

  // Parse Commit
  const sha = envs._DOTENVRTDB_RUNNER_SHA || "";
  const commit = sha ? sha.substring(0, 7) : "";
  const commitUrl = (repository && sha) ? `https://github.com/${repository}/commit/${sha}` : "";

  // Parse Date
  const date = envs._DOTENVRTDB_RUNNER_DATE || envs._DOTENVRTDB_RUNNER_CREATED_AT || "";

  // Host: can be HOSTNAME or HOST
  const host = envs.HOSTNAME || envs.HOST || "";

  // Gather env vars
  const envVars = {};
  runnerKeys.forEach(k => {
    envVars[k] = envs[k];
  });

  res.json({
    deployInfo: {
      org: org || "N/A",
      repo: repo || "N/A",
      commit: commit || "N/A",
      commitUrl: commitUrl || "",
      date: date || "N/A",
      host: host || "N/A",
    },
    envVars,
  });
});

// Static frontend
const publicDir = path.resolve(__dirname, "..", "public");
app.use(express.static(publicDir));

// SPA fallback (excluding /api and SSE) — keep simple
app.get(/^\/(?!api|health).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Generic error handler
app.use((err, _req, res, _next) => {
  console.error("✗  [HTTP] Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal error" });
});

app.listen(PORT, async () => {
  console.log(`✓  [HTTP] agy-auth-webapp listening on http://0.0.0.0:${PORT}`);
  console.log(`ℹ  [HTTP] Frontend: http://localhost:${PORT}/`);
  console.log(`ℹ  [HTTP] Container: ${process.env.CONTAINER_NAME || "agy-dev"}`);

  // Preflight checks — warn early instead of failing on first request
  if (!firebase.isReady()) {
    const firebaseStatus = firebase.getConfigStatus();
    console.warn("⚠  [HTTP] Firebase not ready. Set FIREBASE_SERVICE_ACCOUNT_BASE64 or place service account JSON at FIREBASE_SERVICE_ACCOUNT_PATH.");
    if (firebaseStatus.configError) {
      console.warn(`⚠  [HTTP] Firebase config error: ${firebaseStatus.configError}`);
    } else {
      console.warn(`⚠  [HTTP] Expected service account source: ${firebaseStatus.serviceAccountPath || "FIREBASE_SERVICE_ACCOUNT_BASE64"}`);
    }
  }

  const dockerStatus = await docker.checkDockerEnv({ force: true });
  if (!dockerStatus.available) {
    console.error(`✗  [HTTP] Docker CLI not available: ${dockerStatus.error.hint}`);
  } else if (!dockerStatus.daemonOk) {
    console.error(`✗  [HTTP] Docker daemon not reachable: ${dockerStatus.error.hint}`);
  } else {
    console.log("✓  [HTTP] Docker daemon OK.");
  }
});
