const { ok, fail } = require('../../_lib/http')
const { getPool } = require('../../_lib/db')

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

    const pool = getPool()
    if (!pool) return res.status(500).json({ error: 'Database not configured' })

    const { type, id } = req.query || {}
    if (!type || !id) return res.status(400).json({ error: 'type and id are required' })

    const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1 AND type = $2', [id, type])
    if (rowCount === 0) return res.status(404).json({ error: 'Category item not found' })

    return ok(res, { success: true })
  } catch (err) {
    return fail(res, err)
  }
}

