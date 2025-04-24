const { logger } = require('./logger'); // Assuming logger is in the same utils dir
const {
  chromeHeadless,
  puppeteerDebug,
  webVersion,
  webVersionCacheType
} = require('../config'); // Adjust path as needed
const { LocalAuth } = require('whatsapp-web.js');

// --- Enhanced Utility: Safely Kill Puppeteer Browser ---
// Attempts graceful close, then force kill if necessary
const safeKillBrowser = async (client) => {
  if (!client || !client.pupBrowser) {
    return; // No browser instance to kill
  }

  const browser = client.pupBrowser;
  const browserProcess = browser.process(); // Get the browser's child process
  const sessionId = client?.options?.clientId; // Get sessionId if available

  try {
    if (browser.isConnected()) {
      logger.info(`Attempting graceful browser close`, { sessionId });
      await Promise.race([
        browser.close(),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 sec timeout
      ]);
      logger.info(`Browser closed gracefully`, { sessionId });
    }
  } catch (err) {
    logger.warn(`Graceful browser close failed: ${err.message}. Attempting force kill.`, { sessionId, error: err });
    if (browserProcess && !browserProcess.killed) {
      try {
        process.kill(browserProcess.pid, 'SIGKILL');
        logger.info(`Browser process ${browserProcess.pid} force-killed`, { sessionId });
      } catch (killErr) {
        logger.error(`Failed to force-kill browser process ${browserProcess?.pid}: ${killErr.message}`, { sessionId, error: killErr });
      }
    }
  } finally {
    // Nullify references to potentially help GC
    if (client) {
      client.pupBrowser = null;
      client.pupPage = null;
    }
  }
};

// --- Generate WWebJS Client Options ---
const generateClientOptions = (sessionId, sessionFolderPath) => {
  const logContext = { sessionId };

  const localAuth = new LocalAuth({
    clientId: sessionId,
    dataPath: sessionFolderPath
    // dataUncompressed: true // Consider if needed
  });
  // Simplify logout override - Log this action
  localAuth.logout = () => {
    logger.info(`LocalAuth logout called, but overridden to prevent data deletion.`, logContext);
  };

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
    '--bwsi'
    // Add other experimental flags here if needed
  ];

  const customUserAgent = process.env[`${sessionId.toUpperCase()}_USER_AGENT`] ||
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

  if (puppeteerDebug) {
    logger.debug(`Puppeteer Configuration:`, {
      sessionId,
      headless: chromeHeadless ? 'new' : false,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || 'Default',
      userAgent: customUserAgent,
      args: puppeteerArgs
    });
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
  };

  // Web Version Cache
  if (webVersion) {
    clientOptions.webVersion = webVersion;
    switch (webVersionCacheType.toLowerCase()) {
      case 'local':
        clientOptions.webVersionCache = { type: 'local' };
        break;
      case 'remote':
        clientOptions.webVersionCache = { type: 'remote', remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${webVersion}.html` };
        break;
      default:
        clientOptions.webVersionCache = { type: 'none' };
    }
  }

  return clientOptions;
};

module.exports = {
  safeKillBrowser,
  generateClientOptions
};