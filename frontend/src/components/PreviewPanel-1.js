import React, { useState } from "react";
import { Download, PenLine, CheckCircle, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { api } from "../api";

const STEPS = [
  "Preparing document…",
  "Embedding signature…",
  "Uploading to Drive…",
  "Finalising…",
];

export function PreviewPanel({
  file,
  folderId,
  signature,
  signerName,
  signerTitle,
  onOpenSigPad,
  onSigned,
  onError,
}) {
  const [signing,  setSigning]  = useState(false);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [done,     setDone]     = useState(false);

  async function handleSign() {
    if (!signature)         { onError("Please set your signature first.");          return; }
    if (!signerName?.trim()){ onError("Please enter your name in the top bar.");    return; }
    if (file.isSigned)      return;

    setSigning(true); setDone(false); setStepIdx(0);

    const timers = STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 850));

    try {
      await api.signFile({
        fileId:         file.id,
        signatureBase64: signature,
        signerName:      signerName.trim(),
        signerTitle:     signerTitle || "Academic Head",
      });

      timers.forEach(clearTimeout);
      setDone(true);
      setTimeout(() => { setSigning(false); setDone(false); onSigned(); }, 1100);
    } catch (err) {
      timers.forEach(clearTimeout);
      setSigning(false);
      onError(err.message);
    }
  }

  // ── Empty state ────────────────────────────────────────
  if (!file) {
    return (
      <section className="preview-panel preview-empty">
        <div className="preview-empty-content">
          <div className="preview-empty-icon">📋</div>
          <h3>Select a lesson plan</h3>
          <p>Choose a PDF to preview and approve it</p>
          <div className="preview-steps">
            {["Choose a teacher folder", "Select a lesson plan PDF", "Sign and approve"].map((s, i) => (
              <div key={i} className="preview-step">
                <span className="preview-step-num">{i + 1}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="preview-panel">

      {/* ── Top bar ── */}
      <div className="preview-topbar">
        <div className="preview-file-info">
          <span className="preview-filename" title={file.name}>{file.name}</span>
          <span className={`status-chip ${file.isSigned ? "chip-signed" : "chip-pending"}`}>
            {file.isSigned ? "✅ Signed" : "⏳ Pending"}
          </span>
        </div>
        <a
          href={api.downloadUrl(file.id)}
          className="btn-ghost-sm"
          download
          aria-label="Download PDF"
        >
          <Download size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />
          Download
        </a>
      </div>

      {/* ── PDF Viewer ── */}
      <div className="pdf-viewer-wrap">
        <iframe
          key={file.id}
          src={api.previewUrl(file.id)}
          title={`Preview: ${file.name}`}
          className="pdf-iframe"
          aria-label="PDF document preview"
        />
      </div>

      {/* ── Sign Footer ── */}
      <div className="sign-footer">
        {/* Signature section */}
        <div className="sig-block">
          <span className="sig-block-label">Sig.</span>
          {signature ? (
            <div
              className="sig-block-preview"
              onClick={onOpenSigPad}
              title="Click to change signature"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onOpenSigPad()}
            >
              <img src={signature} alt="Your saved signature" className="sig-img" />
              <span className="sig-change">Change</span>
            </div>
          ) : (
            <button className="sig-block-empty" onClick={onOpenSigPad}>
              <PenLine size={13} />
              Set signature
              <ChevronRight size={13} />
            </button>
          )}
        </div>

        {/* Sign button or already-signed notice */}
        {file.isSigned ? (
          <div className="signed-banner">
            <CheckCircle size={15} />
            <div>
              <span className="signed-banner-title">Approved</span>
              {file.signedBy && (
                <span className="signed-banner-meta">
                  by {file.signedBy} · {new Date(file.signedAt).toLocaleDateString("en-IN")}
                </span>
              )}
            </div>
          </div>
        ) : (
          <button
            className={`btn-sign${signing ? " signing" : ""}${done ? " done" : ""}`}
            onClick={handleSign}
            disabled={signing || !signature || !signerName?.trim()}
            aria-busy={signing}
          >
            {done ? (
              <><CheckCircle size={16} /> Approved!</>
            ) : signing ? (
              <><Loader2 size={15} className="spin" /> {STEPS[stepIdx]}</>
            ) : (
              <><PenLine size={15} /> Sign &amp; Approve</>
            )}
          </button>
        )}
      </div>

      {/* Inline warnings */}
      {!file.isSigned && (!signature || !signerName?.trim()) && (
        <div className="sign-warnings">
          {!signature && (
            <span className="warning-item">
              <AlertCircle size={12} /> Set your signature above
            </span>
          )}
          {!signerName?.trim() && (
            <span className="warning-item">
              <AlertCircle size={12} /> Enter your name in the top bar
            </span>
          )}
        </div>
      )}
    </section>
  );
}