import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, CheckCircle } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const SIGN_STEPS = [
  'Preparing document…',
  'Embedding signature…',
  'Uploading to Drive…',
  'Finalising…',
];

export const PreviewPanel = ({
  file,
  signature = null,
  signerName = '',
  signerTitle = 'Academic Head',
  onOpenSigPad = () => {},
  onSigned = () => {},
  onError = () => {},
  previewKey // From App.js to force iframe reload
}) => {
  const iframeRef = useRef(null);
  const timeoutRef = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [signing, setSigning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);

  const fileId = file?.id;
  const isDocx = file?.name?.toLowerCase().endsWith('.docx');

  // ── BUILD PREVIEW URL (Cache Buster Logic) ────────────────
  const getPreviewUrl = useCallback(() => {
    if (!fileId) return '';
    const base = isDocx 
      ? `https://docs.google.com/viewer?srcid=${fileId}&pid=explorer&efh=false&a=v&chrome=false&embedded=true`
      : `${API_BASE}/files/${fileId}/preview`;
    
    return `${base}${isDocx ? '&' : '?'}v=${previewKey || Date.now()}`;
  }, [fileId, isDocx, previewKey]);

  const previewUrl = getPreviewUrl();

  // ── 10-SECOND TIMEOUT ────────────────────────────────────
  useEffect(() => {
    if (!fileId) return;
    setLoaded(false);
    setTimedOut(false);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!loaded) setTimedOut(true);
    }, 10000);
    return () => clearTimeout(timeoutRef.current);
  }, [previewKey, fileId, loaded]);

  // ── RELOAD ───────────────────────────────────────────────
  const handleReload = () => {
    setLoaded(false);
    setTimedOut(false);
    if (iframeRef.current) {
      iframeRef.current.src = '';
      setTimeout(() => { iframeRef.current.src = previewUrl; }, 100);
    }
  };

  // ── SIGNING LOGIC ──
  async function handleSign() {
    if (!signature) { onError('Please set your signature first.'); return; }
    if (!signerName?.trim()) { onError('Please enter your name in the top bar.'); return; }
    if (file?.isSigned) return;

    setSigning(true); setDone(false); setStepIdx(0);
    const timers = SIGN_STEPS.map((_, i) => setTimeout(() => setStepIdx(i), i * 850));

    try {
      const response = await fetch(`${API_BASE}/files/${fileId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureBase64: signature,
          signerName: signerName.trim(),
          signerTitle: signerTitle || 'Academic Head',
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${response.status}`);
      }

      timers.forEach(clearTimeout);
      setDone(true);

      // Tell App.js to refresh the key & data
      onSigned();

      setTimeout(() => { setSigning(false); setDone(false); }, 1200);
    } catch (err) {
      timers.forEach(clearTimeout);
      setSigning(false);
      onError(err.message);
    }
  }

  // ── EMPTY STATE ──────────────────────────────────────────
  if (!fileId) {
    return (
      <div className="preview-empty">
        <FileText size={48} color="rgba(255,255,255,0.2)" />
        <p>Select a lesson plan to preview and sign</p>
      </div>
    );
  }

  const canSign = !!signature && !!signerName?.trim() && !file?.isSigned;

  return (
    <div className="preview-container">
      
      {/* ── TOOLBAR (Embedded style) ── */}
      <div className="preview-header">
        <div className="preview-title" title={file.name}>{file.name}</div>
        <div className="preview-actions">
           <div className="badge">{isDocx ? 'DOCX' : 'PDF'}</div>
           <button onClick={handleReload} className="btn-icon" title="Reload preview">↺</button>
           <a href={`${API_BASE}/files/${fileId}/download`} className="btn-icon" download title="Download">⬇</a>
        </div>
      </div>

      {/* ── IFRAME AREA ── */}
      <div className="iframe-container">
        {!loaded && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>Loading {isDocx ? 'document' : 'PDF'}...</p>
            {timedOut && (
              <button onClick={handleReload} className="btn-retry">Taking too long? Retry</button>
            )}
          </div>
        )}

        <iframe
          key={previewKey} // Forces remount on sign
          ref={iframeRef}
          src={previewUrl}
          className="preview-iframe"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => {
            clearTimeout(timeoutRef.current);
            setLoaded(true);
            setTimedOut(false);
          }}
          title="Document Preview"
        />
      </div>

      {/* ── SIGN FOOTER ── */}
      <div className="preview-footer">
        
        {/* Signature Box */}
        <div className="sig-status">
          <span className="sig-label">SIG</span>
          {signature ? (
            <div className="sig-preview" onClick={onOpenSigPad} title="Change signature">
              <img src={signature} alt="Signature" />
              <span>Change</span>
            </div>
          ) : (
            <button className="sig-empty" onClick={onOpenSigPad}>✏ Set signature</button>
          )}
        </div>

        {/* Action Button */}
        {file?.isSigned ? (
          <div className="signed-badge">
            <CheckCircle size={16} />
            <div>
              <strong>Approved</strong>
              <span>{file.signedBy}</span>
            </div>
          </div>
        ) : (
          <button
            className={`btn-sign ${signing || !canSign ? 'disabled' : ''} ${done ? 'success' : ''}`}
            onClick={handleSign}
            disabled={signing || !canSign}
          >
            {done ? '✅ Approved!' : signing ? SIGN_STEPS[stepIdx] : '✍ Sign & Approve'}
          </button>
        )}
      </div>

      {/* ── CSS for Embedded Layout ── */}
      {/* ── CSS for Embedded Layout ── */}
      <style>{`
        /* The main container must fit exactly inside the parent column */
        .preview-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          background: #1a1a2e;
          border-radius: 8px;
          overflow: hidden;
        }

        .preview-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: rgba(255,255,255,0.5);
          gap: 16px;
        }

        .preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #0b1d3a;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          flex-shrink: 0; /* Prevents header from shrinking */
        }

        .preview-title {
          color: #fff;
          font-weight: 600;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .preview-actions { display: flex; gap: 8px; align-items: center; }
        
        .badge {
          padding: 2px 6px; background: rgba(255,255,255,0.15);
          font-size: 10px; border-radius: 4px; font-weight: bold; color: white;
        }

        .btn-icon {
          background: rgba(255,255,255,0.1);
          border: none;
          color: white;
          width: 32px; height: 32px;
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; text-decoration: none;
        }

        /* The wrapper for the iframe MUST have flex: 1 and min-height: 0 to constrain the iframe */
        .iframe-container {
          flex: 1;
          position: relative;
          background: #1e293b;
          min-height: 0; 
          overflow: hidden; /* Crucial for keeping iframe inside */
        }

        .preview-iframe {
          width: 100%; 
          height: 100%; 
          border: none;
          display: block;
          transition: opacity 0.3s ease;
        }

        .loading-overlay {
          position: absolute; inset: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          background: #1e293b; color: white;
        }

        .spinner {
          width: 36px; height: 36px;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: #E09000;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        .preview-footer {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; background: #fff;
          border-top: 1px solid #e2e8f0;
          flex-shrink: 0; /* Prevents footer from shrinking */
        }

        .sig-status { display: flex; align-items: center; gap: 8px; }
        .sig-label { font-size: 10px; font-weight: bold; color: #8e9ab5; }
        
        .sig-preview {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 8px; border: 1px solid #e2e8f0;
          border-radius: 6px; cursor: pointer;
        }
        .sig-preview img { height: 24px; }
        .sig-preview span { font-size: 11px; color: #64748b; }
        
        .sig-empty {
          background: transparent; border: 1px dashed #cbd5e1;
          padding: 6px 12px; border-radius: 6px; color: #475569;
          cursor: pointer; font-size: 13px;
        }

        .btn-sign {
          background: #0d1b35; color: white;
          padding: 10px 20px; border: none; border-radius: 8px;
          font-weight: bold; cursor: pointer;
        }
        .btn-sign.disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-sign.success { background: #059669; }
        
        .signed-badge {
          display: flex; align-items: center; gap: 8px;
          background: #ecfdf5; color: #059669;
          padding: 8px 12px; border-radius: 8px;
        }
        .signed-badge strong { display: block; font-size: 13px; }
        .signed-badge span { font-size: 11px; }
      `}</style>
    </div>
  );
};