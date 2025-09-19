require('dotenv').config()
const { getPool } = require('./api/_lib/db')

async function checkPlaceholders() {
  const pool = getPool()
  try {
    const result = await pool.query("SELECT COUNT(*) as count FROM categories WHERE url LIKE '%placehold%'")
    console.log('Placeholder URLs remaining:', result.rows[0].count)
    
    if (result.rows[0].count > 0) {
      const placeholders = await pool.query("SELECT id, type, subcategory, name, url FROM categories WHERE url LIKE '%placehold%' LIMIT 5")
      console.log('Sample placeholder entries:')
      placeholders.rows.forEach(row => {
        console.log(`- ${row.type}/${row.subcategory}/${row.name}: ${row.url}`)
      })
    }
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
  }
}

checkPlaceholders()
