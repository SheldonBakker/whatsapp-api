import { Client } from 'whatsapp-web.js'; // LocalAuth is handled within generateClientOptions
import fs from 'fs';
import path from 'path';
import { promisify } from 'util'; // Used for async fs operations
import { logger } from './utils/logger'; // Import logger
import {
  baseWebhookURL,
  sessionFolderPath
  // Other configs are used by sessionEventHandler.js, not directly here
} from './config';
import { triggerWebhook, waitForNestedObject } from './utils';
import { safeKillBrowser, generateClientOptions } from './utils/puppeteerManager'; // Import puppeteer utils
import { initializeEvents } from './utils/sessionEventHandler'; // Import event handler
import {
  ClientInstance,
  SessionValidationResult,
  SetupSessionResult
} from './types';

const sessions = new Map<string, ClientInstance>();

const readdirAsync = promisify(fs.readdir);
const rmAsync = promisify(fs.rm);
const mkdirAsync = promisify(fs.mkdir);
const statAsync = promisify(fs.stat);
const realpathAsync = promisify(fs.realpath);

// safeKillBrowser is now imported from puppeteerManager.js

// --- Function to validate if the session is ready ---
const validateSession = async (sessionId: string): Promise<SessionValidationResult> => {
  const logContext = { sessionId };
  const returnData: SessionValidationResult = { success: false, state: null, message: '' };
  const client = sessions.get(sessionId);

  // Session not tracked in memory 😢
  if (!client) {
    returnData.message = 'session_not_found_in_memory'; // More specific message
    return returnData;
  }

  // Check if client marked as destroyed internally
  if (client._destroyed) {
    returnData.message = 'session_destroyed';
    returnData.state = 'DESTROYED'; // Custom state
    return returnData;
  }

  try {
    // Early check: See if pupBrowser exists and is connected
    if (!client.pupBrowser || !client.pupBrowser.isConnected()) {
      logger.warn('Browser validation check: Not connected or pupBrowser missing.', logContext);
      try {
        const state = await client.getState();
        returnData.state = state;
        // If state is somehow CONNECTED despite browser issue, flag it
        returnData.message = state === 'CONNECTED' ? 'session_connected_but_browser_unresponsive' : `session_not_connected_state_${state}`;
        logger.warn(`Browser unresponsive/missing, but client state is ${state}`, logContext);
        return returnData;
      } catch (stateError: any) {
        logger.error(`Browser validation check: getState() failed after browser unresponsive/missing: ${stateError.message}`, { ...logContext, error: stateError });
        returnData.message = 'browser_unreachable_or_dead';
        returnData.state = 'ERROR'; // Indicate error state
        return returnData;
      }
    }

    // Wait for client.pupPage to exist (might not during early init)
    await waitForNestedObject(client, 'pupPage').catch((err: Error) => {
      logger.warn(`Validation check: pupPage unavailable: ${err.message}`, { ...logContext, error: err });
      returnData.success = false;
      returnData.state = null; // State unknown if page isn't there
      returnData.message = `pupPage_unavailable: ${err.message}`;
      // No return here, let the explicit check below handle it
    });
    // Explicit check if the above modification changed returnData
    if (!returnData.success && returnData.message.startsWith('pupPage_unavailable')) {
      return returnData; // Exit function if pupPage failed
    }

    // Check if page is closed *before* trying to evaluate
    if (!client.pupPage || client.pupPage.isClosed()) {
      logger.warn('Validation check: Browser tab (pupPage) is closed.', logContext);
      // Try getting state as a fallback, might be STARTING or OPENING
      try {
        returnData.state = await client.getState();
      } catch {
        returnData.state = 'ERROR';
      }
      returnData.message = 'browser_tab_closed';
      return returnData;
    }

    // Check if the page is usable with a timeout
    try {
      await Promise.race([
        client.pupPage.evaluate('1'), // Simple evaluation
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('page_evaluation_timeout')), 5000)) // 5 sec timeout
      ]);
    } catch (error: any) {
      logger.warn(`Validation check: Page evaluation failed: ${error.message}`, { ...logContext, error });
      returnData.message = 'page_unresponsive';
      try {
        // Still try getting state as a fallback
        returnData.state = await client.getState();
      } catch {
        returnData.state = 'ERROR'; // Mark state as ERROR if it also fails
      }
      return returnData;
    }

    // If page is responsive, get the definitive state
    const state = await client.getState();
    returnData.state = state;
    if (state !== 'CONNECTED') {
      logger.warn(`Validation check: Session state is ${state}`, logContext);
      returnData.message = 'session_not_connected';
      return returnData;
    }

    // Session Connected 🎉
    logger.info('Validation check: Session connected and responsive.', logContext);
    returnData.success = true;
    returnData.message = 'session_connected';
    return returnData;
  } catch (error: any) {
    logger.error(`Unexpected session validation error: ${error.message}`, { ...logContext, error });
    // Attempt to get state even on error, might give clues
    try {
      returnData.state = await client.getState();
    } catch {
      returnData.state = 'ERROR';
    }
    returnData.message = `validation_error: ${error.message}`;
    return returnData;
  }
};

