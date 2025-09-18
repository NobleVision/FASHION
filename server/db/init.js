require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Default categories data
const defaultCategories = {
  accessory: [
    { subcategory: 'hats', items: ['Baseball Cap', 'Fedora', 'Beanie', 'Sun Hat', 'Beret', 'Bucket Hat', 'Snapback', 'Cowboy Hat', 'Headband', 'Visor'] },
    { subcategory: 'jewelry', items: ['Gold Necklace', 'Silver Earrings', 'Diamond Ring', 'Pearl Bracelet', 'Watch', 'Anklet', 'Brooch', 'Cufflinks', 'Pendant', 'Chain'] },
    { subcategory: 'bags', items: ['Leather Handbag', 'Backpack', 'Clutch', 'Tote Bag', 'Crossbody Bag', 'Messenger Bag', 'Wallet', 'Purse', 'Duffel Bag', 'Fanny Pack'] },
    { subcategory: 'shoes', items: ['High Heels', 'Sneakers', 'Boots', 'Sandals', 'Loafers', 'Flats', 'Oxfords', 'Wedges', 'Stilettos', 'Combat Boots'] }
  ],
  pose: [
    { subcategory: 'standing', items: ['Classic Standing', 'Hand on Hip', 'Arms Crossed', 'Leaning Forward', 'Power Pose', 'Casual Stand', 'Model Pose', 'Confident Stance', 'Relaxed Standing', 'Fashion Forward'] },
    { subcategory: 'sitting', items: ['Chair Pose', 'Cross-legged', 'Elegant Sitting', 'Casual Sitting', 'Perched Pose', 'Lounge Pose', 'Formal Sitting', 'Relaxed Sitting', 'Side Sitting', 'Edge Sitting'] }
  ],
  location: [
    { subcategory: 'studio', items: ['White Studio', 'Black Studio', 'Gradient Background', 'Neon Studio', 'Minimalist Studio', 'Industrial Studio', 'Vintage Studio', 'Modern Studio', 'Colorful Studio', 'Professional Studio'] },
    { subcategory: 'outdoor', items: ['City Street', 'Park Setting', 'Beach Background', 'Urban Rooftop', 'Garden Scene', 'Mountain View', 'Desert Landscape', 'Forest Setting', 'Architectural Background', 'Sunset Scene'] }
  ],
  makeup: [
    { subcategory: 'eyes', items: ['Smoky Eyes', 'Natural Look', 'Bold Eyeliner', 'Colorful Eyeshadow', 'Winged Eyeliner', 'Glitter Eyes', 'Cat Eye', 'Nude Eyes', 'Dramatic Lashes', 'Metallic Eyes'] },
    { subcategory: 'lips', items: ['Red Lipstick', 'Nude Lips', 'Glossy Lips', 'Matte Finish', 'Pink Lips', 'Bold Color', 'Natural Lips', 'Ombre Lips', 'Dark Lips', 'Coral Lips'] }
  ]
};

async function initializeDatabase() {
  try {
    console.log('🗄️  Initializing FashionForge database...');
    
    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        subcategory VARCHAR(50),
        name VARCHAR(100),
        url TEXT,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS generations (
        id SERIAL PRIMARY KEY,
        user_image_url TEXT,
        selected_items JSONB,
        prompt TEXT,
        output_image_url TEXT,
        output_video_url TEXT,
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Tables created successfully');

    // Seed default categories
    for (const [type, subcategories] of Object.entries(defaultCategories)) {
      for (const { subcategory, items } of subcategories) {
        for (const item of items) {
          // Check if item already exists
          const existing = await pool.query(
            'SELECT id FROM categories WHERE type = $1 AND subcategory = $2 AND name = $3',
            [type, subcategory, item]
          );

          if (existing.rows.length === 0) {
            // Generate placeholder URL for the item
            const genUrl = `https://placehold.co/300x300/FF69B4/FFFFFF?text=${encodeURIComponent(item)}`;
            
            await pool.query(
              'INSERT INTO categories (type, subcategory, name, url, is_default) VALUES ($1, $2, $3, $4, true)',
              [type, subcategory, item, genUrl]
            );
            
            console.log(`✨ Seeded ${type}/${subcategory}: ${item}`);
          }
        }
      }
    }

    console.log('🎉 Database initialization complete!');
    console.log(`📊 Categories seeded: ${Object.keys(defaultCategories).join(', ')}`);
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run initialization
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('🚀 Ready to launch FashionForge!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };



