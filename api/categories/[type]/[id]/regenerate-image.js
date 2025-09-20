const { ok, fail } = require('../../../_lib/http')
const { getPool } = require('../../../_lib/db')
const { getCloudinary } = require('../../../_lib/cloudinary')
const { getGoogleAuth, getCredentialsObject } = require('../../../_lib/vertex')

async function uploadBase64ToCloudinary(base64Data, mimeType, folder = 'fashionforge') {
  const cloudinary = getCloudinary()
  const dataUri = `data:${mimeType};base64,${base64Data}`
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      dataUri,
      { resource_type: 'image', folder },
      (err, result) => {
        if (err) return reject(err)
        resolve(result.secure_url)
      }
    )
  })
}

async function vertexGenerateImage(prompt) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID || process.env.GCP_PROJECT || process.env.PROJECT_ID || 'fashion-472519'
  const location = 'us-central1'
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`

  const requestBody = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '1:1',
      safetyFilterLevel: 'block_some',
      personGeneration: 'allow_adult'
    }
  }

  const MAX_RETRIES = 3
  const messages = []
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const isRateLimited = (statusOrErr, details) => {
    try {
      if (statusOrErr === 429) return true
      const raw = typeof details === 'string' ? details : JSON.stringify(details || {})
      return (
        raw.includes('RESOURCE_EXHAUSTED') ||
        raw.includes('Too Many Requests') ||
        raw.includes('Quota exceeded') ||
        raw.includes('per_minute_per_project')
      )
    } catch { return false }
  }

  let attempts = 0
  while (true) {
    const auth = getGoogleAuth()
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()

    const controller = new AbortController()
    const TIMEOUT_MS = 60000
    const t0 = Date.now()
    const timeoutId = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS)
    let resp
    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })
    } catch (netErr) {
      // fallthrough to SDK
      resp = null
    }
    clearTimeout(timeoutId)

    if (resp && resp.ok) {
      const data = await resp.json()
      const pred = data?.predictions?.[0]
      const candidates = data?.candidates?.[0]
      const out = (
        (pred && (pred.bytesBase64Encoded || pred.imageBytesBase64 || pred.base64 || pred.image)) ||
        (pred?.image && pred.image.bytesBase64Encoded) ||
        (pred?.media && pred.media[0] && (pred.media[0].bytesBase64Encoded || pred.media[0].data)) ||
        (candidates?.content?.parts || []).find(p => p.inline_data)?.inline_data?.data
      )
      const mt = pred?.mimeType || pred?.mime_type || 'image/png'
      if (out) return { success: true, imageBase64: out, mimeType: mt, messages, retryAttempts: attempts }
    } else {
      const status = resp?.status
      const errText = resp ? (await resp.text().catch(() => '')) : ''
      if (isRateLimited(status, errText)) {
        if (attempts < MAX_RETRIES) {
          const delaySec = Math.pow(2, attempts + 1)
          messages.push(`Rate limited. Retrying in ${delaySec}s...`)
          await sleep(delaySec * 1000)
          attempts++
          continue
        } else {
          return { success: false, error: 'Rate limit exceeded', rateLimited: true, messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
        }
      }
    }

    // SDK fallback
    try {
      const { VertexAI } = require('@google-cloud/vertexai')
      const credentials = getCredentialsObject()
      const vertex_ai = new VertexAI({ project: projectId, location: 'us-central1', googleAuthOptions: credentials ? { credentials } : undefined })
      const model = vertex_ai.preview.getGenerativeModel({ model: 'imagen-3.0-generate-001' })
      const parts = [{ text: prompt }]
      const request = { contents: [{ role: 'user', parts }], generation_config: { temperature: 0.4 } }
      const sdkResult = await model.generateContent(request)
      const sdkParts = sdkResult?.response?.candidates?.[0]?.content?.parts || []
      const inline = sdkParts.find(p => p.inline_data)
      const out = inline?.inline_data?.data
      if (out) return { success: true, imageBase64: out, mimeType: 'image/png', messages, retryAttempts: attempts }
    } catch (sdkErr) {
      const raw = sdkErr?.message || sdkErr
      if (isRateLimited(sdkErr?.code, raw)) {
        if (attempts < MAX_RETRIES) {
          const delaySec = Math.pow(2, attempts + 1)
          messages.push(`Rate limited. Retrying in ${delaySec}s...`)
          await sleep(delaySec * 1000)
          attempts++
          continue
        } else {
          return { success: false, error: 'Rate limit exceeded', rateLimited: true, messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
        }
      }
    }

    return { success: false, error: 'Using fallback image', messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
  }
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const pool = getPool()
    if (!pool) return res.status(500).json({ error: 'Database not configured' })

    const { type, id } = req.query || {}
    if (!type || !id) return res.status(400).json({ error: 'type and id are required' })

    const { rows } = await pool.query('SELECT * FROM categories WHERE id = $1 AND type = $2', [id, type])
    if (rows.length === 0) return res.status(404).json({ error: 'Category item not found' })

    const item = rows[0]
    const label = `${item.name}${item.subcategory ? ` (${item.subcategory})` : ''}`
    const prompt = `High-quality product thumbnail for fashion ${type}: ${label}. Crisp, neutral studio background, centered subject, well-lit, photorealistic. Avoid text and logos. 1:1 aspect.`

    const result = await vertexGenerateImage(prompt)
    let finalUrl
    const folder = `fashionforge/${type}`
    if (result.success) {
      finalUrl = await uploadBase64ToCloudinary(result.imageBase64, result.mimeType, folder)
    } else {
      // Upload fallback to Cloudinary to standardize storage
      try {
        const resp = await fetch(result.fallbackUrl)
        const buf = await resp.arrayBuffer()
        const b64 = Buffer.from(buf).toString('base64')
        finalUrl = await uploadBase64ToCloudinary(b64, 'image/jpeg', folder)
      } catch {
        finalUrl = result.fallbackUrl
      }
    }

    const { rows: updated } = await pool.query('UPDATE categories SET url = $1 WHERE id = $2 AND type = $3 RETURNING *', [finalUrl, id, type])
    return ok(res, { item: updated[0], rateLimited: Boolean(result.rateLimited), messages: result.messages || [], retryAttempts: result.retryAttempts || 0 })
  } catch (err) {
    return fail(res, err)
  }
}

