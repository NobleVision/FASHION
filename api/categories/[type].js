const { ok, fail } = require('../_lib/http')
const { getPool } = require('../_lib/db')

module.exports = async (req, res) => {
  try {
    const pool = getPool()
    if (!pool) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { type } = req.query || {}
    const { rows } = await pool.query(
      'SELECT * FROM categories WHERE type = $1 ORDER BY created_at DESC',
      [type]
    )
    return ok(res, rows)
  } catch (err) {
    return fail(res, err)
  }
}

