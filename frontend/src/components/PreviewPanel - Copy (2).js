import React, { useState, useEffect, useRef } from 'react';

const FilePreviewModal = ({ file, onClose, previewKey }) => {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const iframeRef = useRef(null);

  const fileId = file?.id;
  const isDocx = file?.name?.toLowerCase().endsWith('.docx');
  
  // --- CACHE BUSTER LOGIC ---
  // Append the previewKey as a version parameter to force Google Drive to reload
  const getPreviewUrl = () => {
    if (!fileId) return "";
    const base = isDocx 
      ? `https://docs.google.com/viewer?srcid=${fileId}&pid=explorer&efh=false&a=v&chrome=false&embedded=true`
      : `https://drive.google.com/file/d/${fileId}/preview`;
    
    // Add version key to bypass browser/Google caching after signing
    return `${base}&v=${previewKey || Date.now()}`;
  };

  const previewUrl = getPreviewUrl();

  // Prevent background scroll when modal is open
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => { if (!loaded) setTimedOut(true); }, 10000);
    
    return () => {
      document.body.style.overflow = originalStyle;
      clearTimeout(timer);
    };
  }, [loaded]);

  const handleReload = () => {
    setLoaded(false);
    setTimedOut(false);
    if (iframeRef.current) {
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = '';
      // Small timeout to force DOM refresh
      setTimeout(() => { iframeRef.current.src = currentSrc; }, 100);
    }
  };

  if (!fileId) return null;

  return (
    <div style={styles.modalOverlay}>
      {/* Mobile-Optimized Toolbar */}
      <div style={styles.toolbar}>
        <button onClick={onClose} style={styles.closeBtn}>✕ Close</button>
        <div style={styles.fileName}>{file.name}</div>
        <div style={styles.badge}>{isDocx ? 'DOCX' : 'PDF'}</div>
        <button onClick={handleReload} style={styles.toolBtn} title="Reload">↺</button>
        <a 
          href={`https://drive.google.com/uc?export=download&id=${fileId}`} 
          target="_blank" 
          rel="noopener noreferrer" 
          style={styles.toolBtn}
        >⬇</a>
      </div>

      <div style={styles.iframeWrapper}>
        {/* Loading Spinner / Skeleton */}
        {!loaded && (
          <div style={styles.loadingContainer}>
            <div className="spinner" style={styles.spinner}></div>
            <p style={{ color: '#fff', marginTop: '12px', fontSize: '14px' }}>Loading Lesson Plan...</p>
            {timedOut && (
              <button onClick={handleReload} style={styles.retryBtn}>Taking too long? Retry</button>
            )}
          </div>
        )}

        <iframe
          key={previewKey} // Forcing React to re-mount the iframe when signature is applied
          ref={iframeRef}
          src={previewUrl}
          style={{
            ...styles.iframe,
            opacity: loaded ? 1 : 0,
            pointerEvents: loaded ? 'auto' : 'none'
          }}
          onLoad={() => setLoaded(true)}
          allow="autoplay"
          title="File Preview"
        />
        
        {/* iOS Scroll Fix */}
        <div style={{ height: "1px", background: "transparent" }} />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { 
          width: 40px; height: 40px; 
          border: 3px solid rgba(255,255,255,0.1); 
          border-top: 3px solid #E09000; 
          border-radius: 50%; 
          animation: spin 0.8s linear infinite; 
        }
      `}</style>
    </div>
  );
};

// ... [Styles remain exactly as you have them] ...
const styles = {
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100dvh',
    backgroundColor: '#000',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    height: '52px',
    backgroundColor: '#0B1D3A',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: '8px',
    flexShrink: 0,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  closeBtn: {
    padding: '6px 12px',
    backgroundColor: 'rgba(220,38,38,0.2)',
    color: '#F87171',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  fileName: {
    flex: 1,
    color: '#fff',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontWeight: '500',
  },
  badge: {
    padding: '2px 6px',
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: '10px',
    borderRadius: '4px',
    fontWeight: 'bold',
  },
  toolBtn: {
    width: '36px',
    height: '36px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    fontSize: '16px',
    cursor: 'pointer'
  },
  iframeWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    backgroundColor: '#1a1a2e',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    transition: 'opacity 0.4s ease',
  },
  loadingContainer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  retryBtn: {
    marginTop: '20px',
    padding: '10px 20px',
    backgroundColor: '#E09000',
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer'
  }
};

export default FilePreviewModal;