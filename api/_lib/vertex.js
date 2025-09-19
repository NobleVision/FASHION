const { GoogleAuth } = require('google-auth-library')

// Builds a GoogleAuth client using credentials from env (serverless-friendly)
function getGoogleAuth() {
  try {
    const json = process.env.GOOGLE_CREDENTIALS_JSON
    const credentials = json ? JSON.parse(json) : undefined
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })
    return auth
  } catch (e) {
    console.error('Failed to parse GOOGLE_CREDENTIALS_JSON:', e?.message || e)
    // Return an auth that will fail when used, keeping handler resilient
    return new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  }
}

module.exports = { getGoogleAuth }

