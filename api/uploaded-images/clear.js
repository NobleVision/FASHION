const { ok, fail } = require('../_lib/http')
const { getCloudinary } = require('../_lib/cloudinary')

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const cloudinary = getCloudinary()
    if (!cloudinary) return fail(res, 'Cloudinary not configured', 500)

    const folder = 'fashionforge'
    const prefix = `${folder}/`

    let deleted = {}
    let next_cursor = undefined

    // Delete in pages if there are more than 500 resources
    do {
      const resp = await cloudinary.api.delete_resources_by_prefix(prefix, { resource_type: 'image', next_cursor })
      deleted = { ...deleted, ...(resp.deleted || {}) }
      next_cursor = resp.next_cursor
    } while (next_cursor)

    return ok(res, { folder, prefix, deletedCount: Object.keys(deleted).length, deleted })
  } catch (err) {
    return fail(res, err)
  }
}

