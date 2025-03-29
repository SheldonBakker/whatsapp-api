# Use the official Node.js Alpine image as the base image
FROM node:20-alpine

# Set the working directory
WORKDIR /usr/src/app

# Create sessions directory with proper permissions
RUN mkdir -p /usr/src/app/sessions && chmod 777 /usr/src/app/sessions

# Install Chromium and dependencies required for Puppeteer 24.4.0
ENV CHROME_BIN="/usr/bin/chromium-browser" \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" \
    PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser" \
    NODE_ENV="production"

# Install all the dependencies needed for Chromium and Puppeteer
RUN apk update && apk upgrade && \
    apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn \
    dbus \
    fontconfig \
    udev \
    # Additional dependencies for improved stability
    bash \
    util-linux \
    # These libraries enable Puppeteer to work properly
    libc6-compat \
    gcompat

# Install fonts for proper rendering
RUN apk add --no-cache font-noto-emoji font-noto-cjk font-noto

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the dependencies
RUN npm ci --only=production

# Copy the rest of the source code to the working directory
COPY . .

# Expose the port the API will run on
EXPOSE 3000

# Add a healthcheck to ensure the API is running properly
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ping || exit 1

# Start the API
CMD ["npm", "start"]