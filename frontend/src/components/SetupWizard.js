import React, { useState, useEffect } from "react";
import {
  GraduationCap, Key, FolderPlus, Lock, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, AlertCircle, Trash2,
} from "lucide-react";
import { api } from "../api";

const STEPS = [
  { id: "welcome",  label: "Welcome",     icon: GraduationCap },
  { id: "creds",    label: "Credentials",  icon: Key },
  { id: "folders",  label: "Folders",      icon: FolderPlus },
  { id: "password", label: "Password",     icon: Lock },
  { id: "done",     label: "Complete",     icon: CheckCircle2 },
];

export function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);

  // Step 1: Welcome
  const [orgName, setOrgName] = useState("");

  // Step 2: Credentials
  const [credsJson, setCredsJson]     = useState("");
  const [credsValid, setCredsValid]   = useState(false);
  const [credsEmail, setCredsEmail]   = useState("");
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsError, setCredsError]   = useState("");
  const [credsDetected, setCredsDetected] = useState(false);

  // Step 3: Folders
  const [folderInput, setFolderInput] = useState("");
  const [folders, setFolders]         = useState([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState("");

  // Step 4: Password
  const [password, setPassword]     = useState("");
  const [confirm,  setConfirm]      = useState("");

  // Step 5: Done
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");

  // Check if credentials already exist (env var / file)
  useEffect(() => {
    api.getSetupStatus().then((status) => {
      if (status.hasCredentials) {
        setCredsDetected(true);
        setCredsValid(true);
        setCredsEmail(status.credentialsEmail || "Detected");
      }
    }).catch(() => {});
  }, []);

  // ── Step navigation ─────────────────────────────────────
  function canProceed() {
    switch (step) {
      case 0: return orgName.trim().length > 0;
      case 1: return credsValid;
      case 2: return folders.length > 0;
      case 3: return password.length >= 4 && password === confirm;
      default: return false;
    }
  }

  function next() {
    if (step < STEPS.length - 1 && canProceed()) setStep(step + 1);
    if (step === STEPS.length - 2) handleComplete();
  }
  function back() {
    if (step > 0) setStep(step - 1);
  }

  // ── Step 2: Validate credentials ───────────────────────
  async function validateCreds() {
    if (!credsJson.trim()) return;
    setCredsLoading(true);
    setCredsError("");
    try {
      const result = await api.validateCredentials(credsJson.trim());
      setCredsValid(true);
      setCredsEmail(result.email);
    } catch (err) {
      setCredsError(err.message);
    }
    setCredsLoading(false);
  }

  // ── Step 3: Validate & add folder ──────────────────────
  async function addFolder() {
    if (!folderInput.trim()) return;
    setFolderLoading(true);
    setFolderError("");
    try {
      const result = await api.validateFolder(folderInput.trim());
      if (folders.some((f) => f.id === result.id)) {
        setFolderError("This folder is already added");
      } else {
        setFolders([...folders, {
          id: result.id,
          name: result.name,
          label: result.name,
          teacherCount: result.teacherCount,
        }]);
        setFolderInput("");
      }
    } catch (err) {
      setFolderError(err.message);
    }
    setFolderLoading(false);
  }

  function removeFolder(id) {
    setFolders(folders.filter((f) => f.id !== id));
  }

  // ── Step 5: Complete setup ─────────────────────────────
  async function handleComplete() {
    setCompleting(true);
    setCompleteError("");
    try {
      const result = await api.completeSetup({
        orgName: orgName.trim(),
        password,
        folders,
      });
      setTimeout(() => onComplete(result), 800);
    } catch (err) {
      setCompleteError(err.message);
      setStep(3); // Go back to password step
    }
    setCompleting(false);
  }

  // ── Render steps ────────────────────────────────────────
  function renderStep() {
    switch (step) {
      case 0: return (
        <div className="wiz-step-content">
          <div className="wiz-hero-icon">🏫</div>
          <h2 className="wiz-step-title">Welcome to EduSign</h2>
          <p className="wiz-step-desc">
            Let's set up your digital lesson plan approval system. This wizard will guide you through the configuration in under 2 minutes.
          </p>
          <label className="wiz-label">Organization Name</label>
          <input
            className="wiz-input"
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. ABC International School"
            autoFocus
          />
          <p className="wiz-hint">This will be displayed on the login screen</p>
        </div>
      );

      case 1: return (
        <div className="wiz-step-content">
          <h2 className="wiz-step-title">Google Service Account</h2>
          <p className="wiz-step-desc">
            EduSign needs a Google service account to access your Drive folders. Paste the JSON key file contents below.
          </p>

          {credsDetected ? (
            <div className="wiz-success-card">
              <CheckCircle2 size={20} />
              <div>
                <strong>Credentials Detected</strong>
                <span>{credsEmail}</span>
              </div>
            </div>
          ) : credsValid ? (
            <div className="wiz-success-card">
              <CheckCircle2 size={20} />
              <div>
                <strong>Credentials Valid</strong>
                <span>{credsEmail}</span>
              </div>
            </div>
          ) : (
            <>
              <textarea
                className={`wiz-textarea ${credsError ? "wiz-input-error" : ""}`}
                value={credsJson}
                onChange={(e) => { setCredsJson(e.target.value); setCredsError(""); }}
                placeholder={'Paste your service-account.json contents here...\n\n{\n  "type": "service_account",\n  "project_id": "...",\n  ...}'}
                rows={6}
              />
              {credsError && <p className="wiz-error"><AlertCircle size={12} /> {credsError}</p>}
              <button
                className="wiz-btn-secondary"
                onClick={validateCreds}
                disabled={credsLoading || !credsJson.trim()}
              >
                {credsLoading ? <><Loader2 size={14} className="spin" /> Validating...</> : "Validate Credentials"}
              </button>
            </>
          )}
        </div>
      );

      case 2: return (
        <div className="wiz-step-content">
          <h2 className="wiz-step-title">Add Folder Sources</h2>
          <p className="wiz-step-desc">
            Each folder source is a Google Drive folder containing teacher sub-folders. Paste the folder ID or URL below.
          </p>

          <div className="wiz-folder-input-row">
            <input
              className={`wiz-input wiz-input-flex ${folderError ? "wiz-input-error" : ""}`}
              type="text"
              value={folderInput}
              onChange={(e) => { setFolderInput(e.target.value); setFolderError(""); }}
              placeholder="Paste folder ID or Google Drive URL"
              onKeyDown={(e) => e.key === "Enter" && addFolder()}
            />
            <button
              className="wiz-btn-add"
              onClick={addFolder}
              disabled={folderLoading || !folderInput.trim()}
            >
              {folderLoading ? <Loader2 size={14} className="spin" /> : <FolderPlus size={14} />}
            </button>
          </div>
          {folderError && <p className="wiz-error"><AlertCircle size={12} /> {folderError}</p>}

          {folders.length > 0 && (
            <div className="wiz-folder-list">
              {folders.map((f) => (
                <div key={f.id} className="wiz-folder-card">
                  <div className="wiz-folder-info">
                    <span className="wiz-folder-name">📁 {f.name}</span>
                    <span className="wiz-folder-meta">{f.teacherCount} teacher folder{f.teacherCount !== 1 ? "s" : ""}</span>
                  </div>
                  <button className="wiz-folder-remove" onClick={() => removeFolder(f.id)} aria-label="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {folders.length === 0 && (
            <p className="wiz-hint">Add at least one folder to continue</p>
          )}
        </div>
      );

      case 3: return (
        <div className="wiz-step-content">
          <h2 className="wiz-step-title">Set Login Password</h2>
          <p className="wiz-step-desc">
            This password protects access to EduSign. Share it only with authorized staff.
          </p>
          <label className="wiz-label">Password</label>
          <input
            className="wiz-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 4 characters"
            autoFocus
          />
          <label className="wiz-label" style={{ marginTop: 12 }}>Confirm Password</label>
          <input
            className={`wiz-input ${confirm && password !== confirm ? "wiz-input-error" : ""}`}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
          />
          {confirm && password !== confirm && (
            <p className="wiz-error"><AlertCircle size={12} /> Passwords don't match</p>
          )}
          {password.length > 0 && password.length < 4 && (
            <p className="wiz-error"><AlertCircle size={12} /> Password must be at least 4 characters</p>
          )}
        </div>
      );

      case 4: return (
        <div className="wiz-step-content wiz-done-step">
          {completing ? (
            <div className="wiz-completing">
              <Loader2 size={40} className="spin" />
              <p>Setting up EduSign...</p>
            </div>
          ) : completeError ? (
            <div className="wiz-complete-error">
              <AlertCircle size={40} />
              <h2>Setup Failed</h2>
              <p>{completeError}</p>
            </div>
          ) : (
            <>
              <div className="wiz-done-icon">✅</div>
              <h2 className="wiz-step-title">All Set!</h2>
              <p className="wiz-step-desc">
                EduSign is configured and ready to use for <strong>{orgName}</strong> with {folders.length} folder source{folders.length !== 1 ? "s" : ""}.
              </p>
            </>
          )}
        </div>
      );

      default: return null;
    }
  }

  return (
    <div className="wiz-screen">
      <div className="wiz-container">
        {/* Step indicator */}
        <div className="wiz-steps-bar">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                className={`wiz-step-dot ${i === step ? "wiz-dot-active" : ""} ${i < step ? "wiz-dot-done" : ""}`}
              >
                <div className="wiz-dot-circle">
                  {i < step ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                </div>
                <span className="wiz-dot-label">{s.label}</span>
                {i < STEPS.length - 1 && <div className="wiz-dot-line" />}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="wiz-card">
          {renderStep()}
        </div>

        {/* Navigation */}
        {step < 4 && (
          <div className="wiz-nav">
            {step > 0 && (
              <button className="wiz-btn-back" onClick={back}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              className="wiz-btn-next"
              onClick={next}
              disabled={!canProceed()}
            >
              {step === 3 ? "Complete Setup" : "Continue"} <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
