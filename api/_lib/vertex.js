const { GoogleAuth } = require('google-auth-library')
const fs = require('fs')

// Discover service account JSON from multiple env conventions and optional file path
function getCredentialsObject() {
  // Supported env names
  const candidates = [
    'GOOGLE_CREDENTIALS_JSON',
    'GOOGLE_APPLICATION_JSON', // common variant
    'GOOGLE_APPLICATION_CREDENTIALS', // may be JSON or a file path
    'GCP_SERVICE_ACCOUNT_JSON',
    'GCLOUD_SERVICE_ACCOUNT_JSON'
  ]

  for (const name of candidates) {
    const v = process.env[name]
    if (!v) continue

    // If it looks like inline JSON
    const trimmed = v.trim()
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed)
        console.log(`[vertex] Using credentials from ${name} (inline JSON, keys: ${Object.keys(obj).length})`)
        return obj
      } catch (e) {
        console.warn(`[vertex] Failed to parse inline JSON from ${name}:`, e?.message || e)
      }
    }

    // If it looks like base64 JSON
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && !trimmed.includes('{') && trimmed.length > 100) {
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
        const obj = JSON.parse(decoded)
        console.log(`[vertex] Using credentials from ${name} (base64)`)
        return obj
      } catch (e) {
        // not base64 JSON
      }
    }

    // Otherwise treat as a file path if it exists
    try {
      if (fs.existsSync(trimmed)) {
        const txt = fs.readFileSync(trimmed, 'utf8')
        const obj = JSON.parse(txt)
        console.log(`[vertex] Using credentials from ${name} (file path)`)
        return obj
      }
    } catch (e) {
      console.warn(`[vertex] Failed to read credentials file from ${name}:`, e?.message || e)
    }
  }

  console.warn('[vertex] No explicit credentials found in env; relying on default ADC')
  return undefined
}

// Builds a GoogleAuth client using credentials from env (serverless-friendly)
function getGoogleAuth() {
  try {
    const credentials = getCredentialsObject()
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })
    return auth
  } catch (e) {
    console.error('Failed to construct GoogleAuth:', e?.message || e)
    // Return an auth that will fail when used, keeping handler resilient
    return new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  }
}

module.exports = { getGoogleAuth, getCredentialsObject }

