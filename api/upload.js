const Busboy = require('busboy')
const { getCloudinary } = require('./_lib/cloudinary')
const { getPool } = require('./_lib/db')
const { ok, fail } = require('./_lib/http')

// NOTE: In serverless environments, Busboy's 'finish' can fire before the
// Cloudinary upload_stream callback. We must await the upload to avoid
// returning 400 even though Cloudinary eventually stores the file.
module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const cloudinary = getCloudinary()
  const bb = Busboy({ headers: req.headers })

  const fields = {}
  let hadFile = false
  let uploadPromise = null

  bb.on('field', (name, val) => {
    fields[name] = val
  })

  bb.on('file', (_name, file, info) => {
    // Process only the first file; drain others
    if (hadFile) {
      file.resume()
      return
    }
    hadFile = true

    uploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'fashionforge' },
        (err, result) => {
          if (err) return reject(err)
          return resolve(result?.secure_url)
        }
      )
      file.on('error', reject)
      file.pipe(stream)
    })
  })

  bb.on('error', (err) => fail(res, err))

  bb.on('finish', async () => {
    try {
      if (!hadFile) {
        return res.status(400).json({ error: 'No file uploaded' })
      }

      const imageUrl = await (uploadPromise || Promise.resolve(null))
      if (!imageUrl) {
        return res.status(400).json({ error: 'Upload failed' })
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
