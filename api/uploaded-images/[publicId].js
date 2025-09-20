const { ok, fail } = require('../_lib/http')
const { getCloudinary } = require('../_lib/cloudinary')

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    if (req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const cloudinary = getCloudinary()
    if (!cloudinary) return fail(res, 'Cloudinary not configured', 500)

    const publicIdRaw = (req.query && req.query.publicId) || ''
    if (!publicIdRaw) {
      return res.status(400).json({ error: 'publicId required' })
    }
    const publicId = decodeURIComponent(String(publicIdRaw))

    // Perform deletion
    // destroy() is idempotent: returns { result: 'ok' } or { result: 'not found' }
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true, resource_type: 'image' })

    if (result && (result.result === 'ok' || result.result === 'pending')) {
      return ok(res, { deleted: true, publicId, result })
    }
    if (result && result.result === 'not found') {
      return res.status(404).json({ deleted: false, publicId, error: 'not found' })
    }

    // Unknown response
    return fail(res, `Unexpected Cloudinary response: ${JSON.stringify(result)}`)
  } catch (err) {
    // Graceful error handling
    return fail(res, err)
  }
}

