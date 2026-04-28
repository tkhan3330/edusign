"use strict";
require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const { google } = require("googleapis");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { Readable } = require("stream");
const mammoth = require("mammoth");
const PDFKit = require("pdfkit");
const JSZip = require("jszip");

const { isConfigured, getFolderSources, hasGoogleCredentials, getPublicConfig, addFolderSource, removeFolderSource, setPassword, verifyPassword, readConfig } = require("./config");
const { requireAuth, loginHandler, checkHandler, logoutHandler } = require("./auth");
const setupRouter = require("./setup");

// ── Extract cell colors from raw .docx XML ──
async function extractDocxStyles(wordBuffer) {
  try {
    const zip = await JSZip.loadAsync(wordBuffer);
    const xmlFile = zip.file("word/document.xml");
    if (!xmlFile) return [];
    const xml = await xmlFile.async("string");

    const allTables = [];
    const tableBlocks = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];

    for (const tbl of tableBlocks) {
      const tableRows = [];
      const rowBlocks = tbl.match(/<w:tr[\s\S]*?<\/w:tr>/g) || [];

      for (const row of rowBlocks) {
        const rowCells = [];
        const cellBlocks = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];

        for (const cell of cellBlocks) {
          const shdMatch = cell.match(/<w:shd[^>]*w:fill="([A-Fa-f0-9]{6})"/i);
          let bg = null;
          if (shdMatch && shdMatch[1].toUpperCase() !== "FFFFFF" && shdMatch[1].toUpperCase() !== "AUTO") {
            bg = "#" + shdMatch[1];
          }
          const clrMatch = cell.match(/<w:color[^>]*w:val="([A-Fa-f0-9]{6})"/i);
          let fg = null;
          if (clrMatch && clrMatch[1].toUpperCase() !== "000000" && clrMatch[1].toUpperCase() !== "AUTO") {
            fg = "#" + clrMatch[1];
          }
          const isBold = /<w:b\/>|<w:b [^>]*\/>/.test(cell);
          rowCells.push({ bg, fg, isBold });
        }
        tableRows.push(rowCells);
      }
      allTables.push(tableRows);
    }
    return allTables;
  } catch (e) {
    console.log("   Style extraction skipped:", e.message);
    return [];
  }
}

// ── Helper: strip HTML tags and decode entities ──
function stripTags(html) {
  return (html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ── Render a table into the PDF ──
function drawTable(doc, tableHtml, usableWidth, styleInfo) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(stripTags(cellMatch[1]));
    }
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return;

  const numCols = Math.max(...rows.map((r) => r.length));
  const pad = 5;
  const fs = 9;
  doc.fontSize(fs).font("Helvetica");

  const colMaxLen = new Array(numCols).fill(0);
  for (const row of rows) {
    for (let c = 0; c < numCols; c++) {
      const text = row[c] || "";
      const longest = text.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0);
      const weight = Math.max(text.length, longest * 2);
      if (weight > colMaxLen[c]) colMaxLen[c] = weight;
    }
  }

  const totalWeight = colMaxLen.reduce((s, w) => s + Math.max(w, 3), 0);
  const colWidths = colMaxLen.map((w) => (Math.max(w, 3) / totalWeight) * usableWidth);

  const MIN_COL = 30;
  let deficit = 0;
  let flexCount = 0;
  for (let c = 0; c < numCols; c++) {
    if (colWidths[c] < MIN_COL) {
      deficit += MIN_COL - colWidths[c];
      colWidths[c] = MIN_COL;
    } else {
      flexCount++;
    }
  }
  if (deficit > 0 && flexCount > 0) {
    const reduction = deficit / flexCount;
    for (let c = 0; c < numCols; c++) {
      if (colWidths[c] > MIN_COL) colWidths[c] -= reduction;
    }
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let rowH = 18;
    for (let c = 0; c < numCols; c++) {
      const t = row[c] || "";
      const h = doc.heightOfString(t, { width: colWidths[c] - pad * 2 }) + pad * 2;
      if (h > rowH) rowH = h;
    }
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
    const y = doc.y;
    let xPos = doc.page.margins.left;
    for (let c = 0; c < numCols; c++) {
      const cw = colWidths[c];
      const t = row[c] || "";
      const cellStyle = styleInfo?.[r]?.[c] || {};
      const bgColor = cellStyle.bg || (r === 0 ? "#e2e8f0" : null);
      const fgColor = cellStyle.fg || "#000";
      const useBold = cellStyle.isBold || r === 0;
      doc.save();
      if (bgColor) {
        doc.rect(xPos, y, cw, rowH).fillAndStroke(bgColor, "#94a3b8");
      } else {
        doc.rect(xPos, y, cw, rowH).stroke("#cbd5e1");
      }
      doc.restore();
      doc.fillColor(fgColor).font(useBold ? "Helvetica-Bold" : "Helvetica").fontSize(fs)
        .text(t, xPos + pad, y + pad, { width: cw - pad * 2, lineBreak: true });
      xPos += cw;
    }
    doc.y = y + rowH;
    doc.x = doc.page.margins.left;
  }
  doc.fillColor("#000");
  doc.moveDown(0.5);
}

