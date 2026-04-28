import React, { useState, useEffect } from 'react';
import { 
  FileText, FileType, CheckCircle, RefreshCw, Download, 
  Edit3, Loader2, ExternalLink, X 
} from 'lucide-react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';

// Professional PDF Styles
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const SIGN_STEPS_PDF = [
  'Preparing PDF...',
  'Applying Stamp...',
  'Embedding Signature...',
  'Uploading to Drive...',
  'Finalizing...'
];

const SIGN_STEPS_WORD = [
  'Converting to PDF...',
  'Preparing Document...',
  'Applying Stamp...',
  'Embedding Signature...',
  'Uploading to Drive...',
  'Finalizing...'
];

function isPdfFile(file) {
  return !file?.mimeType || file.mimeType === 'application/pdf';
}

function getFileTypeName(mimeType) {
  if (!mimeType || mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') return 'Word';
  return 'Document';
}

export const PreviewPanel = ({
  file,
  signature = null,
  signaturePosition = 'right',
  signerName = '',
  signerTitle = 'Academic Head',
  onOpenSigPad = () => {},
  onSigned = () => {},
  onError = () => {},
  previewKey,
  onClose = () => {} 
}) => {
  const defaultLayoutPluginInstance = defaultLayoutPlugin();
  
  const [signing, setSigning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  const fileId = file?.id;
  const isPdf = isPdfFile(file);
  const signSteps = isPdf ? SIGN_STEPS_PDF : SIGN_STEPS_WORD;
  
  const pdfUrl = (fileId && isPdf) ? `${API_BASE}/files/${fileId}/preview?v=${previewKey}` : null;

  useEffect(() => {
    let interval;
    if (signing) {
      interval = setInterval(() => {
        setStepIdx((prev) => (prev < signSteps.length - 1 ? prev + 1 : prev));
      }, 850);
    } else {
      setStepIdx(0);
    }
    return () => clearInterval(interval);
  }, [signing, signSteps.length]);

  useEffect(() => {
    if (isReloading) {
      const timer = setTimeout(() => {
        setIsReloading(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [previewKey, isReloading]);


  const openSource = () => {
    const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;
    window.open(driveUrl, '_blank');
  };

  const handleReload = () => {
    setIsReloading(true);
    onSigned(); 
  };

  async function handleSign() {
    if (!signature) { onError('Please set your signature first.'); return; }
    if (!signerName?.trim()) { onError('Please enter your name.'); return; }
    
    setSigning(true);
    setDone(false);
    
    try {
      const token = localStorage.getItem("es_token");
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE}/files/${fileId}/sign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          signatureBase64: signature,
          signaturePosition,
          signerName: signerName.trim(),
          signerTitle: signerTitle,
        }),
      });

      if (!response.ok) throw new Error('Signing process failed');
      
      setDone(true);
      setIsReloading(true);
      onSigned(); 
      setTimeout(() => { setSigning(false); setDone(false); }, 2000);
    } catch (err) {
      setSigning(false);
      onError(err.message);
    }
  }

  if (!fileId) {
    return (
      <div className="preview-empty">
        <div className="empty-icon-box">
          <FileText size={48} color="#94a3b8" />
        </div>
        <h3>No Lesson Plan Selected</h3>
        <p>Choose a file from the teacher's folder to preview and approve.</p>
      </div>
    );
  }

  return (
    <div className="preview-container">
      <div className="preview-header">
        <div className="title-group">
          <span className="file-type-badge" style={!isPdf ? { background: '#2563eb' } : undefined}>{getFileTypeName(file?.mimeType)}</span>
          <h2 className="preview-title" title={file.name}>{file.name}</h2>
        </div>
        
        <div className="header-actions">
          <button onClick={handleReload} className="action-btn" title="Reload Preview">
            <RefreshCw size={18} />
          </button>
          <button onClick={openSource} className="action-btn" title="Open in Google Drive">
            <ExternalLink size={18} />
          </button>
          <a href={`${API_BASE}/files/${fileId}/download`} className="action-btn" download title="Download">
            <Download size={18} />
          </a>
          <button onClick={onClose} className="action-btn close-btn" title="Close Preview">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="viewer-section">
        {isPdf ? (
          <>
            {/* UPDATED: Version changed from 3.4.120 to 3.11.174 to match API */}
            <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
              <div className="pdf-viewer-wrapper">
                <Viewer
                  fileUrl={pdfUrl}
                  httpHeaders={{
                    Authorization: `Bearer ${localStorage.getItem("es_token")}`
                  }}
                  plugins={[defaultLayoutPluginInstance]}
                  renderLoader={(percentages) => (
                    <div className="pdf-loader-wrapper">
                      <div className="pdf-loader-card">
                        <Loader2 className="spinner" size={32} color="#2563eb" />
                        <span>Loading PDF {Math.round(percentages)}%</span>
                      </div>
                    </div>
                  )}
                />
              </div>
            </Worker>
            {isReloading && (
              <div className="reload-overlay">
                <div className="reload-loader">
                  <Loader2 className="reload-spinner" size={40} />
                  <span>Updating PDF...</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="non-pdf-card">
            <div className="non-pdf-card-inner">
              <div className="non-pdf-icon-wrap">
                <FileType size={56} />
              </div>
              <h3 className="non-pdf-title">{file.name}</h3>
              <span className="non-pdf-type">{getFileTypeName(file?.mimeType)} Document</span>
              <p className="non-pdf-hint">
                This file will be converted to PDF and stamped with your signature upon signing.
              </p>
              <button onClick={openSource} className="non-pdf-drive-btn">
                <ExternalLink size={14} /> Open in Google Drive
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="preview-footer">
        <div className="sig-container">
          {signature ? (
            <div className="sig-box" onClick={onOpenSigPad} title="Change Signature">
              <img src={signature} alt="Signature" />
              <div className="sig-overlay"><Edit3 size={14} /></div>
            </div>
          ) : (
            <button className="set-sig-btn" onClick={onOpenSigPad}>
              <Edit3 size={14} /> Set Signature
            </button>
          )}
        </div>

        <div className="action-container">
          {file?.isSigned ? (
            <div className="status-badge-signed">
              <CheckCircle size={18} />
              <div className="badge-text">
                <strong>Approved</strong>
                <span>by {file.signedBy}</span>
              </div>
            </div>
          ) : (
            <button 
              className={`approve-btn ${signing ? 'is-loading' : ''} ${done ? 'is-success' : ''}`} 
              onClick={handleSign}
              disabled={signing || !signature}
            >
              <>{signing ? (
                <><Loader2 size={16} className="spinner" /> {signSteps[stepIdx]}</>
              ) : done ? (
                '✅ Approved & Saved'
              ) : (
                isPdf ? <>✍ Approve & Sign</> : <>✍ Convert & Sign</>
              )}</>
            </button>
          )}
        </div>
      </div>

      <style>{`
        .preview-container { 
          display: flex; 
          flex-direction: column; 
          height: 100%; 
          background: #ffffff; 
          overflow: hidden; 
          border: 1px solid #e2e8f0; 
          border-radius: 12px;
          position: relative;
        }
        .preview-header { 
          padding: 12px 16px; 
          background: #0f172a; 
          color: white; 
          flex-shrink: 0; 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
        }
        .title-group { 
          display: flex; 
          align-items: center; 
          gap: 10px; 
          overflow: hidden; 
        }
        .file-type-badge { 
          background: #ef4444; 
          color: white; 
          font-size: 10px; 
          font-weight: 800; 
          padding: 2px 6px; 
          border-radius: 4px; 
        }
        .preview-title { 
          font-size: 14px; 
          font-weight: 500; 
          margin: 0; 
          white-space: nowrap; 
          overflow: hidden; 
          text-overflow: ellipsis; 
        }
        .header-actions { 
          display: flex; 
          gap: 8px; 
        }
        .action-btn { 
          background: rgba(255,255,255,0.1); 
          border: none; 
          color: white; 
          width: 34px; 
          height: 34px; 
          border-radius: 8px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          cursor: pointer; 
          transition: 0.2s; 
        }
        .action-btn:hover { background: rgba(255,255,255,0.2); }
        .action-btn.close-btn:hover { background: rgba(239, 68, 68, 0.7); }
        
        .viewer-section { 
          flex: 1; 
          min-height: 0; 
          background: #525659; 
          overflow: hidden; 
          padding-bottom: 60px;
          position: relative;
        }
        .non-pdf-card {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 32px;
        }
        .non-pdf-card-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 12px;
          background: #ffffff;
          padding: 40px 32px;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
          max-width: 440px;
          width: 100%;
        }
        .non-pdf-icon-wrap {
          width: 88px;
          height: 88px;
          border-radius: 50%;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #2563eb;
          margin-bottom: 8px;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.1);
        }
        .non-pdf-title {
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          margin: 0;
          max-width: 300px;
          word-break: break-word;
        }
        .non-pdf-type {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #2563eb;
          background: #eff6ff;
          padding: 3px 10px;
          border-radius: 6px;
        }
        .non-pdf-hint {
          font-size: 13px;
          color: #64748b;
          max-width: 320px;
          line-height: 1.5;
          margin: 4px 0 8px;
        }
        .non-pdf-drive-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(37, 99, 235, 0.08);
          border: 1px solid rgba(37, 99, 235, 0.2);
          color: #2563eb;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          transition: 0.2s;
        }
        .non-pdf-drive-btn:hover {
          background: rgba(37, 99, 235, 0.15);
        }
        .pdf-viewer-wrapper { 
          height: 100%; 
          width: 100%; 
        }
        .pdf-loader-wrapper { 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          height: 100%; 
        }
        .pdf-loader-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          background: #ffffff;
          padding: 24px 32px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          color: #1e293b;
          font-size: 14px;
          font-weight: 600;
        }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        
        .preview-footer { 
          position: fixed;
          bottom: 60px;
          left: 0;
          right: 0;
          padding: 10px 12px; 
          background: white; 
          border-top: 1px solid #e2e8f0; 
          display: flex; 
          align-items: center;
          gap: 10px;
          z-index: 101; 
          box-shadow: 0 -2px 8px rgba(0,0,0,0.06); 
        }
        
        .sig-container {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        
        .sig-box { 
          height: 40px; 
          min-width: 100px;
          border: 1px solid #e2e8f0; 
          border-radius: 8px; 
          position: relative; 
          cursor: pointer; 
          overflow: hidden; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          flex-shrink: 0;
        }
        .sig-box img { 
          height: 80%; 
          object-fit: contain; 
        }
        .sig-overlay { 
          position: absolute; 
          inset: 0; 
          background: rgba(0,0,0,0.4); 
          color: white; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          opacity: 0; 
          transition: 0.2s; 
        }
        .sig-box:hover .sig-overlay { opacity: 1; }
        
        .set-sig-btn { 
          border: 1px dashed #cbd5e1; 
          background: none; 
          padding: 10px 14px; 
          border-radius: 8px; 
          font-size: 13px; 
          color: #64748b; 
          cursor: pointer; 
          display: flex; 
          align-items: center; 
          gap: 6px; 
          flex-shrink: 0;
          height: 40px;
        }
        
        .action-container {
          flex: 1;
          display: flex;
          min-width: 140px;
        }
        
        .approve-btn { 
          background: #0f172a; 
          color: white; 
          border: none; 
          padding: 10px 16px; 
          border-radius: 8px; 
          font-weight: 600; 
          font-size: 13px; 
          cursor: pointer; 
          display: flex; 
          align-items: center; 
          justify-content: center;
          gap: 8px; 
          transition: 0.2s; 
          flex: 1;
          white-space: nowrap;
          height: 40px;
        }
        .approve-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .approve-btn.is-loading { background: #334155; }
        .approve-btn.is-success { background: #16a34a; }
        
        .status-badge-signed { 
          display: flex; 
          align-items: center; 
          gap: 8px; 
          color: #16a34a; 
          background: #f0fdf4; 
          padding: 8px 12px; 
          border-radius: 8px; 
          border: 1px solid #bbf7d0; 
          font-size: 12px;
          flex: 1;
          height: 40px;
        }
        .badge-text { 
          display: flex; 
          flex-direction: column; 
        }
        .badge-text strong { font-size: 12px; }
        .badge-text span { font-size: 10px; opacity: 0.8; }
        
        .preview-empty { 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          justify-content: center; 
          height: 100%; 
          background: #f8fafc; 
          padding: 40px; 
          text-align: center; 
        }
        .empty-icon-box { 
          background: #f1f5f9; 
          padding: 20px; 
          border-radius: 50%; 
          margin-bottom: 20px; 
        }
        .preview-empty h3 { font-size: 18px; color: #1e293b; margin: 0 0 8px 0; }
        .preview-empty p { font-size: 14px; color: #64748b; margin: 0; max-width: 280px; line-height: 1.5; }
        
        .reload-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          backdrop-filter: blur(2px);
        }
        
        .reload-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          background: white;
          padding: 24px 32px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        
        .reload-spinner {
          animation: spin 1s linear infinite;
          color: #0f172a;
        }
        
        .reload-loader span {
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
        }
        
        @media (min-width: 900px) {
          .preview-footer {
            bottom: 0;
            left: auto;
            right: auto;
            position: absolute;
            width: 100%;
            border-radius: 0 0 12px 12px;
          }
          .viewer-section {
            padding-bottom: 60px;
          }
        }
      `}</style>
    </div>
  );
};