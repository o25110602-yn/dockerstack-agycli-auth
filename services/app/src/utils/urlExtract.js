'use strict';

/**
 * urlExtract.js
 * Ported verbatim from wrapper.js → CONFIG.urlPatterns + addEmailHint + extractUrl.
 * Do NOT modify the regex set; the order matters (specific → fallback).
 */

const { URL } = require('url');

// Same 6 patterns as wrapper.js, in the same order.
const URL_PATTERNS = [
  /https?:\/\/\S+(?:auth|login|oauth|authorize|sso)\S*/i,
  /https?:\/\/\S+[?&](?:code_challenge|client_id|response_type)\S*/i,
  /Please (?:open|visit|go to|navigate to)[:\s]+(\S+)/i,
  /Authorization URL[:\s]+(\S+)/i,
  /Login URL[:\s]+(\S+)/i,
  /(https?:\/\/[^\s"'<>]+)/i, // fallback
];

/**
 * Extract the first valid http/https URL from a chunk of text.
 * Returns the URL string (canonicalised via WHATWG URL) or null.
 */
function extractUrl(text) {
  if (!text) return null;
  for (const pattern of URL_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const candidate = (match[1] || match[0] || '').trim();
    if (!candidate) continue;
    try {
      const u = new URL(candidate);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return u.toString();
      }
    } catch (_) {
      // not a valid URL, try next pattern
    }
  }
  return null;
}

/**
 * Append `login_hint=<email>` to an auth URL when not already present.
 * Mirrors wrapper.js#addEmailHint exactly.
 */
function addEmailHint(rawUrl, email) {
  if (!rawUrl || !email) return rawUrl;
  try {
    const u = new URL(rawUrl);
    if (!u.searchParams.has('login_hint') && !u.searchParams.has('email')) {
      u.searchParams.set('login_hint', email);
    }
    return u.toString();
  } catch (_) {
    return rawUrl;
  }
}

module.exports = {
  URL_PATTERNS,
  extractUrl,
  addEmailHint,
};
