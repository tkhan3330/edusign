# EduSign v2 — School Lesson Plan Approval System

A lightweight digital signing tool that sits on top of Google Drive. Academic
heads can preview lesson plan PDFs uploaded by teachers, sign them with a digital
stamp, and the signed version replaces the original — all without disturbing the
existing Google Drive workflow.

---

## Complete File Structure

```
edusign/                               ← project root
├── .gitignore                         ← ignores .env, node_modules, credentials
├── README.md                          ← this file
│
├── backend/                           ← Node.js + Express API server
│   ├── .env.example                   ← copy to .env and fill in
│   ├── .gitignore
│   ├── package.json
│   ├── server.js                      ← all API routes
│   └── credentials/
│       └── .gitkeep                   ← place service-account.json here (gitignored)
│
└── frontend/                          ← React app
    ├── .env.example                   ← copy to .env if needed locally
    ├── package.json
    ├── public/
    │   └── index.html
    └── src/
        ├── index.js                   ← React entry point
        ├── App.js                     ← root component, state, layout
        ├── App.css                    ← complete design system
        ├── api.js                     ← all API calls
        └── components/
            ├── Sidebar.js             ← left: folder list
            ├── FileList.js            ← middle: PDF list
            ├── PreviewPanel.js        ← right: viewer + sign controls
            └── SignaturePad.js        ← draw/upload signature modal
```

---

## Prerequisites

Before starting, ensure you have:

| Tool | Version | Check |
|------|---------|-------|
| Node.js | ≥ 18 | `node --version` |
| npm | ≥ 9 | `npm --version` |
| Git | Any | `git --version` |
| Google Account | — | needs Drive access |

---

## Part 1 — Google Cloud Setup

### Step 1.1 — Create a Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click the project dropdown at the top → **New Project**
3. Name it: `EduSign` → click **Create**
4. Wait for creation, then select the project from the dropdown

### Step 1.2 — Enable the Google Drive API

1. In the left menu → **APIs & Services → Library**
2. Search: `Google Drive API` → click it → click **Enable**
3. Wait for the status to show "API enabled"

### Step 1.3 — Create a Service Account

1. Left menu → **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service account**
3. Fill in:
   - **Service account name**: `edusign-service`
   - **Service account ID**: auto-fills, leave as-is
   - Click **Create and Continue**
4. **Grant role**: expand "Basic" → select **Editor** → click **Continue**
5. Click **Done**

### Step 1.4 — Download the JSON Key

1. In the Credentials page, click the service account email you just created
2. Go to the **Keys** tab
3. Click **Add Key → Create new key**
4. Select **JSON** → click **Create**
5. A `.json` file downloads automatically
6. **Rename it to** `service-account.json`
7. Place it at: `backend/credentials/service-account.json`

> ⚠️ This file is sensitive. It is gitignored. Never commit it to git.

### Step 1.5 — Set up Google Drive Folder Structure

Your Drive should look like this:
```
📁 All Teacher Lessons             ← PARENT folder (you create this)
   ├── 📁 Ms. Ananya Singh         ← teacher folder (teacher creates/you create)
   │      └── lesson_plan.pdf
   ├── 📁 Mr. Rahul Verma
   │      └── unit3_plan.pdf
   └── 📁 Dr. Kavita Patel
          └── science_week2.pdf
```

**Create the parent folder if it doesn't exist:**
1. Open Google Drive
2. Click **+ New → Folder**
3. Name it (e.g. `All Teacher Lessons`)

### Step 1.6 — Share the Parent Folder with the Service Account

1. Right-click the parent folder → **Share**
2. Paste the service account email address
   - Find it in Google Cloud → Credentials → it looks like:
   - `edusign-service@your-project-id.iam.gserviceaccount.com`
3. Set permission to **Editor** (required — app needs to update file content)
4. Uncheck "Notify people" → click **Share**

> Teachers only need to share their folder with this same service account email,
> or you can ask them to put files inside a sub-folder of the parent you control.

### Step 1.7 — Get the Parent Folder ID

