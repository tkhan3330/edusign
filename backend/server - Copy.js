"use strict";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════
//  STARTUP VALIDATION
//  Fail fast with helpful messages before the server starts
// ═══════════════════════════════════════════════════════
function validateEnv() {
  const missing = [];

  if (!process.env.PARENT_FOLDER_ID) missing.push("PARENT_FOLDER_ID");

  const hasKeyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH &&
    fs.existsSync(path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH));
  const hasKeyJson = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!hasKeyFile && !hasKeyJson) {
    missing.push(
      "GOOGLE credentials (set GOOGLE_SERVICE_ACCOUNT_JSON for production " +
      "OR place service-account.json and set GOOGLE_SERVICE_ACCOUNT_KEY_PATH for local)"
    );
  }

  if (missing.length) {
    console.error("\n❌  Missing required environment variables:\n");
    missing.forEach((v) => console.error(`   • ${v}`));
    console.error("\n   → Copy backend/.env.example to backend/.env and fill in values.\n");
    process.exit(1);
  }
}

validateEnv();

// ═══════════════════════════════════════════════════════
//  EXPRESS SETUP
// ═══════════════════════════════════════════════════════
const app = express();

// Allow requests from the frontend (both local dev and production)
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:3001",
];

app.use(
  cors({
    origin: (origin, cb) => {
      // allow curl/postman (no origin) and listed origins
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Handle preflight for all routes
app.options("*", cors());

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));



// --- PREVIEW FIX: Allow Vercel to embed PDFs ---
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy", 
    "frame-ancestors 'self' http://localhost:3000 https://edusignv2.vercel.app"
  );
  next();
});
// ----------------------------------------------


