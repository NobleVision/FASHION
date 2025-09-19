require('dotenv').config()

function mockRes() {
  return {
    _status: 200,
    status(c){ this._status=c; return this },
    json(b){ console.log(JSON.stringify({ statusCode: this._status||200, body: b }, null, 2)) }
  }
}

async function call(handler, req){
  const res = mockRes()
  await handler(req, res)
}

async function main(){
  const { getPool } = require('../api/_lib/db')
  const pool = getPool()
  if (!pool) throw new Error('DATABASE_URL not set')

  // 1) init-db
  console.log('\n== init-db ==')
  await call(require('../api/init-db.js'), { method: 'POST' })

  // 2) seed minimal categories
  console.log('\n== seed categories ==')
  await pool.query("INSERT INTO categories (type, subcategory, name, url, is_default) VALUES ('pose','test','Pose One','https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80',true)")
  await pool.query("INSERT INTO categories (type, subcategory, name, url, is_default) VALUES ('location','studio','Studio','https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80',true)")

  // 3) categories
  console.log('\n== categories ==')
  await call(require('../api/categories/index.js'), {})

  // 4) categories/:type
  console.log('\n== categories/:type (pose) ==')
  await call(require('../api/categories/[type].js'), { query: { type: 'pose' }})

  // 5) generate-image
  console.log('\n== generate-image ==')
  const poseId = (await pool.query("SELECT id FROM categories WHERE type='pose' ORDER BY id DESC LIMIT 1")).rows[0].id
  const locId = (await pool.query("SELECT id FROM categories WHERE type='location' ORDER BY id DESC LIMIT 1")).rows[0].id
  await call(require('../api/generate-image.js'), { method:'POST', body: { poseId, locationId: locId, accessories: [], makeup: [] }})

  // 6) generations
  console.log('\n== generations ==')
  await call(require('../api/generations.js'), { method:'GET' })

  // 7) uploaded-images (Cloudinary folder scan)
  console.log('\n== uploaded-images ==')
  await call(require('../api/uploaded-images.js'), { method:'GET' })

  // 8) save-generation (rename last)
  console.log('\n== save-generation ==')
  const lastGen = (await pool.query("SELECT id FROM generations ORDER BY id DESC LIMIT 1")).rows[0]
  await call(require('../api/save-generation.js'), { method:'POST', body: { generationId: lastGen.id, name: 'My Look' }})

  // 9) generate-video (using the last generation image)
  console.log('\n== generate-video ==')
  const genRow = (await pool.query("SELECT id, output_image_url FROM generations ORDER BY id DESC LIMIT 1")).rows[0]
  await call(require('../api/generate-video.js'), { method:'POST', body: { imageUrl: genRow.output_image_url, generationId: genRow.id }})

  console.log('\nDone.')
}

main().catch(e=>{ console.error('Test failed:', e); process.exit(1) })

