# FashionForge - Unified Vercel Serverless Architecture

FashionForge is an AI-powered fashion application that lets users upload a photo and generate high‑fashion imagery and videos using Google Vertex AI, with assets stored on Cloudinary and metadata persisted in PostgreSQL.

## 1) Architecture Overview
The app now runs as a single Vercel deployment powered by serverless functions. We migrated from the previous split architecture (Express.js API on port 3001 + Vite frontend on port 5000) to a unified Vercel setup:

- Serverless backend: Vercel functions in `/api` (Node.js)
- Shared runtime modules in `/api/_lib`
- Frontend: React/Vite in `/client`
- One deployment on Vercel: static assets and APIs are served from the same origin

The legacy `/server` (Express) implementation has been retired and removed from the repository to prevent confusion. If you still see a `server` folder locally, stop any running Node processes and delete the folder (see “Locked server folder note” below).

## Recent Highlights

- Unified Vercel serverless backend; legacy Express removed
- Step-by-step image generation flow (pose → location → accessory → makeup) with identity preservation and reference conditioning
- Gemini 2.5 Flash Image Preview supported in locations/global, with REST fallback; Imagen 3 used as stable default in us-central1
- Veo 3 video generation added with env-configurable model/region and graceful fallback; clearer diagnostics for 429/404
- Category UI now displays DB-backed thumbnails with robust placeholders/fallbacks
- Local development via `vercel dev` and a single Vercel deployment for app + APIs

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
Create a `.env` at the repo root. In production, set these in Vercel → Project → Settings → Environment Variables.

Required
- DATABASE_URL

Cloudinary
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET

Google Cloud / Vertex AI
- VERTEX_AI_PROJECT_ID (or GOOGLE_CLOUD_PROJECT_ID)
- VERTEX_LOCATION (default: us-central1; use `global` for Gemini preview image models)
- VERTEX_IMAGE_MODEL (default: `imagen-3.0-generate-001`; optional: `gemini-2.5-flash-image-preview`)
- VERTEX_VIDEO_MODEL (e.g., `veo-3.0-generate-preview` or `veo-3.0-fast-generate-preview`)
- VERTEX_VIDEO_LOCATION (default: `us-central1`)

Credentials (choose one)
- GOOGLE_CREDENTIALS_JSON (inline JSON string or base64-encoded JSON)
- GOOGLE_APPLICATION_CREDENTIALS (inline JSON OR absolute file path)
Also supported: GOOGLE_APPLICATION_JSON, GCP_SERVICE_ACCOUNT_JSON, GCLOUD_SERVICE_ACCOUNT_JSON

Example
```bash
DATABASE_URL=postgres://user:pass@host:5432/db

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

VERTEX_AI_PROJECT_ID=fashion-472519
VERTEX_LOCATION=us-central1
VERTEX_IMAGE_MODEL=imagen-3.0-generate-001

VERTEX_VIDEO_MODEL=veo-3.0-generate-preview
VERTEX_VIDEO_LOCATION=us-central1

# One of these:
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
# or
GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\service-account.json
```

## 4a) Image Generation – Step-by-step flow & identity preservation

The image pipeline supports two modes via `POST /api/generate-image`:

- Step mode (recommended for UX): perform one transformation at a time in the sequence pose → location → accessory → makeup. Each step:
  - Uses the previous image as input (`inputImageUrl`),
  - Optionally includes a category reference image (e.g., the selected pose image) as a secondary reference,
  - Adds the original user image as an identity anchor so the face/body remain the same,
  - Uploads the result to Cloudinary and returns the new URL.

- Full compose mode: generate a final image in one shot from `poseId`, `locationId`, `accessories[]`, `makeup[]`, preserving identity.

Models
- Default image model: `imagen-3.0-generate-001` (region: `us-central1`)
- Gemini option for step mode: `gemini-2.5-flash-image-preview` (region: `global`) with REST fallback when SDK routing fails

Minimal example (step mode)
```bash
curl -X POST http://localhost:3000/api/generate-image \
  -H "Content-Type: application/json" \
  -d '{
    "step": "pose",
    "inputImageUrl": "<previous_or_user_image_url>",
    "userImageUrl": "<original_user_image_url>",
    "poseId": 123
  }'
```

Notes
- The backend automatically includes helpful reference fields for different providers (e.g., `image`, `input_image`, `inlineData`) and normalizes the returned bytes.
- Rate limits are handled with exponential backoff; on persistent failure, a clear message is returned with a safe fallback image.

