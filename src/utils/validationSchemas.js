const Joi = require('joi');

// Basic WhatsApp ID format (adjust regex as needed for more strictness)
// Allows digits, '+', '@', '.', '-'
const whatsappIdRegex = /^[0-9@.+-\s]+$/;
// Basic Session ID format (alphanumeric, hyphens, underscores)
const sessionIdRegex = /^[a-zA-Z0-9-_]+$/;

// Schema for Session ID (used in params)
const sessionIdParamSchema = Joi.object({
  sessionId: Joi.string().pattern(sessionIdRegex).required().messages({
    'string.pattern.base': 'Session ID contains invalid characters.',
    'any.required': 'Session ID is required.'
  })
});

// Schema for Chat ID (used in body)
const chatIdSchema = Joi.string().pattern(whatsappIdRegex).required().messages({
  'string.pattern.base': 'Chat ID contains invalid characters or format.',
  'any.required': 'Chat ID (chatId) is required.'
});

// Schema for Phone Number (used in body)
const numberSchema = Joi.string().pattern(/^[0-9+\s]+$/).required().messages({ // Simpler regex for general numbers
  'string.pattern.base': 'Number contains invalid characters.',
  'any.required': 'Number (number) is required.'
});

// Schema for Message ID (used in body)
const messageIdSchema = Joi.string().required().messages({ // Usually an opaque string
  'any.required': 'Message ID (messageId) is required.'
});

// Schema for Message Content (used in body)
const messageContentSchema = Joi.alternatives().try(
  Joi.string().required(),
  Joi.object().required() // Allow objects for media captions etc.
).messages({
  'alternatives.types': 'Content must be a string or an object.',
  'any.required': 'Content (content) is required.'
});

// Schema for Content Type (used in body)
const contentTypeSchema = Joi.string().valid(
  'text', 'image', 'video', 'audio', 'document', 'location', 'vcard', 'sticker' // Add other valid types as needed
).required().messages({
  'any.only': 'Invalid content type provided.',
  'any.required': 'Content type (contentType) is required.'
});

// --- Combined Schemas for Route Validation ---

// Schema for POST /client/getNumberId/:sessionId
const getNumberIdBodySchema = Joi.object({
  number: numberSchema
});

// Schema for POST /client/sendMessage/:sessionId
const sendMessageBodySchema = Joi.object({
  chatId: chatIdSchema,
  content: messageContentSchema,
  contentType: contentTypeSchema,
  options: Joi.object().optional() // Allow optional message options
});

// Schema for POST /message/delete/:sessionId
const deleteMessageBodySchema = Joi.object({
  chatId: chatIdSchema,
  messageId: messageIdSchema
});

module.exports = {
  sessionIdParamSchema,
  getNumberIdBodySchema,
  sendMessageBodySchema,
  deleteMessageBodySchema,
  // Export individual schemas if needed elsewhere
  chatIdSchema,
  numberSchema,
  messageIdSchema,
  messageContentSchema,
  contentTypeSchema
};