// ── Render non-table content into the PDF ──
function drawText(doc, html) {
  const processed = html
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, lvl, t) => `\n__H${lvl}__${stripTags(t)}__/H__\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `__LI__${stripTags(t)}__/LI__\n`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  const lines = processed.split("\n");
  const sizes = { 1: 18, 2: 15, 3: 13, 4: 12, 5: 11, 6: 11 };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { doc.moveDown(0.3); continue; }
    const hm = trimmed.match(/^__H(\d)__(.+)__\/H__$/);
    if (hm) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(sizes[hm[1]] || 12).text(hm[2]);
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(11);
      continue;
    }
    const lm = trimmed.match(/^__LI__(.+)__\/LI__$/);
    if (lm) {
      doc.font("Helvetica").fontSize(11).text(`  \u2022  ${lm[1]}`, { indent: 10 });
      continue;
    }
    doc.font("Helvetica").fontSize(11).text(trimmed, { lineGap: 2 });
  }
}

// ── Convert Word → PDF locally ──
async function convertWordToPdf(wordBuffer) {
  const [{ value: html }, tableStyles] = await Promise.all([
    mammoth.convertToHtml({ buffer: wordBuffer }),
    extractDocxStyles(wordBuffer),
  ]);
  console.log(`   Extracted ${tableStyles.length} table style maps from docx XML`);

  return new Promise((resolve, reject) => {
    const doc = new PDFKit({
      size: "TABLOID", layout: "landscape",
      margins: { top: 40, bottom: 70, left: 40, right: 40 },
      info: { Title: "Converted Document", Producer: "EduSign" },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const segments = html.split(/(<table[\s\S]*?<\/table>)/gi);
    let tableIdx = 0;
    for (const seg of segments) {
      if (!seg.trim()) continue;
      if (seg.trim().toLowerCase().startsWith("<table")) {
        drawTable(doc, seg, usableWidth, tableStyles[tableIdx] || null);
        tableIdx++;
      } else {
        drawText(doc, seg);
      }
    }
    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════
//  Express App
// ═══════════════════════════════════════════════════════════

const app = express();

const allowedOrigins = new Set(
  [process.env.FRONTEND_URL, "http://localhost:3000", "https://edusignv2.vercel.app"].filter(Boolean)
);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin) || process.env.NODE_ENV === "production") return cb(null, true);
    cb(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self' http://localhost:3000 https://edusignv2.vercel.app https://drive.google.com");
  next();
});

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ── Google Auth (shared module — avoids circular deps) ────
const { getGoogleAuth, getDrive } = require("./google");

const SUPPORTED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const MIME_QUERY = SUPPORTED_MIMES.map(t => `mimeType = '${t}'`).join(" or ");

async function getFolderAndSubfolders(drive, parentId) {
  try {
    const { data } = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
    });
    const subIds = (data.files || []).map(f => f.id);
    return [parentId, ...subIds];
  } catch (err) {
    return [parentId];
  }
}

// ═══════════════════════════════════════════════════════════
//  Routes — Setup & Auth (open, no auth required)
// ═══════════════════════════════════════════════════════════
app.use("/api/setup", setupRouter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.post("/api/auth/login", loginHandler);
app.get("/api/auth/check", checkHandler);
app.post("/api/auth/logout", logoutHandler);

// ── Auth middleware — everything below requires auth ──────
app.use(requireAuth);

// ═══════════════════════════════════════════════════════════
//  Routes — Admin
// ═══════════════════════════════════════════════════════════
app.get("/api/admin/config", (_req, res) => {
  res.json(getPublicConfig());
});

app.get("/api/admin/storage", async (_req, res) => {
  try {
    const drive = getDrive();
    const { data } = await drive.about.get({ fields: "storageQuota, user" });
    const { data: fileList } = await drive.files.list({
      q: "trashed = false", fields: "files(id, name, size, mimeType, createdTime)",
      orderBy: "createdTime desc", pageSize: 100, spaces: "drive",
    });
    res.json({
      storage: data.storageQuota, user: data.user?.emailAddress,
      fileCount: fileList.files?.length || 0,
      files: (fileList.files || []).map(f => ({ id: f.id, name: f.name, size: f.size, mimeType: f.mimeType, created: f.createdTime })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/admin/cleanup", async (_req, res) => {
  try {
    const drive = getDrive();
    try { await drive.files.emptyTrash(); } catch(e) { /* ignore */ }
    const { data: fileList } = await drive.files.list({
      q: "'me' in owners and trashed = false", fields: "files(id, name, size)", pageSize: 500, spaces: "drive",
    });
    const files = fileList.files || [];
    let deleted = 0;
    for (const f of files) {
      try { await drive.files.delete({ fileId: f.id }); deleted++; } catch(e) { /* skip */ }
    }
    res.json({ found: files.length, deleted, files: files.map(f => f.name) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/folders/add", async (req, res) => {
  try {
    let { folderId, label } = req.body;
    if (!folderId) return res.status(400).json({ error: "Folder ID is required" });
    const urlMatch = folderId.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) folderId = urlMatch[1];
    folderId = folderId.trim();

    // Validate folder exists
    const drive = getDrive();
    const { data: folder } = await drive.files.get({ fileId: folderId, fields: "id, name, mimeType" });
    if (folder.mimeType !== "application/vnd.google-apps.folder") {
      return res.status(400).json({ error: "This ID is not a folder" });
    }

    const folders = addFolderSource(folderId, label || folder.name);
    res.json({ success: true, folders, folderName: folder.name });
  } catch (err) {
    res.status(err.message.includes("already exists") ? 409 : 500).json({ error: err.message });
  }
});

app.delete("/api/admin/folders/:folderId", (req, res) => {
  try {
    const folders = removeFolderSource(req.params.folderId);
    res.json({ success: true, folders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/admin/password", (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    // Verify current password if one is set
    const { isPasswordConfigured } = require("./config");
    if (isPasswordConfigured() && !verifyPassword(currentPassword)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    setPassword(newPassword);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/admin/org", (req, res) => {
  try {
    const { orgName } = req.body;
    const config = readConfig();
    config.orgName = (orgName || "EduSign").trim();
    const { writeConfig } = require("./config");
    writeConfig(config);
    res.json({ success: true, orgName: config.orgName });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  Routes — Core App (folders, files, preview, sign)
// ═══════════════════════════════════════════════════════════
app.get("/api/folders", async (_req, res) => {
  try {
    const drive = getDrive();
    const sources = getFolderSources();

    if (!sources.length) {
      return res.json({ folders: [], sources: [] });
    }

    // Fetch teacher folders from ALL sources in parallel
    const sourceResults = await Promise.all(
      sources.map(async (source) => {
        try {
          const { data } = await drive.files.list({
            q: `'${source.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: "files(id, name)", orderBy: "name",
          });
          return (data.files || []).map(f => ({ ...f, sourceLabel: source.label, sourceId: source.id }));
        } catch (err) {
          console.warn(`⚠️ Source "${source.label}" (${source.id}):`, err.message);
          return [];
        }
      })
    );

    const allFolders = sourceResults.flat();

    // Enrich with file counts in parallel
    const enriched = await Promise.all(
      allFolders.map(async (folder) => {
        try {
          const searchIds = await getFolderAndSubfolders(drive, folder.id);
          const parentQuery = searchIds.map(id => `'${id}' in parents`).join(" or ");
          const { data: fd } = await drive.files.list({
            q: `(${parentQuery}) and (${MIME_QUERY}) and trashed = false`,
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

    res.json({ folders: enriched, sources });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/folders/:folderId/files", async (req, res) => {
  try {
    const drive = getDrive();
    const searchIds = await getFolderAndSubfolders(drive, req.params.folderId);
    const parentQuery = searchIds.map(id => `'${id}' in parents`).join(" or ");
    const { data } = await drive.files.list({
      q: `(${parentQuery}) and (${MIME_QUERY}) and trashed = false`,
      fields: "files(id, name, mimeType, properties, size)", orderBy: "name",
    });
    const files = data.files.map(f => ({
      id: f.id, name: f.name, mimeType: f.mimeType || "application/pdf",
      isSigned: f.properties?.edusign_signed === "true",
      signedBy: f.properties?.edusign_signed_by || null,
      signedAt: f.properties?.edusign_signed_at || null,
    }));
    res.json({ files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/files/:fileId/preview", async (req, res) => {
  try {
    const drive = getDrive();
    const { fileId } = req.params;
    const fileRes = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"lesson-plan.pdf\"");
    fileRes.data.pipe(res);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Multi-page signing + professional stamp (PDF + Word) ──
app.post("/api/files/:fileId/sign", async (req, res) => {
  try {
    const drive = getDrive();
    const { fileId } = req.params;
    const { signatureBase64, signerName, signerTitle = "Academic Head" } = req.body;

    const { data: fileMeta } = await drive.files.get({ fileId, fields: "mimeType, name, parents" });
    const isPdf = fileMeta.mimeType === "application/pdf";
    let pdfBuffer;

    if (isPdf) {
      const fileRes = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
      pdfBuffer = Buffer.from(fileRes.data);
    } else {
      console.log(`📄 Converting "${fileMeta.name}" locally to PDF...`);
      const wordRes = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
      const wordBuffer = Buffer.from(wordRes.data);
      console.log(`   Downloaded Word file: ${wordBuffer.length} bytes`);
      pdfBuffer = await convertWordToPdf(wordBuffer);
      console.log(`   Converted to PDF: ${pdfBuffer.length} bytes`);
    }

    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const sigImage = await pdfDoc.embedPng(Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ""), "base64"));
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const STAMP_W = 210, STAMP_H = 96, MARGIN = 36;
    const navy = rgb(0.05, 0.11, 0.21);
    const gold = rgb(0.78, 0.66, 0.29);
    const gray = rgb(0.55, 0.6, 0.68);
    const istTime = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    pages.forEach((page) => {
      const { width } = page.getSize();
      const stampX = width - STAMP_W - MARGIN;
      const stampY = MARGIN;
      page.drawRectangle({ x: stampX, y: stampY, width: STAMP_W, height: STAMP_H, color: rgb(1, 1, 1), borderColor: navy, borderWidth: 1 });
      page.drawRectangle({ x: stampX, y: stampY + STAMP_H - 14, width: STAMP_W, height: 14, color: gold });
      page.drawText("DIGITALLY APPROVED", { x: stampX + 8, y: stampY + STAMP_H - 10, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
      const sigDims = sigImage.scaleToFit(STAMP_W - 24, 34);
      page.drawImage(sigImage, { x: stampX + 12, y: stampY + STAMP_H - 14 - sigDims.height - 4, width: sigDims.width, height: sigDims.height });
      page.drawLine({ start: { x: stampX + 8, y: stampY + 32 }, end: { x: stampX + STAMP_W - 8, y: stampY + 32 }, thickness: 0.5, color: gray });
      page.drawText(signerName.trim(), { x: stampX + 8, y: stampY + 21, size: 7.5, font: fontBold, color: navy });
      page.drawText(signerTitle.trim(), { x: stampX + 8, y: stampY + 12, size: 6.5, font: fontReg, color: gray });
      page.drawText(`${istTime} IST`, { x: stampX + 8, y: stampY + 4, size: 5.5, font: fontReg, color: gray });
      page.drawRectangle({ x: stampX, y: stampY, width: STAMP_W, height: 3, color: gold });
    });

    const signedPdfBytes = await pdfDoc.save();
    const s = new Readable(); s.push(Buffer.from(signedPdfBytes)); s.push(null);
    await drive.files.update({ fileId, media: { mimeType: "application/pdf", body: s } });

    const updateBody = {
      properties: {
        edusign_signed: "true",
        edusign_signed_by: signerName.trim(),
        edusign_signed_at: new Date().toISOString(),
      },
    };
    if (!isPdf && fileMeta.name) {
      updateBody.name = fileMeta.name.replace(/\.(docx?|doc)$/i, ".pdf");
    }
    await drive.files.update({ fileId, requestBody: updateBody });
    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Sign error:", err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
    res.status(500).json({ error: err.message });
  }
});

// ── Boot ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🏫 EduSign Backend v3.0.0 — Port ${PORT}`);
  if (isConfigured()) {
    const sources = getFolderSources();
    console.log(`✅ Configured with ${sources.length} folder source(s)`);
  } else {
    console.log(`⚙️  Not yet configured — Setup wizard will launch on first visit`);
  }
  if (hasGoogleCredentials()) {
    console.log(`🔑 Google credentials: detected`);
  } else {
    console.log(`⚠️  Google credentials: not found (set via wizard or env var)`);
  }
  console.log("");
});