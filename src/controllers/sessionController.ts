import qr from 'qr-image';
import {
  setupSession,
  deleteSession,
  reloadSession,
  validateSession,
  flushSessions,
  sessions // Direct access to the map
} from '../sessions';
import { sendErrorResponse } from '../utils';
import { AuthenticatedRequest, TypedResponse } from '../types';
import { SessionRecovery } from '../utils/sessionRecovery';
import { SessionHealthMonitor } from '../utils/sessionHealthMonitor';

// Define standard status codes
const HTTP_OK = 200;
const HTTP_ACCEPTED = 202; // Good for async process accepted
const HTTP_BAD_REQUEST = 400; // General client error
const HTTP_NOT_FOUND = 404; // Resource not found
const HTTP_CONFLICT = 409; // Resource already exists or state conflict
const HTTP_UNPROCESSABLE_ENTITY = 422; // Validation error on input
const HTTP_INTERNAL_SERVER_ERROR = 500; // Server error

/**
 * Starts initiating a session or confirms it's already starting/running.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to start.
 * @returns {Promise<void>}
 */
export const startSession = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Start a session'
  // #swagger.description = 'Starts initiating a session for the given ID. If already starting or running, confirms status.'
  const sessionId = req.params.sessionId
  if (!sessionId) {
    // #swagger.responses[400] = { description: 'Bad Request - Session ID required.' }
    sendErrorResponse(res, HTTP_BAD_REQUEST, 'Session ID is required.')
  }

  try {
    // Check current status *before* attempting setup
    const currentStatus = await validateSession(sessionId)

    if (currentStatus.message === 'session_not_found_in_memory' || currentStatus.message === 'browser_unreachable_or_dead') {
      // Session doesn't exist or is dead, proceed with setup
      console.log(`[Controller] Starting new session setup for: ${sessionId}`)
      const setupResult = setupSession(sessionId) // This function is synchronous in initiating the process

      if (!setupResult.success) {
        // #swagger.responses[422] = { description: 'Unprocessable Entity - Setup failed (e.g., critical error like folder creation).' }
        // Use setupResult.message which might contain specific error
        sendErrorResponse(res, HTTP_UNPROCESSABLE_ENTITY, setupResult.message || 'Failed to initiate session setup.')
        return;
      }

      // #swagger.responses[202] = { description: 'Accepted - Session initialization started. Poll /status for progress.' }
      res.status(HTTP_ACCEPTED).json({
        success: true,
        message: 'Session initialization accepted. Please poll status.',
        state: 'INITIALIZING' // Indicate the initial state
      })
    } else if (currentStatus.success || currentStatus.state) {
      // Session already exists (connected, starting, qr, etc.)
      // #swagger.responses[200] = { description: 'OK - Session already exists or is initializing.' }
      console.log(`[Controller] Session ${sessionId} already exists. State: ${currentStatus.state}, Message: ${currentStatus.message}`)
      res.status(HTTP_OK).json({
        success: true, // Indicate the operation succeeded (finding existing session)
        message: `Session already exists or is in progress (${currentStatus.message}).`,
        state: currentStatus.state || 'UNKNOWN'
      })
    } else {
      // Catch unexpected validation result that isn't "not found" but also not clearly existing
      console.error(`[Controller] Unexpected validation state for ${sessionId}:`, currentStatus)
      // #swagger.responses[500] = { description: 'Internal Server Error - Unexpected session state during start.' }
      sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, `Unexpected session state: ${currentStatus.message}`)
      return;
    }
  } catch (error: any) {
    // #swagger.responses[500] = { description: 'Internal Server Error.' }
    console.error('[Controller:startSession] ERROR:', error);
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, error.message || 'An unexpected error occurred.');
  }
}

/**
 * Gets the status of the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to check.
 * @returns {Promise<void>}
 */
