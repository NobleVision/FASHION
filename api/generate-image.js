const { ok, fail } = require('./_lib/http')
const { getPool } = require('./_lib/db')
const { getCloudinary } = require('./_lib/cloudinary')
const { getGoogleAuth } = require('./_lib/vertex')

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

async function vertexGenerateImage(prompt) {
  // Implements REST call similar to server/services/vertexai-rest.js
  try {
    const auth = getGoogleAuth()
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()
    const projectId = process.env.VERTEX_AI_PROJECT_ID || 'fashion-472519'
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

    console.log(`[${new Date().toISOString()}] ▶ Vertex REST request:`, JSON.stringify(requestBody))

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
    if (pred?.bytesBase64Encoded) {
      return { success: true, imageBase64: pred.bytesBase64Encoded, mimeType: pred.mimeType || 'image/png' }
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