// --- Function to handle client session restoration ---
const restoreSessions = async (): Promise<void> => { // Make async
  logger.info('Attempting to restore sessions from disk...');
  try {
    // Ensure session folder exists
    try {
      await statAsync(sessionFolderPath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        logger.info(`Session folder path "${sessionFolderPath}" not found. Creating...`);
        await mkdirAsync(sessionFolderPath, { recursive: true });
      } else {
        logger.error(`Error checking session folder path "${sessionFolderPath}": ${err.message}`, { error: err });
        throw err; // Re-throw other errors
      }
    }

    logger.info(`Reading session directory: ${sessionFolderPath}`);
    const files = await readdirAsync(sessionFolderPath);
    logger.info(`Found items in session directory: ${files.length}`, { items: files }); // Log count and potentially items if not too many

    let restoreCount = 0;
    let successCount = 0;
    const validSessionDirs = [];

    // First pass: validate session directories
    for (const file of files) {
      const match = file.match(/^session-(.+)$/);
      const fullPath = path.join(sessionFolderPath, file);

      // Ensure it's a directory before proceeding
      try {
        const stats = await statAsync(fullPath);
        if (match && stats.isDirectory()) {
          const sessionId = match[1];

          // Check if session data exists (look for Default folder which indicates valid WhatsApp session)
          const sessionDataPath = path.join(fullPath, 'Default');
          try {
            await statAsync(sessionDataPath);
            validSessionDirs.push(sessionId);
            logger.info('Found valid session data for restoration', { sessionId });
          } catch (dataErr: any) {
            if (dataErr.code === 'ENOENT') {
              logger.warn(`Session directory "${file}" exists but contains no valid data. Skipping.`, { sessionId });
            } else {
              logger.warn(`Error checking session data for "${file}": ${dataErr.message}`, { sessionId, error: dataErr });
            }
          }
        } else if (!stats.isDirectory()) {
          logger.warn(`Found non-directory item "${file}" in session directory. Skipping.`, { path: fullPath });
        }
      } catch (statErr: any) {
        logger.error(`Error accessing item "${file}" during restore: ${statErr.message}`, { path: fullPath, error: statErr });
      }
    }

    if (validSessionDirs.length === 0) {
      logger.info('No valid session directories found to restore.');
      return;
    }

    logger.info(`Found ${validSessionDirs.length} valid session directories. Starting restoration...`);

    // Second pass: restore valid sessions
    for (const sessionId of validSessionDirs) {
      const logContext = { sessionId };
      try {
        // Check if session is already in memory (shouldn't be on startup, but safety check)
        if (sessions.has(sessionId)) {
          logger.info('Session already exists in memory, skipping restoration', logContext);
          continue;
        }

        logger.info('Initiating session restoration', logContext);
        const result = setupSession(sessionId);

        if (result.success) {
          restoreCount++;
          logger.info('Session restoration initiated successfully', logContext);

          // Wait a moment and check if the session was actually added to memory
          await new Promise(resolve => setTimeout(resolve, 500));
          if (sessions.has(sessionId)) {
            successCount++;
            logger.info('Session successfully added to memory', logContext);
          } else {
            logger.warn('Session setup succeeded but not found in memory', logContext);
          }
        } else {
          logger.warn(`Session restoration failed: ${result.message}`, logContext);
        }
      } catch (restoreErr: any) {
        logger.error(`Error restoring session: ${restoreErr.message}`, { ...logContext, error: restoreErr });
      }
    }

    logger.info(`Session restore process completed. Initiated: ${restoreCount}, Successfully added to memory: ${successCount} out of ${validSessionDirs.length} valid sessions found.`);

    // Log current active sessions
    logger.info(`Active sessions in memory: ${sessions.size}`);
    if (sessions.size > 0) {
      const activeSessionIds = Array.from(sessions.keys());
      logger.info(`Active session IDs: ${activeSessionIds.join(', ')}`);
    }
  } catch (error: any) {
    logger.error(`Failed to restore sessions: ${error.message}`, { error });
    // Depending on severity, might want to exit or notify admin
  }
};

