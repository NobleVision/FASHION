require('dotenv').config()
const { getCloudinary } = require('./api/_lib/cloudinary')

async function testCloudinary() {
  console.log('Environment variables:')
  console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT SET')
  console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET')
  console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET')
  
  try {
    const cloudinary = getCloudinary()
    console.log('Cloudinary instance:', cloudinary ? 'CREATED' : 'FAILED')
    
    if (cloudinary) {
      console.log('Testing Cloudinary search...')
      const result = await cloudinary.search
        .expression('folder:fashionforge AND resource_type:image')
        .sort_by([['created_at', 'desc']])
        .max_results(5)
        .execute()
      
      console.log('Search result:', {
        total: result.total_count,
        found: result.resources.length,
        sample: result.resources.slice(0, 2).map(r => ({ id: r.public_id, url: r.secure_url }))
      })
    }
  } catch (error) {
    console.error('Cloudinary test error:', error.message)
    console.error('Full error:', error)
  }
}

testCloudinary()
