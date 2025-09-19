const { ok, fail } = require('./_lib/http')
const { getPool } = require('./_lib/db')

// Seed minimal default rows per category type, only if that type is empty
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const pool = getPool()
    if (!pool) return res.status(500).json({ error: 'Database not configured' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    let { types } = body

    const allTypes = ['accessory', 'pose', 'location', 'makeup']
    if (!types || (Array.isArray(types) && types.length === 0) || types === 'all') {
      types = allTypes
    }
    if (typeof types === 'string') types = [types]

    const seeds = {
      accessory: [
        { subcategory: 'eyewear', name: 'Sunglasses', url: 'https://images.unsplash.com/photo-1503342394121-480f7a6bba3a?w=800&q=80' }
      ],
      pose: [
        { subcategory: 'test', name: 'Pose One', url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80' }
      ],
      location: [
        { subcategory: 'studio', name: 'Studio', url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80' }
      ],
      makeup: [
        { subcategory: 'natural', name: 'Natural Makeup', url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&q=80' }
      ]
    }

    const results = {}

    for (const type of types) {
      if (!allTypes.includes(type)) continue
      const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM categories WHERE type = $1', [type])
      const count = countRows[0]?.count || 0
      if (count > 0) {
        results[type] = { skipped: true, reason: 'Already has items' }
        continue
      }

      const list = seeds[type] || []
      let inserted = 0
      for (const item of list) {
        await pool.query(
          'INSERT INTO categories (type, subcategory, name, url, is_default) VALUES ($1, $2, $3, $4, true)',
          [type, item.subcategory, item.name, item.url]
        )
        inserted += 1
      }
      results[type] = { inserted }
    }

    return ok(res, { seeded: results })
  } catch (err) {
    return fail(res, err)
  }
}

