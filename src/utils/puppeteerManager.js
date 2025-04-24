const { logger } = require('./logger') // Assuming logger is in the same utils dir
const {
  chromeHeadless,
  puppeteerDebug,
  webVersion,
  webVersionCacheType
} = require('../config') // Adjust path as needed
const { LocalAuth } = require('whatsapp-web.js')

// --- Enhanced Utility: Safely Kill Puppeteer Browser ---
// Attempts graceful close, then force kill if necessary
const safeKillBrowser = async (client) => {
  if (!client) {
    return // No client to work with
  }

  const sessionId = client?.options?.clientId // Get sessionId if available
  const logContext = { sessionId }

  // Try to clean up any existing Chrome processes for this session
  try {
    const { exec } = require('child_process')
    // Find and kill any Chrome processes that might be using this session's profile
    const profilePath = `/usr/src/app/.wwebjs_auth/session-${sessionId}/puppeteer_chrome_profile`
    exec(`pkill -f "${profilePath}"`, (error) => {
      if (!error) {
        logger.info(`Killed Chrome processes using profile: ${profilePath}`, logContext)
      }
    })
  } catch (execErr) {
    logger.warn(`Failed to kill Chrome processes: ${execErr.message}`, { ...logContext, error: execErr })
  }

  // Now handle the browser instance if it exists
  if (!client.pupBrowser) {
    return // No browser instance to kill
  }

  const browser = client.pupBrowser
  const browserProcess = browser.process() // Get the browser's child process

  try {
    if (browser.isConnected()) {
      logger.info('Attempting graceful browser close', logContext)
      await Promise.race([
        browser.close(),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 sec timeout
      ])
      logger.info('Browser closed gracefully', logContext)
    }
  } catch (err) {
    logger.warn(`Graceful browser close failed: ${err.message}. Attempting force kill.`, { ...logContext, error: err })
    if (browserProcess && !browserProcess.killed) {
      try {
        process.kill(browserProcess.pid, 'SIGKILL')
        logger.info(`Browser process ${browserProcess.pid} force-killed`, logContext)
      } catch (killErr) {
        logger.error(`Failed to force-kill browser process ${browserProcess?.pid}: ${killErr.message}`, { ...logContext, error: killErr })
      }
    }
  } finally {
    // Nullify references to potentially help GC
    if (client) {
      client.pupBrowser = null
      client.pupPage = null
    }
  }
}

// --- Generate WWebJS Client Options ---
const generateClientOptions = (sessionId, sessionFolderPath) => {
  const logContext = { sessionId }

  const localAuth = new LocalAuth({
    clientId: sessionId,
    dataPath: sessionFolderPath
    // dataUncompressed: true // Consider if needed
  })
  // Simplify logout override - Log this action
  localAuth.logout = () => {
    logger.info('LocalAuth logout called, but overridden to prevent data deletion.', logContext)
  }

  // Base Puppeteer args for resource optimization
  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process', // May impact stability slightly, monitor
    '--disable-extensions',
    '--disable-popup-blocking',
    '--disable-sync',
    '--disable-features=IsolateOrigins,site-per-process',
    '--bwsi',
    // Use a persistent directory for Chrome user data instead of /tmp
    `--user-data-dir=/usr/src/app/.wwebjs_auth/session-${sessionId}/puppeteer_chrome_profile`,
    '--disable-software-rasterizer',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-translate',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-client-side-phishing-detection',
    '--disable-hang-monitor',
    '--disable-prompt-on-repost',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    '--safebrowsing-disable-auto-update',
    '--password-store=basic',
    '--use-mock-keychain',
    '--mute-audio'
  ]

  const customUserAgent = process.env[`${sessionId.toUpperCase()}_USER_AGENT`] ||
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'

  if (puppeteerDebug) {
    logger.debug('Puppeteer Configuration:', {
      sessionId,
      headless: chromeHeadless ? 'new' : false,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || 'Default',
      userAgent: customUserAgent,
      args: puppeteerArgs
    })
  }

  const clientOptions = {
    puppeteer: {
      headless: chromeHeadless ? 'new' : false,
      args: puppeteerArgs,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || undefined,
      dumpio: puppeteerDebug,
      timeout: 180000 // 3 minutes initialization timeout
    },
    userAgent: customUserAgent,
    authStrategy: localAuth,
    restartOnAuthFail: true,
    takeoverOnConflict: true,
    qrMaxRetries: 3,
    clientId: sessionId
  }

  // Web Version Cache
  if (webVersion) {
    clientOptions.webVersion = webVersion
    switch (webVersionCacheType.toLowerCase()) {
      case 'local':
        clientOptions.webVersionCache = { type: 'local' }
        break
      case 'remote':
        clientOptions.webVersionCache = { type: 'remote', remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${webVersion}.html` }
        break
      default:
        clientOptions.webVersionCache = { type: 'none' }
    }
  }

  return clientOptions
}

module.exports = {
  safeKillBrowser,
  generateClientOptions
}
// End of file
