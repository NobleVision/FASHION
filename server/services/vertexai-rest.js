const { GoogleAuth } = require('google-auth-library');

class VertexAIService {
  constructor() {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    this.projectId = process.env.VERTEX_AI_PROJECT_ID || 'fashion-472519';
    this.location = 'us-central1';
  }

  async getAccessToken() {
    try {
      const client = await this.auth.getClient();
      const accessToken = await client.getAccessToken();
      return accessToken.token;
    } catch (error) {
      console.error('❌ Failed to get access token:', error);
      throw error;
    }
  }

  async generateImage(prompt) {
    try {
      console.log('🎨 Calling Vertex AI Imagen API...');
      
      const accessToken = await this.getAccessToken();
      const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/imagen-3.0-generate-001:predict`;

      const requestBody = {
        instances: [{
          prompt: prompt
        }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1",
          safetyFilterLevel: "block_some",
          personGeneration: "allow_adult"
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Vertex AI API error:', errorData);
        throw new Error(`Vertex AI API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Vertex AI response received');
      
      if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
        return {
          success: true,
          imageBase64: data.predictions[0].bytesBase64Encoded,
          mimeType: data.predictions[0].mimeType || 'image/png'
        };
      } else {
        throw new Error('No image data in response');
      }
    } catch (error) {
      console.error('❌ Vertex AI generation failed:', error);
      return {
        success: false,
        error: 'Using fallback image',
        fallbackUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80'
      };
    }
  }

  async testConnection() {
    try {
      const result = await this.generateImage('A simple test image of a red apple');
      return result.success;
    } catch (error) {
      return false;
    }
  }
}

module.exports = VertexAIService;
