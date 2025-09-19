#!/usr/bin/env node

/**
 * Script to populate category items with real images from Unsplash
 * This will replace the placeholder URLs with actual fashion images
 */

// Load environment variables
require('dotenv').config()

const { getPool } = require('../api/_lib/db')

// Curated fashion images from Unsplash
const FASHION_IMAGES = {
  accessory: {
    hats: [
      'https://images.unsplash.com/photo-1521369909029-2afed882baee?w=400&q=80', // Baseball cap
      'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=400&q=80', // Fedora
      'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=400&q=80', // Beanie
      'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?w=400&q=80', // Sun hat
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80', // Beret
    ],
    jewelry: [
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&q=80', // Gold necklace
      'https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?w=400&q=80', // Silver earrings
      'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400&q=80', // Diamond ring
      'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=400&q=80', // Pearl bracelet
      'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=400&q=80', // Watch
    ],
    bags: [
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80', // Leather handbag
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80', // Backpack
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&q=80', // Clutch
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&q=80', // Tote bag
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&q=80', // Crossbody bag
    ],
    shoes: [
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&q=80', // High heels
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&q=80', // Sneakers
      'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=400&q=80', // Boots
      'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?w=400&q=80', // Sandals
      'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=400&q=80', // Loafers
    ]
  },
  pose: {
    standing: [
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&q=80', // Classic standing
      'https://images.unsplash.com/photo-1494790108755-2616c27b1e2d?w=400&q=80', // Hand on hip
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80', // Arms crossed
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80', // Leaning forward
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&q=80', // Power pose
    ],
    sitting: [
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80', // Chair pose
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80', // Cross-legged
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80', // Elegant sitting
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80', // Casual sitting
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&q=80', // Perched pose
    ]
  },
  location: {
    studio: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80', // White studio
      'https://images.unsplash.com/photo-1493666438817-866a91353ca9?w=400&q=80', // Black studio
      'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=400&q=80', // Gradient background
      'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&q=80', // Neon studio
      'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=400&q=80', // Minimalist studio
    ],
    outdoor: [
      'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&q=80', // City street
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80', // Park setting
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80', // Beach background
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80', // Urban rooftop
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80', // Garden scene
    ]
  },
  makeup: {
    eyes: [
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80', // Smoky eyes
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&q=80', // Natural look
      'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?w=400&q=80', // Bold eyeliner
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80', // Colorful eyeshadow
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80', // Winged eyeliner
    ],
    lips: [
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80', // Red lipstick
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&q=80', // Nude lips
      'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?w=400&q=80', // Glossy lips
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80', // Matte finish
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80', // Pink lips
    ]
  }
}

async function updateCategoryImages() {
  const pool = getPool()
  if (!pool) {
    console.error('Database not configured')
    process.exit(1)
  }

  console.log('🎨 Starting to update category images...')

  try {
    // Get all categories
    const result = await pool.query('SELECT * FROM categories ORDER BY type, subcategory, id')
    const categories = result.rows

    console.log(`Found ${categories.length} categories to update`)

    let updated = 0
    
    for (const category of categories) {
      const { id, type, subcategory, name } = category
      
      // Skip if already has a real image URL (not placeholder)
      if (category.url && !category.url.includes('placehold.co')) {
        continue
      }

      // Find appropriate image
      let imageUrl = null
      
      if (FASHION_IMAGES[type] && FASHION_IMAGES[type][subcategory]) {
        const images = FASHION_IMAGES[type][subcategory]
        // Use modulo to cycle through available images
        imageUrl = images[updated % images.length]
      }

      if (imageUrl) {
        await pool.query(
          'UPDATE categories SET url = $1 WHERE id = $2',
          [imageUrl, id]
        )
        console.log(`✅ Updated ${type}/${subcategory}/${name} with image`)
        updated++
      } else {
        console.log(`⚠️  No image found for ${type}/${subcategory}/${name}`)
      }
    }

    console.log(`🎉 Updated ${updated} category images`)
    
  } catch (error) {
    console.error('❌ Error updating images:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run the script
if (require.main === module) {
  updateCategoryImages()
}
