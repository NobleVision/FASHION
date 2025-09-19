const { ok, fail } = require('./_lib/http')
const { getPool } = require('./_lib/db')

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const pool = getPool()
    if (!pool) return res.status(500).json({ error: 'Database not configured' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { generationId } = body
    if (!generationId) return res.status(400).json({ error: 'generationId is required' })

    await pool.query('DELETE FROM generations WHERE id = $1', [generationId])
    return ok(res, { success: true })
  } catch (err) {
    return fail(res, err)
  }
}

