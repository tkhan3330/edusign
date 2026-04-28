import React, { useState, useEffect } from "react";
import {
  X, FolderPlus, Trash2, HardDrive, Lock, RefreshCw,
  Loader2, AlertCircle, CheckCircle2, Building2, ChevronDown, ChevronUp,
} from "lucide-react";
import { api } from "../api";

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="adm-section">
      <button className="adm-section-header" onClick={() => setOpen(!open)}>
        <div className="adm-section-title">
          <Icon size={15} />
          <span>{title}</span>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="adm-section-body">{children}</div>}
    </div>
  );
}

export function AdminPanel({ onClose, onFoldersChanged }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  // Folder add
  const [folderInput, setFolderInput] = useState("");
  const [folderLabel, setFolderLabel] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [folderSuccess, setFolderSuccess] = useState("");

  // Password change
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState({ text: "", type: "" });

  // Org name
  const [orgName, setOrgName] = useState("");
  const [orgLoading, setOrgLoading] = useState(false);

  // Storage
  const [storage, setStorage] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
      setOrgName(cfg.orgName || "");
    } catch { }
    setLoading(false);
  }

  async function loadStorage() {
    setStorageLoading(true);
    try {
      const data = await api.getStorage();
      setStorage(data);
    } catch { }
    setStorageLoading(false);
  }

  async function handleAddFolder() {
    if (!folderInput.trim()) return;
    setAddingFolder(true);
    setFolderError("");
    setFolderSuccess("");
    try {
      const result = await api.addFolder(folderInput.trim(), folderLabel.trim() || undefined);
      setFolderSuccess(`Added "${result.folderName}"`);
      setFolderInput("");
      setFolderLabel("");
      loadConfig();
      onFoldersChanged?.();
    } catch (err) {
      setFolderError(err.message);
    }
    setAddingFolder(false);
  }

  async function handleRemoveFolder(id) {
    if (!window.confirm("Remove this folder source? Teachers inside won't be deleted from Drive.")) return;
    try {
      await api.removeFolder(id);
      loadConfig();
      onFoldersChanged?.();
    } catch { }
  }

  async function handlePasswordChange() {
    if (newPw.length < 4) { setPwMsg({ text: "Min 4 characters", type: "error" }); return; }
    if (newPw !== confirmPw) { setPwMsg({ text: "Passwords don't match", type: "error" }); return; }
    setPwLoading(true);
    setPwMsg({ text: "", type: "" });
    try {
      await api.changePassword(curPw, newPw);
      setPwMsg({ text: "Password changed successfully", type: "success" });
      setCurPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      setPwMsg({ text: err.message, type: "error" });
    }
    setPwLoading(false);
  }

  async function handleOrgSave() {
    setOrgLoading(true);
    try {
      await api.updateOrg(orgName);
      loadConfig();
    } catch { }
    setOrgLoading(false);
  }

  async function handleCleanup() {
    if (!window.confirm("Delete ALL files owned by the service account? This cannot be undone.")) return;
    setCleaning(true);
    try {
      await api.cleanupStorage();
      loadStorage();
    } catch { }
    setCleaning(false);
  }

  return (
    <>
      <div className="adm-backdrop" onClick={onClose} />
      <div className="adm-panel">
        {/* Header */}
        <div className="adm-header">
          <h2 className="adm-title">Admin Panel</h2>
          <button className="adm-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="adm-body">
          {loading ? (
            <div className="adm-loading"><Loader2 size={24} className="spin" /></div>
          ) : (
            <>
              {/* ── Organization ─────────────────────────── */}
              <Section title="Organization" icon={Building2}>
                <label className="adm-label">Organization Name</label>
                <div className="adm-row">
                  <input
                    className="adm-input"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="School name"
                  />
                  <button className="adm-btn-sm" onClick={handleOrgSave} disabled={orgLoading}>
                    {orgLoading ? <Loader2 size={13} className="spin" /> : "Save"}
                  </button>
                </div>
              </Section>

              {/* ── Folder Sources ───────────────────────── */}
              <Section title="Folder Sources" icon={FolderPlus}>
                {config?.folders?.length > 0 && (
                  <div className="adm-folder-list">
                    {config.folders.map((f) => (
                      <div key={f.id} className="adm-folder-item">
                        <div className="adm-folder-info">
                          <span className="adm-folder-label">📁 {f.label || f.name || f.id}</span>
                          <span className="adm-folder-id">{f.id.substring(0, 20)}...</span>
                        </div>
                        <button className="adm-folder-del" onClick={() => handleRemoveFolder(f.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="adm-label" style={{ marginTop: 12 }}>Add New Source</label>
                <input
                  className="adm-input"
                  value={folderInput}
                  onChange={(e) => { setFolderInput(e.target.value); setFolderError(""); setFolderSuccess(""); }}
                  placeholder="Folder ID or Google Drive URL"
                />
                <input
                  className="adm-input"
                  value={folderLabel}
                  onChange={(e) => setFolderLabel(e.target.value)}
                  placeholder="Label (optional, e.g. Main Campus)"
                  style={{ marginTop: 6 }}
                />
                {folderError && <p className="adm-msg adm-msg-error"><AlertCircle size={12} /> {folderError}</p>}
                {folderSuccess && <p className="adm-msg adm-msg-ok"><CheckCircle2 size={12} /> {folderSuccess}</p>}
                <button className="adm-btn-sm" onClick={handleAddFolder} disabled={addingFolder || !folderInput.trim()} style={{ marginTop: 8 }}>
                  {addingFolder ? <><Loader2 size={13} className="spin" /> Adding...</> : <><FolderPlus size={13} /> Add Folder</>}
                </button>
              </Section>

              {/* ── Password ────────────────────────────── */}
              <Section title="Change Password" icon={Lock} defaultOpen={false}>
                <input className="adm-input" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Current password" />
                <input className="adm-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" style={{ marginTop: 6 }} />
                <input className="adm-input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirm new password" style={{ marginTop: 6 }} />
                {pwMsg.text && <p className={`adm-msg ${pwMsg.type === "error" ? "adm-msg-error" : "adm-msg-ok"}`}>{pwMsg.text}</p>}
                <button className="adm-btn-sm" onClick={handlePasswordChange} disabled={pwLoading} style={{ marginTop: 8 }}>
                  {pwLoading ? <><Loader2 size={13} className="spin" /> Saving...</> : "Update Password"}
                </button>
              </Section>

              {/* ── Storage ─────────────────────────────── */}
              <Section title="Storage & Cleanup" icon={HardDrive} defaultOpen={false}>
                <button className="adm-btn-sm" onClick={loadStorage} disabled={storageLoading}>
                  {storageLoading ? <><Loader2 size={13} className="spin" /> Loading...</> : <><RefreshCw size={13} /> Check Storage</>}
                </button>
                {storage && (
                  <div className="adm-storage-info">
                    <p><strong>Service Account:</strong> {storage.user}</p>
                    <p><strong>Files:</strong> {storage.fileCount}</p>
                    {storage.storage?.usage && (
                      <p><strong>Used:</strong> {(parseInt(storage.storage.usage) / 1024 / 1024).toFixed(1)} MB</p>
                    )}
                  </div>
                )}
                <div className="adm-danger">
                  <p className="adm-danger-label">Danger Zone</p>
                  <button className="adm-btn-danger" onClick={handleCleanup} disabled={cleaning}>
                    {cleaning ? <><Loader2 size={13} className="spin" /> Cleaning...</> : <><Trash2 size={13} /> Delete All Service Account Files</>}
                  </button>
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
