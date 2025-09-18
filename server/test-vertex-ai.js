require('dotenv').config();
const VertexAIService = require('./services/vertexai');

async function testVertexAI() {
  console.log('🧪 Testing Vertex AI integration...');
  console.log('📋 Configuration:');
  console.log('  - Project ID:', process.env.VERTEX_AI_PROJECT_ID);
  console.log('  - Location:', process.env.VERTEX_AI_LOCATION);
  console.log('  - API Key configured:', !!process.env.VERTEX_AI_API_KEY);
  
  if (!process.env.VERTEX_AI_PROJECT_ID || !process.env.VERTEX_AI_API_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('  - VERTEX_AI_PROJECT_ID:', !!process.env.VERTEX_AI_PROJECT_ID);
    console.error('  - VERTEX_AI_API_KEY:', !!process.env.VERTEX_AI_API_KEY);
    process.exit(1);
  }
  
  try {
    const vertexAI = new VertexAIService();
    
    // Test image generation
    console.log('\n📸 Testing Imagen 3...');
    const imageResult = await vertexAI.generateImage('A beautiful red rose on a white background, professional photography');
    
    if (imageResult.success) {
      console.log('✅ Imagen 3 working! Generated image data received.');
      console.log('📊 Image size:', imageResult.imageBase64.length, 'characters');
      
      // Test video generation (if image generation worked)
      console.log('\n🎬 Testing Veo 3...');
      const videoResult = await vertexAI.generateVideo(imageResult.imageBase64, 'Gentle rotation of the rose with soft lighting');
      
      if (videoResult.success) {
        console.log('✅ Veo 3 working! Generated video data received.');
        console.log('📊 Video size:', videoResult.videoBase64.length, 'characters');
      } else {
        console.log('❌ Veo 3 failed:', videoResult.error);
      }
    } else {
      console.log('❌ Imagen 3 failed:', imageResult.error);
    }
    
    console.log('\n🏁 Test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

if (require.main === module) {
  testVertexAI().catch(console.error);
}

module.exports = { testVertexAI };