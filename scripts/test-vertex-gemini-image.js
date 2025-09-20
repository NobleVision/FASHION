#!/usr/bin/env node
/*
 Simple smoke test for Gemini 2.5 Flash Image (Preview) on Vertex AI using REST.
 - Uses the same credential discovery as the app (api/_lib/vertex.js).
 - Calls the global endpoint with a text-only prompt and requests PNG output.
 - Prints the HTTP status and whether inline image bytes were returned.

 Usage:
   node scripts/test-vertex-gemini-image.js \
     --project fashion-472519 \
     --model gemini-2.5-flash-image-preview \
     --text "generate a simple icon of a red heart on a white background"

 Environment variables it respects (all optional):
   GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS (file path)
   GOOGLE_CLOUD_PROJECT_ID
   VERTEX_IMAGE_MODEL

 Note: This performs a paid API call if successful.
*/

const { getGoogleAuth } = require('../api/_lib/vertex')

function parseArgs() {
  const args = process.argv.slice(2)
  const out = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '')
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true
      out[key] = val
    }
  }
  return out
}

async function main() {
  const { project: cliProject, model: cliModel, text: cliText } = parseArgs()
  const projectId = cliProject || process.env.GOOGLE_CLOUD_PROJECT_ID || 'fashion-472519'
  const modelId = cliModel || process.env.VERTEX_IMAGE_MODEL || 'gemini-2.5-flash-image-preview'
  const prompt = cliText || 'generate an image of a penguin driving a taxi in New York City'

  const url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${modelId}:generateContent`

  const parts = [{ text: prompt }]
  const body = {
    contents: [{ role: 'user', parts }],
    generation_config: { response_modalities: ['TEXT','IMAGE'], temperature: 0.2 }
  }

  const auth = getGoogleAuth()
  const client = await auth.getClient()
  const { token } = await client.getAccessToken()

  console.log('▶ Test request', { projectId, modelId, prompt })

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const json = await resp.json().catch(() => ({}))
  const partsOut = json?.candidates?.[0]?.content?.parts || []
  const inline = partsOut.find(p => p.inline_data || p.inlineData)
  const bytesLen = (inline?.inline_data?.data || inline?.inlineData?.data || '').length

  console.log('◀ Test response', { status: resp.status, ok: resp.ok, parts: partsOut.length, hasInline: Boolean(inline), bytesLen })
  if (!resp.ok) {
    console.error('Error payload:', JSON.stringify(json, null, 2))
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error('Test script failed:', err?.message || err)
  process.exitCode = 1
})

