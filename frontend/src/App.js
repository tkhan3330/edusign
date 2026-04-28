import React, { useState, useEffect, useCallback } from "react";
import { User, PenLine, GraduationCap, AlertCircle, FolderOpen, FileText, Eye, ChevronLeft, Settings, LogOut } from "lucide-react";
import { api } from "./api";
import { Sidebar } from "./components/Sidebar";
import { FileList } from "./components/FileList";
import { PreviewPanel } from "./components/PreviewPanel";
import { SignaturePad } from "./components/SignaturePad";
import { LoginScreen } from "./components/LoginScreen";
import { SetupWizard } from "./components/SetupWizard";
import { AdminPanel } from "./components/AdminPanel";

let toastId = 0;

// ═══════════════════════════════════════════════════════════
//  App States: "loading" → "setup" | "login" | "ready"
// ═══════════════════════════════════════════════════════════

const BOOT_MESSAGES = [
  "🚀 Starting EduSign engine...",
  "⏰ Waking up the server...",
  "🔧 Initializing systems...",
  "📡 Connecting to the cloud...",
  "🎓 Loading your teachers...",
  "⚡ Almost ready...",
];

function BootLoader() {
  const [messageIdx, setMessageIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIdx((prev) => (prev < BOOT_MESSAGES.length - 1 ? prev + 1 : prev));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="boot-loader">
      <div className="boot-content">
        <div className="boot-icon">🏫</div>
        <h1 className="boot-title">EduSign</h1>
        <div className="boot-message"><span>{BOOT_MESSAGES[messageIdx]}</span></div>
        <div className="boot-spinner">
          <div className="spinner-dot" />
          <div className="spinner-dot" />
          <div className="spinner-dot" />
        </div>
      </div>
      <style>{`
        .boot-loader { position:fixed; top:0; left:0; right:0; bottom:0; background:linear-gradient(135deg,#0d1b35 0%,#162040 100%); display:flex; align-items:center; justify-content:center; z-index:9999; }
        .boot-content { text-align:center; display:flex; flex-direction:column; align-items:center; gap:24px; }
        .boot-icon { font-size:64px; animation:bounce 2s ease-in-out infinite; }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }
        .boot-title { font-family:'Bricolage Grotesque',sans-serif; font-size:36px; font-weight:700; color:white; margin:0; letter-spacing:-0.5px; }
        .boot-message { font-size:16px; color:rgba(255,255,255,.7); min-height:24px; font-weight:500; }
        .boot-spinner { display:flex; gap:8px; justify-content:center; }
        .spinner-dot { width:10px; height:10px; border-radius:50%; background:rgba(200,168,75,.8); animation:pulse 1.4s ease-in-out infinite; }
        .spinner-dot:nth-child(2){animation-delay:.2s} .spinner-dot:nth-child(3){animation-delay:.4s}
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
      `}</style>
    </div>
  );
}

function ToastStack({ toasts }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === "error" && <AlertCircle size={14} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function IdentityModal({ defaultName, defaultTitle, onSave }) {
  const [name,  setName]  = useState(defaultName  || "");
  const [title, setTitle] = useState(defaultTitle || "Academic Head");
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-box identity-modal">
        <div className="identity-icon"><GraduationCap size={28} /></div>
        <h2 className="modal-title" style={{ textAlign: "center" }}>Welcome to EduSign</h2>
        <p className="modal-sub" style={{ textAlign: "center", marginBottom: 24 }}>
          Your name and title will be stamped on every signed document.
        </p>
        <label className="field-label">Full Name</label>
        <input className="field-input" type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name, title)} autoFocus />
        <label className="field-label" style={{ marginTop: 14 }}>Title / Designation</label>
        <input className="field-input" type="text" placeholder="e.g. Academic Head"
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name, title)} />
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 20 }}
          disabled={!name.trim()} onClick={() => onSave(name.trim(), title.trim() || "Academic Head")}>
          Continue to EduSign
        </button>
      </div>
    </div>
  );
}

