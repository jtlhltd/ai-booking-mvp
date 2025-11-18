#!/bin/bash
# Environment Setup Script for AI Booking MVP
# Run this script to set up your development environment

set -e

echo "🚀 Setting up AI Booking MVP development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install additional development dependencies
echo "📦 Installing development dependencies..."
npm install --save-dev jest supertest @jest/globals

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env file with your actual credentials"
fi

# Create data directory
echo "📁 Creating data directory..."
mkdir -p data

# Set up database
echo "🗄️  Setting up database..."
npm run migrate

# Run tests
echo "🧪 Running tests..."
npm test || echo "⚠️  Some tests failed - check your configuration"

# Start the server
echo "🎉 Setup complete! Starting server..."
echo "📝 Don't forget to:"
echo "   1. Update .env file with your credentials"
echo "   2. Configure VAPI, Twilio, and Google Calendar"
echo "   3. Run 'npm test' to verify everything works"
echo ""
echo "🚀 Starting server on http://localhost:3000"

npm start




























