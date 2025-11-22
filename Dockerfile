# Docker Configuration for AI Booking System
# Multi-stage build for production optimization

# Development stage
FROM node:18-alpine AS development

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev"]

# Production build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application (if needed)
RUN npm run build || echo "No build script found"

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy built application
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app ./

# Create data directory
RUN mkdir -p data && chown nodejs:nodejs data

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start production server
CMD ["npm", "start"]

# Docker Compose for development
# docker-compose.yml
# version: '3.8'
# services:
#   app:
#     build:
#       context: .
#       target: development
#     ports:
#       - "3000:3000"
#     environment:
#       - NODE_ENV=development
#       - DATABASE_URL=postgresql://user:password@db:5432/ai_booking
#     volumes:
#       - .:/app
#       - /app/node_modules
#     depends_on:
#       - db
#       - redis
#   
#   db:
#     image: postgres:15-alpine
#     environment:
#       - POSTGRES_DB=ai_booking
#       - POSTGRES_USER=user
#       - POSTGRES_PASSWORD=password
#     volumes:
#       - postgres_data:/var/lib/postgresql/data
#     ports:
#       - "5432:5432"
#   
#   redis:
#     image: redis:7-alpine
#     ports:
#       - "6379:6379"
#     volumes:
#       - redis_data:/data
# 
# volumes:
#   postgres_data:
#   redis_data: