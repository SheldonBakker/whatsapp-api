FROM node:18-alpine AS builder

# Install dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn \
    python3 \
    make \
    g++


# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install all dependencies (including devDependencies)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .


# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

# Install dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /usr/src/app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /usr/src/app/dist ./dist

# Create necessary directories with proper permissions
RUN mkdir -p .wwebjs_auth sessions .cache/puppeteer && \
    chmod -R 777 .wwebjs_auth sessions .cache

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S whatsapp -u 1001 -G nodejs

# Change ownership of the app directory to the nodejs user
RUN chown -R whatsapp:nodejs /usr/src/app

# Expose port
EXPOSE 5656

# Switch to non-root user
USER whatsapp

# Start the application
CMD ["node", "dist/server.js"]
