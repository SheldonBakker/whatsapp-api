import { MessageMedia, Location, Buttons, List, Poll } from 'whatsapp-web.js';
import { sessions } from '../sessions';
import { sendErrorResponse } from '../utils';
import { AuthenticatedRequest, TypedResponse } from '../types';

/**
 * Send a message to a chat using the WhatsApp API
 *
 * @async
 * @function sendMessage
 * @param {Object} req - The request object containing the request parameters
 * @param {Object} req.body - The request body containing the chatId, content, contentType and options
 * @param {string} req.body.chatId - The chat id where the message will be sent
 * @param {string|Object} req.body.content - The message content to be sent, can be a string or an object containing the MessageMedia data
 * @param {string} req.body.contentType - The type of the message content, must be one of the following: 'string', 'MessageMedia', 'MessageMediaFromURL', 'Location', 'Buttons', or 'List'
 * @param {Object} req.body.options - Additional options to be passed to the WhatsApp API
 * @param {string} req.params.sessionId - The id of the WhatsApp session to be used
 * @param {Object} res - The response object
 * @returns {Object} - The response object containing a success flag and the sent message data
 * @throws {Error} - If there is an error while sending the message
 */
export const sendMessage = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  /*
    #swagger.requestBody = {
      required: true,
      '@content': {
        "application/json": {
          schema: {
            type: 'object',
            properties: {
              chatId: {
                type: 'string',
                description: 'The Chat id which contains the message (Group or Individual)',
              },
              contentType: {
                type: 'string',
                description: 'The type of message content, must be one of the following: string, MessageMedia, MessageMediaFromURL, Location, Buttons, or List',
              },
              content: {
                type: 'object',
                description: 'The content of the message, can be a string or an object',
              },
              options: {
                type: 'object',
                description: 'The message send options',
              }
            }
          },
          examples: {
            string: { value: { chatId: '6281288888888@c.us', contentType: 'string', content: 'Hello World!' } },
            MessageMedia: { value: { chatId: '6281288888888@c.us', contentType: 'MessageMedia', content: { mimetype: 'image/jpeg', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', filename: 'image.jpg' } } },
            MessageMediaFromURL: { value: { chatId: '6281288888888@c.us', contentType: 'MessageMediaFromURL', content: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=Example' } },
            Location: { value: { chatId: '6281288888888@c.us', contentType: 'Location', content: { latitude: -6.2, longitude: 106.8, description: 'Jakarta' } } },
            Buttons: { value: { chatId: '6281288888888@c.us', contentType: 'Buttons', content: { body: 'Hello World!', buttons: [{ body: 'button 1' }], title: 'Hello World!', footer: 'Hello World!' } } },
            List: {
              value: { chatId: '6281288888888@c.us', contentType: 'List', content: { body: 'Hello World!', buttonText: 'Hello World!', sections: [{ title: 'sectionTitle', rows: [{ id: 'customId', title: 'ListItem2', description: 'desc' }, { title: 'ListItem2' }] }], title: 'Hello World!', footer: 'Hello World!' } }
            },
            Contact: {
              value: { chatId: '6281288888888@c.us', contentType: 'Contact', content: { contactId: '6281288888889@c.us' } }
            },
            Poll: {
              value: { chatId: '6281288888888@c.us', contentType: 'Poll', content: { pollName: 'Cats or Dogs?', pollOptions: ['Cats', 'Dogs'], options: { allowMultipleAnswers: true } } }
            },
          }
        }
      }
    }
  */

  try {
    const { chatId, content, contentType, options } = req.body;
    const client = sessions.get(req.params.sessionId);

    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }

    let messageOut: any;
    switch (contentType) {
      case 'string':
        if (options?.media) {
          const media = options.media
          media.filename = null
          media.filesize = null
          options.media = new MessageMedia(media.mimetype, media.data, media.filename, media.filesize)
        }
        messageOut = await client.sendMessage(chatId, content, options)
        break
      case 'MessageMediaFromURL': {
        const messageMediaFromURL = await MessageMedia.fromUrl(content, { unsafeMime: true })
        messageOut = await client.sendMessage(chatId, messageMediaFromURL, options)
        break
      }
      case 'MessageMedia': {
        const messageMedia = new MessageMedia(content.mimetype, content.data, content.filename, content.filesize)
        messageOut = await client.sendMessage(chatId, messageMedia, options)
        break
      }
      case 'Location': {
        const location = new Location(content.latitude, content.longitude, content.description)
        messageOut = await client.sendMessage(chatId, location, options)
        break
      }
      case 'Buttons': {
        const buttons = new Buttons(content.body, content.buttons, content.title, content.footer)
        messageOut = await client.sendMessage(chatId, buttons, options)
        break
      }
      case 'List': {
        const list = new List(content.body, content.buttonText, content.sections, content.title, content.footer)
        messageOut = await client.sendMessage(chatId, list, options)
        break
      }
      case 'Contact': {
        const contactId = content.contactId.endsWith('@c.us') ? content.contactId : `${content.contactId}@c.us`
        const contact = await client.getContactById(contactId)
        messageOut = await client.sendMessage(chatId, contact, options)
        break
      }
      case 'Poll': {
        const poll = new Poll(content.pollName, content.pollOptions, content.options)
        messageOut = await client.sendMessage(chatId, poll, options)
        break
      }
      default:
        return sendErrorResponse(res, 404, 'contentType invalid, must be string, MessageMedia, MessageMediaFromURL, Location, Buttons, List, Contact or Poll')
    }

    res.json({ success: true, message: messageOut });
  } catch (error: any) {
    console.log(error);
    sendErrorResponse(res, 500, error.message);
  }
}

/**
 * Get session information for a given sessionId
 *
 * @async
 * @function getClientInfo
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} req.params.sessionId - The sessionId for which the session info is requested
 * @returns {Object} - Response object with session info
 * @throws Will throw an error if session info cannot be retrieved
 */
export const getClassInfo = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const sessionInfo = await (client as any).info;
    res.json({ success: true, sessionInfo });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
}

/**
 * Retrieves the registered WhatsApp ID for a number
 *
 * @async
 * @function getNumberId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} req.params.sessionId - The sessionId in which the user is registered
 * @param {string} req.body.id - The id of the user to check
 * @returns {Object} - Response object with a boolean indicating whether the user is registered
 * @throws Will throw an error if user registration cannot be checked
 */
export const getNumberId = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  /*
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          number: {
            type: 'string',
            description: 'The number or ID (\"@c.us\" will be automatically appended if not specified)',
            example: '6281288888888'
          },
        }
      },
    }
  */
  try {
    const { number } = req.body;
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const result = await client.getNumberId(number);
    res.json({ success: true, result });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
}

/**
 * Retrieves the version of WhatsApp Web currently being run.
 *
 * @async
 * @function getWWebVersion
 * @param {Object} req - The HTTP request object.
 * @param {Object} req.params - The request parameters.
 * @param {string} req.params.sessionId - The ID of the session.
 * @param {Object} res - The HTTP response object.
 * @returns {Object} The response object.
 * @throws {Error} If there is an error while accepting the invite.
 */
export const getWWebVersion = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const result = await client.getWWebVersion();
    res.json({ success: true, result });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
}

/**
 * Retrieves the state for a particular session.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The ID of the session to retrieve the state for.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 * @throws {Error} If there is an error retrieving the state.
 */
export const getState = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const state = await client.getState();
    res.json({ success: true, state });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
}

// All functions are already exported individually above
