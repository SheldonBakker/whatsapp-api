import { logger } from './logger';
import {
  chromeHeadless,
  puppeteerDebug,
  webVersion,
  webVersionCacheType
} from '../config';
import { LocalAuth } from 'whatsapp-web.js';
import { exec } from 'child_process';
import { ClientInstance } from '../types';

// --- Enhanced Utility: Safely Kill Puppeteer Browser ---
// Attempts graceful close, then force kill if necessary
export const safeKillBrowser = async (client: ClientInstance): Promise<void> => {
  if (!client) {
    return; // No client to work with
  }

  const sessionId = (client as any)?.options?.clientId; // Get sessionId if available
  const logContext = { sessionId };

  // Try to clean up any existing Chrome processes for this session
  try {
    // Find and kill any Chrome processes that might be using this session's profile
    const profilePath = `${process.cwd()}/.wwebjs_auth/session-${sessionId}/puppeteer_chrome_profile`;
    exec(`pkill -f "${profilePath}"`, (error) => {
      if (!error) {
        logger.info(`Killed Chrome processes using profile: ${profilePath}`, logContext);
      }
    });
  } catch (execErr: any) {
    logger.warn(`Failed to kill Chrome processes: ${execErr.message}`, { ...logContext, error: execErr });
  }

  // Now handle the browser instance if it exists
  if (!client.pupBrowser) {
    return; // No browser instance to kill
  }

  const browser = client.pupBrowser;
  const browserProcess = browser.process(); // Get the browser's child process

  try {
    if (browser.isConnected()) {
      logger.info('Attempting graceful browser close', logContext);
      await Promise.race([
        browser.close(),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 sec timeout
      ]);
      logger.info('Browser closed gracefully', logContext);
    }
  } catch (err: any) {
    logger.warn(`Graceful browser close failed: ${err.message}. Attempting force kill.`, { ...logContext, error: err });
    if (browserProcess && !browserProcess.killed) {
      try {
        process.kill(browserProcess.pid, 'SIGKILL');
        logger.info(`Browser process ${browserProcess.pid} force-killed`, logContext);
      } catch (killErr: any) {
        logger.error(`Failed to force-kill browser process ${browserProcess?.pid}: ${killErr.message}`, { ...logContext, error: killErr });
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
export const generateClientOptions = (sessionId: string, sessionFolderPath: string): any => {
  const logContext = { sessionId };

  const localAuth = new LocalAuth({
    clientId: sessionId,
    dataPath: sessionFolderPath
    // dataUncompressed: true // Consider if needed
  });
  // Simplify logout override - Log this action
  (localAuth as any).logout = (): void => {
    logger.info('LocalAuth logout called, but overridden to prevent data deletion.', logContext);
  };

  // Base Puppeteer args optimized for Docker/containerized environments
  const puppeteerArgs: string[] = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--disable-sync',
    '--disable-features=VizDisplayCompositor',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',
    '--bwsi',
    // Use a persistent directory for Chrome user data
    `--user-data-dir=${process.cwd()}/.wwebjs_auth/session-${sessionId}/puppeteer_chrome_profile`,
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
    '--mute-audio',
    // Docker/Container specific optimizations
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-features=VizServiceDisplayCompositor',
    '--disable-logging',
    '--disable-login-animations',
    '--disable-motion-blur',
    '--disable-new-tab-first-run',
    '--disable-default-apps',
    '--disable-background-mode',
    '--disable-component-extensions-with-background-pages',
    '--disable-component-update',
    '--disable-domain-reliability',
    '--disable-features=AudioServiceOutOfProcess',
    '--disable-features=MediaRouter',
    '--disable-print-preview',
    '--disable-speech-api',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-pings',
    '--no-zygote',
    '--single-process',
    '--disable-gpu-sandbox'
  ];

  const customUserAgent: string = process.env[`${sessionId.toUpperCase()}_USER_AGENT`] ||
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

  if (puppeteerDebug) {
    logger.debug('Puppeteer Configuration:', {
      sessionId,
      headless: chromeHeadless ? 'new' : false,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || 'Default',
      userAgent: customUserAgent,
      args: puppeteerArgs
    });
  }

  // Determine Chrome executable path based on environment
  const getChromePath = (): string | undefined => {
    // Priority order: PUPPETEER_EXECUTABLE_PATH > CHROME_BIN > CHROME_PATH > auto-detect
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    if (process.env.CHROME_BIN) {
      return process.env.CHROME_BIN;
    }
    if (process.env.CHROME_PATH) {
      return process.env.CHROME_PATH;
    }

    // Auto-detect based on platform
    const platform = process.platform;
    if (platform === 'linux') {
      // Common paths for Linux/Docker
      const linuxPaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable'
      ];
      for (const path of linuxPaths) {
        try {
          require('fs').accessSync(path, require('fs').constants.F_OK);
          return path;
        } catch (e) {
          // Continue to next path
        }
      }
    } else if (platform === 'darwin') {
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }

    return undefined; // Let Puppeteer use its bundled Chromium
  };

  const clientOptions: any = {
    puppeteer: {
      headless: chromeHeadless ? 'new' : false,
      args: puppeteerArgs,
      executablePath: getChromePath(),
      dumpio: puppeteerDebug,
      timeout: 180000, // 3 minutes initialization timeout
      ignoreDefaultArgs: ['--disable-extensions'], // Allow some extensions for better compatibility
      defaultViewport: null // Use default viewport
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
// End of file
