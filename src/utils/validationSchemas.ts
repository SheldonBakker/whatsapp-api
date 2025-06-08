import Joi from 'joi';
import { ValidationSchema } from '../types';

// Basic WhatsApp ID format (adjust regex as needed for more strictness)
// Allows digits, letters, '+', '@', '.', '-', and spaces for WhatsApp chat IDs
// Examples: "27681501196@c.us", "123456789@g.us", "+1234567890@c.us"
const whatsappIdRegex: RegExp = /^[0-9a-zA-Z@.+-\s]+$/;
// Basic Session ID format (alphanumeric, hyphens, underscores)
const sessionIdRegex: RegExp = /^[a-zA-Z0-9-_]+$/;

// Schema for Session ID (used in params)
const sessionIdParamSchema: Joi.ObjectSchema = Joi.object({
  sessionId: Joi.string().pattern(sessionIdRegex).required().messages({
    'string.pattern.base': 'Session ID contains invalid characters.',
    'any.required': 'Session ID is required.'
  })
});

// Schema for Chat ID (used in body)
const chatIdSchema: Joi.StringSchema = Joi.string().pattern(whatsappIdRegex).required().messages({
  'string.pattern.base': 'Chat ID contains invalid characters or format.',
  'any.required': 'Chat ID (chatId) is required.'
});

// Schema for Phone Number (used in body)
const numberSchema: Joi.StringSchema = Joi.string().pattern(/^[0-9+\s]+$/).required().messages({ // Simpler regex for general numbers
  'string.pattern.base': 'Number contains invalid characters.',
  'any.required': 'Number (number) is required.'
});

// Schema for Message ID (used in body)
const messageIdSchema: Joi.StringSchema = Joi.string().required().messages({ // Usually an opaque string
  'any.required': 'Message ID (messageId) is required.'
});

// Schema for Message Content (used in body)
const messageContentSchema: Joi.AlternativesSchema = Joi.alternatives().try(
  Joi.string().required(),
  Joi.object().required() // Allow objects for media captions etc.
).messages({
  'alternatives.types': 'Content must be a string or an object.',
  'any.required': 'Content (content) is required.'
});

// Schema for Content Type (used in body) - Updated to match controller implementation
const contentTypeSchema: Joi.StringSchema = Joi.string().valid(
  'string',              // For text messages
  'MessageMedia',        // For media files (images, videos, audio, documents)
  'MessageMediaFromURL', // For media from URL
  'Location',            // For location sharing
  'Buttons',             // For button messages
  'List',                // For list messages
  'Contact',             // For contact cards
  'Poll'                 // For polls
).required().messages({
  'any.only': 'Invalid content type. Must be one of: string, MessageMedia, MessageMediaFromURL, Location, Buttons, List, Contact, Poll',
  'any.required': 'Content type (contentType) is required.'
});

// --- Combined Schemas for Route Validation ---

// Schema for POST /client/getNumberId/:sessionId
const getNumberIdBodySchema: Joi.ObjectSchema = Joi.object({
  number: numberSchema
});

// Schema for POST /client/sendMessage/:sessionId
const sendMessageBodySchema: Joi.ObjectSchema = Joi.object({
  chatId: chatIdSchema,
  content: messageContentSchema,
  contentType: contentTypeSchema,
  options: Joi.object().optional() // Allow optional message options
});

// Schema for POST /message/delete/:sessionId
const deleteMessageBodySchema: Joi.ObjectSchema = Joi.object({
  chatId: chatIdSchema,
  messageId: messageIdSchema
});

const validationSchemas: ValidationSchema = {
  sessionId: sessionIdParamSchema,
  message: sendMessageBodySchema,
  chatId: chatIdSchema,
  contactId: numberSchema,
  mediaUrl: Joi.string().uri().optional(),
  caption: Joi.string().optional(),
  quotedMessageId: messageIdSchema.optional(),
  mentions: Joi.array().items(Joi.string()).optional()
};

export {
  sessionIdParamSchema,
  getNumberIdBodySchema,
  sendMessageBodySchema,
  deleteMessageBodySchema,
  // Export individual schemas if needed elsewhere
  chatIdSchema,
  numberSchema,
  messageIdSchema,
  messageContentSchema,
  contentTypeSchema,
  validationSchemas
};
