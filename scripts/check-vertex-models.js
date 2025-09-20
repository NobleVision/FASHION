#!/usr/bin/env node
/*
  check-vertex-models.js
  Lists Model Garden publisher models available to your project per region, with focus on Gemini 2.5 Flash Image (Preview).

  Usage:
    - Ensure gcloud auth or service account credentials are set via env. This script uses the same auth as the API code.
    - Set project via one of: GOOGLE_CLOUD_PROJECT_ID | VERTEX_AI_PROJECT_ID | GCP_PROJECT | PROJECT_ID
    - Optional: VERTEX_PROBE_REGIONS="us-central1,us-east5,europe-west4"

    npm run check:models
    # or
    node scripts/check-vertex-models.js
*/

const axios = require('axios')
const path = require('path')
// Load project .env (one directory up from scripts/)
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
const { getGoogleAuth } = require('../api/_lib/vertex')

async function main() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID || process.env.GCP_PROJECT || process.env.PROJECT_ID
  if (!projectId) {
    console.error('❌ Please set GOOGLE_CLOUD_PROJECT_ID (or VERTEX_AI_PROJECT_ID/GCP_PROJECT/PROJECT_ID) in your environment.')
    process.exit(1)
  }

  const regionEnv = process.env.VERTEX_PROBE_REGIONS
  const regionsOfInterest = regionEnv ? regionEnv.split(/[ ,]+/).filter(Boolean) : ['us-central1', 'us-east5', 'europe-west4']
  const query = 'listAllVersions=True&filter=is_deployable(true)'

  const auth = getGoogleAuth()
  const client = await auth.getClient()
  const tok = await client.getAccessToken()
  const token = (typeof tok === 'string') ? tok : (tok && tok.token) || ''
  if (!token) {
    console.error('❌ Failed to obtain access token from Google Auth')
    process.exit(2)
  }

  console.log(`🔎 Project: ${projectId}`)
  console.log(`🌍 Regions of interest: ${regionsOfInterest.join(', ')}`)
  console.log(`🔧 Env -> VERTEX_IMAGE_MODEL=${process.env.VERTEX_IMAGE_MODEL || process.env.VTX_IMAGE_MODEL || '(unset)'} | VERTEX_LOCATION=${process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || '(unset)'}\n`)

  // Query Model Garden publishers endpoints (project-scoped first), then fall back to global listings
  const endpoints = [
    `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/-/models?${query}`,
    `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/-/models?${query}`,
    `https://aiplatform.googleapis.com/v1beta1/publishers/*/models?${query}`,
    `https://aiplatform.googleapis.com/v1/publishers/*/models?${query}`
  ]

  let items = []
  let lastErr = null
  for (const url of endpoints) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-goog-user-project': projectId
        },
        timeout: 45000
      })
      items = Array.isArray(data?.publisherModels) ? data.publisherModels : []
      console.log(`🌐 Model Garden list fetched from: ${url}`)
      break
    } catch (e) {
      lastErr = e
      console.warn(`⚠️  Failed to query ${url}:`, e?.response?.status || e?.code || e?.message)
    }
  }

  if (items.length === 0) {
    console.log('\n=== Summary ===')
    console.log('❌ Could not retrieve Model Garden publisher models for this project.')
    if (lastErr) console.log(`   Last error: ${lastErr?.response?.status || lastErr?.code || lastErr?.message}`)
    console.log('   Make sure Vertex AI API is enabled and your credentials have access to Model Garden.')
    process.exit(0)
  }

  // Helper to derive regions from supportedActions.*.references keys
  function extractRegions(model) {
    const regions = new Set()
    try {
      const sa = model?.supportedActions || {}
      for (const k of Object.keys(sa)) {
        const refs = sa[k]?.references
        if (refs && typeof refs === 'object') {
          for (const r of Object.keys(refs)) regions.add(r)
        }
      }
    } catch {}
    return Array.from(regions)
  }

  const byName = (s) => items.filter(m => (m.name || '').toLowerCase().includes(s))
  const geminiImg = byName('gemini-2.5-flash-image-preview').map(m => ({ ...m, regions: extractRegions(m) }))
  const gemini2PrevImg = byName('gemini-2.0-flash-preview-image-generation').map(m => ({ ...m, regions: extractRegions(m) }))
  const imagen = items.filter(m => /imagen/i.test((m.name||'')) || /imagen/i.test((m.displayName||''))).map(m => ({ ...m, regions: extractRegions(m) }))

  console.log('\n=== Gemini Image Models ===')
  if (geminiImg.length > 0) {
    for (const m of geminiImg) {
      console.log(`✅ ${m.name} | ${m.displayName || ''} | regions: ${(m.regions || []).join(', ') || '(none shown)'}`)
    }
  } else {
    console.log('❌ Gemini 2.5 Flash Image (Preview) not present in listing for this project.')
  }

  if (gemini2PrevImg.length > 0) {
    for (const m of gemini2PrevImg) {
      console.log(`ℹ️  ${m.name} | ${m.displayName || ''} | regions: ${(m.regions || []).join(', ') || '(none shown)'}`)
    }
  }

  if (imagen.length > 0) {
    console.log('\n📸 Imagen models:')
    for (const m of imagen) console.log(`  - ${m.name} | ${m.displayName || ''} | regions: ${(m.regions || []).join(', ') || '(none shown)'}`)
  }

  console.log('\n=== Summary ===')
  if (geminiImg.length > 0) {
    // Find first overlap with user's regions of interest
    const roi = new Set(regionsOfInterest)
    let chosen = null
    for (const m of geminiImg) {
      const hit = (m.regions || []).find(r => roi.has(r))
      if (hit) { chosen = { region: hit, model: m }; break }
    }
    if (!chosen) {
      // pick first region if any
      const r0 = (geminiImg[0].regions || [])[0]
      if (r0) chosen = { region: r0, model: geminiImg[0] }
    }
    console.log('✅ Gemini 2.5 Flash Image (Preview) appears in Model Garden for this project.')
    if (chosen) {
      console.log(`   Suggested env:\n   VERTEX_IMAGE_MODEL=gemini-2.5-flash-image-preview\n   VERTEX_LOCATION=${chosen.region}`)
    } else {
      console.log('   No regions were advertised in supportedActions; try us-central1 first.')
    }
  } else {
    console.log('❌ Gemini 2.5 Flash Image (Preview) not found in Model Garden listing for this project.')
    console.log('   Next steps: Check Model Garden in the console, or open a Google Cloud support case to enable the model for your project.')
  }
}

main().catch(err => {
  console.error('❌ Unhandled error:', err)
  process.exit(3)
})
