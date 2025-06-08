import { sessions } from '../sessions';
import { sendErrorResponse } from '../utils';
import { AuthenticatedRequest, TypedResponse } from '../types';

/**
 * Get message by its ID from a given chat using the provided client.
 * @async
 * @function
 * @param {object} client - The chat client.
 * @param {string} messageId - The ID of the message to get.
 * @param {string} chatId - The ID of the chat to search in.
 * @returns {Promise<object>} - A Promise that resolves with the message object that matches the provided ID, or undefined if no such message exists.
 * @throws {Error} - Throws an error if the provided client, message ID or chat ID is invalid.
 */
const _getMessageById = async (client: any, messageId: string, chatId: string): Promise<any> => {
  const chat = await client.getChatById(chatId);
  const messages = await chat.fetchMessages({ limit: 100 });
  const message = messages.find((message: any) => { return message.id.id === messageId; });
  return message;
};
/**
 * Deletes a message.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @param {boolean} req.body.everyone - Whether to delete the message for everyone or just the sender.
 * @returns {Promise<void>} - A Promise that resolves with no value when the function completes.
 */
export const deleteMessage = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const { messageId, chatId, everyone } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not Found') }
    const result = await message.delete(everyone)
    res.json({ success: true, result })
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
}

// Function is already exported above