// --- Setup Session ---
const setupSession = (sessionId: string): SetupSessionResult => {
  const logContext = { sessionId };
  try {
    if (sessions.has(sessionId)) {
      logger.warn('Attempted to set up existing session. Returning existing client.', logContext);
      return { success: false, message: `Session already exists for: ${sessionId}` };
    }
    logger.info('Initiating session setup', logContext);

    const sessionDir = path.join(sessionFolderPath, `session-${sessionId}`);
    try {
      // Ensure directory exists synchronously during setup if not using async file ops everywhere
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
        logger.info(`Created session directory: ${sessionDir}`, logContext);
      }
    } catch (mkdirErr: any) {
      logger.error(`Failed to create session directory ${sessionDir}: ${mkdirErr.message}`, { ...logContext, error: mkdirErr });
      return { success: false, message: `Failed to create session directory: ${mkdirErr.message}` };
    }

    // Generate client options using the dedicated manager
    const clientOptions = generateClientOptions(sessionId, sessionFolderPath);

    const client = new Client(clientOptions) as ClientInstance;

    // Track initialization status to prevent race conditions on errors/restarts
    client._initializing = true;
    client._destroyed = false; // Explicitly set destroyed flag

    // Initialization with Retry Logic
    const initializeWithRetry = async (maxRetries: number = 3, delay: number = 10000): Promise<void> => { // Increased delay
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const attemptLogContext = { ...logContext, attempt, maxRetries };
        // Ensure client hasn't been destroyed externally (e.g., by deleteSession)
        if (client._destroyed) {
          logger.warn('Initialization cancelled, client already destroyed.', attemptLogContext);
          return;
        }
        logger.info(`Initializing session (Attempt ${attempt}/${maxRetries})...`, attemptLogContext);
        try {
          // Pass dependencies to initializeEvents
          initializeEvents(client, sessionId, { sessions, setupSession, deleteSession, safeKillBrowser });
          await client.initialize();
          logger.info('Session initialized successfully via WWebJS.', attemptLogContext);
          client._initializing = false; // Mark as done
          return; // Success
        } catch (err: any) {
          logger.error(`Initialization attempt ${attempt}/${maxRetries} failed: ${err.message}`, { ...attemptLogContext, error: err });

          // Check for common fatal errors
          if (err.message.includes('Target closed') || err.message.includes('Protocol error') || err.message.includes('Navigation failed because browser has disconnected')) {
            logger.error('Potentially unrecoverable browser error detected. Cleaning up browser.', attemptLogContext);
            await safeKillBrowser(client); // Clean up the likely dead browser process
            break; // Exit retry loop for this type of error
          } else if (err.message.includes('Timeout')) {
            logger.warn('Initialization timed out. Retrying might help.', attemptLogContext);
          }
          // Other errors already logged above

          if (attempt < maxRetries) {
            logger.info(`Retrying initialization in ${delay / 1000} seconds...`, attemptLogContext);
            await new Promise(resolve => setTimeout(resolve, delay));
            logger.info('Cleaning up browser before retry...', attemptLogContext);
            await safeKillBrowser(client); // Ensure old process is gone before retrying
          } else {
            logger.error(`Failed to initialize session after ${maxRetries} attempts.`, attemptLogContext);
            client._initializing = false; // Mark as done (failed)
            await handleInitializationFailure(sessionId, client);
            return; // Stop the process for this session
          }
        }
      }
      // If loop finishes due to break (fatal browser error)
      if (client._initializing) { // Check if we didn't succeed or fail explicitly
        logger.error(`Initialization failed due to unrecoverable browser error after ${maxRetries} attempts.`, logContext);
        client._initializing = false;
        await handleInitializationFailure(sessionId, client);
      }
    };

    // Start initialization asynchronously
    initializeWithRetry().catch((err: Error) => {
      // This catch is unlikely to be hit if initializeWithRetry handles its errors
      logger.error(`Uncaught error during async initialization: ${err.message}`, { ...logContext, error: err });
      handleInitializationFailure(sessionId, client); // Ensure cleanup even here
    });

    // Store the client immediately (even before initialized) to allow tracking/deletion
    sessions.set(sessionId, client);
    logger.info('Session added to active sessions map. Initialization running in background.', logContext);

    return { success: true, message: 'Session initialization started' };
  } catch (error: any) {
    logger.error(`Failed to create Client instance: ${error.message}`, { sessionId, error }); // Add sessionId here too
    return { success: false, message: `Critical setup error: ${error.message}` };
  }
};

