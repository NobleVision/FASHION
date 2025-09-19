const { ok, fail } = require('./_lib/http')
const { getPool } = require('./_lib/db')

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const pool = getPool()
    if (!pool) return res.status(500).json({ error: 'Database not configured' })
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        subcategory VARCHAR(50),
        name VARCHAR(100),
        url TEXT,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS generations (
        id SERIAL PRIMARY KEY,
        user_image_url TEXT,
        selected_items JSONB,
        prompt TEXT,
        output_image_url TEXT,
        output_video_url TEXT,
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
    return ok(res, { message: 'Database initialized successfully' })
  } catch (err) {
    return fail(res, err)
  }
}

