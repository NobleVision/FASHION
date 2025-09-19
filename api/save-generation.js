const { ok, fail } = require('./_lib/http')
const { getPool } = require('./_lib/db')

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const pool = getPool()
    if (!pool) return res.status(500).json({ error: 'Database not configured' })
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { generationId, name } = body
    const { rows } = await pool.query('UPDATE generations SET name = $1 WHERE id = $2 RETURNING *', [name, generationId])
    return ok(res, rows[0])
  } catch (err) {
    return fail(res, err)
  }
}

