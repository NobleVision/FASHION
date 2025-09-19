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

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { userImageUrl, selectedCategories } = body

    if (!userImageUrl) {
      return fail(res, 'User image URL is required')
    }

    if (!selectedCategories || Object.keys(selectedCategories).length === 0) {
      return fail(res, 'At least one category selection is required')
    }

    // Get Google AI client
    const auth = getGoogleAuth()
    if (!auth) {
      return fail(res, 'Google AI not configured')
    }

    // Convert user image to base64
    const userImageBase64 = await imageUrlToBase64(userImageUrl)
    if (!userImageBase64) {
      return fail(res, 'Failed to process user image')
    }

    // Get database connection
    const pool = getPool()
    if (!pool) {
      return fail(res, 'Database not configured')
    }

    // Fetch selected category items from database
    const categoryItems = {}
    for (const [categoryType, itemId] of Object.entries(selectedCategories)) {
      if (itemId) {
        const result = await pool.query(
          'SELECT * FROM categories WHERE id = $1 AND type = $2',
          [itemId, categoryType]
        )
        if (result.rows.length > 0) {
          categoryItems[categoryType] = result.rows[0]
        }
      }
    }

    // Build prompt for fashion generation
    const categoryDescriptions = Object.entries(categoryItems)
      .map(([type, item]) => `${type}: ${item.name}`)
      .join(', ')

    const prompt = `Generate a fashion look for this person with the following style elements: ${categoryDescriptions}. 
    Create a realistic fashion photo that shows the person wearing or styled with these elements. 
    Maintain the person's appearance and pose while incorporating the selected fashion elements naturally.
    The result should look like a professional fashion photograph.`

    console.log('Generating fashion look with prompt:', prompt)

    // Import Vertex AI
    const { VertexAI } = require('@google-cloud/vertexai')
    const vertex_ai = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT_ID,
      location: 'us-central1',
      googleAuthOptions: { credentials: auth }
    })

    const model = vertex_ai.preview.getGenerativeModel({
      model: 'imagen-3.0-generate-001',
    })

    const request = {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: userImageBase64
            }
          }
        ]
      }],
      generation_config: {
        max_output_tokens: 8192,
        temperature: 0.4,
        top_p: 0.95,
      },
    }

    console.log('Sending request to Vertex AI...')
    const result = await model.generateContent(request)
    
    if (!result.response?.candidates?.[0]?.content?.parts?.[0]) {
      console.error('Unexpected Vertex AI response structure:', JSON.stringify(result, null, 2))
      return fail(res, 'Failed to generate fashion look - unexpected response format')
    }

    const generatedImageData = result.response.candidates[0].content.parts[0].inline_data?.data
    if (!generatedImageData) {
      console.error('No image data in response:', JSON.stringify(result.response.candidates[0], null, 2))
      return fail(res, 'Failed to generate fashion look - no image data returned')
    }

    console.log('Fashion look generated, uploading to Cloudinary...')

    // Upload generated image to Cloudinary
    const generatedImageUrl = await uploadBase64ToCloudinary(
      generatedImageData,
      'image/png',
      'fashionforge/generated'
    )

    console.log('Fashion look uploaded to:', generatedImageUrl)

    // Store generation record in database (optional)
    try {
      await pool.query(
        `INSERT INTO generations (user_image_url, generated_image_url, selected_categories, created_at) 
         VALUES ($1, $2, $3, NOW())`,
        [userImageUrl, generatedImageUrl, JSON.stringify(selectedCategories)]
      )
    } catch (dbError) {
      console.warn('Failed to store generation record:', dbError.message)
      // Don't fail the request if database storage fails
    }

    return ok(res, {
      generatedImageUrl,
      userImageUrl,
      selectedCategories: categoryItems,
      message: 'Fashion look generated successfully'
    })

  } catch (error) {
    console.error('Fashion generation error:', error)
    return fail(res, `Fashion generation failed: ${error.message}`)
  }
}
