import React, { useState, useEffect, useCallback } from "react";
import {
  User, PenLine, GraduationCap, AlertCircle,
  FolderOpen, FileText, Eye, ChevronLeft,
} from "lucide-react";
import { api } from "./api";
import { Sidebar }      from "./components/Sidebar";
import { FileList }     from "./components/FileList";
import { PreviewPanel }     from "./components/PreviewPanel";
import { SignaturePad } from "./components/SignaturePad";

// ... [ToastStack and IdentityModal components remain the same] ...

let toastId = 0;

export default function App() {
  const [signerName,   setSignerName]   = useState(() => localStorage.getItem("es_name")  || "");
  const [signerTitle,  setSignerTitle]  = useState(() => localStorage.getItem("es_title") || "");
  const [showIdentity, setShowIdentity] = useState(!localStorage.getItem("es_name"));
  const [signature,    setSignature]    = useState(() => localStorage.getItem("es_sig") || null);
  const [showSigPad,   setShowSigPad]   = useState(false);

  const [folders,        setFolders]        = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [files,          setFiles]          = useState([]);
  const [selectedFile,   setSelectedFile]   = useState(null);

  const [foldersLoading, setFoldersLoading] = useState(false);
  const [filesLoading,   setFilesLoading]   = useState(false);

  // --- REFRESH FIX ---
  const [previewKey, setPreviewKey] = useState(Date.now());

  const [mobileTab, setMobileTab] = useState("folders");
  const [toasts, setToasts] = useState([]);

  function addToast(message, type = "success") {
    const id = ++toastId;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }

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

  useEffect(() => { loadFolders(); }, [loadFolders]);

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

  // --- UPDATED ON-SIGNED LOGIC ---
  async function onSigned() {
    addToast(`"${selectedFile.name}" approved and saved to Drive.`, "success");
    
    // 1. Force the preview to reload with the new signature
    setPreviewKey(Date.now());

    if (!selectedFolder) return;
    
    // 2. Refresh folders (for counts) and files (for isSigned status)
    try {
      const [folderData, fileData] = await Promise.all([
        api.getFolders(),
        api.getFiles(selectedFolder.id),
      ]);
      setFolders(folderData.folders || []);
      setFiles(fileData.files || []);
      
      const updated = (fileData.files || []).find((f) => f.id === selectedFile.id);
      if (updated) setSelectedFile(updated);
    } catch { /* ignore refresh errors */ }
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

  const showFolders = mobileTab === "folders";
  const showFiles   = mobileTab === "files";
  const showPreview = mobileTab === "preview";

  return (
    <>
      <div className="app-root">
        {/* ... [Header Logic remains same] ... */}

        <div className="app-body">
          <div className={`panel-col col-folders${showFolders ? " mob-show" : " mob-hide"}`}>
            <Sidebar
              folders={folders}
              selectedId={selectedFolder?.id}
              onSelect={selectFolder}
              loading={foldersLoading}
              onRefresh={loadFolders}
            />
          </div>

          <div className={`panel-col col-files${showFiles ? " mob-show" : " mob-hide"}`}>
            <FileList
              files={files}
              selectedId={selectedFile?.id}
              onSelect={selectFile}
              loading={filesLoading}
              folderName={selectedFolder?.name}
            />
          </div>

          <div className={`panel-col col-preview${showPreview ? " mob-show" : " mob-hide"}`}>
            <PreviewPanel
              file={selectedFile}
              folderId={selectedFolder?.id}
              signature={signature}
              signerName={signerName}
              signerTitle={signerTitle}
              onOpenSigPad={() => setShowSigPad(true)}
              onSigned={onSigned}
              onError={(msg) => addToast(msg, "error")}
              // --- PASS THE KEY DOWN ---
              previewKey={previewKey}
            />
          </div>
        </div>

        {/* ... [Rest of components remain same] ... */}
      </div>
      {/* ... [Modals and Toasts remain same] ... */}
    </>
  );
}