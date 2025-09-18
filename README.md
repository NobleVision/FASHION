# FashionForge - AI-Powered Virtual Wardrobe Studio

## Project Overview
FashionForge is an AI-powered fashion application that allows users to upload photos and transform them using AI-generated accessories, poses, and backgrounds. Built with React frontend and Express.js backend.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS on port 5000
- **Backend**: Express.js + Node.js on port 3001
- **Database**: PostgreSQL (Neon) for tracking images and categories
- **Storage**: Cloudinary for image storage
- **AI**: Google Imagen 3 for image generation, Veo 3 for video generation

## Recent Updates & Fixes
- ✅ Database initialization and seeding completed successfully
- ✅ Fixed placeholder image URL issues (switched from via.placeholder.com to placehold.co)
- ✅ Resolved net::ERR_NAME_NOT_RESOLVED errors for category images
- ✅ Database reset functionality added for development (`/api/reset-db` endpoint)
- ✅ All 100 category items properly seeded with working placeholder images
- ✅ Frontend category display fully functional with clean grid layout

## Current Features
- Fully functional category system with 100 seeded items:
  - 40 accessories (hats, jewelry, bags, shoes)
  - 20 poses (standing, sitting variations)
  - 20 locations (studio, outdoor settings)
  - 20 makeup options (eyes, lips styles)
- Working placeholder images for all categories using placehold.co
- Drag & drop photo upload interface with visual feedback
- Interactive category selection grid with hover effects
- Database integration with PostgreSQL for data persistence
- Responsive web interface optimized for desktop and mobile
- Real-time server health monitoring and status checks

## Environment Setup
- Uses Replit secrets for API credentials
- Backend configured for localhost:3001
- Frontend configured for 0.0.0.0:5000 (Replit proxy compatible)
- Database reset endpoint available at `/api/reset-db` for development

## Database Schema
- `categories` table: stores accessories, poses, locations, makeup with placeholder URLs
- `generations` table: tracks user creations and AI outputs

## Technical Details

### API Endpoints
- `GET /api/health` - Server health check
- `GET /api/categories` - Fetch all fashion categories
- `POST /api/init-db` - Initialize database tables and seed data
- `POST /api/reset-db` - Reset database (development only)
- `POST /api/upload` - Handle image uploads to Cloudinary
- `POST /api/generate` - AI image generation (Imagen 3)
- `POST /api/generate-video` - AI video generation (Veo 3)

### Port Configuration
- **Frontend**: 5000 (Vite dev server with HMR)
- **Backend**: 3001 (Express.js API server)
- **Database**: PostgreSQL via Neon cloud service

## Development Status
- ✅ Project structure set up
- ✅ Backend server running with health checks
- ✅ Frontend React app with modern UI
- ✅ Database schema created and seeded with 100 items
- ✅ API endpoints for upload, generation, categories
- ✅ Workflow configured for Replit environment
- ✅ Frontend category display working with placeholder images
- ✅ Image placeholder system functional (placehold.co)
- ✅ Server health checks operational
- ✅ Database integration fully functional
- 🔄 AI image generation ready (quota limitations noted)
- 🔄 Video generation integration pending
- 🔄 User authentication system pending
- 🔄 Gallery save/load functionality pending

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   - Set up Replit secrets or create `.env` file with required credentials
   - Configure Google AI API key, Cloudinary credentials, and database URL

3. **Database Initialization**
   ```bash
   npm run db:init
   ```

4. **Start Development Servers**
   ```bash
   npm run dev
   ```
   This runs both frontend (port 5000) and backend (port 3001) concurrently

5. **Database Reset (if needed)**
   ```bash
   curl -X POST http://localhost:3001/api/reset-db
   npm run db:init
   ```

## Recent Changes (Sept 18, 2025)
- Database placeholder image URLs fixed and fully functional
- All category items properly seeded and displaying correctly
- Server stability improvements and error handling enhanced
- Frontend category grid layout optimized for better user experience
- Development workflow streamlined with database reset capabilities