## 4b) Video Generation (Veo 3) – Setup & Troubleshooting

Endpoint: `POST /api/generate-video`
- Input: `{ imageUrl: string, customPrompt?: string, generationId?: string, plan?: 'fast'|'standard' }`
- Output: uploads generated video to Cloudinary (mp4) and returns the URL; falls back to a sample video if Veo is unavailable.

Environment variables
- `VERTEX_VIDEO_MODEL` (choose one): `veo-3.0-generate-preview` or `veo-3.0-fast-generate-preview`
- `VERTEX_VIDEO_LOCATION`: `us-central1`

Quota requirements (Google Cloud)
- Veo 3 requires explicit quota enablement. In Vertex AI Quotas, request online prediction quota for the chosen base model in `us-central1`.
- Ensure billing is enabled on the project and access is granted in Model Garden.

Common errors
- 429 RESOURCE_EXHAUSTED
  - Meaning: Project quota not provisioned or depleted for Veo in this region.
  - Fix: Request quota for `veo-3.0-generate-preview` (and/or fast) in `us-central1`. Wait for approval; then retry.
- 404 NOT_FOUND
  - Meaning: Model name/variant not available for this project/region.
  - Fix: Use one of the supported IDs above; confirm region is `us-central1`; verify the model is visible in Model Garden for your project.

Quick verification (read-only model artifact)
```bash
# Requires gcloud auth application-default login or a service account token
curl -s \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/$PROJECT/locations/us-central1/publishers/google/models/veo-3.0-generate-preview"
```

Minimal example
```bash
curl -X POST http://localhost:3000/api/generate-video \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "<final_image_url>",
    "customPrompt": "Elegant fashion camera moves",
    "plan": "fast"
  }'
```


```

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



## 9) UI Enhancements – Category thumbnails with DB URLs & fallbacks

- Thumbnails are rendered directly from database URLs for `pose`, `location`, `accessory`, and `makeup` categories.
- Robust fallbacks
  - Broken or missing URLs gracefully show a placeholder thumbnail (no layout shift).
  - Errors are logged to aid curation of category assets.
- Selection UX
  - Clicking a tile selects it; compact icon buttons remain for Replace / Regenerate / Delete.
  - Tooltips and `aria-label`s improve accessibility; clear focus styles for keyboard users.
- Performance
  - Thumbnails are lazily loaded and consistently cropped to keep the grid compact and readable.

## 10) Troubleshooting

### Video generation (Veo 3)
- 429 RESOURCE_EXHAUSTED
  - Cause: Project quota not provisioned or depleted for Veo in this region.
  - Fix: Request online prediction quota for `veo-3.0-generate-preview` (and/or fast) in `us-central1`. Ensure billing is enabled. Wait for approval, then retry.
- 404 NOT_FOUND
  - Cause: Model name/variant not available for this project/region.
  - Fix: Use one of the supported IDs (`veo-3.0-generate-preview`, `veo-3.0-fast-generate-preview`), set `VERTEX_VIDEO_LOCATION=us-central1`, and verify the model is visible in Model Garden.
- Quick read-only check of model artifact
  ```bash
  curl -s \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    "https://us-central1-aiplatform.googleapis.com/v1/projects/$PROJECT/locations/us-central1/publishers/google/models/veo-3.0-generate-preview"
  ```

### Image generation (Gemini / Imagen)
- "Found unsupported response mime type"
  - Cause: Using `responseMimeType` with multimodal Gemini request.
  - Resolution: Use `responseModalities: ['TEXT','IMAGE']` (already implemented) or switch to Imagen 3.
- 404 Model not found (Gemini)
  - Use Imagen 3 fallback by setting `VERTEX_IMAGE_MODEL=imagen-3.0-generate-001` and `VERTEX_LOCATION=us-central1`, or request access to `gemini-2.5-flash-image-preview` in `global`.

### Cloudinary
- 400/401 errors
  - Verify `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
  - Videos are uploaded with `resource_type: 'video'`; images use `resource_type: 'auto'`.

### Database
- Connection or schema issues
  - Check `DATABASE_URL` is set in both local `.env` and Vercel env.
  - For dev, you can call `/api/init-db` to create tables.

### Local development
- App not reachable on http://localhost:3000
  - Run: `npm run build` then `npm run dev` (runs `vercel dev`).
  - If running Vite alongside, ensure `client/vite.config.js` proxies `/api` -> 3000.