export const statusSession = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Get session status'
  // #swagger.description = 'Retrieves the current status (state, QR availability) of the session.'
  const sessionId = req.params.sessionId
  if (!sessionId) {
    // #swagger.responses[400] = { description: 'Bad Request - Session ID required.' }
    sendErrorResponse(res, HTTP_BAD_REQUEST, 'Session ID is required.')
    return;
  }

  try {
    const sessionData = await validateSession(sessionId)

    if (sessionData.message === 'session_not_found_in_memory') {
      // #swagger.responses[404] = { description: 'Not Found - Session with this ID does not exist.' }
      res.status(HTTP_NOT_FOUND).json({ success: false, message: 'Session not found.', state: 'NOT_FOUND' })
      return;
    }

    // Add QR status information based on session state and qr presence
    let qrStatus = 'UNAVAILABLE'
    const client = sessions.get(sessionId) // Get client instance if exists
    if (client) {
      if (client._initializing) {
        qrStatus = 'INITIALIZING'
        // Override state if validation happened before init flag was set
        if (!sessionData.state || sessionData.state === 'ERROR') sessionData.state = 'INITIALIZING'
      } else if (client.qr) {
        qrStatus = 'READY_FOR_SCAN'
        // State might be STARTING or SCAN_QR_CODE from wweb.js internal states
        if (sessionData.state !== 'CONNECTED') sessionData.state = 'SCAN_QR_CODE'
      } else if (sessionData.state === 'CONNECTED') {
        qrStatus = 'SCANNED_AUTHENTICATED'
      } else if (sessionData.state && sessionData.state !== 'NOT_FOUND' && sessionData.state !== 'ERROR') {
        // If there's a state but no QR and not connected, likely scanned but not fully ready/failed auth?
        qrStatus = 'SCANNED_PENDING_AUTH' // Or just UNAVAILABLE
      }
    }

    const responsePayload = {
      success: true, // Always true for found sessions
      message: sessionData.message,
      state: sessionData.state || 'UNKNOWN', // Default to UNKNOWN if null
      qr: client?.qr, // Include QR code string if available
      qrStatus
    }

    // Return 200 OK for any found session, status details are in the body
    // #swagger.responses[200] = { description: 'Status of the session.', content: { "application/json": { schema: { "$ref": "#/definitions/StatusSessionResponse" } } } }
    res.status(HTTP_OK).json(responsePayload)
  } catch (error: any) {
    // #swagger.responses[500] = { description: 'Internal Server Error.' }
    console.error('[Controller:statusSession] ERROR:', error);
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, error.message || 'An unexpected error occurred fetching status.');
  }
}

/**
 * Enhanced session status with automatic recovery for browser issues.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID.
 * @returns {Promise<void>}
 */
export const sessionStatusWithRecovery = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Get session status with automatic recovery'
  // #swagger.description = 'Returns session status and attempts automatic recovery if browser issues are detected.'
  const sessionId = req.params.sessionId
  if (!sessionId) {
    // #swagger.responses[400] = { description: 'Bad Request - Session ID required.' }
    sendErrorResponse(res, HTTP_BAD_REQUEST, 'Session ID is required.')
    return;
  }

  try {
    const statusResult = await SessionRecovery.getSessionStatusWithRecovery(sessionId);

    if (!statusResult.success && statusResult.state === 'ERROR' && !statusResult.recoveryAttempted) {
      // #swagger.responses[404] = { description: 'Not Found - Session not found or in error state.' }
      res.status(HTTP_NOT_FOUND).json({
        success: false,
        message: statusResult.message,
        state: 'NOT_FOUND'
      });
      return;
    }

    // Return status with recovery information
    const responsePayload = {
      success: statusResult.success,
      message: statusResult.message,
      state: statusResult.state,
      qrStatus: statusResult.qrStatus,
      qr: statusResult.qr,
      ...(statusResult.recoveryAttempted && {
        recovery: {
          attempted: statusResult.recoveryAttempted,
          result: statusResult.recoveryResult,
          attempts: SessionRecovery.getRecoveryAttempts(sessionId)
        }
      })
    };

    // #swagger.responses[200] = { description: 'Session status with recovery information.' }
    res.status(HTTP_OK).json(responsePayload);
  } catch (error: any) {
    // #swagger.responses[500] = { description: 'Internal Server Error.' }
    console.error('[Controller:sessionStatusWithRecovery] ERROR:', error);
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, error.message || 'An unexpected error occurred fetching status.');
  }
}

/**
 * Gets the QR code string for session authentication.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID.
 * @returns {Promise<void>}
 */
