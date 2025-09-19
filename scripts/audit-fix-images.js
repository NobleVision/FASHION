#!/usr/bin/env node

/**
 * Audit + fix category images
 * - Audits DB rows that use Unsplash/placeholder/empty URLs
 * - For each, generates a relevant image (Vertex AI) or falls back to a curated stock
 * - Uploads to Cloudinary folder `fashionforge/<type>/<subcategory>` with metadata
 * - Updates DB with the new Cloudinary URL
 * - Validates Cloudinary availability and summarizes results
 *
 * Safe defaults:
 * - Dry-run by default (pass --apply to write changes)
 * - Generation mode: ai (default) | stock | ai-first (ai then stock)
 * - Limit processing via --limit=N
 */

require('dotenv').config()

const path = require('path')
const { getPool } = require('../api/_lib/db')
const { getCloudinary } = require('../api/_lib/cloudinary')
const { getGoogleAuth } = require('../api/_lib/vertex')

const CLO_FOLDER = 'fashionforge'

// --- CLI args ---
const args = process.argv.slice(2)
const flags = Object.fromEntries(args.map(a => {
  const [k, v] = a.includes('=') ? a.split('=') : [a, true]
  return [k.replace(/^--/, ''), v === undefined ? true : (v === 'false' ? false : v)]
}))

const APPLY = Boolean(flags.apply)
const LIMIT = flags.limit ? parseInt(flags.limit, 10) : Infinity
const MODE = (flags.mode || 'ai-first') // 'ai' | 'stock' | 'ai-first'
const ONLY_AUDIT = Boolean(flags.audit)

// --- Helpers ---
const sleep = ms => new Promise(r => setTimeout(r, ms))
const isUnsplash = url => typeof url === 'string' && /images\.unsplash\.com/i.test(url)
const isPlaceholder = url => typeof url === 'string' && /placehold\./i.test(url)
const isCloudinary = url => typeof url === 'string' && /res\.cloudinary\.com/i.test(url)
const isEmpty = url => !url || String(url).trim() === ''

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function fetchToBase64(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  return buf.toString('base64')
}

