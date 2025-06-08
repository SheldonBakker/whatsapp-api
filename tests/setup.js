// Test setup file
process.env.NODE_ENV = 'test'
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true'
process.env.CHROME_HEADLESS = 'true'
process.env.API_KEY = 'test-api-key'
process.env.BASE_WEBHOOK_URL = 'http://localhost:3001/callback'

// Increase timeout for tests that might need more time
jest.setTimeout(30000)
