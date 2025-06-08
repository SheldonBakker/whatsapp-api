FROM node:18-alpine

# Install dependencies for Puppeteer and Chrome
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    ttf-dejavu \
    ttf-droid \
    ttf-liberation \
    fontconfig \
    dbus \
    xvfb \
    curl \
    && rm -rf /var/cache/apk/*

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/bin/chromium-browser \
    DISPLAY=:99 \
    NODE_ENV=production

# Create app directory and set proper permissions
WORKDIR /usr/src/app

# Create user for security (don't run as root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S whatsapp -u 1001 -G nodejs

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy app source (including pre-built dist folder)
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p .cache/puppeteer .wwebjs_auth sessions logs && \
    chown -R whatsapp:nodejs /usr/src/app && \
    chmod -R 755 /usr/src/app

# Switch to non-root user
USER whatsapp

# Expose port
EXPOSE 5656

# Health check using ping endpoint (no API key required)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
#     CMD curl -f http://localhost:5656/ping || exit 1

# Start the application
CMD ["node", "dist/server.js"]
