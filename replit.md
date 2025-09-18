# FashionForge - AI-Powered Virtual Wardrobe Studio

## Project Overview
FashionForge is an AI-powered fashion application that allows users to upload photos and transform them using AI-generated accessories, poses, and backgrounds. Built with React frontend and Express.js backend.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS on port 5000
- **Backend**: Express.js + Node.js on port 3001
- **Database**: PostgreSQL (Neon) for tracking images and categories
- **Storage**: Cloudinary for image storage
- **AI**: Google Imagen 3 for image generation, Veo 3 for video generation

## Features
- Upload and process user photos
- 10 default categories each: accessories, poses, locations, makeup
- AI-powered image generation with fashion prompts
- Video generation from static images
- Gallery to save and view created content
- Responsive web interface with drag-and-drop uploads

## Environment Setup
- Uses Replit secrets for API credentials
- Backend configured for localhost:3001
- Frontend configured for 0.0.0.0:5000 (Replit proxy compatible)

## Database Schema
- `categories` table: stores accessories, poses, locations, makeup
- `generations` table: tracks user creations and AI outputs

## Development Status
- ✅ Project structure set up
- ✅ Backend server running with health checks
- ✅ Frontend React app with modern UI
- ✅ Database schema created
- ✅ API endpoints for upload, generation, categories
- ✅ Workflow configured for Replit environment
- 🔄 AI integration ready for API credentials
- 🔄 Deployment configuration pending

## Recent Changes (Sept 18, 2025)
- Initial project setup from GitHub import
- Full-stack application structure created
- Backend and frontend separation implemented
- Vite configuration optimized for Replit hosting
- Workflow configured to run both services