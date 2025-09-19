const { Pool } = require('pg')

// Reuse the same Pool across invocations to avoid exhausting connections
const GLOBAL_KEY = '__FASHIONFORGE_PG_POOL__'

function createPool() {
  const connStr = process.env.DATABASE_URL
  if (!connStr) return null
  const sslNeeded = process.env.PGSSLMODE === 'require' || /neon\.tech|render\.com/.test(connStr)
  return new Pool({
    connectionString: connStr,
    ssl: sslNeeded ? { rejectUnauthorized: false } : undefined,
    max: parseInt(process.env.PG_MAX || '5', 10),
    idleTimeoutMillis: 10_000
  })
}

function getPool() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = createPool()
  }
  return globalThis[GLOBAL_KEY]
}

module.exports = { getPool }

