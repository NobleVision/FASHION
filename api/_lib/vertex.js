const { GoogleAuth } = require('google-auth-library')

// Builds a GoogleAuth client using credentials from env (serverless-friendly)
function getGoogleAuth() {
  try {
    let credentials
    // Prefer GOOGLE_CREDENTIALS_JSON; fallback to inline GOOGLE_APPLICATION_CREDENTIALS if it looks like JSON
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.trim().startsWith('{')) {
      credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    }
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })
    return auth
  } catch (e) {
    console.error('Failed to parse Google credentials JSON:', e?.message || e)
    // Return an auth that will fail when used, keeping handler resilient
    return new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  }
}

module.exports = { getGoogleAuth }

