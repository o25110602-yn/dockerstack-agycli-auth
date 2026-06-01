'use strict';

/**
 * sanitize.js
 * Convert an email to a Firebase-safe key.
 * Firebase RTDB keys cannot contain: . # $ [ ] / @ (we also strip @ for clarity)
 */

function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase().replace(/[.#$\[\]@/]/g, '_');
}

/**
 * Basic email format check. Not RFC-perfect — sufficient to reject obvious garbage.
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate sessionId: alphanumeric, hyphens, underscores, 8-128 chars.
 * Accepts UUIDv4 from crypto.randomUUID().
 */
function isValidSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  return /^[A-Za-z0-9_-]{8,128}$/.test(sessionId);
}

module.exports = { sanitizeEmail, isValidEmail, isValidSessionId };
