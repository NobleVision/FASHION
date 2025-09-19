const fs = require('fs')
const { ok, fail } = require('./_lib/http')

module.exports = (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    // Mirrors Express implementation for API compatibility
    ok(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
      database: !!process.env.DATABASE_URL,
      google_ai: !!process.env.GOOGLE_API_KEY,
      // Verify no credential files are being used (same path check as server)
      credentials_secure: !fs.existsSync('./fashion-472519-ca3e6ccdecc3.json')
    })
  } catch (err) {
    fail(res, err)
  }
}

