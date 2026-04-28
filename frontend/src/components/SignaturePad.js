import React, { useRef, useState, useEffect, useCallback } from "react";
import { X, Trash2, Upload, PenLine } from "lucide-react";

export function SignaturePad({ onSave, onClose }) {
  const canvasRef  = useRef(null);
  const [mode,     setMode]       = useState("draw");
  const [drawing,  setDrawing]    = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [uploadImg, setUploadImg] = useState(null);
  const [dragging, setDragging]   = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const initCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0d1b35";
    ctx.lineWidth   = 2.2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }, []);

  useEffect(() => {
    if (mode === "draw") { initCanvas(); setHasStrokes(false); }
  }, [mode, initCanvas]);

  // Prevent body scroll when drawing on mobile
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width  / rect.width;
    const sy = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }

  function onDown(e) {
    e.preventDefault();
    setDrawing(true); setHasStrokes(true);
    lastPos.current = getPos(e, canvasRef.current);
  }

  function onMove(e) {
    e.preventDefault();
    if (!drawing) return;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const pos = getPos(e, c);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }

  function onUp(e) { e.preventDefault(); setDrawing(false); }

  function clearCanvas() { initCanvas(); setHasStrokes(false); }

  function processFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => setUploadImg(ev.target.result);
    reader.readAsDataURL(file);
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    processFile(e.dataTransfer.files[0]);
  }

  function handleSave() {
    if (mode === "draw") {
      if (!hasStrokes) return;
      onSave(canvasRef.current.toDataURL("image/png"));
    } else {
      if (!uploadImg) return;
      onSave(uploadImg);
    }
    onClose();
  }

  const canSave = mode === "draw" ? hasStrokes : !!uploadImg;

  return (
    <div
      className="modal-backdrop sig-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Signature setup"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box sig-modal">

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Your Signature</h2>
            <p className="modal-sub">Saved locally for this session</p>
          </div>
          <button className="icon-btn-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="sig-tabs">
          <button
            className={`sig-tab${mode === "draw" ? " active" : ""}`}
            onClick={() => { setMode("draw"); setUploadImg(null); }}
          >
            <PenLine size={13} /> Draw
          </button>
          <button
            className={`sig-tab${mode === "upload" ? " active" : ""}`}
            onClick={() => setMode("upload")}
          >
            <Upload size={13} /> Upload image
          </button>
        </div>

        {/* Draw mode */}
        {mode === "draw" && (
          <div>
            <p className="sig-hint">Sign with your finger or mouse</p>
            <div className="sig-canvas-wrap">
              <canvas
                ref={canvasRef}
                width={480}
                height={150}
                className="sig-canvas"
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
                onTouchStart={onDown}
                onTouchMove={onMove}
                onTouchEnd={onUp}
              />
              {!hasStrokes && (
                <div className="sig-canvas-placeholder">Sign here</div>
              )}
            </div>
            <button className="btn-link" onClick={clearCanvas} disabled={!hasStrokes}>
              <Trash2 size={12} /> Clear
            </button>
          </div>
        )}

        {/* Upload mode */}
        {mode === "upload" && (
          <div
            className={`sig-upload-zone${dragging ? " dragging" : ""}${uploadImg ? " has-img" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {uploadImg ? (
              <div className="sig-upload-preview">
                <img src={uploadImg} alt="Signature preview" />
                <button className="btn-link" onClick={() => setUploadImg(null)}>
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            ) : (
              <>
                <Upload size={28} className="upload-zone-icon" />
                <p className="upload-zone-text">Tap or drag to upload</p>
                <p className="upload-zone-sub">PNG or JPG · Transparent background recommended</p>
              </>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => processFile(e.target.files[0])}
              className="upload-input"
              aria-label="Upload signature image"
            />
          </div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            Save Signature
          </button>
        </div>

      </div>
    </div>
  );
}