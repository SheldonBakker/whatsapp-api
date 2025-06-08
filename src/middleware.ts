import { Request, Response, NextFunction } from 'express';
import { globalApiKey, rateLimitMax, rateLimitWindowMs } from './config';
import { sendErrorResponse } from './utils';
import { validateSession } from './sessions';
import rateLimiting from 'express-rate-limit';
import { logger } from './utils/logger';
import { AuthenticatedRequest, MiddlewareFunction } from './types';
import Joi from 'joi';

// --- Generic Joi Validation Middleware ---
export const validate = (schema: Joi.Schema, property: string = 'body'): MiddlewareFunction => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const dataToValidate = (req as any)[property];
    const options = {
      abortEarly: false, // Return all errors
      allowUnknown: true, // Allow properties not defined in schema (can be adjusted)
      stripUnknown: false // Do not remove unknown properties (can be adjusted)
    };

    try {
      await schema.validateAsync(dataToValidate, options);
      next(); // Validation successful
    } catch (error: any) {
      // Log the validation error with details
      const reqLogger = req.logger || logger; // Use request-specific logger if available
      const errorDetails = error.details.map((detail: any) => ({
        message: detail.message,
        path: detail.path,
        type: detail.type
      }));
      reqLogger.warn(`Validation Error (${property}): ${error.message}`, {
        validationProperty: property,
        validationErrors: errorDetails,
        requestData: dataToValidate // Be cautious logging sensitive data
      });

      // Determine appropriate status code (400 for general bad input, 422 if syntactically correct but semantically wrong)
      const statusCode = (property === 'body' || property === 'query') ? 400 : 422; // Example logic

      // Send detailed error response (consider simplifying for production)
      sendErrorResponse(res, statusCode, 'Validation failed');
      return;
    }
  };
};

// JSON payload size validation (Keep as is, Joi doesn't handle raw size)
export const validatePayloadSize = (maxSize: number = 50 * 1024 * 1024): MiddlewareFunction => { // Default 50MB
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const reqLogger = req.logger || logger;
    const contentLength = parseInt(req.headers['content-length'] as string, 10);
    if (contentLength > maxSize) {
      reqLogger.warn(`Payload too large: ${contentLength} bytes (Max: ${maxSize})`, {
        contentLength,
        maxSize,
        url: req.originalUrl
      });
      sendErrorResponse(res, 413, 'Payload too large');
      return;
    }
    next();
  };
};

// API Key Validation (Keep as is, specific logic)
export const apikey = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  /*
    #swagger.security = [{
          "apiKeyAuth": []
    }]
  */
  /* #swagger.responses[403] = {
        description: "Forbidden.",
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/ForbiddenResponse" }
          }
        }
      }
  */
  try {
    // Use the API key from the config, which is loaded from .env
    const apiKeyFromConfig = globalApiKey;

    const reqLogger = req.logger || logger;
    // Ensure API key is set and not empty
    if (!apiKeyFromConfig || apiKeyFromConfig.trim() === '') {
      reqLogger.error('API key is not configured in environment variables');
      sendErrorResponse(res, 500, 'API authentication is not properly configured');
      return;
    }

    // Get the API key from the request headers
    const apiKeyFromRequest = req.headers['x-api-key'] as string;

    // Check if the API key is present and matches
    if (!apiKeyFromRequest || apiKeyFromRequest !== apiKeyFromConfig) {
      reqLogger.warn('Invalid API key attempt', { providedKeyStart: apiKeyFromRequest?.substring(0, 8) });
      sendErrorResponse(res, 403, 'Invalid API key');
      return;
    }

    // API key is valid, proceed
    next();
  } catch (error: any) {
    const reqLogger = req.logger || logger;
    reqLogger.error(`API key validation error: ${error.message}`, { error });
    if (!res.headersSent) {
      sendErrorResponse(res, 500, 'Internal server error during authentication');
      return;
    }
  }
};

// Session Exists/Ready Validation (Keep as is, uses custom logic)
export const sessionValidation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validation = await validateSession(req.params.sessionId);
    if (validation.success !== true) {
      /* #swagger.responses[404] = {
          description: "Not Found.",
          content: {
            "application/json": {
              schema: { "$ref": "#/definitions/NotFoundResponse" }
            }
          }
        }
      */
      sendErrorResponse(res, 404, validation.message);
      return;
    }
    next();
  } catch (error: any) {
    const reqLogger = req.logger || logger;
    reqLogger.error(`Session validation error: ${error.message}`, { sessionId: req.params?.sessionId, error });
    if (!res.headersSent) {
      sendErrorResponse(res, 500, 'Error validating session');
      return;
    }
  }
};

export const rateLimiter = rateLimiting({
  max: rateLimitMax,
  windowMs: rateLimitWindowMs,
  message: "You can't make any more requests at the moment. Try again later"
});

export const sessionSwagger = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
  /*
    #swagger.tags = ['Session']
  */
  next();
};

export const clientSwagger = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
  /*
    #swagger.tags = ['Client']
  */
  next();
};

export const contactSwagger = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
  /*
    #swagger.tags = ['Contact']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          contactId: {
            type: 'string',
            description: 'Unique whatsApp identifier for the contact',
            example: '6281288888888@c.us'
          }
        }
      }
    }
  */
  next();
};

export const messageSwagger = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
  /*
    #swagger.tags = ['Message']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'The Chat id which contains the message',
            example: '6281288888888@c.us'
          },
          messageId: {
            type: 'string',
            description: 'Unique whatsApp identifier for the message',
            example: 'ABCDEF999999999'
          }
        }
      }
    }
  */
  next();
};

export const chatSwagger = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
  /*
    #swagger.tags = ['Chat']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'Unique whatsApp identifier for the given Chat (either group or personnal)',
            example: '6281288888888@c.us'
          }
        }
      }
    }
  */
  next();
};
