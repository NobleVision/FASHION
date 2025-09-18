module.exports = (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cloudinary: false,
    database: false,
    google_ai: false,
    credentials_secure: true
  })
}

