require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGoogleAI() {
  console.log('🧪 Testing Google Generative AI (Gemini)...');
  
  if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ Missing GOOGLE_API_KEY environment variable');
    process.exit(1);
  }
  
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    console.log('📝 Testing text generation...');
    const result = await model.generateContent('Write a short description of a fashion AI app');
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ Gemini working!');
    console.log('📄 Response:', text.substring(0, 100) + '...');
    
  } catch (error) {
    console.error('❌ Google AI test failed:', error.message);
  }
}

if (require.main === module) {
  testGoogleAI().catch(console.error);
}

module.exports = { testGoogleAI };