function MobileTabBar({ activeTab, onTabChange, folderName, hasFile, signerName }) {
  const firstName = signerName ? signerName.split(' ')[0] : 'Name';
  const tabs = [
    { id: "folders", Icon: FolderOpen, label: "Teacher"  },
    { id: "files",   Icon: FileText,   label: folderName ? folderName.split(" ").slice(-1)[0] : "Files" },
    { id: "preview", Icon: Eye,        label: firstName,  disabled: !hasFile },
  ];
  return (
    <nav className="mobile-tabbar" aria-label="Main navigation">
      {tabs.map(({ id, Icon, label, disabled }) => (
        <button key={id}
          className={`mobile-tab${activeTab === id ? " mob-active" : ""}${disabled ? " mob-disabled" : ""}`}
          onClick={() => !disabled && onTabChange(id)}
          aria-current={activeTab === id ? "page" : undefined} aria-disabled={disabled}>
          <Icon size={19} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  // ── App state machine ──────────────────────────────────
  const [appState, setAppState]   = useState("loading"); // loading | setup | login | ready
  const [orgName,  setOrgName]    = useState("EduSign");

  // ── Identity & signature ───────────────────────────────
  const [signerName,   setSignerName]   = useState(() => localStorage.getItem("es_name")  || "");
  const [signerTitle,  setSignerTitle]  = useState(() => localStorage.getItem("es_title") || "");
  const [showIdentity, setShowIdentity] = useState(false);
  const [signature,    setSignature]    = useState(() => localStorage.getItem("es_sig") || null);
  const [showSigPad,   setShowSigPad]   = useState(false);

  // ── Data ───────────────────────────────────────────────
  const [folders,        setFolders]        = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files,          setFiles]          = useState([]);
  const [selectedFile,   setSelectedFile]   = useState(null);

  // ── UI state ───────────────────────────────────────────
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [filesLoading,   setFilesLoading]   = useState(false);
  const [previewKey,     setPreviewKey]     = useState(Date.now());
  const [mobileTab,      setMobileTab]      = useState("folders");
  const [toasts,         setToasts]         = useState([]);
  const [showAdmin,      setShowAdmin]      = useState(false);

  function addToast(message, type = "success") {
    const id = ++toastId;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }

  // ── Boot: check setup status + auth ────────────────────
  useEffect(() => {
    async function boot() {
      try {
        const status = await api.getSetupStatus();
        if (!status.configured) {
          setAppState("setup");
          return;
        }

        // System is configured — check auth
        const auth = await api.checkAuth();
        if (!auth.passwordRequired || auth.authenticated) {
          // Try to get org name
          try {
            const cfg = await api.getConfig();
            setOrgName(cfg.orgName || "EduSign");
          } catch { }
          setAppState("ready");
          // Show identity modal if name not set
          if (!localStorage.getItem("es_name")) setShowIdentity(true);
        } else {
          // Need to get org name without auth
          try {
            const cfg = await api.getConfig().catch(() => null);
            if (cfg) setOrgName(cfg.orgName || "EduSign");
          } catch { }
          setAppState("login");
        }
      } catch {
        // If backend is unreachable, show login (will show error on attempt)
        setAppState("login");
      }
    }
    boot();

    // Listen for auth expiry
    const handler = () => { setAppState("login"); addToast("Session expired. Please log in again.", "error"); };
    window.addEventListener("edusign:auth-expired", handler);
    return () => window.removeEventListener("edusign:auth-expired", handler);
  }, []);

  // ── Auth handlers ──────────────────────────────────────
  async function handleLogin(password, rememberMe) {
    await api.login(password, rememberMe);
    try {
      const cfg = await api.getConfig();
      setOrgName(cfg.orgName || "EduSign");
    } catch { }
    setAppState("ready");
    if (!localStorage.getItem("es_name")) setShowIdentity(true);
  }

  function handleSetupComplete(result) {
    if (result?.orgName) setOrgName(result.orgName);
    setAppState("ready");
    setShowIdentity(true);
  }

  async function handleLogout() {
    await api.logout();
    setAppState("login");
    setFolders([]);
    setSelectedFolder(null);
    setFiles([]);
    setSelectedFile(null);
  }

  // ── Data loaders ───────────────────────────────────────
  const loadFolders = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const data = await api.getFolders();
      setFolders(data.folders || []);
    } catch (err) {
      addToast(err.message, "error");
    }
    setFoldersLoading(false);
  }, []);

  useEffect(() => {
    if (appState === "ready") loadFolders();
  }, [appState, loadFolders]);

  async function selectFolder(folder) {
    setSelectedFolder(folder);
    setSelectedFile(null);
    setFiles([]);
    setFilesLoading(true);
    setMobileTab("files");
    try {
      const data = await api.getFiles(folder.id);
      setFiles(data.files || []);
    } catch (err) {
      addToast(err.message, "error");
    }
    setFilesLoading(false);
  }

  function selectFile(file) {
    setSelectedFile(file);
    setMobileTab("preview");
  }

  async function onSigned() {
    addToast(`"${selectedFile.name}" approved and saved to Drive.`, "success");
    setPreviewKey(Date.now());
    if (!selectedFolder) return;
    try {
      const [folderData, fileData] = await Promise.all([
        api.getFolders(), api.getFiles(selectedFolder.id),
      ]);
      setFolders(folderData.folders || []);
      setFiles(fileData.files || []);
      const updated = (fileData.files || []).find((f) => f.id === selectedFile.id);
      if (updated) setSelectedFile(updated);
    } catch { }
  }

  function saveIdentity(name, title) {
    setSignerName(name); setSignerTitle(title);
    localStorage.setItem("es_name", name);
    localStorage.setItem("es_title", title);
    setShowIdentity(false);
  }

  function saveSignature(base64) {
    setSignature(base64);
    localStorage.setItem("es_sig", base64);
    addToast("Signature saved for this session.");
  }

  // ── Render based on app state ──────────────────────────
  if (appState === "loading") return <BootLoader />;
  if (appState === "setup") return <SetupWizard onComplete={handleSetupComplete} />;
  if (appState === "login") return <LoginScreen onLogin={handleLogin} orgName={orgName} />;

  const showFolders = mobileTab === "folders";
  const showFiles   = mobileTab === "files";
  const showPreview = mobileTab === "preview";
  const isBooting = foldersLoading && folders.length === 0;

  return (
    <>
      {isBooting && <BootLoader />}
      <div className="app-root">
        <header className="app-header">
          <div className="header-brand">
            {mobileTab !== "folders" && (
              <button className="mobile-back" onClick={() => setMobileTab(mobileTab === "preview" ? "files" : "folders")} aria-label="Back">
                <ChevronLeft size={20} />
              </button>
            )}
            <span className="brand-icon">🏫</span>
            <div>
              <span className="brand-name">EduSign</span>
              <span className="brand-tagline">Lesson Plan Approval</span>
              <span className="brand-credit">Built by Tauseef Khan</span>
            </div>
          </div>

          <div className="header-center">
            <span className="role-badge"><GraduationCap size={12} />Academic Head</span>
          </div>

          <div className="header-actions">
            <button className="header-btn sig-btn" onClick={() => setShowSigPad(true)} aria-label={signature ? "Change signature" : "Set signature"}>
              {signature ? <img src={signature} alt="" className="header-sig-img" /> : <><PenLine size={13} /><span className="hbtn-txt">Sign</span></>}
            </button>
            <button className="header-btn name-btn" onClick={() => setShowIdentity(true)} aria-label="Edit identity">
              <User size={13} /><span className="hbtn-txt name-txt">{signerName || "Name"}</span>
            </button>
            <button className="header-btn" onClick={() => setShowAdmin(true)} aria-label="Admin panel" title="Admin Panel">
              <Settings size={13} />
            </button>
            <button className="header-btn" onClick={handleLogout} aria-label="Logout" title="Logout">
              <LogOut size={13} />
            </button>
          </div>
        </header>

        <div className="app-body">
          <div className={`panel-col col-folders${showFolders ? " mob-show" : " mob-hide"}`}>
            <Sidebar folders={folders} selectedId={selectedFolder?.id} onSelect={selectFolder} loading={foldersLoading} onRefresh={loadFolders} />
          </div>
          <div className={`panel-col col-files${showFiles ? " mob-show" : " mob-hide"}`}>
            <FileList files={files} selectedId={selectedFile?.id} onSelect={selectFile} loading={filesLoading} folderName={selectedFolder?.name} />
          </div>
          <div className={`panel-col col-preview${showPreview ? " mob-show" : " mob-hide"}`}>
            <PreviewPanel file={selectedFile} signature={signature} signerName={signerName} signerTitle={signerTitle}
              onOpenSigPad={() => setShowSigPad(true)} onSigned={onSigned} onError={(msg) => addToast(msg, "error")}
              previewKey={previewKey} onClose={() => { setSelectedFile(null); setMobileTab("files"); }} />
          </div>
        </div>

        <MobileTabBar activeTab={mobileTab} onTabChange={setMobileTab} folderName={selectedFolder?.name} hasFile={!!selectedFile} signerName={signerName} />
      </div>

      {showIdentity && <IdentityModal defaultName={signerName} defaultTitle={signerTitle} onSave={saveIdentity} />}
      {showSigPad && <SignaturePad onSave={saveSignature} onClose={() => setShowSigPad(false)} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} onFoldersChanged={loadFolders} />}
      <ToastStack toasts={toasts} />
    </>
  );
}