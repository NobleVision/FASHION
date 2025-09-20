const { ok, fail } = require('./_lib/http')
const { getPool } = require('./_lib/db')
const { getCloudinary } = require('./_lib/cloudinary')
const { getGoogleAuth, getCredentialsObject } = require('./_lib/vertex')

async function imageUrlToBase64(url) {
  try {
    const resp = await fetch(url)
    const buf = await resp.arrayBuffer()
    return Buffer.from(buf).toString('base64')
  } catch (e) {
    console.error('Error converting image to base64:', e)
    return null
  }
}

async function uploadBase64ToCloudinary(base64Data, mimeType, folder = 'fashionforge') {
  const cloudinary = getCloudinary()
  const dataUri = `data:${mimeType};base64,${base64Data}`
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      dataUri,
      { resource_type: 'auto', folder },
      (err, result) => {
        if (err) return reject(err)
        resolve(result.secure_url)
      }
    )
  })
}

async function vertexGenerateImage(prompt, primaryImageBase64 = null, extraImagesBase64 = []) {
  // Robust generation with retry + exponential backoff for quota exhaustion
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID || process.env.GCP_PROJECT || process.env.PROJECT_ID || 'fashion-472519'
    const location = 'us-central1'
    const baseModelId = process.env.VERTEX_IMAGE_MODEL || process.env.VTX_IMAGE_MODEL || 'imagen-3.0-generate-001'
    let modelId = baseModelId
    const isImagen = /^imagen/i.test(modelId)
    let sdkLocation = process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
    const endpoint = isImagen
      ? `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predict`
      : null

    // Build a flexible instance that includes commonly recognized fields for image-to-image
    const instance = { prompt }
    if (primaryImageBase64) {
      instance.image = { bytesBase64Encoded: primaryImageBase64 }
      instance.input_image = primaryImageBase64
      instance.image_base64 = primaryImageBase64
    }
    if (Array.isArray(extraImagesBase64) && extraImagesBase64.length > 0) {
      const [img2, img3] = extraImagesBase64
      if (img2) {
        instance.reference_image = img2
        instance.style_image = img2
        instance.image2 = img2
        instance.image_2 = img2
      }
      if (img3) {
        instance.image3 = img3
        instance.image_3 = img3
      }
      instance.images = [primaryImageBase64, ...extraImagesBase64].filter(Boolean)
    }

    const requestBody = {
      instances: [instance],
      parameters: {
        sampleCount: 1,
        aspectRatio: '1:1',
        safetyFilterLevel: 'block_some',
        personGeneration: 'allow_adult'
      }
    }

    console.log(`[${new Date().toISOString()}] 🧠 Vertex model selected: ${modelId} (${isImagen ? 'REST Imagen path' : 'SDK generative path'})`)

    const MAX_RETRIES = 3
    const messages = []
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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

    // If using a Gemini model (or any non-Imagen model), use the SDK request loop directly
    if (!isImagen) {
      // Candidates to try if the requested model isn't available in this project/region yet
      const candidates = Array.from(new Set([
        modelId,
        'gemini-2.5-flash-image-preview',
        // Older preview image-capable Gemini model (fallback)
        'gemini-2.0-flash-preview-image-generation'
      ])).filter(m => !/^imagen/i.test(m))
      // Gemini image-capable models are often served from the 'global' location. Try it first, then regional fallbacks.
      const regionCandidates = Array.from(new Set([
        sdkLocation || 'global',
        'global',
        'us-central1',
        'us-east5',
        'europe-west4'
      ]))
      let modelIndex = 0
      let locIndex = 0
      let currentLocation = regionCandidates[locIndex]
      while (true) {
        try {
          const { VertexAI } = require('@google-cloud/vertexai')
          const credentials = getCredentialsObject()
          const project = projectId
          console.log(`[${new Date().toISOString()}] ▶ Vertex SDK request`, {
          modelId: candidates[modelIndex],
            hasCreds: Boolean(credentials), project,
            hasPrimary: Boolean(primaryImageBase64),
            extraCount: Array.isArray(extraImagesBase64) ? extraImagesBase64.length : 0,
            attempt: attempts,
            sdkLocation: currentLocation
          })
          const vertex_ai = new VertexAI({ project, location: currentLocation, googleAuthOptions: credentials ? { credentials } : undefined })
          const model = vertex_ai.preview.getGenerativeModel({ model: candidates[modelIndex] })
          const parts = [{ text: prompt }]
          if (primaryImageBase64) parts.push({ inlineData: { mimeType: 'image/png', data: primaryImageBase64 } })
          if (Array.isArray(extraImagesBase64)) for (const b64 of extraImagesBase64) if (b64) parts.push({ inlineData: { mimeType: 'image/png', data: b64 } })
          const request = { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.4, responseModalities: ['TEXT', 'IMAGE'] } }
          const sdkResult = await model.generateContent(request)
          const sdkParts = sdkResult?.response?.candidates?.[0]?.content?.parts || []
          const inline = sdkParts.find(p => p.inlineData || p.inline_data)
          console.log(`[${new Date().toISOString()}] ◀ Vertex SDK result`, { partsReturned: sdkParts.length, hasInline: Boolean(inline), inlineLen: inline?.inline_data?.data?.length || 0 })
          const out = (inline?.inlineData?.data) || (inline?.inline_data?.data)
          const outMime = (inline?.inlineData?.mimeType) || (inline?.inline_data?.mime_type) || 'image/png'
          if (out) return { success: true, imageBase64: out, mimeType: outMime, messages, retryAttempts: attempts }
        } catch (sdkErr) {
          const raw = sdkErr?.message || sdkErr
          const code = sdkErr?.code || sdkErr?.status
          const rawStr = typeof raw === 'string' ? raw : String(raw)
          const notFound = /not\s*found/i.test(rawStr) || code === 404
          const htmlResp = /<!DOCTYPE/i.test(rawStr)

          // REST fallback for global location to bypass SDK routing quirks
          if (currentLocation === 'global') {
            try {
              const auth = getGoogleAuth()
              const client = await auth.getClient()
              const { token } = await client.getAccessToken()

              const restParts = [{ text: prompt }]
              if (primaryImageBase64) restParts.push({ inline_data: { mime_type: 'image/png', data: primaryImageBase64 } })
              if (Array.isArray(extraImagesBase64)) for (const b64 of extraImagesBase64) if (b64) restParts.push({ inline_data: { mime_type: 'image/png', data: b64 } })

              const body = {
                contents: [{ role: 'user', parts: restParts }],
                generation_config: { temperature: 0.4, response_modalities: ['TEXT','IMAGE'] }
              }
              const url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${currentLocation}/publishers/google/models/${candidates[modelIndex]}:generateContent`
              const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
              })
              const data = await resp.json().catch(() => null)
              if (resp.ok) {
                const prts = data?.candidates?.[0]?.content?.parts || []
                const inline = prts.find(p => p.inline_data || p.inlineData)
                const out = (inline?.inline_data?.data) || (inline?.inlineData?.data)
                const outMime = (inline?.inline_data?.mime_type) || (inline?.inlineData?.mimeType) || 'image/png'
                console.log(`[${new Date().toISOString()}] ◀ Vertex REST result`, { partsReturned: prts.length, hasInline: Boolean(inline), inlineLen: out?.length || 0, outMime })
                if (out) return { success: true, imageBase64: out, mimeType: outMime, messages, retryAttempts: attempts }
              } else if (resp.status === 404) {
                const msg = `Model ${candidates[modelIndex]} not found in region ${currentLocation} (REST).`
                messages.push(msg)
                // Region or model fallback
                if (locIndex < regionCandidates.length - 1) {
                  locIndex++
                  currentLocation = regionCandidates[locIndex]
                  console.warn(`[${new Date().toISOString()}] 🔁 Trying region fallback: ${currentLocation}`)
                  await new Promise(r => setTimeout(r, 200))
                  continue
                }
                if (modelIndex < candidates.length - 1) {
                  modelIndex++
                  locIndex = 0
                  currentLocation = regionCandidates[locIndex]
                  console.warn(`[${new Date().toISOString()}] 🔁 Trying fallback model: ${candidates[modelIndex]} in region ${currentLocation}`)
                  await new Promise(r => setTimeout(r, 200))
                  continue
                }
                messages.push('No more Gemini image-capable model or region candidates to try. Verify model availability in your project/region or use Imagen 3.')
                return { success: false, error: 'Using fallback image', messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
              } else {
                const errMsg = data?.error?.message || data?.message || JSON.stringify(data)
                console.warn(`[${new Date().toISOString()}] ⚠️ Vertex REST generateContent failed: ${resp.status} ${errMsg}`)
              }
            } catch (restErr) {
              console.warn(`[${new Date().toISOString()}] ⚠️ Vertex REST generateContent threw:`, restErr?.message || restErr)
            }
          }

          if (notFound || htmlResp) {
            const triedModel = candidates[modelIndex]
            const why = notFound ? 'not found' : 'invalid HTML response (likely wrong region)'
            const msg = `Model ${triedModel} ${why} in region ${currentLocation}.`
            messages.push(msg)
            // Try next region if available
            if (locIndex < regionCandidates.length - 1) {
              locIndex++
              currentLocation = regionCandidates[locIndex]
              console.warn(`[${new Date().toISOString()}] 🔁 Trying region fallback: ${currentLocation}`)
              await new Promise(r => setTimeout(r, 200))
              continue
            }
            // Try next model candidate if available
            if (modelIndex < candidates.length - 1) {
              modelIndex++
              locIndex = 0
              currentLocation = regionCandidates[locIndex]
              console.warn(`[${new Date().toISOString()}] 🔁 Trying fallback model: ${candidates[modelIndex]} in region ${currentLocation}`)
              await new Promise(r => setTimeout(r, 200))
              continue
            }
            messages.push('No more Gemini image-capable model or region candidates to try. Verify model availability in your project/region or use Imagen 3.')
            return { success: false, error: 'Using fallback image', messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
          }
          if (isRateLimited(sdkErr?.code, raw)) {
            if (attempts < MAX_RETRIES) {
              const delaySec = Math.pow(2, attempts + 1)
              const msg = attempts === 0
                ? `API rate limit reached. Pausing for ${delaySec} seconds before retry (attempt 1 of ${MAX_RETRIES})...`
                : `Still rate limited. Waiting ${delaySec} seconds before retry (attempt ${attempts + 1} of ${MAX_RETRIES})...`
              messages.push(msg)
              console.warn(`[${new Date().toISOString()}] ⏳ ${msg}`)
              await sleep(delaySec * 1000)
              attempts++
              continue
            } else {
              const msg = 'Rate limit exceeded. Please try again in a few minutes.'
              console.error(`[${new Date().toISOString()}] ❌ ${msg}`)
              return { success: false, error: msg, rateLimited: true, messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
            }
          }

          // If we get here, the SDK failed with a non-not-found error. Try next region/model before giving up.
          console.warn(`[${new Date().toISOString()}] ⚠️ Vertex SDK request failed:`, raw)
          if (locIndex < regionCandidates.length - 1) {
            locIndex++
            currentLocation = regionCandidates[locIndex]
            console.warn(`[${new Date().toISOString()}] 🔁 Trying region fallback: ${currentLocation}`)
            await new Promise(r => setTimeout(r, 200))
            continue
          }
          if (modelIndex < candidates.length - 1) {
            modelIndex++
            locIndex = 0
            currentLocation = regionCandidates[locIndex]
            console.warn(`[${new Date().toISOString()}] 🔁 Trying fallback model: ${candidates[modelIndex]} in region ${currentLocation}`)
            await new Promise(r => setTimeout(r, 200))
            continue
          }
          messages.push('No more Gemini image-capable model or region candidates to try. Verify model availability in your project/region or use Imagen 3.')
          return { success: false, error: 'Using fallback image', messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
        }
      }
    }
    while (true) {
      // Acquire a fresh access token for each attempt
      const auth = getGoogleAuth()
      const client = await auth.getClient()
      const { token } = await client.getAccessToken()

      console.log(`[${new Date().toISOString()}] ▶ Vertex REST request`, {
        modelId,
        projectId,
        hasPrimary: Boolean(primaryImageBase64),
        extraCount: Array.isArray(extraImagesBase64) ? extraImagesBase64.length : 0,
        attempt: attempts
      })

      // 1) REST path (with timeout and detailed logging)
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
        const dur = Date.now() - t0
        if (netErr?.name === 'AbortError') {
          console.error(`[${new Date().toISOString()}] ⏱️ Vertex REST request timed out after ${dur}ms`)
        } else {
          console.error(`[${new Date().toISOString()}] 🌐 Vertex REST network error after ${dur}ms:`, netErr?.message || netErr)
        }
        clearTimeout(timeoutId)
        // Continue to SDK path or backoff if rate-limited indicated in message
        const raw = netErr?.message || ''
        if (isRateLimited(undefined, raw)) {
          // handled by SDK catch below; proceed to backoff loop
        }
        // fall through to SDK fallback
        resp = null
      }
      clearTimeout(timeoutId)

      if (!resp || !resp.ok) {
        const status = resp?.status
        const errText = resp ? (await resp.text().catch(() => '')) : 'No response (network/timeout)'
        if (isRateLimited(status, errText)) {
          if (attempts < MAX_RETRIES) {
            const delaySec = Math.pow(2, attempts + 1) // 2,4,8
            const msg = attempts === 0
              ? `API rate limit reached. Pausing for ${delaySec} seconds before retry (attempt 1 of ${MAX_RETRIES})...`
              : `Still rate limited. Waiting ${delaySec} seconds before retry (attempt ${attempts + 1} of ${MAX_RETRIES})...`
            messages.push(msg)
            console.warn(`[${new Date().toISOString()}] ⏳ ${msg}`)
            await sleep(delaySec * 1000)
            attempts++
            continue
          } else {
            const msg = 'Rate limit exceeded. Please try again in a few minutes.'
            console.error(`[${new Date().toISOString()}] ❌ ${msg}`)
            return { success: false, error: msg, rateLimited: true, messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
          }
        } else {
          console.error(`[${new Date().toISOString()}] ❌ Vertex AI REST error:`, resp.status, errText?.slice(0, 300))
          // Fall through to SDK attempt (no backoff unless that also rate-limits)
        }
      } else {
        const dur = Date.now() - t0
        console.log(`[${new Date().toISOString()}] \u2705 Vertex REST response received`, { status: resp.status, durationMs: dur })
        const data = await resp.json()
        const pred = data?.predictions?.[0]
        const candidates = data?.candidates?.[0]
        let out = (
          (pred && (pred.bytesBase64Encoded || pred.imageBytesBase64 || pred.base64 || pred.image)) ||
          (pred?.image && pred.image.bytesBase64Encoded) ||
          (pred?.media && pred.media[0] && (pred.media[0].bytesBase64Encoded || pred.media[0].data)) ||
          (candidates?.content?.parts || []).find(p => p.inline_data)?.inline_data?.data
        )
        let mt = pred?.mimeType || pred?.mime_type || 'image/png'
        if (out) return { success: true, imageBase64: out, mimeType: mt, messages, retryAttempts: attempts }

        // No image found -> log and try SDK
        try {
          const keys = Object.keys(data || {})
          console.warn(`[${new Date().toISOString()}] ℹ️ Unexpected Vertex response shape (no image). Top-level keys:`, keys)
          const predKeys = pred ? Object.keys(pred) : null
          const candLen = (candidates?.content?.parts || []).length
          console.warn(`[${new Date().toISOString()}] ℹ️ REST response summary`, { predKeys, candLen })
        } catch {}
      }

      // 2) SDK fallback for this attempt
      try {
        const { VertexAI } = require('@google-cloud/vertexai')
        const credentials = getCredentialsObject()
        const project = projectId
        console.log(`[${new Date().toISOString()}] ▶ Vertex SDK fallback starting`, {
          hasCreds: Boolean(credentials), project,
          hasPrimary: Boolean(primaryImageBase64),
          extraCount: Array.isArray(extraImagesBase64) ? extraImagesBase64.length : 0,
          attempt: attempts,
          sdkLocation
        })
        const vertex_ai = new VertexAI({ project, location: sdkLocation, googleAuthOptions: credentials ? { credentials } : undefined })
        const model = vertex_ai.preview.getGenerativeModel({ model: modelId })
        const parts = [{ text: prompt }]
        if (primaryImageBase64) parts.push({ inlineData: { mimeType: 'image/png', data: primaryImageBase64 } })
        if (Array.isArray(extraImagesBase64)) for (const b64 of extraImagesBase64) if (b64) parts.push({ inlineData: { mimeType: 'image/png', data: b64 } })
        const request = { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.4, responseMimeType: 'image/png' } }
        const sdkResult = await model.generateContent(request)
        const sdkParts = sdkResult?.response?.candidates?.[0]?.content?.parts || []
        const inline = sdkParts.find(p => p.inlineData || p.inline_data)
        console.log(`[${new Date().toISOString()}] ◀ Vertex SDK result`, { partsReturned: sdkParts.length, hasInline: Boolean(inline), inlineLen: (inline?.inlineData?.data?.length || inline?.inline_data?.data?.length || 0) })
        const out = (inline?.inlineData?.data) || (inline?.inline_data?.data)
        if (out) return { success: true, imageBase64: out, mimeType: 'image/png', messages, retryAttempts: attempts }
      } catch (sdkErr) {
        const raw = sdkErr?.message || sdkErr
        if (isRateLimited(sdkErr?.code, raw)) {
          if (attempts < MAX_RETRIES) {
            const delaySec = Math.pow(2, attempts + 1)
            const msg = attempts === 0
              ? `API rate limit reached. Pausing for ${delaySec} seconds before retry (attempt 1 of ${MAX_RETRIES})...`
              : `Still rate limited. Waiting ${delaySec} seconds before retry (attempt ${attempts + 1} of ${MAX_RETRIES})...`
            messages.push(msg)
            console.warn(`[${new Date().toISOString()}] ⏳ ${msg}`)
            await sleep(delaySec * 1000)
            attempts++
            continue
          } else {
            const msg = 'Rate limit exceeded. Please try again in a few minutes.'
            console.error(`[${new Date().toISOString()}] ❌ ${msg}`)
            return { success: false, error: msg, rateLimited: true, messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
          }
        }
        console.warn(`[${new Date().toISOString()}] ⚠️ Vertex SDK fallback failed:`, raw)
      }

      // If we reach here, neither REST nor SDK yielded an image and it wasn't rate-limited -> give up
      return { success: false, error: 'Using fallback image', messages, retryAttempts: attempts, fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80' }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Vertex AI generation failed:`, error?.message || error)
    return {
      success: false,
      error: 'Using fallback image',
      fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80'
    }
  }
}

function buildLabel(row) {
  return `${row.name}${row.subcategory ? ` (${row.subcategory})` : ''}`
}

module.exports = async (req, res) => {
  try {

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { userImageUrl, accessories = [], poseId, locationId, makeup = [] } = body

    if (!poseId || !locationId) {
      return res.status(400).json({ error: 'Pose and location are required' })
    }

    const pool = getPool()
    if (!pool) return res.status(500).json({ error: 'Database not configured' })

    // Fetch pose and location
    const poseResult = await pool.query('SELECT * FROM categories WHERE id = $1 AND type = $2', [poseId, 'pose'])
    const locationResult = await pool.query('SELECT * FROM categories WHERE id = $1 AND type = $2', [locationId, 'location'])
    if (poseResult.rows.length === 0 || locationResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid pose or location ID' })
    }

    const pose = poseResult.rows[0]
    const location = locationResult.rows[0]

    // Accessory and makeup details
    let accessoryDetails = []
    let makeupDetails = []

    if (Array.isArray(accessories) && accessories.length > 0) {
      const q = await pool.query('SELECT * FROM categories WHERE id = ANY($1) AND type = $2', [accessories, 'accessory'])
      accessoryDetails = q.rows
    }
    if (Array.isArray(makeup) && makeup.length > 0) {
      const q = await pool.query('SELECT * FROM categories WHERE id = ANY($1) AND type = $2', [makeup, 'makeup'])
      makeupDetails = q.rows
    }
    // Step-by-step mode: perform a single incremental transformation and return
    const { step, inputImageUrl, accessoryId, makeupId } = body
    if (step) {
      let inputUrl = inputImageUrl || userImageUrl
      if (!inputUrl) return res.status(400).json({ error: 'inputImageUrl or userImageUrl required for step mode' })

      // Convert input to base64
      let inputBase64 = null
      if (inputUrl.startsWith('data:')) inputBase64 = inputUrl.split(',')[1]
      else inputBase64 = await imageUrlToBase64(inputUrl)
      if (!inputBase64) return res.status(400).json({ error: 'Could not read input image for step' })

      let stepPrompt = ''
      let extraRefs = [] // optional extra reference images to condition on
      let refDebug = []  // urls we attempted to include (for logs)
      if (step === 'pose') {
        const poseLbl = buildLabel(pose)
        // Try to include the pose reference image as the 2nd image
        if (pose?.url) {
          const poseRef = await imageUrlToBase64(pose.url)
          if (poseRef) extraRefs.push(poseRef)
          refDebug.push(pose?.url)
        }
        stepPrompt = `Take the person from the first image and put them in the pose shown in the second image (${poseLbl}). Preserve the person's identity, face, and body exactly. Do not alter gender, age, skin tone, hair, facial structure, or body proportions. The first image is the person to keep unchanged; any additional image(s) are pose/style references only.`
      } else if (step === 'location') {
        const locLbl = buildLabel(location)
        if (location?.url) {
          const locRef = await imageUrlToBase64(location.url)
          if (locRef) extraRefs.push(locRef)
          refDebug.push(location?.url)
        }
        stepPrompt = `Use the first image as the subject to keep unchanged. Place this same person in ${locLbl} using the second image as a background reference only. Keep the pose and identity unchanged. Do not modify the person's face, hair, body, or proportions. Only adjust background and lighting to match the location.`
      } else if (step === 'accessory') {
        // Choose target accessory
        let accRow = null
        if (accessoryId) {
          const q = await pool.query('SELECT * FROM categories WHERE id = $1 AND type = $2', [accessoryId, 'accessory'])
          accRow = q.rows[0]
        } else if (accessoryDetails[0]) accRow = accessoryDetails[0]
        const accLbl = accRow ? buildLabel(accRow) : 'selected accessory'
        if (accRow?.url) {
          const accRef = await imageUrlToBase64(accRow.url)
          if (accRef) extraRefs.push(accRef)
          refDebug.push(accRow?.url)
        }
        stepPrompt = `Use the first image as the subject to keep unchanged. Using the second image only as an accessory reference, add ${accLbl} to the same person. Do not change identity, pose, location, clothing fit, or expression.`
      } else if (step === 'makeup') {
        let mkRow = null
        if (makeupId) {
          const q = await pool.query('SELECT * FROM categories WHERE id = $1 AND type = $2', [makeupId, 'makeup'])
          mkRow = q.rows[0]
        } else if (makeupDetails[0]) mkRow = makeupDetails[0]
        const mkLbl = mkRow ? buildLabel(mkRow) : 'selected makeup style'
        if (mkRow?.url) {
          const mkRef = await imageUrlToBase64(mkRow.url)
          if (mkRef) extraRefs.push(mkRef)
          refDebug.push(mkRow?.url)
        }
        stepPrompt = `Use the first image as the subject to keep unchanged. Using the second image only as a makeup reference, apply ${mkLbl} to the same person. Keep everything else unchanged. Do not change identity, pose, or location.`
      } else {
        return res.status(400).json({ error: 'Unknown step' })
      }

      // Identity anchor: include the original user image as an additional reference
      try {
        const shouldAddIdentityAnchor = Boolean(userImageUrl) && typeof userImageUrl === 'string' && userImageUrl !== inputUrl
        if (shouldAddIdentityAnchor) {
          let idRef = null
          if (userImageUrl.startsWith('data:')) idRef = userImageUrl.split(',')[1]
          else idRef = await imageUrlToBase64(userImageUrl)
          if (idRef) {
            extraRefs.push(idRef)
            refDebug.push(userImageUrl + ' (identity anchor)')
          }
        }
      } catch (e) {
        console.warn('Failed to add identity anchor reference:', e?.message || e)
      }

      const stepTs = new Date().toISOString()
      console.log(`[${stepTs}] 🔁 Step mode -> ${step}`)
      console.log(`[${stepTs}] 📝 Step prompt:`, stepPrompt)
      console.log(`[${stepTs}] 🖼️ Using ${extraRefs.length} reference image(s):`, refDebug.filter(Boolean))

      const stepResult = await vertexGenerateImage(stepPrompt, inputBase64, extraRefs)
      let stepUrl
      // Save step outputs into category-specific folders to avoid polluting general uploads
      const stepFolder = `fashionforge/${step}`
      if (stepResult.success) {
        stepUrl = await uploadBase64ToCloudinary(stepResult.imageBase64, stepResult.mimeType, stepFolder)
      } else {
        const fb = await imageUrlToBase64(stepResult.fallbackUrl)
        stepUrl = fb ? await uploadBase64ToCloudinary(fb, 'image/jpeg', stepFolder) : stepResult.fallbackUrl
      }

      return ok(res, { imageUrl: stepUrl, step, prompt: stepPrompt, messages: stepResult.messages || [], retryAttempts: stepResult.retryAttempts || 0, rateLimited: Boolean(stepResult.rateLimited) })
    }


    // Build an identity-preserving prompt
    const poseLabel = `${pose.name}${pose.subcategory ? ` (${pose.subcategory})` : ''}`
    const locationLabel = `${location.name}${location.subcategory ? ` (${location.subcategory})` : ''}`
    const accessoriesLabel = accessoryDetails.length > 0
      ? accessoryDetails.map(a => `${a.name}${a.subcategory ? ` (${a.subcategory})` : ''}`).join(', ')
      : 'none'
    const makeupLabel = makeupDetails.length > 0
      ? makeupDetails.map(m => `${m.name}${m.subcategory ? ` (${m.subcategory})` : ''}`).join(', ')
      : 'none'

    const prompt = `High-fashion editorial photograph of THE SAME PERSON from the reference image. Preserve the subject's identity exactly. Do not change gender, age, skin tone, hair color/style, facial structure, or body proportions. Keep the same face and body; no face replacement, no identity swap.

POSE: ${poseLabel}
LOCATION: ${locationLabel}
ACCESSORIES: ${accessoriesLabel}
MAKEUP: ${makeupLabel}

Guidance: Photorealistic, magazine quality, professional lighting, editorial fashion. Prioritize identity preservation over styling changes. Only modify wardrobe, accessories, makeup, and background per selections. Avoid any changes to the person's identity or presentation. No cartoonish effects; keep realistic.`

    const ts = new Date().toISOString()
    console.log(`[${ts}] 🎨 Generating image with Imagen 3`)
    console.log(`[${ts}] 👤 User image URL:`, userImageUrl || '(none)')
    console.log(`[${ts}] 🧭 Selections -> pose: ${poseLabel}; location: ${locationLabel}; accessories: ${accessoriesLabel}; makeup: ${makeupLabel}`)
    console.log(`[${ts}] 📝 Prompt:`, prompt)

    // Convert user image to base64 when provided
    let userImageBase64 = null
    if (userImageUrl && typeof userImageUrl === 'string') {
      if (userImageUrl.startsWith('http')) {
        userImageBase64 = await imageUrlToBase64(userImageUrl)
      } else if (userImageUrl.startsWith('data:')) {
        userImageBase64 = userImageUrl.split(',')[1]
      }
    }
    console.log(`[${new Date().toISOString()}] F Reference image base64 present:`, Boolean(userImageBase64))
    console.log(`[${new Date().toISOString()}] 🖼️ Reference image base64 present:`, Boolean(userImageBase64))


    // Generate image via Vertex AI (userImageBase64 may be ignored by backend but kept for compatibility)
    const result = await vertexGenerateImage(prompt, userImageBase64)

    let finalImageUrl
    let generationStatus = 'success'
    let errorMessage = null

    if (result.success) {
      // Store final generated images in a dedicated folder separate from user uploads
      finalImageUrl = await uploadBase64ToCloudinary(result.imageBase64, result.mimeType, 'fashionforge/generated')
      console.log('✅ Image generated and uploaded successfully')
    } else {
      // Upload fallback image to Cloudinary as well
      try {
        const fallbackBase64 = await imageUrlToBase64(result.fallbackUrl)
        if (fallbackBase64) {
          finalImageUrl = await uploadBase64ToCloudinary(fallbackBase64, 'image/jpeg', 'fashionforge/generated')
          console.log('✅ Fallback image uploaded to Cloudinary')
        } else {
          finalImageUrl = result.fallbackUrl
          console.log('⚠️  Failed to convert fallback to base64, using original URL')
        }
      } catch (uploadErr) {
        console.error('❌ Failed to upload fallback to Cloudinary:', uploadErr)
        finalImageUrl = result.fallbackUrl
      }
      generationStatus = 'fallback'
      errorMessage = result.error
      console.log('⚠️  Using fallback image due to error:', result.error)
    }

    // Save generation
    const selectedItems = body
    const { rows } = await pool.query(
      'INSERT INTO generations (user_image_url, selected_items, prompt, output_image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [userImageUrl, JSON.stringify(selectedItems), prompt, finalImageUrl]
    )

    return ok(res, {
      imageUrl: finalImageUrl,
      generationId: rows[0].id,
      prompt,
      status: generationStatus,
      error: errorMessage,
      message: result.success
        ? 'Image generated with Imagen 3!'
        : (result.rateLimited ? 'Rate limit exceeded. Please try again in a few minutes.' : 'Using fallback image - check Vertex AI configuration'),
      messages: result.messages || [],
      retryAttempts: result.retryAttempts || 0,
      rateLimited: Boolean(result.rateLimited)
    })
  } catch (err) {
    console.error('❌ Generation error:', err)
    return fail(res, err)
  }
}