// --- Helper for Handling Initialization Failure ---
const handleInitializationFailure = async (sessionId: string, client: ClientInstance): Promise<void> => {
  const logContext = { sessionId };
  logger.error('Handling fatal initialization failure.', logContext);
  if (client && !client._destroyed) {
    await safeKillBrowser(client); // Ensure browser is killed
    client._destroyed = true; // Mark as destroyed
  }
  sessions.delete(sessionId); // Remove from active sessions
  logger.info('Session removed from active map due to initialization failure.', logContext);
  // Trigger a webhook to alert about the failure
  triggerWebhook(baseWebhookURL, sessionId, 'status', { status: 'INITIALIZATION_FAILED' });

  // Optionally, attempt to clean the session folder IF corrupted data is suspected
  // logger.warn('Consider manually deleting session folder if issues persist.', logContext)
  // await deleteSessionFolder(sessionId).catch(e => logger.error(`Error deleting session folder during cleanup: ${e.message}`, { ...logContext, error: e }))
};

// initializeEvents and handleUnexpectedClosure are now imported from sessionEventHandler.js

// --- Function to delete client session folder ---
const deleteSessionFolder = async (sessionId: string): Promise<void> => {
  const logContext = { sessionId };
  const targetDirPath = path.join(sessionFolderPath, `session-${sessionId}`);
  logger.info(`Attempting to delete session folder: ${targetDirPath}`, logContext);
  try {
    // Basic path check (relative paths)
    if (targetDirPath.includes('..')) {
      throw new Error('Invalid path: Directory traversal detected.');
    }
    // Use realpath for symlink resolution and better validation
    const resolvedTargetDirPath = await realpathAsync(targetDirPath).catch((err: any) => {
      if (err.code === 'ENOENT') return null; // Folder doesn't exist, nothing to delete
      throw err; // Other error during realpath
    });

    // Ensure resolvedSessionPath calculation happens only if target exists or no error
    let resolvedSessionPath: string | undefined;
    if (resolvedTargetDirPath !== undefined) { // Check if realpath didn't throw ENOENT or other critical error
      try {
        resolvedSessionPath = await realpathAsync(sessionFolderPath);
      } catch (sessionPathErr: any) {
        logger.error(`Failed to resolve session root path "${sessionFolderPath}": ${sessionPathErr.message}`, { ...logContext, error: sessionPathErr });
        throw sessionPathErr; // Cannot proceed without valid root path
      }
    }

    if (!resolvedTargetDirPath) {
      logger.info(`Session folder "${targetDirPath}" does not exist. Skipping deletion.`, logContext);
      return;
    }

    // Final safety check: ensure target is within the main session folder
    if (!resolvedTargetDirPath.startsWith(resolvedSessionPath! + path.sep)) {
      throw new Error(`Invalid path: Resolved path "${resolvedTargetDirPath}" is outside session root "${resolvedSessionPath}".`);
    }

    logger.info(`Deleting directory: ${resolvedTargetDirPath}`, logContext);
    await rmAsync(resolvedTargetDirPath, { recursive: true, force: true, maxRetries: 3 }); // Added retries
    logger.info(`Successfully deleted directory: ${resolvedTargetDirPath}`, logContext);
  } catch (error: any) {
    logger.error(`Failed to delete session folder "${targetDirPath}": ${error.message}`, { ...logContext, path: targetDirPath, error });
    throw error; // Rethrow to indicate failure upstream if necessary
  }
};

