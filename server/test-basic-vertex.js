require('dotenv').config();

console.log('🔍 Basic Vertex AI Configuration Check');
console.log('=====================================');

console.log('Environment Variables:');
console.log('- VERTEX_AI_PROJECT_ID:', process.env.VERTEX_AI_PROJECT_ID || 'NOT SET');
console.log('- VERTEX_AI_LOCATION:', process.env.VERTEX_AI_LOCATION || 'NOT SET');
console.log('- VERTEX_AI_API_KEY:', process.env.VERTEX_AI_API_KEY ? 'SET (length: ' + process.env.VERTEX_AI_API_KEY.length + ')' : 'NOT SET');

console.log('\nTrying to load Vertex AI module...');
try {
  const { VertexAI } = require('@google-cloud/vertexai');
  console.log('✅ @google-cloud/vertexai module loaded successfully');
  
  if (process.env.VERTEX_AI_PROJECT_ID && process.env.VERTEX_AI_API_KEY) {
    console.log('✅ Required environment variables are set');
    console.log('🚀 Ready to test Vertex AI integration');
  } else {
    console.log('❌ Missing required environment variables');
  }
} catch (error) {
  console.log('❌ Failed to load Vertex AI module:', error.message);
}

console.log('\nNext steps:');
console.log('1. Make sure your .env file has VERTEX_AI_PROJECT_ID and VERTEX_AI_API_KEY');
console.log('2. Run: npm run test:vertex');