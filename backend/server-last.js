"use strict";
require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const { google } = require("googleapis");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { Readable } = require("stream");
const fs   = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════
//  STARTUP VALIDATION
// ═══════════════════════════════════════════════════════
function warnMissingEnv() {
  const warn = [];
  if (!process.env.PARENT_FOLDER_ID) warn.push("PARENT_FOLDER_ID");
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) warn.push("GOOGLE_SERVICE_ACCOUNT_JSON");

  if (warn.length) {
    console.warn("\n⚠️ EduSign: Missing env vars in Railway. Deployment may be unstable.\n");
  } else {
    console.log("✅ EduSign: All required env vars present.");
  }
}
warnMissingEnv();

const app = express();

// ═══════════════════════════════════════════════════════
//  EXPRESS SETUP & SECURITY
// ═══════════════════════════════════════════════════════
const allowedOrigins = new Set([
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "https://edusignv2.vercel.app"
].filter(Boolean));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin) || process.env.NODE_ENV === "production") return cb(null, true);
    cb(null, true); 
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy", 
    "frame-ancestors 'self' http://localhost:3000 https://edusignv2.vercel.app https://drive.google.com"
  );
  next();
});

app.options("*", cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ═══════════════════════════════════════════════════════
//  GOOGLE AUTH & HELPERS
// ═══════════════════════════════════════════════════════
function getGoogleAuth() {
  const SCOPES = ["https://www.googleapis.com/auth/drive"];
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  }
  return new google.auth.GoogleAuth({ keyFile: "./credentials/service-account.json", scopes: SCOPES });
}

const getDrive = () => google.drive({ version: "v3", auth: getGoogleAuth() });

/**
 * NEW HELPER: Fetch a folder AND its immediate subfolders
 * Solves the "Teachers making their own folders" issue.
 */
async function getFolderAndSubfolders(drive, parentId) {
  try {
    const { data } = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
    });
    const subIds = (data.files || []).map(f => f.id);
    return [parentId, ...subIds];
  } catch (err) {
    console.error(`Subfolder fetch failed for ${parentId}:`, err.message);
    return [parentId]; // Fallback to just the main folder
  }
}

// ═══════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

/**
 * FIXED: Lists teacher folders WITH Signed/Total counts (Includes Subfolders)
 */
app.get("/api/folders", async (_req, res) => {
  try {
    const drive = getDrive();
    
    // 1. Get main teacher folders
    const { data } = await drive.files.list({
      q: `'${process.env.PARENT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      orderBy: "name",
    });

    const folders = data.files || [];

    // 2. Count PDFs in each folder AND their subfolders
    const enriched = await Promise.all(
      folders.map(async (folder) => {
        try {
          const searchIds = await getFolderAndSubfolders(drive, folder.id);
          const parentQuery = searchIds.map(id => `'${id}' in parents`).join(" or ");

          const { data: fd } = await drive.files.list({
            q: `(${parentQuery}) and mimeType = 'application/pdf' and trashed = false`,
            fields: "files(id, properties)",
          });
          
          const files = fd.files || [];
          const signedCount = files.filter(f => f.properties?.edusign_signed === "true").length;
          return { ...folder, totalFiles: files.length, signedFiles: signedCount };
        } catch {
          return { ...folder, totalFiles: 0, signedFiles: 0 };
        }
      })
    );

    res.json({ folders: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * FIXED: Fetch PDFs from main folder AND its subfolders
 */
app.get("/api/folders/:folderId/files", async (req, res) => {
  try {
    const drive = getDrive();
    
    // 1. Get the main folder + any subfolders the teacher created
    const searchIds = await getFolderAndSubfolders(drive, req.params.folderId);
    const parentQuery = searchIds.map(id => `'${id}' in parents`).join(" or ");

    // 2. Fetch the PDFs
    const { data } = await drive.files.list({
      q: `(${parentQuery}) and mimeType = 'application/pdf' and trashed = false`,
      fields: "files(id, name, properties, size)",
      orderBy: "name",
    });
    
    const files = data.files.map(f => ({
      id: f.id, name: f.name,
      isSigned: f.properties?.edusign_signed === "true",
      signedBy: f.properties?.edusign_signed_by || null,
      signedAt: f.properties?.edusign_signed_at || null
    }));
    res.json({ files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/files/:fileId/preview", async (req, res) => {
  try {
    const drive = getDrive();
    const { fileId } = req.params;

    // Rule 4: Unlock for iframe viewing
    await drive.permissions.create({
      fileId: fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    res.redirect(`https://drive.google.com/file/d/${fileId}/preview`);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * FIXED: Professional Digital Approval Box & Content Update
 */
app.post("/api/files/:fileId/sign", async (req, res) => {
  try {
    const drive = getDrive();
    const { fileId } = req.params;
    const { signatureBase64, signerName, signerTitle = "Academic Head" } = req.body;

    // 1. Download & Prepare PDF
    const fileRes = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    const pdfDoc = await PDFDocument.load(Buffer.from(fileRes.data), { ignoreEncryption: true });
    
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width } = lastPage.getSize();
    const sigImage = await pdfDoc.embedPng(Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ""), "base64"));
    
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 2. DRAW PROFESSIONAL BOX
    const STAMP_W = 210, STAMP_H = 96, MARGIN = 36;
    const stampX = width - STAMP_W - MARGIN, stampY = MARGIN;

    // White Box
    lastPage.drawRectangle({
      x: stampX, y: stampY, width: STAMP_W, height: STAMP_H,
      color: rgb(1, 1, 1), borderColor: rgb(0.05, 0.11, 0.21), borderWidth: 1,
    });
    // Gold Header
    lastPage.drawRectangle({ x: stampX, y: stampY + STAMP_H - 14, width: STAMP_W, height: 14, color: rgb(0.78, 0.66, 0.29) });
    lastPage.drawText("DIGITALLY APPROVED", { x: stampX + 8, y: stampY + STAMP_H - 10, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
    
    // Sig Image
    const sigDims = sigImage.scaleToFit(STAMP_W - 24, 34);
    lastPage.drawImage(sigImage, { x: stampX + 12, y: stampY + STAMP_H - 14 - sigDims.height - 4, width: sigDims.width, height: sigDims.height });
    
    // Info & Timestamp
    lastPage.drawText(signerName.trim(), { x: stampX + 8, y: stampY + 21, size: 7.5, font: fontBold, color: rgb(0.05, 0.11, 0.21) });
    lastPage.drawText(signerTitle.trim(), { x: stampX + 8, y: stampY + 12, size: 6.5, font: fontReg, color: rgb(0.55, 0.6, 0.68) });
    
    const istTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    lastPage.drawText(`${istTime} IST`, { x: stampX + 8, y: stampY + 4, size: 5.5, font: fontReg, color: rgb(0.55, 0.6, 0.68) });

    // 3. Save & Upload
    const signedPdfBytes = await pdfDoc.save();
    const s = new Readable(); s.push(Buffer.from(signedPdfBytes)); s.push(null);
    
    await drive.files.update({ fileId, media: { mimeType: "application/pdf", body: s } });
    await drive.files.update({
      fileId,
      requestBody: { 
        properties: { 
          edusign_signed: "true", 
          edusign_signed_by: signerName.trim(),
          edusign_signed_at: new Date().toISOString()
        } 
      }
    });

    // 4. Rule 4: Final Unlock
    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => console.log(`EduSign v2.5 (Subfolder Ready) Live`));