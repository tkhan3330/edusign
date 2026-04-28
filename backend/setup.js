"use strict";
const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const {
  readConfig,
  writeConfig,
  isConfigured,
  hasGoogleCredentials,
  getCredentialsEmail,
  hashPassword,
  generateSalt,
  CREDENTIALS_PATH,
} = require("./config");
const { createSession } = require("./auth");

// ═══════════════════════════════════════════════════════════
//  EduSign — First-Boot Setup Wizard API
//  These routes are ONLY accessible when the system is not
//  yet configured. After setup completes, they return 403.
// ═══════════════════════════════════════════════════════════

const router = express.Router();

// Guard: block setup routes if already configured
router.use((req, res, next) => {
  // Always allow status check
  if (req.path === "/status") return next();
  if (isConfigured()) {
    return res.status(403).json({
      error: "System is already configured. Use admin panel to modify settings.",
    });
  }
  next();
});

// ── GET /api/setup/status ─────────────────────────────────
router.get("/status", (_req, res) => {
  const hasCreds = hasGoogleCredentials();
  res.json({
    configured: isConfigured(),
    hasCredentials: hasCreds,
    credentialsEmail: hasCreds ? getCredentialsEmail() : null,
  });
});

// ── POST /api/setup/validate-credentials ──────────────────
// Accepts service account JSON, validates it, saves to file.
router.post("/validate-credentials", async (req, res) => {
  try {
    const { credentialsJson } = req.body;
    if (!credentialsJson) {
      return res.status(400).json({ error: "Service account JSON is required" });
    }

    let parsed;
    try {
      parsed =
        typeof credentialsJson === "string"
          ? JSON.parse(credentialsJson)
          : credentialsJson;
    } catch {
      return res.status(400).json({ error: "Invalid JSON format. Please paste the entire contents of your service account key file." });
    }

    if (!parsed.client_email || !parsed.private_key) {
      return res.status(400).json({
        error: "Missing required fields (client_email, private_key). Make sure you're pasting the full service account JSON.",
      });
    }

    // Fix escaped newlines
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }

    // Test by calling Drive API
    const auth = new google.auth.GoogleAuth({
      credentials: parsed,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const drive = google.drive({ version: "v3", auth });
    const { data } = await drive.about.get({ fields: "user" });

    // Save credentials file
    const credDir = path.dirname(CREDENTIALS_PATH);
    if (!fs.existsSync(credDir)) fs.mkdirSync(credDir, { recursive: true });
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(parsed, null, 2), "utf-8");

    res.json({
      valid: true,
      email: parsed.client_email,
      user: data.user?.displayName || parsed.client_email,
    });
  } catch (err) {
    const msg = err.message || "Unknown error";
    if (msg.includes("invalid_grant") || msg.includes("DECODER")) {
      return res.status(400).json({ error: "Invalid service account key. The private key may be corrupted." });
    }
    res.status(400).json({ error: `Validation failed: ${msg}` });
  }
});

// ── POST /api/setup/validate-folder ───────────────────────
// Tests if a folder ID is accessible via the service account.
router.post("/validate-folder", async (req, res) => {
  try {
    let { folderId } = req.body;
    if (!folderId) {
      return res.status(400).json({ error: "Folder ID is required" });
    }

    // Extract ID from URL if needed
    const urlMatch = folderId.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) folderId = urlMatch[1];
    folderId = folderId.trim();

    if (!hasGoogleCredentials()) {
      return res.status(400).json({ error: "Google credentials must be set up first" });
    }

    // Build auth from available credentials
    const { getDrive } = require("./google");
    const drive = getDrive();

    // Try to get folder metadata
    const { data: folder } = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType",
    });

    if (folder.mimeType !== "application/vnd.google-apps.folder") {
      return res.status(400).json({ error: "This ID is not a folder. Please provide a Google Drive folder ID." });
    }

    // Count sub-folders (teacher folders)
    const { data: subList } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      pageSize: 100,
    });

    res.json({
      valid: true,
      id: folderId,
      name: folder.name,
      teacherCount: (subList.files || []).length,
    });
  } catch (err) {
    if (err.code === 404 || err.message?.includes("not found")) {
      return res.status(400).json({
        error: "Folder not found. Make sure the folder is shared with the service account email.",
      });
    }
    res.status(400).json({ error: `Folder validation failed: ${err.message}` });
  }
});

// ── POST /api/setup/complete ──────────────────────────────
// Saves the full configuration and returns a session token.
router.post("/complete", (req, res) => {
  try {
    const { orgName, password, folders } = req.body;

    if (!password || password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    if (!folders || !Array.isArray(folders) || folders.length === 0) {
      return res.status(400).json({ error: "At least one folder source is required" });
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);

    const config = {
      orgName: (orgName || "EduSign").trim(),
      passwordHash,
      passwordSalt: salt,
      folders: folders.map((f) => ({
        id: f.id,
        label: f.label || f.name || "Unnamed",
        name: f.name || "",
        addedAt: new Date().toISOString(),
      })),
      sessionExpiryHours: 168,
      setupCompleted: true,
      setupDate: new Date().toISOString(),
    };

    writeConfig(config);

    // Auto-login after setup
    const session = createSession(true, config.sessionExpiryHours);

    console.log(`✅ EduSign setup completed: "${config.orgName}" with ${config.folders.length} folder source(s)`);

    res.json({
      success: true,
      ...session,
      orgName: config.orgName,
    });
  } catch (err) {
    res.status(500).json({ error: `Setup failed: ${err.message}` });
  }
});

module.exports = router;
