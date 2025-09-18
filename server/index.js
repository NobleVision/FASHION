
require('dotenv').config();

// Handle inline Google credentials
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('{')) {
  const fs = require('fs');
  const path = require('path');
  const credentialsPath = path.join(__dirname, 'google-credentials.json');
  
  try {
    // Only create file if it doesn't exist
    if (!fs.existsSync(credentialsPath)) {
      // Parse to validate JSON
      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      // Write to temporary file
      fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
      console.log('✅ Google credentials configured from inline JSON');
    }
    // Update environment variable to point to file
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  } catch (error) {
    console.error('❌ Invalid Google credentials JSON:', error.message);
  }
}

// Add this debug section after credential setup
console.log('🔍 Debugging Google Auth...');
console.log('Project ID:', process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Set from file' : 'Not set');
console.log('Credentials file exists:', require('fs').existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || ''));

// Test the credentials
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

auth.getClient().then(client => {
  console.log('✅ Google Auth client created successfully');
}).catch(err => {
  console.log('❌ Google Auth failed:', err.message);
});

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const VertexAIService = require('./services/vertexai-rest'); // Use REST service
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
let genAI;
if (process.env.GOOGLE_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  console.log('✅ Google AI (Gemini) initialized');
}

const vertexAI = new VertexAIService();

// Cloudinary config
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('✅ Cloudinary configured');
}

// DB Pool
let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log('✅ Database pool created');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

const upload = multer({ dest: 'uploads/' });

// Helper function to convert image URL to base64
async function imageUrlToBase64(url) {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return base64;
  } catch (error) {
    console.error('Error converting image to base64:', error);
    return null;
  }
}