// --- Function to reload client session (re-init without deleting folder) ---
const reloadSession = async (sessionId: string): Promise<void> => {
  const logContext = { sessionId };
  logger.info('Reload requested', logContext);
  const client = sessions.get(sessionId);

  if (!client) {
    logger.error('Cannot reload session: Not found in active sessions.', logContext);
    throw new Error(`Session ${sessionId} not found.`);
  }

  // Prevent reload if already destroying/initializing
  if (client._destroyed || client._initializing) {
    logger.warn(`Reload cancelled: Client state is (Destroyed: ${client._destroyed}, Initializing: ${client._initializing})`, logContext);
    return;
  }

  client._destroyed = true; // Mark as destroyed to prevent event handlers from interfering

  sessions.delete(sessionId); // Remove from active sessions *before* killing browser
  logger.info('Session removed from active map for reload.', logContext);

  try {
    logger.info('Shutting down existing browser...', logContext);
    await safeKillBrowser(client); // Use robust kill util

    logger.info('Restarting session...', logContext);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2s grace
    setupSession(sessionId); // Re-initialize
    logger.info('Session re-initialization process started.', logContext);
  } catch (error: any) {
    logger.error(`Failed during reload: ${error.message}`, { ...logContext, error });
    // Optionally try deleting folder if reload fails badly?
    // await deleteSessionFolder(sessionId).catch(e => logger.error(`Error deleting folder after failed reload: ${e.message}`, { ...logContext, error: e }))
    throw error; // Rethrow to signal failure
  }
};

// --- Function to delete session (logout/destroy + remove folder) ---
const deleteSession = async (sessionId: string, preserveData: boolean = false): Promise<void> => {
  const logContext = { sessionId, preserveData };
  logger.info('Deletion requested', logContext);
  const client = sessions.get(sessionId);
  const validation = await validateSession(sessionId); // Validate before proceeding

  if (!client && validation.message === 'session_not_found_in_memory') {
    if (preserveData) {
      logger.info('Session not found in memory. Preserving folder as requested.', logContext);
      return; // Skip folder deletion when preserveData is true
    }

    logger.info('Session not found in memory. Attempting folder deletion.', logContext);
    try {
      await deleteSessionFolder(sessionId);
    } catch (folderErr: any) {
      logger.error(`Error deleting folder for inactive session: ${folderErr.message}`, { ...logContext, error: folderErr });
    }
    return; // Session wasn't active, folder cleanup attempted
  }

  if (!client) {
    logger.error(`Cannot delete session: Not found (State: ${validation.message}).`, { ...logContext, validation });
    return; // Cannot proceed without client object
  }

  // Prevent double deletion / race conditions
  if (client._destroyed) {
    logger.warn('Session already marked as destroyed. Skipping client operations.', logContext);
    sessions.delete(sessionId); // Ensure removal from map
    await safeKillBrowser(client); // Attempt kill just in case

    if (!preserveData) {
      await deleteSessionFolder(sessionId).catch((e: any) => logger.error(`Error deleting folder for already-destroyed session: ${e.message}`, { ...logContext, error: e }));
    } else {
      logger.info('Preserving session data folder as requested.', logContext);
    }
    return;
  }

  client._destroyed = true; // Mark as destroyed immediately

  sessions.delete(sessionId); // Remove from active sessions map *early*
  logger.info('Session removed from active map for deletion.', logContext);

  try {
    let shutdownMethod = 'none';
    // Decide how to shut down the client based on validation state
    if (validation.success && validation.state === 'CONNECTED') {
      shutdownMethod = 'logout';
      logger.info('Attempting logout for connected session...', logContext);
      try {
        await Promise.race([
          client.logout(),
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Logout timeout')), 15000)) // 15s timeout
        ]);
        logger.info('Logout successful.', logContext);
      } catch (logoutErr: any) {
        logger.warn(`Logout failed or timed out: ${logoutErr.message}. Proceeding to destroy/kill.`, { ...logContext, error: logoutErr });
        shutdownMethod = 'destroy_after_logout_fail';
      }
    }

    // If not logged out successfully, or wasn't connected, use destroy/kill
    if (shutdownMethod !== 'logout') {
      if (validation.state && validation.state !== 'CONNECTED') {
        shutdownMethod = 'destroy (not connected)';
        logger.info(`Session state is ${validation.state}. Attempting destroy...`, logContext);
      } else if (shutdownMethod === 'destroy_after_logout_fail') {
        logger.info('Attempting destroy after failed logout...', logContext);
      } else {
        shutdownMethod = 'destroy (unknown state)';
        logger.info(`Session in uncertain state (${validation.message}). Attempting destroy...`, logContext);
      }

      try {
        if (client.pupBrowser) { // Check if browser instance exists
          await client.destroy();
          logger.info('Client destroy successful.', logContext);
        } else {
          logger.info('No browser instance found on client. Skipping destroy, attempting kill.', logContext);
        }
      } catch (destroyErr: any) {
        logger.warn(`Client destroy failed: ${destroyErr.message}. Attempting force kill.`, { ...logContext, error: destroyErr });
      }
    }

    // Ensure the browser process is terminated
    logger.info('Ensuring browser process is terminated...', logContext);
    await safeKillBrowser(client);

    // Delete the session folder only if not preserving data
    if (!preserveData) {
      logger.info('Deleting session data folder...', logContext);
      await deleteSessionFolder(sessionId);
      logger.info('Session terminated and data cleaned successfully.', logContext);
    } else {
      logger.info('Session terminated. Session data preserved as requested.', logContext);
    }
  } catch (error: any) {
    logger.error(`Error during termination/cleanup: ${error.message}`, { ...logContext, error });
    await safeKillBrowser(client); // Ensure browser kill is attempted
    throw error; // Rethrow to indicate deletion failed
  } finally {
    // Final check to ensure it's removed from the map
    if (sessions.has(sessionId)) {
      logger.warn('Session was still in map after deletion process. Removing forcefully.', logContext);
      sessions.delete(sessionId);
    }
  }
};