export const sessionQrCode = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Get session QR code string'
  // #swagger.description = 'Returns the QR code string if available for scanning.'
  const sessionId = req.params.sessionId
  if (!sessionId) {
    // #swagger.responses[400] = { description: 'Bad Request - Session ID required.' }
    sendErrorResponse(res, HTTP_BAD_REQUEST, 'Session ID is required.')
    return;
  }

  try {
    const client = sessions.get(sessionId)

    if (!client) {
      // #swagger.responses[404] = { description: 'Not Found - Session not found.' }
      res.status(HTTP_NOT_FOUND).json({ success: false, message: 'Session not found.' });
      return;
    }

    if (client._initializing) {
      // #swagger.responses[202] = { description: 'Accepted - Session is initializing, QR not ready yet.' }
      res.status(HTTP_ACCEPTED).json({ success: false, message: 'Session is initializing, QR code not ready yet.' });
      return;
    }

    if (client.qr) {
      // #swagger.responses[200] = { description: 'OK - QR code string.', content: { "application/json": { schema: { type: "object", properties: { success: {type: "boolean"}, qr: {type: "string"} } } } } }
      res.status(HTTP_OK).json({ success: true, qr: client.qr });
      return;
    }

    // Check state if no QR found
    const state = await client.getState().catch(() => 'ERROR') // Gracefully handle getState error
    if (state === 'CONNECTED') {
      // #swagger.responses[200] = { description: 'OK - QR already scanned and session connected.' } // Changed from 409 to 200
      res.status(HTTP_OK).json({ success: false, message: 'QR code already scanned and session connected.' })
    } else {
      // #swagger.responses[404] = { description: 'Not Found - QR code not available (might be disconnected or initializing without QR yet).' }
      res.status(HTTP_NOT_FOUND).json({ success: false, message: 'QR code not available for this session state.' })
    }
  } catch (error: any) {
    // #swagger.responses[500] = { description: 'Internal Server Error.' }
    console.error('[Controller:sessionQrCode] ERROR:', error);
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, error.message || 'An unexpected error occurred retrieving QR code.');
  }
}

/**
 * Gets the QR code as a PNG image.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID.
 * @returns {Promise<void>}
 */
export const sessionQrCodeImage = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Get session QR code as image'
  // #swagger.description = 'Returns the QR code as a PNG image if available for scanning.'
  const sessionId = req.params.sessionId
  if (!sessionId) {
    // #swagger.responses[400] = { description: 'Bad Request - Session ID required.' }
    // Can't send JSON easily before setting headers, maybe just end?
    res.writeHead(HTTP_BAD_REQUEST, { 'Content-Type': 'text/plain' })
    res.end('Session ID is required.');
    return;
  }

  try {
    const client = sessions.get(sessionId)

    if (!client) {
      // #swagger.responses[404] = { description: 'Not Found - Session not found.' }
      res.writeHead(HTTP_NOT_FOUND, { 'Content-Type': 'text/plain' })
      res.end('Session not found.');
      return;
    }

    if (client._initializing) {
      // #swagger.responses[202] = { description: 'Accepted - Session is initializing, QR not ready yet.' }
      res.writeHead(HTTP_ACCEPTED, { 'Content-Type': 'text/plain' })
      res.end('Session is initializing, QR code not ready yet.');
      return;
    }

    if (client.qr) {
      const qrImage = qr.image(client.qr, { type: 'png' }) // Specify type
      // #swagger.responses[200] = { description: 'OK - QR image.', content: { "image/png": {} } }
      res.writeHead(HTTP_OK, { 'Content-Type': 'image/png' })
      qrImage.pipe(res); // Stream the image
      return;
    }

    // Check state if no QR found
    const state = await client.getState().catch(() => 'ERROR')
    if (state === 'CONNECTED') {
      // #swagger.responses[409] = { description: 'Conflict - QR already scanned and session connected.' } // Keep 409 here maybe? Or 404 for the image?
      res.writeHead(HTTP_CONFLICT, { 'Content-Type': 'text/plain' })
      res.end('QR code already scanned and session connected.');
      return;
    } else {
      // #swagger.responses[404] = { description: 'Not Found - QR code not available.' }
      res.writeHead(HTTP_NOT_FOUND, { 'Content-Type': 'text/plain' })
      res.end('QR code not available for this session state.');
      return;
    }
  } catch (error) {
    // #swagger.responses[500] = { description: 'Internal Server Error.' }
    console.error('[Controller:sessionQrCodeImage] ERROR:', error)
    try { // Try to send text error if headers not sent
      res.writeHead(HTTP_INTERNAL_SERVER_ERROR, { 'Content-Type': 'text/plain' })
      res.end('An unexpected error occurred retrieving QR image.')
    } catch (headerError) {
      // Headers likely already sent (e.g., during pipe), cannot send error body
      console.error('[Controller:sessionQrCodeImage] Could not send error response:', headerError)
    }
  }
}

