# FashionForge - Unified Vercel Serverless Architecture

FashionForge is an AI-powered fashion application that lets users upload a photo and generate high‑fashion imagery and videos using Google Vertex AI, with assets stored on Cloudinary and metadata persisted in PostgreSQL.

## 1) Architecture Overview
The app now runs as a single Vercel deployment powered by serverless functions. We migrated from the previous split architecture (Express.js API on port 3001 + Vite frontend on port 5000) to a unified Vercel setup:

- Serverless backend: Vercel functions in `/api` (Node.js)
- Shared runtime modules in `/api/_lib`
- Frontend: React/Vite in `/client`
- One deployment on Vercel: static assets and APIs are served from the same origin

The legacy `/server` (Express) implementation has been retired and removed from the repository to prevent confusion. If you still see a `server` folder locally, stop any running Node processes and delete the folder (see “Locked server folder note” below).

## 2) Project Structure
```
/                        # repo root
├─ api/                  # serverless API functions (Vercel)
│  ├─ _lib/              # shared modules
│  │  ├─ db.js           # PostgreSQL Pool singleton (globalThis cached)
│  │  ├─ cloudinary.js   # Cloudinary v2 config
│  │  ├─ vertex.js       # Google Auth + Vertex AI helpers
│  │  └─ http.js         # JSON helpers (ok/error)
│  ├─ health.js
│  ├─ categories/
│  │  ├─ index.js        # GET /api/categories
│  │  └─ [type].js       # GET /api/categories/:type
│  ├─ upload.js          # POST /api/upload (multipart via Busboy)
│  ├─ init-db.js         # POST /api/init-db
│  ├─ reset-db.js        # POST /api/reset-db
│  ├─ generate-image.js  # POST /api/generate-image (Imagen 3)
│  ├─ generate-video.js  # POST /api/generate-video (Veo 3; graceful fallback)
│  ├─ generations.js     # GET  /api/generations
│  └─ save-generation.js # POST /api/save-generation
│
├─ client/               # React + Vite frontend
│  ├─ src/ ...
│  └─ vite.config.js     # dev proxy -> http://localhost:3000
│
├─ scripts/
│  └─ local-verify.js    # Node script to call functions directly for smoke tests
│
├─ vercel.json           # build/output config (client/dist)
└─ README.md
```

Notes
- The legacy `/server` directory has been removed from the repo. If a local process locked it and you still see it, stop the process and delete the folder (see Migration Notes).

## 3) Development Setup

### Prerequisites
- Node 18+ (or 20+ recommended)
- A PostgreSQL database (e.g., Neon)
- Cloudinary account
- Google Cloud project + Vertex AI access and a Service Account
- Vercel CLI (optional for local dev): `npm i -g vercel` or use `npx vercel`

### Environment Variables (.env)
Create a `.env` at the repo root with the following (use Vercel Project Settings in production):

- DATABASE_URL
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- VERTEX_AI_PROJECT_ID
- One of the following for Google credentials:
  - GOOGLE_CREDENTIALS_JSON  (paste full JSON as a single string)
  - or GOOGLE_APPLICATION_CREDENTIALS containing inline JSON (supported)

### Run locally (unified serverless)
- Build the frontend once (so Vercel can serve `client/dist`):
  ```bash
  npm run build
  ```
- Start serverless dev (APIs + static assets on the same origin):
  ```bash
  npm run dev   # runs `vercel dev`
  ```
  - Visit http://localhost:3000
  - The frontend and all `/api/*` endpoints are served by Vercel dev

Optional: for React HMR, you can run Vite dev alongside Vercel dev:
- Terminal A: `npx vercel dev` (APIs at 3000)
- Terminal B: `cd client && npx vite` (frontend at 5000; vite.config.js proxies `/api` → 3000)

## 4) API Endpoints (Serverless)
- GET  `/api/health` — health/status
- GET  `/api/categories` — list all categories grouped by type
- GET  `/api/categories/:type` — list categories for a type (`pose|location|accessory|makeup`)
- GET  `/api/generations` — list saved generations
- POST `/api/init-db` — create database tables (dev convenience)
- POST `/api/reset-db` — reset database (dev convenience)
- POST `/api/upload` — multipart image upload to Cloudinary (field: `image`, with `type/subcategory/name`)
- POST `/api/generate-image` — generate image via Vertex Imagen 3; uploads to Cloudinary; saves DB row
- POST `/api/generate-video` — generate short video via Vertex Veo 3; falls back to sample video if model unavailable; updates DB row when `generationId` is provided
- POST `/api/save-generation` — rename a generation (payload: `{ generationId, name }`)