// ═══════════════════════════════════════════════════════
//  GOOGLE AUTH  — works for both local dev and Railway
// ═══════════════════════════════════════════════════════
function getGoogleAuth() {
  const SCOPES = ["https://www.googleapis.com/auth/drive"];

  // Option A: JSON string in environment variable (Railway / production)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. " +
        "Paste the entire service-account.json contents as a single line."
      );
    }

    // ─── CRITICAL FIX ────────────────────────────────────────────────────────
    // Railway (and most CI/CD UIs) double-escape newlines when you paste JSON
    // into an env var field. The private_key ends up with literal "\\n" instead
    // of real newline characters, which makes Google reject the JWT signature
    // with "invalid_grant: Invalid JWT Signature".
    // This one line restores the real newlines before the key is used.
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    // ─────────────────────────────────────────────────────────────────────────

    return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  }

  // Option B: Key file path (local development)
  const keyPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Service account key not found at: ${keyPath}\n` +
      "Place your service-account.json in backend/credentials/ " +
      "and set GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json"
    );
  }
  return new google.auth.GoogleAuth({ keyFile: keyPath, scopes: SCOPES });
}

function getDrive() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}

// ═══════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════
function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

function formatSize(bytes) {
  if (!bytes) return "—";
  const kb = parseInt(bytes) / 1024;
  return kb > 1024
    ? `${(kb / 1024).toFixed(1)} MB`
    : `${kb.toFixed(0)} KB`;
}

// ═══════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════

/**
 * GET /api/health
 */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

/**
 * GET /api/folders
 * Lists all teacher sub-folders inside PARENT_FOLDER_ID
 */
app.get("/api/folders", async (_req, res) => {
  try {
    const drive = getDrive();
    const parentId = process.env.PARENT_FOLDER_ID;

    const { data } = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name, modifiedTime)",
      orderBy: "name",
      pageSize: 200,
    });

    const folders = data.files || [];

    // Get file counts per folder in parallel
    const enriched = await Promise.all(
      folders.map(async (folder) => {
        try {
          const { data: fd } = await drive.files.list({
            q: `'${folder.id}' in parents and mimeType = 'application/pdf' and trashed = false`,
            fields: "files(id, properties)",
            pageSize: 500,
          });
          const files = fd.files || [];
          const signedCount = files.filter(
            (f) => f.properties?.edusign_signed === "true"
          ).length;
          return {
            ...folder,
            totalFiles: files.length,
            signedFiles: signedCount,
          };
        } catch {
          return { ...folder, totalFiles: 0, signedFiles: 0 };
        }
      })
    );

    res.json({ folders: enriched });
  } catch (err) {
    console.error("[GET /api/folders]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/folders/:folderId/files
 * Lists all PDFs inside a teacher folder with signed status
 */
app.get("/api/folders/:folderId/files", async (req, res) => {
  try {
    const drive = getDrive();
    const { folderId } = req.params;

    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: "files(id, name, size, createdTime, modifiedTime, properties)",
      orderBy: "name",
      pageSize: 500,
    });

    const files = (data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      size: formatSize(f.size),
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      isSigned: f.properties?.edusign_signed === "true",
      signedBy: f.properties?.edusign_signed_by || null,
      signedAt: f.properties?.edusign_signed_at || null,
    }));

    res.json({ files });
  } catch (err) {
    console.error("[GET /api/folders/:id/files]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/files/:fileId/preview
 * Streams a PDF for in-browser preview
 */
app.get("/api/files/:fileId/preview", async (req, res) => {
  try {
    const drive = getDrive();
    const { fileId } = req.params;

    const meta = await drive.files.get({ fileId, fields: "name" });

    const fileRes = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(fileRes.data);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(meta.data.name)}"`,
      "Content-Length": buffer.length,
      "Cache-Control": "no-store",
      // Allow iframe embedding from same origin
      // "X-Frame-Options": "SAMEORIGIN",
    });

    res.send(buffer);
  } catch (err) {
    console.error("[GET /api/files/:id/preview]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/files/:fileId/download
 * Forces download of a PDF
 */
app.get("/api/files/:fileId/download", async (req, res) => {
  try {
    const drive = getDrive();
    const { fileId } = req.params;

    const meta = await drive.files.get({ fileId, fields: "name" });
    const fileRes = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(fileRes.data);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(meta.data.name)}"`,
      "Content-Length": buffer.length,
    });

    res.send(buffer);
  } catch (err) {
    console.error("[GET /api/files/:id/download]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/files/:fileId/sign
 * Signs the PDF in-place: overwrites file content + sets Drive properties
 *
 * Body: {
 *   signatureBase64: "data:image/png;base64,...",
 *   signerName: "Dr. Priya Sharma",
 *   signerTitle: "Academic Head"
 * }
 */
app.post("/api/files/:fileId/sign", async (req, res) => {
  try {
    const drive = getDrive();
    const { fileId } = req.params;
    const { signatureBase64, signerName, signerTitle = "Academic Head" } = req.body;

    if (!signatureBase64) {
      return res.status(400).json({ error: "signatureBase64 is required." });
    }
    if (!signerName || !signerName.trim()) {
      return res.status(400).json({ error: "signerName is required." });
    }

    // ── 1. Get file metadata ────────────────────────────
    const meta = await drive.files.get({ fileId, fields: "name, properties" });
    if (meta.data.properties?.edusign_signed === "true") {
      return res.status(400).json({ error: "This file has already been signed." });
    }

    // ── 2. Download original PDF ────────────────────────
    const fileRes = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const originalBytes = Buffer.from(fileRes.data);

    // ── 3. Load PDF and prepare page ───────────────────
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(originalBytes, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
    } catch (loadErr) {
      return res.status(422).json({
        error: `Could not parse PDF: ${loadErr.message}. The file may be password-protected or corrupted.`,
      });
    }

    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    // ── 4. Embed signature image ────────────────────────
    const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, "");
    const sigBytes = Buffer.from(base64Data, "base64");

    let sigImage;
    try {
      // Try PNG first, fallback to JPEG
      sigImage = await pdfDoc.embedPng(sigBytes);
    } catch {
      try {
        sigImage = await pdfDoc.embedJpg(sigBytes);
      } catch (imgErr) {
        return res.status(422).json({
          error: `Could not embed signature image: ${imgErr.message}. Use PNG or JPEG format.`,
        });
      }
    }

    // ── 5. Embed fonts ─────────────────────────────────
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // ── 6. Draw approval stamp (bottom-right corner) ───
    const STAMP_W   = 210;
    const STAMP_H   = 96;
    const MARGIN    = 36;
    const stampX    = width  - STAMP_W - MARGIN;
    const stampY    = MARGIN; // Y=0 is page bottom in PDF coords

    const navyR = 0.05, navyG = 0.11, navyB = 0.21;
    const goldR = 0.78, goldG = 0.66, goldB = 0.29;
    const grayR = 0.55, grayG = 0.60, grayB = 0.68;

    // White background
    lastPage.drawRectangle({
      x: stampX, y: stampY,
      width: STAMP_W, height: STAMP_H,
      color: rgb(1, 1, 1),
      borderColor: rgb(navyR, navyG, navyB),
      borderWidth: 1,
    });

    // Gold top bar
    lastPage.drawRectangle({
      x: stampX, y: stampY + STAMP_H - 14,
      width: STAMP_W, height: 14,
      color: rgb(goldR, goldG, goldB),
    });

    // "DIGITALLY APPROVED" header
    lastPage.drawText("DIGITALLY APPROVED", {
      x: stampX + 8, y: stampY + STAMP_H - 10,
      size: 7.5, font: fontBold,
      color: rgb(1, 1, 1),
    });

    // Signature image (scaled to fit)
    const sigDims = sigImage.scaleToFit(STAMP_W - 24, 34);
    lastPage.drawImage(sigImage, {
      x: stampX + 12,
      y: stampY + STAMP_H - 14 - sigDims.height - 4,
      width: sigDims.width,
      height: sigDims.height,
    });

    // Divider
    const dividerY = stampY + 32;
    lastPage.drawLine({
      start: { x: stampX + 8, y: dividerY },
      end:   { x: stampX + STAMP_W - 8, y: dividerY },
      thickness: 0.5,
      color: rgb(grayR, grayG, grayB),
    });

    // Signer name
    lastPage.drawText(signerName.trim(), {
      x: stampX + 8, y: stampY + 21,
      size: 7.5, font: fontBold,
      color: rgb(navyR, navyG, navyB),
    });

    // Signer title
    lastPage.drawText(signerTitle.trim(), {
      x: stampX + 8, y: stampY + 12,
      size: 6.5, font: fontReg,
      color: rgb(grayR, grayG, grayB),
    });

    // Timestamp
    const now = new Date();
    const timestamp = now.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    lastPage.drawText(timestamp + " IST", {
      x: stampX + 8, y: stampY + 4,
      size: 5.5, font: fontReg,
      color: rgb(grayR, grayG, grayB),
    });

    // Gold bottom bar
    lastPage.drawRectangle({
      x: stampX, y: stampY,
      width: STAMP_W, height: 3,
      color: rgb(goldR, goldG, goldB),
    });

    const signedPdfBytes = await pdfDoc.save();

    // ── 7. Replace file content in Google Drive (in-place) ──
    await drive.files.update({
      fileId,
      requestBody: {},
      media: {
        mimeType: "application/pdf",
        body: bufferToStream(Buffer.from(signedPdfBytes)),
      },
    });

    // ── 8. Write signed metadata to Drive file properties ──
    await drive.files.update({
      fileId,
      requestBody: {
        properties: {
          edusign_signed: "true",
          edusign_signed_by: signerName.trim(),
          edusign_signed_at: now.toISOString(),
          edusign_signed_title: signerTitle.trim(),
        },
      },
    });

    console.log(`[SIGNED] ${meta.data.name} by ${signerName}`);

    res.json({
      success: true,
      message: `"${meta.data.name}" signed successfully.`,
      file: {
        id: fileId,
        name: meta.data.name,
        signedBy: signerName.trim(),
        signedAt: now.toISOString(),
      },
    });
  } catch (err) {
    console.error("[POST /api/files/:id/sign]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  GLOBAL ERROR HANDLER
// ═══════════════════════════════════════════════════════
app.use((err, _req, res, _next) => {
  console.error("[Unhandled Error]", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// 404 for unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ═══════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════
const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════╗
║         EduSign Backend v2.0             ║
║  Listening on port ${PORT}                   ║
║  Environment: ${(process.env.NODE_ENV || "development").padEnd(14)} ║
╚══════════════════════════════════════════╝
  `);
});

module.exports = app;