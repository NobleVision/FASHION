require('dotenv').config()
const { getCloudinary } = require('./api/_lib/cloudinary')

async function testCloudinaryFolders() {
  try {
    const cloudinary = getCloudinary()
    
    console.log('Testing different search expressions...')
    
    // Test 1: All images
    const allImages = await cloudinary.search
      .expression('resource_type:image')
      .max_results(10)
      .execute()
    
    console.log('All images:', allImages.total_count, 'found')
    if (allImages.resources.length > 0) {
      console.log('Sample images:')
      allImages.resources.slice(0, 3).forEach(r => {
        console.log(`- ${r.public_id} (folder: ${r.folder || 'root'})`)
      })
    }
    
    // Test 2: Images with fashionforge in the name
    const fashionImages = await cloudinary.search
      .expression('public_id:*fashionforge* AND resource_type:image')
      .max_results(10)
      .execute()
    
    console.log('Images with "fashionforge" in name:', fashionImages.total_count, 'found')
    if (fashionImages.resources.length > 0) {
      console.log('Sample fashionforge images:')
      fashionImages.resources.slice(0, 3).forEach(r => {
        console.log(`- ${r.public_id} (folder: ${r.folder || 'root'})`)
      })
    }
    
    // Test 3: Check for any folder structure
    const foldersResult = await cloudinary.api.sub_folders('/')
    console.log('Root folders:', foldersResult.folders.map(f => f.name))
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

testCloudinaryFolders()
