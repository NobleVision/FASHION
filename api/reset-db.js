const { ok, fail } = require('./_lib/http')
const { getPool } = require('./_lib/db')

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const pool = getPool()
    if (!pool) return res.status(500).json({ error: 'Database not configured' })
    console.log('🗑️  Resetting database...')
    await pool.query('DELETE FROM categories WHERE is_default = true')
    return ok(res, { success: true, message: 'Database reset complete' })
  } catch (err) {
    console.error('❌ Database reset failed:', err)
    return fail(res, err)
  }
}

