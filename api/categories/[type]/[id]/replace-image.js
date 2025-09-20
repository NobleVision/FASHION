const { ok, fail } = require('../../../_lib/http')
const { getPool } = require('../../../_lib/db')
const { getCloudinary } = require('../../../_lib/cloudinary')

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

    // Expect JSON body with { image, mimeType }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { image, mimeType } = body
    if (!image) return res.status(400).json({ error: 'image (base64) is required' })

    const cloudinary = getCloudinary()
    const dataUri = `data:${mimeType || 'image/jpeg'};base64,${image}`

    // Upload to Cloudinary under category-specific folder
    const folder = `fashionforge/${type}`
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        dataUri,
        { resource_type: 'image', folder },
        (err, uploadRes) => {
          if (err) return reject(err)
          resolve(uploadRes)
        }
      )
    })

    const imageUrl = result.secure_url

    const { rows } = await pool.query(
      'UPDATE categories SET url = $1 WHERE id = $2 AND type = $3 RETURNING *',
      [imageUrl, id, type]
    )

    if (rows.length === 0) return res.status(404).json({ error: 'Category item not found' })

    return ok(res, { item: rows[0] })
  } catch (err) {
    return fail(res, err)
  }
}