/**
 * Restarts the session (kills existing browser, starts new initialization).
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to restart.
 * @returns {Promise<void>}
 */
export const restartSession = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Restart session'
  // #swagger.description = 'Terminates the current browser instance and starts re-initializing the session.'
  const sessionId = req.params.sessionId
  if (!sessionId) {
    // #swagger.responses[400] = { description: 'Bad Request - Session ID required.' }
    sendErrorResponse(res, HTTP_BAD_REQUEST, 'Session ID is required.')
    return;
  }

  try {
    // Check if session exists first - reloadSession expects it
    const client = sessions.get(sessionId)
    if (!client) {
      // #swagger.responses[404] = { description: 'Not Found - Session not found, cannot restart.' }
      res.status(HTTP_NOT_FOUND).json({ success: false, message: 'Session not found, cannot restart.' })
      return;
    }

    console.log(`[Controller] Restart requested for session: ${sessionId}`)
    await reloadSession(sessionId) // reloadSession now handles the killing & re-setup internally

    // #swagger.responses[200] = { description: 'OK - Session restart process initiated.' }
    res.status(HTTP_OK).json({ success: true, message: 'Session restart initiated successfully.' })
  } catch (error: any) {
    // #swagger.responses[500] = { description: 'Internal Server Error during restart.' }
    console.error('[Controller:restartSession] ERROR:', error);
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, error.message || 'An error occurred during session restart.');
  }
}

/**
 * Terminates the session, logs out, and deletes session data.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to terminate.
 * @returns {Promise<void>}
 */
export const terminateSession = async (req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Terminate session'
  // #swagger.description = 'Logs out, terminates the session, and deletes associated data.'
  const sessionId = req.params.sessionId
  if (!sessionId) {
    // #swagger.responses[400] = { description: 'Bad Request - Session ID required.' }
    sendErrorResponse(res, HTTP_BAD_REQUEST, 'Session ID is required.')
    return;
  }

  try {
    console.log(`[Controller] Termination requested for session: ${sessionId}`)

    // deleteSession now handles validation and "not found" cases internally
    await deleteSession(sessionId)

    // #swagger.responses[200] = { description: 'OK - Session terminated successfully (or was already inactive).' }
    // Idempotent: return success even if it wasn't running
    res.status(HTTP_OK).json({ success: true, message: 'Session terminated successfully.' })
  } catch (error: any) {
    // #swagger.responses[500] = { description: 'Internal Server Error during termination.' }
    console.error('[Controller:terminateSession] ERROR:', error);
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, error.message || 'An error occurred during session termination.');
  }
}

/**
 * Terminates all sessions considered inactive.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object (unused).
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 */
export const terminateInactiveSessions = async (_req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Terminate inactive sessions'
  // #swagger.description = 'Terminates all sessions that are not currently in a CONNECTED state.'
  try {
    console.log('[Controller] Terminating inactive sessions...')
    await flushSessions(true) // true = delete only inactive

    // #swagger.responses[200] = { description: 'OK - Inactive session flush completed.' }
    res.status(HTTP_OK).json({ success: true, message: 'Inactive session flush completed successfully.' })
  } catch (error: any) {
    // #swagger.responses[500] = { description: 'Internal Server Error during flush.' }
    console.error('[Controller:terminateInactiveSessions] ERROR:', error);
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, error.message || 'An error occurred while flushing inactive sessions.');
  }
}

/**
 * Terminates ALL sessions, regardless of state.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object (unused).
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 */
export const terminateAllSessions = async (_req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Terminate ALL sessions'
  // #swagger.description = 'Terminates every active or inactive session.'
  try {
    console.log('[Controller] Terminating ALL sessions...')
    await flushSessions(false) // false = delete all

    // #swagger.responses[200] = { description: 'OK - All sessions terminated.' }
    res.status(HTTP_OK).json({ success: true, message: 'All sessions terminated successfully.' })
  } catch (error: any) {
    // #swagger.responses[500] = { description: 'Internal Server Error during flush.' }
    console.error('[Controller:terminateAllSessions] ERROR:', error);
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, error.message || 'An error occurred while terminating all sessions.');
  }
}

