const { ok, fail } = require('../_lib/http')
const { getPool } = require('../_lib/db')

module.exports = async (req, res) => {
  try {
    const pool = getPool()
    if (!pool) {
      return ok(res, {
        accessory: [],
        pose: [],
        location: [],
        makeup: []
      })
    }

    const types = ['accessory', 'pose', 'location', 'makeup']
    const categories = {}

    for (const type of types) {
      const { rows } = await pool.query(
        'SELECT * FROM categories WHERE type = $1 ORDER BY created_at DESC',
        [type]
      )
      categories[type] = rows
    }

    return ok(res, categories)
  } catch (error) {
    console.error('❌ Error fetching all categories:', error)
    return fail(res, error)
  }
}

