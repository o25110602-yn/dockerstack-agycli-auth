'use strict';

/**
 * sessionManager.js
 * In-memory store of active login sessions + helpers to push SSE events.
 *
 * Each session:
 *   {
 *     sessionId, email, fifoPath, childProcess, sseRes,
 *     status: 'starting' | 'waiting_url' | 'url_ready' | 'waiting_code' | 'success' | 'error',
 *     authUrl, createdAt, cleanupTimer,
 *     stdoutBuf, stderrBuf, loginLogs, loginSnapshot,
 *   }
 */

const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || '600000', 10);

const sessions = new Map();

const log = {
  info: (msg) => console.log(`ℹ  [SESSION] ${msg}`),
  warn: (msg) => console.warn(`⚠  [SESSION] ${msg}`),
  err:  (msg) => console.error(`✗  [SESSION] ${msg}`),
  ok:   (msg) => console.log(`✓  [SESSION] ${msg}`),
};

function createSession({ sessionId, email }) {
  if (sessions.has(sessionId)) {
    throw new Error(`Session ${sessionId} already exists`);
  }
  const fifoPath = `/tmp/agy-code-${sessionId}`;
  const session = {
    sessionId,
    email,
    fifoPath,
    childProcess: null,
    sseRes: null,
    status: 'starting',
    authUrl: null,
    createdAt: Date.now(),
    cleanupTimer: null,
    stdoutBuf: '',
    stderrBuf: '',
    loginLogs: [],
    loginSnapshot: null,
  };
  // Auto-cleanup after timeout
  session.cleanupTimer = setTimeout(() => {
    log.warn(`Session ${sessionId} timed out after ${SESSION_TIMEOUT_MS}ms; destroying.`);
    destroySession(sessionId, { reason: 'timeout' });
  }, SESSION_TIMEOUT_MS);

  sessions.set(sessionId, session);
  log.ok(`Created session ${sessionId} for ${email}`);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function updateStatus(sessionId, status, extra = {}) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  s.status = status;
  Object.assign(s, extra);
  emitSSE(sessionId, { type: 'status', stage: status, ...extra });
  return s;
}

function appendLog(sessionId, { level = 'info', message, details = null } = {}) {
  const s = sessions.get(sessionId);
  if (!s || !message) return null;

  const event = {
    type: 'auth_log',
    id: `${Date.now()}-${s.loginLogs.length}`,
    at: Date.now(),
    level,
    message,
    details,
  };

  s.loginLogs.push(event);
  if (s.loginLogs.length > 200) s.loginLogs.shift();
  emitSSE(sessionId, event);
  return event;
}

function setLoginSnapshot(sessionId, snapshot) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  s.loginSnapshot = snapshot;
  emitSSE(sessionId, { type: 'login_snapshot', snapshot });
  return snapshot;
}

/**
 * Push an SSE event to a session's connected client.
 * No-op if there is no SSE client attached yet.
 */
function emitSSE(sessionId, payload) {
  const s = sessions.get(sessionId);
  if (!s || !s.sseRes) return false;
  try {
    s.sseRes.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch (err) {
    log.err(`Failed to emit SSE for ${sessionId}: ${err.message}`);
    return false;
  }
}

function attachSSE(sessionId, res) {
  const s = sessions.get(sessionId);
  if (!s) return false;
  s.sseRes = res;
  // Replay last known status so a late-connecting client catches up.
  emitSSE(sessionId, { type: 'status', stage: s.status });
  if (s.authUrl) {
    emitSSE(sessionId, { type: 'auth_url', url: s.authUrl });
  }
  for (const event of s.loginLogs) {
    emitSSE(sessionId, event);
  }
  if (s.loginSnapshot) {
    emitSSE(sessionId, { type: 'login_snapshot', snapshot: s.loginSnapshot });
  }
  return true;
}

function detachSSE(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.sseRes = null;
}

function destroySession(sessionId, { reason } = {}) {
  const s = sessions.get(sessionId);
  if (!s) return;
  if (s.cleanupTimer) clearTimeout(s.cleanupTimer);
  if (s.childProcess) {
    try { s.childProcess.kill('SIGTERM'); } catch (_) {}
  }
  if (s.sseRes) {
    try {
      s.sseRes.write(`data: ${JSON.stringify({ type: 'closed', reason: reason || 'destroyed' })}\n\n`);
      s.sseRes.end();
    } catch (_) {}
  }
  sessions.delete(sessionId);
  log.ok(`Destroyed session ${sessionId} (reason: ${reason || 'normal'})`);
}

function listSessions() {
  return Array.from(sessions.values()).map((s) => ({
    sessionId: s.sessionId,
    email: s.email,
    status: s.status,
    createdAt: s.createdAt,
  }));
}

module.exports = {
  SESSION_TIMEOUT_MS,
  createSession,
  getSession,
  updateStatus,
  appendLog,
  setLoginSnapshot,
  emitSSE,
  attachSSE,
  detachSSE,
  destroySession,
  listSessions,
};