These endpoints maintain API compatibility with the previous Express routes.

## 5) Deployment (Vercel)
- Connect the GitHub repo to Vercel (one project for the whole repo)
- Project Settings → Build & Development
  - Root Directory: leave empty (repo root)
  - Build Command: `npm run build`
  - Output Directory: `client/dist`
- Set Environment Variables (same as `.env`) in Vercel → Settings → Environment Variables
- Push to main; Vercel will build the client and deploy the serverless functions in `/api` automatically. No separate server deployment is needed.

## 6) Dependencies
The cleaned `package.json` keeps only what the serverless architecture needs:
- Keep: `pg`, `cloudinary`, `@google-cloud/vertexai`, `busboy`, `dotenv`, `axios`
- Removed: `express`, `multer`, `cors`, `concurrently`, `nodemon`, `@google/generative-ai`

## 7) Migration Notes
- The Express.js backend has been replaced by Vercel serverless functions while keeping the same API surface.
- Ensure your `.env` (and Vercel env) are properly configured; image generation requires working Google credentials and a Vertex AI project.
- Video generation uses Google Veo. If your project does not have access to the specified model, the endpoint responds with a graceful fallback video URL.
- Locked server folder note: if you previously ran `npm run dev` (the old Express+Vite setup) and see the `server` folder locked on Windows, stop all Node processes first, then delete it:
  ```powershell
  # in PowerShell from the repo root
  Stop-Process -Name node -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force server
  ```

## 8) Quick verification
For a quick smoke test without running browsers:
```bash
node scripts/local-verify.js
```
This script calls the serverless handlers directly to validate DB init, categories, image generation, generations listing, save-generation, and video generation (with fallback if needed).



## 9) UI Enhancements – Category Item Management

The category grid UI has been refined to provide a cleaner, more compact experience. Action buttons inside each category tile have been converted from text labels to icon buttons to prevent overlap and improve readability.

- Category Grid UI Enhancements
  - Replaced text buttons (Replace, Regenerate, Delete) with compact icons.
  - Buttons are positioned at the top‑right of each tile and sized to fit without crowding.
  - Functionality remains the same (file picker for Replace; confirmation dialogs for Regenerate/Delete).

- Button Changes
  - Replace: 📷 (camera icon)
  - Regenerate: 🔄 (refresh icon)
  - Delete: 🗑️ (trash icon)

- Accessibility Features
  - Each button includes a hover tooltip and an `aria-label` for screen readers.
  - Clear focus ring for keyboard navigation.

- Layout Improvements
  - Compact circular buttons (approx. 24×24px) avoid overlap with the bulk selection checkbox and other UI elements.
  - Consistent spacing and alignment ensure all three actions are always visible and clickable on all tile sizes.

## TODO - Post-Migration Cleanup & Issues

### 1. Remove Legacy Server Folder (After Reboot)
The empty `/server` directory is currently locked by a Windows process and cannot be deleted. After rebooting the development machine, run:
```powershell
Remove-Item -Recurse -Force server
```
This folder is a remnant from the Express.js architecture and should be completely removed to avoid confusion.

### 2. Fix Production Upload Endpoint (CRITICAL)
The deployed application at https://fashion.noblevision.com has a broken image upload functionality:
- Error: `POST /api/upload 400 (Bad Request)`
- Categories are loading correctly (accessory: 40, pose: 23, location: 23, makeup: 20)
- Images are successfully stored in Cloudinary but the upload endpoint is returning 400 errors

**Investigation needed:**
- Check Vercel function logs for `/api/upload` endpoint
- Verify multipart form handling with Busboy in serverless environment
- Ensure all environment variables are properly set in Vercel dashboard
- Test the upload endpoint directly to isolate frontend vs backend issues

### 3. Feature Enhancement: Image Gallery Selection
Add functionality to allow users to select from previously uploaded images stored in Cloudinary instead of only allowing new uploads. This would improve user experience by letting them reuse existing photos for different fashion generation requests.

**Implementation considerations:**
- Query Cloudinary API for user's uploaded images
- Add image gallery UI component to the upload interface
- Store user-image associations in the database for proper filtering
- Add pagination for large image collections
