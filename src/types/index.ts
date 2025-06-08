import { Request, Response } from 'express';
import { Client } from 'whatsapp-web.js';

// Session-related types
export interface SessionData {
  success: boolean;
  message: string;
  state?: string;
  qr?: string;
}

export interface ClientInstance extends Client {
  qr?: string;
  _initializing?: boolean;
  _destroyed?: boolean;
  pupBrowser?: any; // Puppeteer browser instance
  pupPage?: any; // Puppeteer page instance
}

export interface SessionStatus {
  success: boolean;
  message: string;
  state: string;
  qr?: string;
  qrStatus: 'UNAVAILABLE' | 'INITIALIZING' | 'READY_FOR_SCAN' | 'SCANNED_AUTHENTICATED' | 'SCANNED_PENDING_AUTH' | 'ERROR';
}

export interface SessionSummary {
  id: string;
  state: string;
  qrStatus: string;
  message: string;
}

// WhatsApp message types
export interface WhatsAppMessage {
  id: string;
  body: string;
  type: string;
  timestamp: number;
  from: string;
  to: string;
  author?: string;
  deviceType?: string;
  hasMedia?: boolean;
  hasQuotedMsg?: boolean;
  isForwarded?: boolean;
  isStatus?: boolean;
  isStarred?: boolean;
  isGif?: boolean;
  mentionedIds?: string[];
}

export interface MessageOptions {
  caption?: string;
  quotedMessageId?: string;
  mentions?: string[];
  sendMediaAsSticker?: boolean;
  sendMediaAsDocument?: boolean;
  parseVCards?: boolean;
  linkPreview?: boolean;
}

export interface ContactInfo {
  id: string;
  name?: string;
  pushname?: string;
  number?: string;
  isGroup?: boolean;
  isUser?: boolean;
  isMyContact?: boolean;
  isBlocked?: boolean;
  profilePicUrl?: string;
}

export interface ChatInfo {
  id: string;
  name?: string;
  isGroup: boolean;
  isReadOnly: boolean;
  unreadCount: number;
  timestamp: number;
  archived: boolean;
  pinned: boolean;
  isMuted: boolean;
  muteExpiration?: number;
  participants?: ContactInfo[];
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    stack?: string;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// Configuration types
export interface ConfigOptions {
  sessionFolderPath: string;
  enableCallback: boolean;
  globalApiKey?: string | undefined;
  baseWebhookURL: string;
  maxAttachmentSize: number;
  setMessagesAsSeen: boolean;
  disabledCallbacks: string[];
  enableSwaggerEndpoint: boolean;
  webVersion?: string | undefined;
  webVersionCacheType: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  recoverSessions: boolean;
  optimizeChromeMemory: boolean;
  chromeHeadless: boolean;
  puppeteerDebug: boolean;
}

// Webhook types
export interface WebhookPayload {
  sessionId: string;
  event: string;
  data: any;
  timestamp: number;
}

// Express types extensions
export interface AuthenticatedRequest extends Request {
  sessionId?: string;
  logger?: any;
  requestId?: string;
}

export interface TypedResponse extends Response {
  json(body: any): this;
}

// Puppeteer configuration types
export interface PuppeteerConfig {
  headless: boolean;
  args: string[];
  defaultViewport?: {
    width: number;
    height: number;
  };
  userDataDir?: string;
  executablePath?: string;
}

// Health check types
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: number;
  details?: {
    activeSessions: number;
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
  };
}

// Validation schema types
export interface ValidationSchema {
  sessionId?: any;
  message?: any;
  chatId?: any;
  contactId?: any;
  mediaUrl?: any;
  caption?: any;
  quotedMessageId?: any;
  mentions?: any;
}

// Logger types
export interface LoggerConfig {
  level: string;
  format: any;
  transports: any[];
}

export interface ChildLoggerOptions {
  requestId?: string;
  sessionId?: string;
  module?: string;
  [key: string]: any;
}

// Utility function types
export type AsyncHandler = (req: AuthenticatedRequest, res: TypedResponse, next?: any) => Promise<void>;
export type MiddlewareFunction = (req: AuthenticatedRequest, res: Response, next: any) => void;

// Session management function types
export interface SetupSessionResult {
  success: boolean;
  message?: string;
}

export interface SessionValidationResult {
  success: boolean;
  message: string;
  state?: string | null;
}

// File attachment types
export interface FileAttachment {
  filename: string;
  mimetype: string;
  data: Buffer | string;
  size: number;
}

// Rate limiting types
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}
