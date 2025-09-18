module.exports = (req, res) => {
  // Vercel provides query params via req.query
  const { type } = req.query
  res.status(200).json([])
}