1. Open the parent folder in Google Drive
2. Look at the URL: `https://drive.google.com/drive/folders/XXXXXXXXXXXXXXXX`
3. Copy the part after `/folders/` — this is your **PARENT_FOLDER_ID**

---

## Part 2 — Local Development Setup

### Step 2.1 — Clone and Install

```bash
# If using git
git clone https://github.com/your-username/edusign.git
cd edusign

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Step 2.2 — Configure Backend Environment

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in:
```env
PARENT_FOLDER_ID=paste_your_folder_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json
GOOGLE_SERVICE_ACCOUNT_JSON=
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

Make sure `service-account.json` is at `backend/credentials/service-account.json`.

### Step 2.3 — Start the Servers

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Should print: Listening on port 3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm start
# Opens http://localhost:3000 automatically
```

Visit http://localhost:3000 — you should see EduSign load with your teacher folders.

---

## Part 3 — Free Deployment (Lifetime, $0)

### Architecture for Production

```
Internet → Vercel (React frontend) → Railway (Express backend) → Google Drive
```

Both Vercel and Railway have free tiers that are sufficient for a school:
- **Vercel**: Unlimited for frontend, no sleeping
- **Railway**: 500 free hours/month (~20 days), or upgrade to Hobby $5/mo for always-on

---

### Step 3.1 — Push to GitHub

```bash
# From project root
git init
git add .
git commit -m "Initial commit"

