// Load environment variables from .env file
import 'dotenv/config';
import { ConfigOptions } from './types';

// setup global const
const sessionFolderPath: string = process.env.SESSIONS_PATH || './sessions';
const enableCallback: boolean = (process.env.ENABLE_CALLBACK || '').toLowerCase() === 'true';
const globalApiKey: string | undefined = process.env.API_KEY;
const baseWebhookURL: string = process.env.BASE_WEBHOOK_URL || 'http://localhost:3000/callback';
const maxAttachmentSize: number = parseInt(process.env.MAX_ATTACHMENT_SIZE || '10000000', 10);
const setMessagesAsSeen: boolean = (process.env.SET_MESSAGES_AS_SEEN || '').toLowerCase() === 'true';
const disabledCallbacks: string[] = process.env.DISABLED_CALLBACKS ? process.env.DISABLED_CALLBACKS.split('|') : [];
const enableSwaggerEndpoint: boolean = (process.env.ENABLE_SWAGGER_ENDPOINT || '').toLowerCase() === 'true';
const webVersion: string | undefined = process.env.WEB_VERSION;
const webVersionCacheType: string = process.env.WEB_VERSION_CACHE_TYPE || 'none';
const rateLimitMax: number = parseInt(process.env.RATE_LIMIT_MAX || '1000', 10);
const rateLimitWindowMs: number = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '1000', 10);
const recoverSessions: boolean = (process.env.RECOVER_SESSIONS || '').toLowerCase() === 'true';
const optimizeChromeMemory: boolean = (process.env.OPTIMIZE_CHROME_MEMORY || '').toLowerCase() === 'true';
// Use CHROME_HEADLESS if available, otherwise fall back to HEADLESS_MODE
const chromeHeadless: boolean = process.env.CHROME_HEADLESS !== undefined
  ? (process.env.CHROME_HEADLESS || '').toLowerCase() === 'true'
  : (process.env.HEADLESS_MODE || '').toLowerCase() === 'true';
const puppeteerDebug: boolean = (process.env.PUPPETEER_DEBUG || '').toLowerCase() === 'true';

// Enable puppeteer debugging if configured
if (puppeteerDebug) {
  process.env.DEBUG = 'puppeteer:*';
}

const config: ConfigOptions = {
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
  chromeHeadless,
  puppeteerDebug
};

export {
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
  chromeHeadless,
  puppeteerDebug
};

export default config;
