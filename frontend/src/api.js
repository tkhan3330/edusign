// ════════════════════════════════════════════════════
//  EduSign API v3 — All backend calls with auth support
// ════════════════════════════════════════════════════

const BASE = process.env.REACT_APP_API_URL || "/api";

// ── Token management ──────────────────────────────────────
function getToken() {
  return localStorage.getItem("es_token");
}
function setToken(token) {
  if (token) localStorage.setItem("es_token", token);
  else localStorage.removeItem("es_token");
}

// ── Core request helper ───────────────────────────────────
async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  // Handle auth failures globally
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.code === "AUTH_REQUIRED") {
      setToken(null);
      window.dispatchEvent(new CustomEvent("edusign:auth-expired"));
    }
    throw new Error(body.error || "Authentication required");
  }

  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error || msg;
    } catch { /* ignore parse error */ }
    throw new Error(msg);
  }

  return res.json();
}

export const api = {
  // ── Setup ───────────────────────────────────────────────
  getSetupStatus: () => request(`${BASE}/setup/status`),
  validateCredentials: (credentialsJson) =>
    request(`${BASE}/setup/validate-credentials`, {
      method: "POST",
      body: JSON.stringify({ credentialsJson }),
    }),
  validateFolder: (folderId) =>
    request(`${BASE}/setup/validate-folder`, {
      method: "POST",
      body: JSON.stringify({ folderId }),
    }),
  completeSetup: ({ orgName, password, folders }) =>
    request(`${BASE}/setup/complete`, {
      method: "POST",
      body: JSON.stringify({ orgName, password, folders }),
    }),

  // ── Auth ────────────────────────────────────────────────
  login: (password, rememberMe = false) =>
    request(`${BASE}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ password, rememberMe }),
    }).then((data) => {
      if (data.token) setToken(data.token);
      return data;
    }),

  checkAuth: () => request(`${BASE}/auth/check`),

  logout: () =>
    request(`${BASE}/auth/logout`, { method: "POST" })
      .catch(() => {})
      .finally(() => setToken(null)),

  // ── Core App ────────────────────────────────────────────
  health: () => request(`${BASE}/health`),
  getFolders: () => request(`${BASE}/folders`),
  getFiles: (folderId) => request(`${BASE}/folders/${folderId}/files`),
  previewUrl: (fileId) => `${BASE}/files/${fileId}/preview`,
  downloadUrl: (fileId) => `${BASE}/files/${fileId}/download`,

  signFile: ({ fileId, signatureBase64, signerName, signerTitle }) =>
    request(`${BASE}/files/${fileId}/sign`, {
      method: "POST",
      body: JSON.stringify({ signatureBase64, signerName, signerTitle }),
    }),

  // ── Admin ───────────────────────────────────────────────
  getConfig: () => request(`${BASE}/admin/config`),
  getStorage: () => request(`${BASE}/admin/storage`),
  cleanupStorage: () => request(`${BASE}/admin/cleanup`, { method: "DELETE" }),
  addFolder: (folderId, label) =>
    request(`${BASE}/admin/folders/add`, {
      method: "POST",
      body: JSON.stringify({ folderId, label }),
    }),
  removeFolder: (folderId) =>
    request(`${BASE}/admin/folders/${folderId}`, { method: "DELETE" }),
  changePassword: (currentPassword, newPassword) =>
    request(`${BASE}/admin/password`, {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updateOrg: (orgName) =>
    request(`${BASE}/admin/org`, {
      method: "PUT",
      body: JSON.stringify({ orgName }),
    }),

  // ── Token helpers (for App.js) ──────────────────────────
  getToken,
  setToken,
};
