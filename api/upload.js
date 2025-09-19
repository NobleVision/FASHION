const { getCloudinary } = require('./_lib/cloudinary')
const { ok, fail } = require('./_lib/http')

// Upload endpoint that handles base64 data
module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const cloudinary = getCloudinary()

    // Parse JSON body
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })

    req.on('end', async () => {
      try {
        const { image, mimeType } = JSON.parse(body)

        if (!image) {
          return res.status(400).json({ error: 'No image data provided' })
        }

        // Create data URI for Cloudinary
        const dataUri = `data:${mimeType || 'image/jpeg'};base64,${image}`

        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload(
            dataUri,
            { resource_type: 'image', folder: 'fashionforge' },
            (err, result) => {
              if (err) return reject(err)
              resolve(result)
            }
          )
        })

        return ok(res, {
          url: result.secure_url,
          message: 'Image uploaded successfully'
        })
      } catch (err) {
        return fail(res, err)
      }
    })

    req.on('error', (err) => {
      return fail(res, err)
    })

  } catch (err) {
    return fail(res, err)
  }
}
