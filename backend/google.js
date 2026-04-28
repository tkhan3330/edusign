"use strict";
const { google } = require("googleapis");

// ═══════════════════════════════════════════════════════════
//  EduSign — Google Auth Factory
//  Shared between server.js and setup.js to avoid circular deps.
// ═══════════════════════════════════════════════════════════

function getGoogleAuth() {
  const SCOPES = ["https://www.googleapis.com/auth/drive"];
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  }
  return new google.auth.GoogleAuth({
    keyFile: "./credentials/service-account.json",
    scopes: SCOPES,
  });
}

function getDrive() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}

module.exports = { getGoogleAuth, getDrive };