/**
 * Gets summarized status for all active sessions in memory.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object (unused).
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 */
export const getAllSessions = async (_req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Get all active sessions'
  // #swagger.description = 'Returns a list summarizing the state of all sessions currently active in memory.'
  try {
    const sessionsList = []
    console.log(`[Controller] Getting status for all ${sessions.size} active sessions...`)

    // Use Promise.all for potentially faster state retrieval if needed,
    // but sequential might be fine for reasonable numbers of sessions.
    for (const [sessionId, client] of sessions.entries()) {
      let state = 'UNKNOWN'
      let qrStatus = 'UNAVAILABLE'
      let message = 'Fetching status...' // Default message

      try {
        if (!client) {
          state = 'ERROR'
          message = 'Client object not found in map!'
        } else if (client._initializing) {
          state = 'INITIALIZING'
          message = 'Session is initializing.'
          qrStatus = 'INITIALIZING'
        } else {
          // Attempt to get actual state only if not initializing
          try {
            state = await client.getState()
            if (!state) state = 'UNKNOWN' // Handle null/undefined return from getState
          } catch (stateErr: any) {
            console.warn(`[Controller:getAllSessions] Error getting state for ${sessionId}: ${stateErr.message}`);
            state = 'ERROR';
            message = `Error getting state: ${stateErr.message}`;
          }

          // Determine QR status based on state and client.qr
          if (client.qr) {
            qrStatus = 'READY_FOR_SCAN'
            message = 'QR code is available for scanning.'
            if (state !== 'CONNECTED') state = 'SCAN_QR_CODE' // Align state
          } else if (state === 'CONNECTED') {
            qrStatus = 'SCANNED_AUTHENTICATED'
            message = 'Session is connected.'
          } else if (state === 'ERROR') {
            // Keep state as ERROR, message already set
            qrStatus = 'ERROR'
          } else {
            // Other states (DISCONNECTED, STARTING, etc.) without QR
            qrStatus = 'UNAVAILABLE'
            message = `Session in ${state} state, QR not available.`
          }
        }
      } catch (clientError: any) {
        // Catch errors accessing client properties like _initializing
        console.error(`[Controller:getAllSessions] Error processing client ${sessionId}: ${clientError.message}`);
        state = 'ERROR';
        qrStatus = 'ERROR';
        message = `Internal error processing session: ${clientError.message}`;
      }

      sessionsList.push({
        sessionId: sessionId, // Use sessionId instead of id to match API documentation
        state,
        qrStatus,
        message // Add descriptive message
      })
    } // End for loop

    // #swagger.responses[200] = { description: 'List of all active sessions.', content: { "application/json": { schema: { ... } } } }
    res.status(HTTP_OK).json({ success: true, sessions: sessionsList })
  } catch (error: any) {
    // #swagger.responses[500] = { description: 'Internal Server Error.' }
    console.error('[Controller:getAllSessions] ERROR:', error);
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, error.message || 'An error occurred while retrieving session list.');
  }
}

/**
 * Get health status of all sessions
 * @async
 * @param {Object} _req - The HTTP request object (unused).
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 */
export const getSessionsHealth = async (_req: AuthenticatedRequest, res: TypedResponse): Promise<void> => {
  // #swagger.summary = 'Get sessions health status'
  // #swagger.description = 'Returns health status information for all active WhatsApp sessions, including failure counts and recovery status.'
  try {
    /*
      #swagger.responses[200] = {
        description: 'Session health status retrieved successfully',
        content: {
          "application/json": {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                data: {
                  type: 'object',
                  properties: {
                    totalSessions: { type: 'number', example: 3 },
                    healthySessions: { type: 'number', example: 2 },
                    unhealthySessions: { type: 'number', example: 1 },
                    sessionDetails: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          sessionId: { type: 'string', example: 'my-session' },
                          isHealthy: { type: 'boolean', example: true },
                          failureCount: { type: 'number', example: 0 },
                          state: { type: 'string', example: 'CONNECTED' },
                          message: { type: 'string', example: 'Session is ready' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      #swagger.responses[500] = {
        description: 'Internal Server Error',
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/ErrorResponse" }
          }
        }
      }
    */

    const healthStatus = await SessionHealthMonitor.getHealthStatus();
    res.json({ success: true, data: healthStatus });
  } catch (error: any) {
    sendErrorResponse(res, HTTP_INTERNAL_SERVER_ERROR, `Failed to get session health status: ${error.message}`);
  }
};

// All functions are already exported individually above
