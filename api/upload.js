const Busboy = require('busboy')
const { getCloudinary } = require('./_lib/cloudinary')
const { getPool } = require('./_lib/db')
const { ok, fail } = require('./_lib/http')

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const cloudinary = getCloudinary()
  const bb = Busboy({ headers: req.headers })

  const fields = {}
  let imageUrl = null
  let hadFile = false
  let uploadErr = null

  bb.on('field', (name, val) => {
    fields[name] = val
  })

  bb.on('file', (_name, file, info) => {
    hadFile = true
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'fashionforge' },
      (err, result) => {
        if (err) uploadErr = err
        else imageUrl = result.secure_url
      }
    )
    file.pipe(stream)
  })

  bb.on('error', (err) => fail(res, err))

  bb.on('finish', async () => {
    try {
      if (uploadErr) return fail(res, uploadErr)
      if (!hadFile || !imageUrl) {
        return res.status(400).json({ error: 'No file uploaded' })
      }

      const { type, subcategory, name } = fields
      const pool = getPool()
      if (pool) {
        const { rows } = await pool.query(
          'INSERT INTO categories (type, subcategory, name, url, is_default) VALUES ($1, $2, $3, $4, false) RETURNING *',
          [type, subcategory, name, imageUrl]
        )
        return ok(res, rows[0])
      }

      return ok(res, {
        url: imageUrl,
        type,
        subcategory,
        name,
        message: 'Image uploaded but not saved to database (DB not configured)'
      })
    } catch (err) {
      return fail(res, err)
    }
  })

  req.pipe(bb)
}