# Create a repo on github.com then:
git remote add origin https://github.com/YOUR_USERNAME/edusign.git
git push -u origin main
```

> The `.gitignore` already excludes `.env` and `credentials/*.json`.

---

### Step 3.2 — Deploy Backend to Railway

1. Go to https://railway.app → **Sign up with GitHub** (free)

2. Click **New Project → Deploy from GitHub repo** → select your repo

3. When asked for the service name, click **Add Service → GitHub Repo**

4. Railway auto-detects Node.js. Set the **Root Directory** to `backend`
   - In Railway: your service → Settings → Source → Root Directory → type `backend`

5. In Railway: your service → **Variables** tab → Add these one by one:

   | Variable | Value |
   |----------|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `3001` |
   | `PARENT_FOLDER_ID` | your folder ID |
   | `FRONTEND_URL` | `https://your-app.vercel.app` *(add after Vercel deploy)* |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | *see below* |

6. **For `GOOGLE_SERVICE_ACCOUNT_JSON`:**
   - Open `backend/credentials/service-account.json` in a text editor
   - Select ALL the text (the entire JSON object)
   - Paste it as the value of `GOOGLE_SERVICE_ACCOUNT_JSON` in Railway
   - It must be the entire JSON as a single value (Railway handles multi-line fine)

7. In Railway: your service → Settings → **Start Command**:
   ```
   node server.js
   ```

8. Click **Deploy** → wait for the build to complete

9. Go to Settings → **Networking → Generate Domain**
   - You'll get a URL like: `https://edusign-backend-production.up.railway.app`
   - Note this URL — you need it for the frontend

10. Test your backend: visit `https://your-backend.railway.app/api/health`
    - Should return: `{"status":"ok","timestamp":"..."}`

---

### Step 3.3 — Deploy Frontend to Vercel

1. Go to https://vercel.com → **Sign up with GitHub** (free)

2. Click **Add New → Project** → Import your GitHub repo

3. **IMPORTANT — Configure the project:**
   - **Framework Preset**: Create React App
   - **Root Directory**: click Edit → type `frontend` → Save
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `build` (auto-detected)
   - **Install Command**: `npm install` (auto-detected)

4. Click **Environment Variables** → Add:

   | Variable | Value |
   |----------|-------|
   | `REACT_APP_API_URL` | `https://your-backend.railway.app/api` |

   Replace `your-backend.railway.app` with your actual Railway URL from Step 3.2.

5. Click **Deploy** → wait for build

6. Vercel gives you a URL like: `https://edusign.vercel.app`

7. **Go back to Railway** → update `FRONTEND_URL` to your Vercel URL
   → Redeploy Railway (it will auto-redeploy when you save the variable)

---

### Step 3.4 — Verify Everything Works

1. Open your Vercel URL: `https://edusign.vercel.app`
2. You should see the EduSign login/identity modal
3. Enter your name → teacher folders should load from Google Drive
4. Click a folder → PDFs should appear
5. Click a PDF → it should preview in the right panel
6. Set a signature → click "Sign & Approve" → the signed PDF replaces the original in Drive

---

## Troubleshooting

### "CORS error" in browser console
- The frontend URL in Railway's `FRONTEND_URL` must **exactly** match your Vercel URL
- Include `https://` — no trailing slash
- After updating Railway variables, wait for Railway to redeploy

### "No folders found" / folder list is empty
- Check `PARENT_FOLDER_ID` — copy from the Drive URL carefully (no spaces)
- Confirm the service account email has **Editor** access to the parent folder
- Try the health check: `https://your-backend.railway.app/api/health`

### "Service account credentials error" on Railway
- The `GOOGLE_SERVICE_ACCOUNT_JSON` must be the full contents of your JSON key file
- Check for accidental spaces or truncation
- In the JSON, `private_key` contains `\n` characters — this is normal, keep them

### PDF preview shows blank / "Failed to load"
- Some browsers block mixed-content iframes — ensure both frontend and backend use HTTPS in production
- Try Chrome if another browser has issues

### "This file has already been signed" error
- The signing is idempotent — once signed, Drive file properties are set
- To re-sign (e.g. for testing), you must manually remove the `edusign_*` properties from the file in Drive API Explorer, or use a fresh test file

### Railway app sleeps after inactivity (free tier)
- Railway's free tier: 500 hours/month. App may sleep after 30 min of no traffic.
- First request after sleep takes ~5 seconds to wake up
- Upgrade to Railway Hobby ($5/mo) for always-on, or use a cron ping service like UptimeRobot (free) to ping `/api/health` every 5 minutes

### Build fails on Vercel: "Cannot find module 'lucide-react'"
- Make sure `frontend/package.json` lists `lucide-react` as a dependency (not devDependency)
- Run `npm install` locally in `frontend/` and commit the updated `package-lock.json`

### "Permission denied" when signing a file
- The service account needs **Editor** access, not just Viewer
- Re-share the parent folder with the service account and select Editor

---

## How Signing Works

1. Academic Head selects a teacher folder → selects a PDF
2. PDF is streamed from Drive and shown in the browser iframe
3. Academic Head draws or uploads their signature
4. On clicking "Sign & Approve":
   - Backend downloads the PDF bytes from Drive
   - `pdf-lib` embeds the signature image + a professional approval stamp on the last page
   - The stamp includes: "DIGITALLY APPROVED" header, signature image, signer name, title, date/time (IST)
   - The signed PDF **replaces the original file content** in Drive (same file ID, same name)
   - Drive's built-in revision history preserves the original automatically
   - The file's Drive `properties` are updated with `edusign_signed=true`, signer name, and timestamp
5. The file list refreshes — the file shows a green "Signed" badge

---

## Security Notes

- The service account JSON key is **never** sent to the frontend
- Signatures are stored only in the browser's `localStorage` — they are not sent to any server except during signing
- The backend validates every request before touching Drive
- CORS is locked to your frontend URL only
- All Drive operations use HTTPS

---

## Cost Summary

| Service | Plan | Cost |
|---------|------|------|
| Vercel (frontend) | Hobby (free forever) | ₹0 |
| Railway (backend) | Free (500h/month) | ₹0 |
| Google Cloud | Free tier | ₹0 |
| Google Drive | Existing account | ₹0 |
| **Total** | | **₹0/month** |

> If the school needs the backend always-on: Railway Hobby = $5/month (~₹420/month).

---

## Updating the App

When you push new code to GitHub:
- **Vercel** auto-redeploys the frontend (takes ~1 minute)
- **Railway** auto-redeploys the backend (takes ~1 minute)

No manual steps needed after initial setup.
