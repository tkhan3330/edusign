"use strict";
const crypto = require("crypto");
const { verifyPassword, isPasswordConfigured } = require("./config");

// ═══════════════════════════════════════════════════════════
//  EduSign — Session-based Authentication
//  In-memory session store with automatic expiry cleanup.
//  No external dependencies (Redis, DB, etc.) needed.
// ═══════════════════════════════════════════════════════════

const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

/**
 * Create a new authenticated session.
 * @param {boolean} rememberMe - If true, session lasts 7 days; otherwise 24h.
 * @param {number} expiryHours - Override expiry from config.
 * @returns {{ token: string, expiresAt: number }}
 */
function createSession(rememberMe = false, expiryHours = 168) {
  const hours = rememberMe ? expiryHours : 24;
  const token = generateToken();
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  sessions.set(token, { expiresAt, createdAt: Date.now() });
  return { token, expiresAt };
}

function validateSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function destroySession(token) {
  sessions.delete(token);
}

function getActiveSessionCount() {
  // Clean expired first
  const now = Date.now();
  for (const [t, s] of sessions) {
    if (now > s.expiresAt) sessions.delete(t);
  }
  return sessions.size;
}

// ── Periodic cleanup (every hour) ─────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
}, 60 * 60 * 1000);

// ── Express Middleware ────────────────────────────────────
const OPEN_PATHS = ["/api/health", "/api/auth/login", "/api/setup"];

function requireAuth(req, res, next) {
  // Always allow open paths
  if (OPEN_PATHS.some((p) => req.path.startsWith(p))) return next();

  // If no password is configured at all, skip auth (legacy/open mode)
  if (!isPasswordConfigured()) return next();

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !validateSession(token)) {
    return res.status(401).json({
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
  }

  next();
}

// ── Auth route handlers (to be mounted in server.js) ──────
function loginHandler(req, res) {
  const { password, rememberMe } = req.body;

  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  if (!isPasswordConfigured()) {
    // No password set — auto-login (shouldn't normally reach here)
    const session = createSession(true);
    return res.json({ success: true, ...session });
  }

  if (!verifyPassword(password)) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const session = createSession(!!rememberMe);
  res.json({ success: true, ...session });
}

function checkHandler(req, res) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!isPasswordConfigured()) {
    return res.json({ authenticated: true, passwordRequired: false });
  }

  if (!token || !validateSession(token)) {
    return res.json({ authenticated: false, passwordRequired: true });
  }

  res.json({ authenticated: true, passwordRequired: true });
}

function logoutHandler(req, res) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) destroySession(token);
  res.json({ success: true });
}

module.exports = {
  createSession,
  validateSession,
  destroySession,
  getActiveSessionCount,
  requireAuth,
  loginHandler,
  checkHandler,
  logoutHandler,
};