// Helper function to upload base64 to Cloudinary
async function uploadBase64ToCloudinary(base64Data, mimeType, folder = 'fashionforge') {
  try {
    const dataUri = `data:${mimeType};base64,${base64Data}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: 'auto',
      folder: folder
    });
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
}

// Enhanced health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    database: !!process.env.DATABASE_URL,
    google_ai: !!process.env.GOOGLE_API_KEY,
    // Verify no credential files are being used
    credentials_secure: !fs.existsSync('./fashion-472519-ca3e6ccdecc3.json')
  });
});

// Test Vertex AI endpoint
app.get('/api/test-vertex', async (req, res) => {
  try {
    const result = await vertexAI.generateImage('A beautiful red rose on a white background');
    
    if (result.success) {
      // Upload to Cloudinary for display
      const cloudinaryUrl = await uploadBase64ToCloudinary(result.imageBase64, result.mimeType, 'test');
      
      res.json({
        success: true,
        message: 'Vertex AI (Imagen 3) is working!',
        imageUrl: cloudinaryUrl
      });
    } else {
      res.json({
        success: false,
        message: 'Vertex AI test failed',
        error: result.error,
        fallbackUrl: result.fallbackUrl
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Vertex AI test failed',
      details: error.message
    });
  }
});

// Add this endpoint BEFORE the existing /api/categories/:type endpoint
app.get('/api/categories', async (req, res) => {
  try {
    if (!pool) {
      return res.json({
        accessory: [],
        pose: [],
        location: [],
        makeup: []
      });
    }
    
    console.log('📂 Fetching all categories...');
    const types = ['accessory', 'pose', 'location', 'makeup'];
    const categories = {};
    
    for (const type of types) {
      const { rows } = await pool.query(
        'SELECT * FROM categories WHERE type = $1 ORDER BY created_at DESC',
        [type]
      );
      categories[type] = rows;
      console.log(`✅ Found ${rows.length} items for ${type}`);
    }
    
    res.json(categories);
  } catch (error) {
    console.error('❌ Error fetching all categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get categories by type
app.get('/api/categories/:type', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM categories WHERE type = $1 ORDER BY created_at DESC', 
      [req.params.type]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload image to Cloudinary
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await cloudinary.uploader.upload(req.file.path, { 
      resource_type: 'image',
      folder: 'fashionforge'
    });
    
    fs.unlinkSync(req.file.path); // Cleanup temp file
    
    const { type, subcategory, name } = req.body;
    
    if (pool) {
      const { rows } = await pool.query(
        'INSERT INTO categories (type, subcategory, name, url, is_default) VALUES ($1, $2, $3, $4, false) RETURNING *',
        [type, subcategory, name, result.secure_url]
      );
      res.json(rows[0]);
    } else {
      res.json({ 
        url: result.secure_url, 
        type, 
        subcategory, 
        name, 
        message: 'Image uploaded but not saved to database (DB not configured)' 
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate image with Imagen 3
app.post('/api/generate-image', async (req, res) => {
  try {
    const { userImageUrl, accessories = [], poseId, locationId, makeup = [] } = req.body;
    
    if (!poseId || !locationId) {
      return res.status(400).json({ error: 'Pose and location are required' });
    }

    if (!pool) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Get pose and location details
    const poseResult = await pool.query('SELECT * FROM categories WHERE id = $1 AND type = $2', [poseId, 'pose']);
    const locationResult = await pool.query('SELECT * FROM categories WHERE id = $1 AND type = $2', [locationId, 'location']);
    
    if (poseResult.rows.length === 0 || locationResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid pose or location ID' });
    }

    const pose = poseResult.rows[0];
    const location = locationResult.rows[0];

    // Get accessory and makeup details
    let accessoryDetails = [];
    let makeupDetails = [];
    
    if (accessories.length > 0) {
      const accessoryResult = await pool.query(
        'SELECT * FROM categories WHERE id = ANY($1) AND type = $2',
        [accessories, 'accessory']
      );
      accessoryDetails = accessoryResult.rows;
    }
    
    if (makeup.length > 0) {
      const makeupResult = await pool.query(
        'SELECT * FROM categories WHERE id = ANY($1) AND type = $2',
        [makeup, 'makeup']
      );
      makeupDetails = makeupResult.rows;
    }

    // Build comprehensive prompt for Imagen 3
    const prompt = `Professional high-fashion editorial photograph. Transform the person in the reference image with these specifications:

POSE: ${pose.name} - elegant ${pose.subcategory || 'fashion pose'}
SETTING: ${location.name} - ${location.subcategory || 'professional studio'}
${accessoryDetails.length > 0 ? `ACCESSORIES: ${accessoryDetails.map(a => `${a.name} (${a.subcategory})`).join(', ')}` : ''}
${makeupDetails.length > 0 ? `MAKEUP: ${makeupDetails.map(m => `${m.name} (${m.subcategory})`).join(', ')}` : ''}

Style: Ultra-high resolution, magazine quality, professional lighting, photorealistic, fashion photography, editorial style, dramatic composition, perfect styling. The model should embody confidence and elegance in the specified pose within the luxurious setting.`;

    console.log('🎨 Generating image with Imagen 3...');
    console.log('📝 Prompt:', prompt);

    // Convert user image to base64 if provided
    let userImageBase64 = null;
    if (userImageUrl && userImageUrl.startsWith('http')) {
      userImageBase64 = await imageUrlToBase64(userImageUrl);
    } else if (userImageUrl && userImageUrl.startsWith('data:')) {
      // Extract base64 from data URL
      userImageBase64 = userImageUrl.split(',')[1];
    }

    // Generate image with Vertex AI (Imagen 3)
    const result = await vertexAI.generateImage(prompt, userImageBase64);
    
    let finalImageUrl;
    let generationStatus = 'success';
    let errorMessage = null;

    if (result.success) {
      // Upload generated image to Cloudinary
      finalImageUrl = await uploadBase64ToCloudinary(result.imageBase64, result.mimeType);
      console.log('✅ Image generated and uploaded successfully');
    } else {
      // Use fallback URL
      finalImageUrl = result.fallbackUrl;
      generationStatus = 'fallback';
      errorMessage = result.error;
      console.log('⚠️  Using fallback image due to error:', result.error);
    }
    
    // Save generation to database
    const { rows } = await pool.query(
      'INSERT INTO generations (user_image_url, selected_items, prompt, output_image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [userImageUrl, JSON.stringify(req.body), prompt, finalImageUrl]
    );
    
    res.json({ 
      imageUrl: finalImageUrl,
      generationId: rows[0].id,
      prompt: prompt,
      status: generationStatus,
      error: errorMessage,
      message: result.success ? 'Image generated with Imagen 3!' : 'Using fallback image - check Vertex AI configuration'
    });

  } catch (err) {
    console.error('❌ Generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate video with Veo 3
app.post('/api/generate-video', async (req, res) => {
  try {
    const { imageUrl, customPrompt = '', generationId } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required for video generation' });
    }

    const videoPrompt = `Create an elegant fashion video animation from this static image. The video should feature:

- A professional fashion model with graceful, fluid movements
- Sophisticated poses and transitions typical of high-end fashion campaigns  
- Smooth camera movements and professional cinematography
- Luxurious lighting and atmosphere
- Duration: 5 seconds
- High-quality, cinematic motion
${customPrompt ? `- Additional styling: ${customPrompt}` : ''}

Style: Premium fashion commercial, elegant movement, magazine-quality production, sophisticated and alluring.`;

    console.log('🎬 Generating video with Veo 3...');
    console.log('📝 Video prompt:', videoPrompt);

    // Convert image to base64
    let imageBase64;
    if (imageUrl.startsWith('data:')) {
      imageBase64 = imageUrl.split(',')[1];
    } else {
      imageBase64 = await imageUrlToBase64(imageUrl);
    }

    if (!imageBase64) {
      return res.status(400).json({ error: 'Could not process input image' });
    }

    // Generate video with Vertex AI (Veo 3)
    const result = await vertexAI.generateVideo(imageBase64, videoPrompt);
    
    let finalVideoUrl;
    let generationStatus = 'success';
    let errorMessage = null;

    if (result.success) {
      // Upload generated video to Cloudinary
      finalVideoUrl = await uploadBase64ToCloudinary(result.videoBase64, result.mimeType, 'fashionforge/videos');
      console.log('✅ Video generated and uploaded successfully');
    } else {
      // Use fallback URL
      finalVideoUrl = result.fallbackUrl;
      generationStatus = 'fallback';
      errorMessage = result.error;
      console.log('⚠️  Using fallback video due to error:', result.error);
    }
    
    // Update generation record with video
    if (pool && generationId) {
      await pool.query(
        'UPDATE generations SET output_video_url = $1 WHERE id = $2',
        [finalVideoUrl, generationId]
      );
    }

    res.json({ 
      videoUrl: finalVideoUrl,
      prompt: videoPrompt,
      status: generationStatus,
      error: errorMessage,
      message: result.success ? 'Video generated with Veo 3!' : 'Using fallback video - check Vertex AI configuration'
    });

  } catch (err) {
    console.error('❌ Video generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all generations for gallery
app.get('/api/generations', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    
    const { rows } = await pool.query(
      'SELECT * FROM generations ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save generation with name
app.post('/api/save-generation', async (req, res) => {
  try {
    const { generationId, name } = req.body;
    
    if (!pool) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    
    const { rows } = await pool.query(
      'UPDATE generations SET name = $1 WHERE id = $2 RETURNING *',
      [name, generationId]
    );
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize database tables
app.post('/api/init-db', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    
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
    
    res.json({ message: 'Database initialized successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add this endpoint after the existing /api/init-db endpoint
app.post('/api/reset-db', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    
    console.log('🗑️  Resetting database...');
    
    // Clear existing data
    await pool.query('DELETE FROM categories WHERE is_default = true');
    
    console.log('✅ Database cleared, ready for fresh seed');
    res.json({ success: true, message: 'Database reset complete' });
  } catch (err) {
    console.error('❌ Database reset failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 FashionForge server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Vertex AI test: http://localhost:${PORT}/api/test-vertex`);
});











