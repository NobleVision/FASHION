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
  // REST call to Imagen 3 with optional image conditioning (single or multi-image hints)
  try {
    const auth = getGoogleAuth()
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()
    const projectId = process.env.VERTEX_AI_PROJECT_ID || 'fashion-472519'
    const location = 'us-central1'
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`

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

    console.log(`[${new Date().toISOString()}] ▶ Vertex REST request`, {
      hasPrimary: Boolean(primaryImageBase64),
      extraCount: Array.isArray(extraImagesBase64) ? extraImagesBase64.length : 0,
      prompt: prompt?.slice(0, 180)
    })

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '')
      console.error(`[${new Date().toISOString()}] ❌ Vertex AI API error:`, resp.status, errBody)
      throw new Error(`Vertex AI API error: ${resp.status}`)
    }

    const data = await resp.json()
    const pred = data?.predictions?.[0]
    const candidates = data?.candidates?.[0]

    // Try several common output locations
    let out = (
      (pred && (pred.bytesBase64Encoded || pred.imageBytesBase64 || pred.base64 || pred.image)) ||
      (pred?.image && pred.image.bytesBase64Encoded) ||
      (pred?.media && pred.media[0] && (pred.media[0].bytesBase64Encoded || pred.media[0].data)) ||
      (candidates?.content?.parts || []).find(p => p.inline_data)?.inline_data?.data
    )
    let mt = pred?.mimeType || pred?.mime_type || 'image/png'

    if (!out) {
      // Log unexpected shape for troubleshooting
      try {
        const keys = Object.keys(data || {})
        console.warn(`[${new Date().toISOString()}] ℹ️ Unexpected Vertex response shape (no image). Top-level keys:`, keys)
      } catch {}

      // SDK fallback using official client (more tolerant to schema changes)
      try {
        const { VertexAI } = require('@google-cloud/vertexai')
        let credentials
        try {
          const raw = process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS
          if (raw && raw.trim().startsWith('{')) credentials = JSON.parse(raw)
        } catch {}
        const project = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID || 'fashion-472519'
        const vertex_ai = new (VertexAI)({
          project,
          location: 'us-central1',
          googleAuthOptions: credentials ? { credentials } : undefined
        })
        const model = vertex_ai.preview.getGenerativeModel({ model: 'imagen-3.0-generate-001' })
        const parts = [{ text: prompt }]
        if (primaryImageBase64) parts.push({ inline_data: { mime_type: 'image/png', data: primaryImageBase64 } })
        if (Array.isArray(extraImagesBase64)) {
          for (const b64 of extraImagesBase64) if (b64) parts.push({ inline_data: { mime_type: 'image/png', data: b64 } })
        }
        const request = { contents: [{ role: 'user', parts }], generation_config: { temperature: 0.4 } }
        const sdkResult = await model.generateContent(request)
        out = sdkResult?.response?.candidates?.[0]?.content?.parts?.find(p => p.inline_data)?.inline_data?.data
        mt = 'image/png'
      } catch (sdkErr) {
        console.warn(`[${new Date().toISOString()}] ⚠️ Vertex SDK fallback failed:`, sdkErr?.message || sdkErr)
      }
    }

    if (out) {
      return { success: true, imageBase64: out, mimeType: mt }
    }

    throw new Error('No image data in response')
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
      if (step === 'pose') {
        const poseLbl = buildLabel(pose)
        // Try to include the pose reference image as the 2nd image
        if (pose?.url) {
          const poseRef = await imageUrlToBase64(pose.url)
          if (poseRef) extraRefs.push(poseRef)
        }
        stepPrompt = `Take the person from the first image and put them in the pose shown in the second image (${poseLbl}). Preserve the person's identity, face, and body exactly. Do not alter gender, age, skin tone, hair, facial structure, or body proportions.`
      } else if (step === 'location') {
        const locLbl = buildLabel(location)
        if (location?.url) {
          const locRef = await imageUrlToBase64(location.url)
          if (locRef) extraRefs.push(locRef)
        }
        stepPrompt = `Take the person from this image and place them in ${locLbl}. Keep the pose and identity unchanged. Maintain the same person without any facial or body changes.`
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
        }
        stepPrompt = `Add ${accLbl} to the person in this image. Do not change the person's identity, pose, or location. Keep everything else the same.`
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
        }
        stepPrompt = `Apply ${mkLbl} to the person in this image. Keep everything else unchanged. Do not change identity, pose, or location.`
      } else {
        return res.status(400).json({ error: 'Unknown step' })
      }

      const stepTs = new Date().toISOString()
      console.log(`[${stepTs}] 🔁 Step mode -> ${step}`)
      console.log(`[${stepTs}] 📝 Step prompt:`, stepPrompt)

      const stepResult = await vertexGenerateImage(stepPrompt, inputBase64, extraRefs)
      let stepUrl
      if (stepResult.success) {
        stepUrl = await uploadBase64ToCloudinary(stepResult.imageBase64, stepResult.mimeType)
      } else {
        const fb = await imageUrlToBase64(stepResult.fallbackUrl)
        stepUrl = fb ? await uploadBase64ToCloudinary(fb, 'image/jpeg') : stepResult.fallbackUrl
      }

      return ok(res, { imageUrl: stepUrl, step, prompt: stepPrompt })
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
      finalImageUrl = await uploadBase64ToCloudinary(result.imageBase64, result.mimeType)
      console.log('✅ Image generated and uploaded successfully')
    } else {
      // Upload fallback image to Cloudinary as well
      try {
        const fallbackBase64 = await imageUrlToBase64(result.fallbackUrl)
        if (fallbackBase64) {
          finalImageUrl = await uploadBase64ToCloudinary(fallbackBase64, 'image/jpeg')
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
      message: result.success ? 'Image generated with Imagen 3!' : 'Using fallback image - check Vertex AI configuration'
    })
  } catch (err) {
    console.error('❌ Generation error:', err)
    return fail(res, err)
  }
}

