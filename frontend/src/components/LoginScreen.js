import React, { useState } from "react";
import { Lock, Eye, EyeOff, GraduationCap } from "lucide-react";

export function LoginScreen({ onLogin, orgName }) {
  const [password, setPassword]     = useState("");
  const [showPw,   setShowPw]       = useState(false);
  const [remember, setRemember]     = useState(true);
  const [loading,  setLoading]      = useState(false);
  const [error,    setError]        = useState("");
  const [shake,    setShake]        = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onLogin(password, remember);
    } catch (err) {
      setError(err.message || "Invalid password");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
    setLoading(false);
  }

  return (
    <div className="login-screen">
      <div className="login-bg-pattern" />

      <form
        className={`login-card ${shake ? "login-shake" : ""}`}
        onSubmit={handleSubmit}
        autoComplete="off"
      >
        {/* Brand */}
        <div className="login-brand">
          <div className="login-icon-wrap">
            <GraduationCap size={28} />
          </div>
          <h1 className="login-title">EduSign</h1>
          {orgName && orgName !== "EduSign" && (
            <p className="login-org">{orgName}</p>
          )}
          <p className="login-subtitle">Lesson Plan Approval System</p>
        </div>

        {/* Divider */}
        <div className="login-divider" />

        {/* Password field */}
        <label className="login-label">
          <Lock size={13} />
          Password
        </label>
        <div className="login-input-wrap">
          <input
            type={showPw ? "text" : "password"}
            className={`login-input ${error ? "login-input-error" : ""}`}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="Enter your password"
            autoFocus
            disabled={loading}
          />
          <button
            type="button"
            className="login-eye"
            onClick={() => setShowPw(!showPw)}
            tabIndex={-1}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && <p className="login-error">{error}</p>}

        {/* Remember me */}
        <label className="login-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Remember me for 7 days</span>
        </label>

        {/* Submit */}
        <button
          type="submit"
          className="login-btn"
          disabled={loading || !password.trim()}
        >
          {loading ? (
            <span className="login-btn-loading">
              <span className="login-spinner" />
              Authenticating...
            </span>
          ) : (
            "Sign In"
          )}
        </button>

        <p className="login-footer">Built by Tauseef Khan</p>
      </form>
    </div>
  );
}
