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

async function uploadBase64VideoToCloudinary(base64Data, mimeType = 'video/mp4', folder = 'fashionforge/videos') {
  const cloudinary = getCloudinary()
  const dataUri = `data:${mimeType};base64,${base64Data}`
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      dataUri,
      { resource_type: 'video', folder },
      (err, result) => {
        if (err) return reject(err)
        resolve(result.secure_url)
      }
    )
  })
}

async function vertexGenerateVideo(imageBase64, prompt, plan = 'fast') {
  // Attempt a REST call to Veo 3; prefer a cost-optimized/fast tier when available.
  try {
    const auth = getGoogleAuth()
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()
    const projectId = process.env.VERTEX_AI_PROJECT_ID || 'fashion-472519'
    const location = 'us-central1'

    // Try fast/economy first (if unsupported, we fall back to standard)
    const modelAttempts = [
      // Hypothetical fast/economy variants first
      `projects/${projectId}/locations/${location}/publishers/google/models/veo-3.0-fast-generate-preview`,
      `projects/${projectId}/locations/${location}/publishers/google/models/veo-2.0-fast-generate-001`,
      // Standard models
      `projects/${projectId}/locations/${location}/publishers/google/models/veo-3.0-generate-preview`,
      `projects/${projectId}/locations/${location}/publishers/google/models/veo-2.0-generate-001`,
      // Legacy catch-all
      `projects/${projectId}/locations/${location}/publishers/google/models/veo-3.0`
    ]

    const commonParameters = {
      output_mime_type: 'video/mp4',
      sampleCount: 1,
      durationSeconds: 5,
      // Hints for economical tier (if the backend honors them)
      preset: plan === 'fast' ? 'economy' : 'standard',
      plan: plan,
      mode: plan === 'fast' ? 'FAST' : 'STANDARD'
    }

    const requestBody = (parametersOverride = {}) => ({
      instances: [{
        prompt,
        // Some Veo endpoints accept an inline base64 image under a field like "image" or "input_image".
        // We provide both; unsupported fields will be ignored by the backend.
        image: imageBase64,
        input_image: imageBase64
      }],
      parameters: { ...commonParameters, ...parametersOverride }
    })

    let lastErrText = ''
    for (const modelPath of modelAttempts) {
      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/${modelPath}:predict`
      console.log(`[Veo] Attempting model: ${modelPath} (plan=${plan})`)
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody())
      })
      if (resp.ok) {
        const data = await resp.json()
        const pred = data?.predictions?.[0]
        if (pred?.bytesBase64Encoded) {
          return { success: true, videoBase64: pred.bytesBase64Encoded, mimeType: pred.mimeType || 'video/mp4' }
        }
        // Some endpoints may return a different field name
        if (pred?.videoBytesBase64) {
          return { success: true, videoBase64: pred.videoBytesBase64, mimeType: pred.mimeType || 'video/mp4' }
        }
      } else {
        const errBody = await resp.text().catch(() => '')
        lastErrText = `${resp.status} ${errBody}`
        console.warn(`[Veo] Model attempt failed: ${modelPath} -> ${lastErrText}`)
        continue
      }
    }

    throw new Error(`All Veo attempts failed. Last error: ${lastErrText}`)
  } catch (error) {
    console.error('Vertex AI video generation failed:', error?.message || error)
    return {
      success: false,
      error: 'Using fallback video',
      fallbackUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
    }
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { imageUrl, customPrompt = '', generationId, plan = 'fast' } = body

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required for video generation' })
    }

    // Build video prompt exactly as in Express
    const videoPrompt = `Create an elegant fashion video animation from this static image. The video should feature:\n\n- A professional fashion model with graceful, fluid movements\n- Sophisticated poses and transitions typical of high-end fashion campaigns  \n- Smooth camera movements and professional cinematography\n- Luxurious lighting and atmosphere\n- Duration: 5 seconds\n- High-quality, cinematic motion\n${customPrompt ? `- Additional styling: ${customPrompt}` : ''}\n\nStyle: Premium fashion commercial, elegant movement, magazine-quality production, sophisticated and alluring.`

    // Convert image to base64
    let imageBase64
    if (imageUrl.startsWith('data:')) imageBase64 = imageUrl.split(',')[1]
    else imageBase64 = await imageUrlToBase64(imageUrl)

    if (!imageBase64) {
      return res.status(400).json({ error: 'Could not process input image' })
    }

    // Request video generation (prefer economical/fast plan)
    const result = await vertexGenerateVideo(imageBase64, videoPrompt, plan)

    let finalVideoUrl
    let generationStatus = 'success'
    let errorMessage = null

    if (result.success) {
      finalVideoUrl = await uploadBase64VideoToCloudinary(result.videoBase64, result.mimeType)
      console.log('✅ Video generated and uploaded successfully')
    } else {
      finalVideoUrl = result.fallbackUrl
      generationStatus = 'fallback'
      errorMessage = result.error
      console.log('⚠️  Using fallback video due to error:', result.error)
    }

    // Update generation record with video URL (if provided and DB configured)
    const pool = getPool()
    if (pool && generationId) {
      await pool.query('UPDATE generations SET output_video_url = $1 WHERE id = $2', [finalVideoUrl, generationId])
    }

    return ok(res, {
      videoUrl: finalVideoUrl,
      prompt: videoPrompt,
      status: generationStatus,
      error: errorMessage,
      message: result.success ? 'Video generated with Veo 3!' : 'Using fallback video - check Vertex AI configuration'
    })
  } catch (err) {
    console.error('❌ Video generation error:', err)
    return fail(res, err)
  }
}