// --- Function to handle session flush ---
const flushSessions = async (deleteOnlyInactive: boolean, preserveData: boolean = false): Promise<void> => {
  logger.info(`Starting flush process. Delete only inactive: ${deleteOnlyInactive}, Preserve data: ${preserveData}`);
  try {
    // Get session IDs from the folder structure first
    const sessionFolders = new Set<string>();
    try {
      const files = await readdirAsync(sessionFolderPath);
      for (const file of files) {
        const match = file.match(/^session-(.+)$/);
        const fullPath = path.join(sessionFolderPath, file);
        try {
          const stats = await statAsync(fullPath);
          if (match && stats.isDirectory()) {
            sessionFolders.add(match[1]);
          }
        } catch (statErr: any) {
          if (statErr.code !== 'ENOENT') {
            logger.warn(`Error stating file during flush scan: ${statErr.message}`, { file, error: statErr });
          }
        }
      }
    } catch (readErr: any) {
      if (readErr.code === 'ENOENT') {
        logger.info('Session folder does not exist. Nothing to flush.');
        return;
      }
      logger.error(`Error reading session directory during flush: ${readErr.message}`, { error: readErr });
      throw readErr; // Rethrow other directory read errors
    }

    // Also consider sessions currently in the memory map
    const activeSessionIds = new Set(sessions.keys());
    const allSessionIds = new Set([...sessionFolders, ...activeSessionIds]);

    logger.info(`Found ${sessionFolders.size} session folders and ${activeSessionIds.size} active sessions. Total unique IDs: ${allSessionIds.size}`);

    let deletedCount = 0;
    for (const sessionId of allSessionIds) {
      const logContext = { sessionId, preserveData };
      logger.info('Processing session ID for flush', logContext);
      const validation = await validateSession(sessionId); // Check current state

      let shouldDelete = false;
      if (!deleteOnlyInactive) {
        shouldDelete = true;
        logger.info(`${preserveData ? 'Closing' : 'Deleting'} session (flush all).`, logContext);
      } else if (!validation.success || validation.state !== 'CONNECTED') {
        shouldDelete = true;
        logger.info(`${preserveData ? 'Closing' : 'Deleting'} inactive session (State: ${validation.state || 'Unknown'}, Success: ${validation.success}).`, { ...logContext, validation });
      } else {
        logger.info('Skipping active session.', logContext);
      }

      if (shouldDelete) {
        try {
          await deleteSession(sessionId, preserveData); // Pass preserveData flag to deleteSession
          deletedCount++;
        } catch (deleteErr: any) {
          logger.error(`Failed to ${preserveData ? 'close' : 'delete'} session during flush: ${deleteErr.message}`, { ...logContext, error: deleteErr });
        }
      }
    }
    logger.info(`Flush process completed. ${preserveData ? 'Closed' : 'Deleted'} ${deletedCount} sessions.`);
  } catch (error: any) {
    logger.error(`An error occurred during the flush process: ${error.message}`, { error });
    throw error; // Rethrow to indicate failure
  }
};

// --- Module Exports ---
export {
  sessions,
  setupSession,
  restoreSessions,
  validateSession,
  deleteSession,
  reloadSession,
  flushSessions
  // safeKillBrowser is intentionally not exported from here anymore
};
