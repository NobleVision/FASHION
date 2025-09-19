const { ok, fail } = require('./_lib/http')
const { getCloudinary } = require('./_lib/cloudinary')

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // Check if Cloudinary environment variables are set
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('Cloudinary not configured - missing environment variables')
      return ok(res, {
        images: [],
        total: 0,
        message: 'Cloudinary not configured'
      })
    }

    const cloudinary = getCloudinary()
    if (!cloudinary) {
      return fail(res, 'Cloudinary not configured')
    }

    // Fetch images from the dedicated folder only
    const folder = 'fashionforge'
    const result = await cloudinary.search
      .expression(`resource_type:image AND folder="${folder}"`)
      .sort_by('created_at', 'desc')
      .max_results(50)
      .execute()

    const images = (result.resources || []).map(resource => ({
      id: resource.public_id,
      url: resource.secure_url,
      created_at: resource.created_at,
      width: resource.width,
      height: resource.height,
      format: resource.format,
      bytes: resource.bytes,
      folder: resource.folder
    }))

    return ok(res, {
      images,
      total: (typeof result.total_count === 'number' ? result.total_count : images.length)
    })

  } catch (error) {
    console.error('Error fetching uploaded images:', error)
    return fail(res, `Failed to fetch uploaded images: ${error.message}`)
  }
}
