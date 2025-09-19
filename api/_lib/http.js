function ok(res, data) {
  return res.status(200).json(data)
}

function fail(res, err, code = 500) {
  console.error('API error:', err)
  const message = err && err.message ? err.message : String(err)
  return res.status(code).json({ error: message })
}

module.exports = { ok, fail }

