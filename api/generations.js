const { ok, fail } = require('./_lib/http')
const { getPool } = require('./_lib/db')

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const pool = getPool()
    if (!pool) return res.status(500).json({ error: 'Database not configured' })
    const { rows } = await pool.query('SELECT * FROM generations ORDER BY created_at DESC LIMIT 50')
    return ok(res, rows)
  } catch (err) {
    return fail(res, err)
  }
}