async function vertexGenerate(prompt) {
  try {
    const auth = getGoogleAuth()
    const client = await auth.getClient()
    const { token } = await client.getAccessToken()
    const projectId = process.env.VERTEX_AI_PROJECT_ID || 'fashion-472519'
    const location = 'us-central1'
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`

    const body = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1', safetyFilterLevel: 'block_some', personGeneration: 'allow_adult' }
    }
    const resp = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!resp.ok) throw new Error(`Vertex AI error: ${resp.status}`)
    const data = await resp.json()
    const pred = data?.predictions?.[0]
    if (!pred?.bytesBase64Encoded) throw new Error('No image data in response')
    return { success: true, imageBase64: pred.bytesBase64Encoded, mimeType: pred.mimeType || 'image/png' }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
}

async function uploadBase64ToCloudinary(base64, mimeType, { type, subcategory, name, id }) {
  const cloudinary = getCloudinary()
  const folder = `${CLO_FOLDER}/${slugify(type)}/${slugify(subcategory || 'general')}`
  const publicId = `${slugify(name)}_${id}`
  const dataUri = `data:${mimeType};base64,${base64}`
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      dataUri,
      { resource_type: 'image', folder, public_id: publicId, overwrite: true, context: { type, subcategory: subcategory || '', name, category_id: String(id) } },
      (err, result) => err ? reject(err) : resolve(result?.secure_url)
    )
  })
}

// Minimal curated fallback set (reuses populate-category-images.js intent)
const STOCK = {
  accessory: {
    hats: [
      'https://images.unsplash.com/photo-1521369909029-2afed882baee?w=800&q=80',
      'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=800&q=80'
    ],
    jewelry: [
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&q=80'
    ],
    bags: [
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80'
    ],
    shoes: [
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80'
    ]
  },
  pose: {
    standing: ['https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80'],
    sitting: ['https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&q=80']
  },
  location: {
    studio: ['https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80']
  },
  makeup: {
    lips: ['https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=80']
  }
}

function buildPrompt(cat) {
  const { type, subcategory, name } = cat
  switch (type) {
    case 'accessory':
      return `Studio product photograph of a ${name} (${subcategory || 'accessory'}). Clean seamless background, soft even lighting, high detail, fashion e-commerce style, photorealistic.`
    case 'pose':
      return `Full-body studio portrait demonstrating the pose: ${name} (${subcategory || 'fashion pose'}). Neutral clothing, elegant posture, professional lighting, magazine fashion style.`
    case 'location':
      return `Fashion photoshoot background of ${name} (${subcategory || 'setting'}). High-quality scene, shallow depth of field, no people, cinematic lighting, editorial runway vibe.`
    case 'makeup':
      return `Beauty editorial close-up showcasing ${name} (${subcategory || 'makeup'}). Flawless skin, soft light, high-resolution, professional retouching.`
    default:
      return `${name} ${subcategory || ''} fashion image`
  }
}

async function processOne(cat, idx, total) {
  const where = `${cat.type}/${cat.subcategory || 'general'}/${cat.name} (#${cat.id})`
  console.log(`\n[${idx + 1}/${total}] Processing ${where}`)

  let finalUrl = null

  const tryAi = MODE === 'ai' || MODE === 'ai-first'
  const tryStock = MODE === 'stock' || MODE === 'ai-first'

  if (tryAi) {
    const prompt = buildPrompt(cat)
    const gen = await vertexGenerate(prompt)
    if (gen.success) {
      try {
        finalUrl = await uploadBase64ToCloudinary(gen.imageBase64, gen.mimeType, cat)
        console.log('  ✅ AI image generated and uploaded')
      } catch (e) {
        console.log('  ⚠️  AI upload failed:', e?.message || e)
      }
    } else {
      console.log('  ⚠️  AI generation failed:', gen.error)
    }
  }

  if (!finalUrl && tryStock) {
    const stockList = STOCK?.[cat.type]?.[cat.subcategory || ''] || []
    const stockUrl = stockList[0]
    if (stockUrl) {
      try {
        const b64 = await fetchToBase64(stockUrl)
        finalUrl = await uploadBase64ToCloudinary(b64, 'image/jpeg', cat)
        console.log('  ✅ Stock image uploaded to Cloudinary')
      } catch (e) {
        console.log('  ⚠️  Stock upload failed:', e?.message || e)
      }
    } else {
      console.log('  ℹ️  No curated stock match found')
    }
  }

  return finalUrl
}

async function audit(pool) {
  const { rows } = await pool.query('SELECT id, type, subcategory, name, url FROM categories ORDER BY type, subcategory, id')
  const toFix = rows.filter(r => isEmpty(r.url) || isUnsplash(r.url) || isPlaceholder(r.url) || !isCloudinary(r.url))
  return { all: rows, toFix }
}

async function validate(pool) {
  const cloudinary = getCloudinary()
  const result = await cloudinary.search.expression(`resource_type:image AND folder="${CLO_FOLDER}"`).max_results(100).execute()
  const count = result?.total_count || (result?.resources || []).length || 0
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM categories WHERE url LIKE 'https://res.cloudinary.com/%'")
  return { cloudinaryCount: count, dbCloudinaryCount: rows[0]?.c || 0 }
}

async function main() {
  const pool = getPool()
  if (!pool) throw new Error('DATABASE_URL not set')

  console.log('▶ Audit current state...')
  const { toFix, all } = await audit(pool)
  console.log(`• Categories total: ${all.length}`)
  console.log(`• Need fix (unsplash/empty/placeholder/non-Cloudinary): ${toFix.length}`)

  if (ONLY_AUDIT) {
    await pool.end();
    return
  }

  if (!APPLY) {
    console.log('\nDry run. To apply fixes, re-run with --apply')
    await pool.end()
    return
  }

  let processed = 0, updated = 0
  for (let i = 0; i < Math.min(LIMIT, toFix.length); i++) {
    const cat = toFix[i]
    try {
      const url = await processOne(cat, i, Math.min(LIMIT, toFix.length))
      if (url) {
        await pool.query('UPDATE categories SET url = $1 WHERE id = $2', [url, cat.id])
        updated++
      }
      processed++
      await sleep(400) // be gentle to APIs
    } catch (e) {
      console.log('  ❌ Failed:', e?.message || e)
    }
  }

  console.log(`\n✔ Done. Processed: ${processed}, Updated: ${updated}`)

  console.log('\n▶ Validation...')
  const v = await validate(pool)
  console.log(`• Cloudinary images in folder '${CLO_FOLDER}': ${v.cloudinaryCount}`)
  console.log(`• DB rows pointing to Cloudinary: ${v.dbCloudinaryCount}`)

  await pool.end()
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal:', err?.message || err)
    process.exit(1)
  })
}

