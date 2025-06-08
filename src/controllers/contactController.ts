import { sessions } from '../sessions';
import { sendErrorResponse } from '../utils';
import { AuthenticatedRequest, TypedResponse } from '../types';

/**
 * Retrieves information about a WhatsApp contact by ID.
 *
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The ID of the current session.
 * @param {string} req.body.contactId - The ID of the contact to retrieve information for.
 * @throws {Error} If there is an error retrieving the contact information.
 * @returns {Object} The contact information object.
 */
export const getClassInfo = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const { contactId } = req.body;
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const contact = await client.getContactById(contactId);
    if (!contact) {
      return sendErrorResponse(res, 404, 'Contact not Found');
    }
    res.json({ success: true, result: contact });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Blocks a WhatsApp contact by ID.
 *
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The ID of the current session.
 * @param {string} req.body.contactId - The ID of the contact to block.
 * @throws {Error} If there is an error blocking the contact.
 * @returns {Object} The result of the blocking operation.
 */
export const block = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const { contactId } = req.body;
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const contact = await client.getContactById(contactId);
    if (!contact) {
      return sendErrorResponse(res, 404, 'Contact not Found');
    }
    const result = await contact.block();
    res.json({ success: true, result });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Retrieves the 'About' information of a WhatsApp contact by ID.
 *
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The ID of the current session.
 * @param {string} req.body.contactId - The ID of the contact to retrieve 'About' information for.
 * @throws {Error} If there is an error retrieving the contact information.
 * @returns {Object} The 'About' information of the contact.
 */
export const getAbout = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const { contactId } = req.body;
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const contact = await client.getContactById(contactId);
    if (!contact) {
      return sendErrorResponse(res, 404, 'Contact not Found');
    }
    const result = await contact.getAbout();
    res.json({ success: true, result });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Retrieves the chat information of a contact with a given contactId.
 *
 * @async
 * @function getChat
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose chat information is being retrieved.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error retrieving the chat information.
 * @returns {Promise<void>} A promise that resolves with the chat information of the contact.
 */
export const getChat = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const { contactId } = req.body;
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const contact = await client.getContactById(contactId);
    if (!contact) {
      return sendErrorResponse(res, 404, 'Contact not Found');
    }
    const result = await contact.getChat();
    res.json({ success: true, result });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Retrieves the formatted number of a contact with a given contactId.
 *
 * @async
 * @function getFormattedNumber
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose chat information is being retrieved.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error retrieving the chat information.
 * @returns {Promise<void>} A promise that resolves with the formatted number of the contact.
 */
export const getFormattedNumber = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const { contactId } = req.body;
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const contact = await client.getContactById(contactId);
    if (!contact) {
      return sendErrorResponse(res, 404, 'Contact not Found');
    }
    const result = await contact.getFormattedNumber();
    res.json({ success: true, result });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Retrieves the country code of a contact with a given contactId.
 *
 * @async
 * @function getCountryCode
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose chat information is being retrieved.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error retrieving the chat information.
 * @returns {Promise<void>} A promise that resolves with the country code of the contact.
 */
export const getCountryCode = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const { contactId } = req.body;
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const contact = await client.getContactById(contactId);
    if (!contact) {
      return sendErrorResponse(res, 404, 'Contact not Found');
    }
    const result = await contact.getCountryCode();
    res.json({ success: true, result });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Retrieves the profile picture url of a contact with a given contactId.
 *
 * @async
 * @function getProfilePicUrl
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose chat information is being retrieved.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error retrieving the chat information.
 * @returns {Promise<void>} A promise that resolves with the profile picture url of the contact.
 */
export const getProfilePicUrl = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const { contactId } = req.body;
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const contact = await client.getContactById(contactId);
    if (!contact) {
      return sendErrorResponse(res, 404, 'Contact not Found');
    }
    const result = await contact.getProfilePicUrl() || null;
    res.json({ success: true, result });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
};

/**
 * Unblocks the contact with a given contactId.
 *
 * @async
 * @function unblock
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose contact is being unblocked.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error unblocking the contact.
 * @returns {Promise<void>} A promise that resolves with the result of unblocking the contact.
 */
export const unblock = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  try {
    const { contactId } = req.body;
    const client = sessions.get(req.params.sessionId);
    if (!client) {
      return sendErrorResponse(res, 404, 'Session not found');
    }
    const contact = await client.getContactById(contactId);
    if (!contact) {
      return sendErrorResponse(res, 404, 'Contact not Found');
    }
    const result = await contact.unblock();
    res.json({ success: true, result });
  } catch (error: any) {
    sendErrorResponse(res, 500, error.message);
  }
};

// All functions are already exported individually above
