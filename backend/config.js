"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ── Config file path ──────────────────────────────────────
const CONFIG_PATH = path.resolve(
  process.env.CONFIG_PATH || path.join(__dirname, "config.json")
);

const CREDENTIALS_PATH = path.resolve(
  __dirname,
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || "./credentials/service-account.json"
);

// ── Default config structure ──────────────────────────────
const DEFAULT_CONFIG = {
  orgName: "EduSign",
  passwordHash: "",
  passwordSalt: "",
  folders: [],
  sessionExpiryHours: 168, // 7 days
  setupCompleted: false,
  setupDate: null,
};

// ── Read / Write ──────────────────────────────────────────
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error("⚠️ Error reading config.json:", e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function writeConfig(config) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

// ── Credential detection ─────────────────────────────────
function hasGoogleCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return true;
  return fs.existsSync(CREDENTIALS_PATH);
}

function getCredentialsEmail() {
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return creds.client_email || null;
    }
    if (fs.existsSync(CREDENTIALS_PATH)) {
      const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
      return creds.client_email || null;
    }
  } catch { /* ignore */ }
  return null;
}

// ── Setup status ─────────────────────────────────────────
function isConfigured() {
  const config = readConfig();
  if (config.setupCompleted) return true;
  // Fallback: env vars present = configured (legacy mode)
  if ((process.env.PARENT_FOLDER_ID || process.env.PARENT_FOLDER_IDS) && hasGoogleCredentials()) {
    return true;
  }
  return false;
}

// ── Folder sources (multi-folder) ────────────────────────
function getFolderSources() {
  const config = readConfig();
  if (config.folders && config.folders.length > 0) {
    return config.folders;
  }
  // Fallback: env vars
  const envIds = process.env.PARENT_FOLDER_IDS || process.env.PARENT_FOLDER_ID || "";
  return envIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id, i) => ({
      id,
      label: i === 0 ? "Default" : `Source ${i + 1}`,
    }));
}

function addFolderSource(id, label) {
  const config = readConfig();
  if (config.folders.some((f) => f.id === id)) {
    throw new Error("Folder source already exists");
  }
  config.folders.push({ id, label, addedAt: new Date().toISOString() });
  writeConfig(config);
  return config.folders;
}

function removeFolderSource(id) {
  const config = readConfig();
  config.folders = config.folders.filter((f) => f.id !== id);
  writeConfig(config);
  return config.folders;
}

// ── Password hashing (scrypt — built into Node, no deps) ─
function generateSalt() {
  return crypto.randomBytes(32).toString("hex");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password) {
  const config = readConfig();
  // Check config.json first
  if (config.passwordHash && config.passwordSalt) {
    const hash = hashPassword(password, config.passwordSalt);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(hash, "hex"),
        Buffer.from(config.passwordHash, "hex")
      );
    } catch {
      return false;
    }
  }
  // Fallback: env var
  if (process.env.ADMIN_PASSWORD) {
    // Constant-time comparison for env var too
    const a = Buffer.from(password);
    const b = Buffer.from(process.env.ADMIN_PASSWORD);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
  // No password configured = no auth required
  return false;
}

function isPasswordConfigured() {
  const config = readConfig();
  if (config.passwordHash) return true;
  if (process.env.ADMIN_PASSWORD) return true;
  return false;
}

function setPassword(newPassword) {
  const config = readConfig();
  const salt = generateSalt();
  config.passwordHash = hashPassword(newPassword, salt);
  config.passwordSalt = salt;
  writeConfig(config);
}

// ── Public config (safe to send to frontend) ─────────────
function getPublicConfig() {
  const config = readConfig();
  return {
    orgName: config.orgName,
    folders: config.folders,
    setupCompleted: config.setupCompleted,
    setupDate: config.setupDate,
    hasPassword: isPasswordConfigured(),
    hasCredentials: hasGoogleCredentials(),
    credentialsEmail: getCredentialsEmail(),
  };
}

module.exports = {
  readConfig,
  writeConfig,
  isConfigured,
  hasGoogleCredentials,
  getCredentialsEmail,
  getFolderSources,
  addFolderSource,
  removeFolderSource,
  hashPassword,
  generateSalt,
  verifyPassword,
  isPasswordConfigured,
  setPassword,
  getPublicConfig,
  CONFIG_PATH,
  CREDENTIALS_PATH,
};
