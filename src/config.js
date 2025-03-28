// Load environment variables from .env file
require('dotenv').config()

// setup global const
const sessionFolderPath = process.env.SESSIONS_PATH || './sessions'
const enableCallback = (process.env.ENABLE_CALLBACK || '').toLowerCase() === 'true'
const globalApiKey = process.env.API_KEY
const baseWebhookURL = process.env.BASE_WEBHOOK_URL
const maxAttachmentSize = parseInt(process.env.MAX_ATTACHMENT_SIZE) || 10000000
const setMessagesAsSeen = (process.env.SET_MESSAGES_AS_SEEN || '').toLowerCase() === 'true'
const disabledCallbacks = process.env.DISABLED_CALLBACKS ? process.env.DISABLED_CALLBACKS.split('|') : []
const enableSwaggerEndpoint = (process.env.ENABLE_SWAGGER_ENDPOINT || '').toLowerCase() === 'true'
const webVersion = process.env.WEB_VERSION
const webVersionCacheType = process.env.WEB_VERSION_CACHE_TYPE || 'none'
const rateLimitMax = process.env.RATE_LIMIT_MAX || 1000
const rateLimitWindowMs = process.env.RATE_LIMIT_WINDOW_MS || 1000
const recoverSessions = (process.env.RECOVER_SESSIONS || '').toLowerCase() === 'true'
const optimizeChromeMemory = (process.env.OPTIMIZE_CHROME_MEMORY || '').toLowerCase() === 'true'
const headlessMode = (process.env.HEADLESS_MODE || '').toLowerCase() === 'true'
const puppeteerDebug = (process.env.PUPPETEER_DEBUG || '').toLowerCase() === 'true'

// Enable puppeteer debugging if configured
if (puppeteerDebug) {
  process.env.DEBUG = 'puppeteer:*'
}

module.exports = {
  sessionFolderPath,
  enableCallback,
  globalApiKey,
  baseWebhookURL,
  maxAttachmentSize,
  setMessagesAsSeen,
  disabledCallbacks,
  enableSwaggerEndpoint,
  webVersion,
  webVersionCacheType,
  rateLimitMax,
  rateLimitWindowMs,
  recoverSessions,
  optimizeChromeMemory,
  headlessMode,
  puppeteerDebug
}
