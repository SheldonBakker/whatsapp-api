import { logger } from './logger';
import { baseWebhookURL, maxAttachmentSize, setMessagesAsSeen, recoverSessions } from '../config';
import { triggerWebhook, checkIfEventisEnabled } from '../utils';
import { ClientInstance } from '../types';

// Note: This module will need access to sessions map, setupSession, deleteSession, safeKillBrowser
// We will pass these in when calling initializeEvents

interface EventDependencies {
  sessions: Map<string, ClientInstance>;
  setupSession: (sessionId: string) => any;
  deleteSession: (sessionId: string, preserveData?: boolean) => Promise<void>;
  safeKillBrowser: (client: ClientInstance) => Promise<void>;
}

// --- Initialize Client Events ---
export const initializeEvents = (client: ClientInstance, sessionId: string, dependencies: EventDependencies): void => {
  const { sessions, setupSession, deleteSession, safeKillBrowser } = dependencies;
  const logContext = { sessionId };
  logger.info('Initializing event listeners', logContext);
  const sessionWebhook = process.env[sessionId.toUpperCase() + '_WEBHOOK_URL'] || baseWebhookURL;

  // Flag to prevent multiple restart attempts in quick succession
  let restartInProgress = false;

  // Handle unexpected browser/page closure more robustly
  const handleUnexpectedClosure = async (type: string, error: Error | null = null): Promise<void> => {
    const closureLogContext = { ...logContext, closureType: type };
    if (restartInProgress || client._initializing || client._destroyed) {
      logger.info(`Closure (${type}) ignored (Already handling: ${restartInProgress}, Initializing: ${client._initializing}, Destroyed: ${client._destroyed})`, closureLogContext);
      return;
    }
    restartInProgress = true;
    logger.warn(`Browser ${type} detected. Error: ${error?.message || 'N/A'}`, { ...closureLogContext, error });
    triggerWebhook(sessionWebhook, sessionId, 'status', { status: 'DISCONNECTED', reason: `Browser ${type}` });

    if (recoverSessions) {
      logger.info('Attempting to recover session...', closureLogContext);
      sessions.delete(sessionId); // Remove from sessions map BEFORE attempting destroy/setup

      try {
        logger.info('Destroying old client instance before restart...', closureLogContext);
        if (client.pupBrowser && client.pupBrowser.isConnected()) {
          await client.destroy(); // Use destroy which includes browser close attempt
        } else {
          logger.info('Browser not connected, attempting safe kill instead of destroy.', closureLogContext);
          await safeKillBrowser(client);
        }
        client._destroyed = true; // Mark manually if destroy fails or wasn't called
      } catch (destroyErr: any) {
        logger.error(`Error destroying client during recovery: ${destroyErr.message}. Attempting hard kill.`, { ...closureLogContext, error: destroyErr });
        await safeKillBrowser(client); // Ensure kill on error
        client._destroyed = true;
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds grace period

      logger.info('Re-initializing session after closure.', closureLogContext);
      setupSession(sessionId); // Re-run setup (assuming setupSession is available in scope)
      setTimeout(() => { restartInProgress = false; }, 1000); // Reset flag after setup is *initiated*
    } else {
      logger.info('Session recovery disabled. Removing session permanently.', closureLogContext);
      try {
        await deleteSession(sessionId); // Use the full deleteSession function (assuming it's available)
        logger.info('Session successfully deleted after unexpected closure.', closureLogContext);
      } catch (delErr: any) {
        logger.error(`Error deleting session after unexpected closure: ${delErr.message}`, { ...closureLogContext, error: delErr });
        // Fallback cleanup if deleteSession fails
        await safeKillBrowser(client);
        client._destroyed = true;
        sessions.delete(sessionId); // Ensure removal
      }
      restartInProgress = false; // Reset flag
    }
  };

  // Listen on the browser instance itself if possible
  const addDisconnectedListener = (): void => {
    if (client.pupBrowser && !client.pupBrowser.listenerCount('disconnected')) {
      client.pupBrowser.once('disconnected', () => handleUnexpectedClosure('disconnected'));
    }
  };

  if (client.pupBrowser) {
    addDisconnectedListener();
  }

  // Listen for page crash/close events as secondary checks
  client.once('ready', () => { // Attach page listeners only when page is somewhat ready
    if (client.pupPage) {
      // Check if browser listener already exists
      if (!client.pupBrowser || !client.pupBrowser.listenerCount('disconnected')) {
        client.pupPage.once('close', () => handleUnexpectedClosure('page closed'));
        client.pupPage.once('error', (err: Error) => handleUnexpectedClosure('page error', err));
        client.pupPage.once('crash', () => handleUnexpectedClosure('page crashed'));
      }
      // Ensure browser disconnect listener is attached if possible now
      addDisconnectedListener();
    } else {
      logger.warn('Client ready, but pupPage not available to attach close/error listeners.', logContext);
      addDisconnectedListener(); // Attempt to attach browser listener again
    }
  });

  // --- Standard WWebJS Event Listeners ---
  // (Wrap in checkIfEventisEnabled for efficiency)

  checkIfEventisEnabled('auth_failure').then((enabled: boolean) => {
    if (enabled) {
      client.on('auth_failure', (msg: string) => {
        logger.error(`Authentication failure: ${msg}`, logContext);
        triggerWebhook(sessionWebhook, sessionId, 'status', { status: 'AUTH_FAILURE', message: msg });
      });
    }
  });

  checkIfEventisEnabled('authenticated').then((enabled: boolean) => {
    if (enabled) {
      client.on('authenticated', () => {
        logger.info('Client authenticated successfully.', logContext);
        triggerWebhook(sessionWebhook, sessionId, 'authenticated', {});
      });
    }
  });

  checkIfEventisEnabled('change_state').then((enabled: boolean) => {
    if (enabled) {
      client.on('change_state', (state: string) => {
        logger.info(`Client state changed: ${state}`, { ...logContext, state });
        triggerWebhook(sessionWebhook, sessionId, 'change_state', { state });
      });
    }
  });

  checkIfEventisEnabled('disconnected').then((enabled: boolean) => {
    if (enabled) {
      client.on('disconnected', async (reason: string) => {
        const disconnectLogContext = { ...logContext, reason };
        logger.info('Client disconnected event received.', disconnectLogContext);
        // Avoid triggering recovery if it was an intentional logout/destroy
        if (reason === 'NAVIGATION' || reason === 'LOGOUT') {
          logger.info('Disconnect reason likely intentional, not triggering recovery.', disconnectLogContext);
          if (!client._destroyed) {
            logger.warn(`Client disconnected (${reason}) but not marked destroyed. Forcing cleanup.`, disconnectLogContext);
            client._destroyed = true;
            sessions.delete(sessionId);
            await safeKillBrowser(client); // Ensure browser is gone
          }
          return;
        }

        triggerWebhook(sessionWebhook, sessionId, 'disconnected', { reason });

        if (!recoverSessions) {
          logger.info('Session recovery disabled. Deleting session after termination.', disconnectLogContext);
          try {
            await deleteSession(sessionId);
            logger.info('Session successfully deleted after termination.', disconnectLogContext);
          } catch (error: any) {
            logger.error(`Error deleting session after termination: ${error.message}`, { ...disconnectLogContext, error });
          }
        } else {
          // Recovery for unexpected disconnects is handled by handleUnexpectedClosure
          logger.warn(`Client disconnected unexpectedly (Reason: ${reason}). Recovery should be handled by browser/page event listeners.`, disconnectLogContext);
        }
      });
    }
  });

  // QR Code Handling
  client.on('qr', (qr: string) => {
    logger.info('QR code received', logContext);
    client.qr = qr; // Store QR on client instance for potential retrieval
    checkIfEventisEnabled('qr').then((enabled: boolean) => {
      if (enabled) triggerWebhook(sessionWebhook, sessionId, 'qr', { qr });
    });
  });

  checkIfEventisEnabled('ready').then((enabled: boolean) => {
    if (enabled) {
      client.on('ready', () => {
        logger.info('Client is ready!', logContext);
        client._initializing = false; // Ensure init flag is false on ready
        triggerWebhook(sessionWebhook, sessionId, 'ready', {});
      });
    }
  });

  // Message Related Events
  checkIfEventisEnabled('message').then((enabled: boolean) => {
    if (enabled) {
      client.on('message', async (message: any) => {
        triggerWebhook(sessionWebhook, sessionId, 'message', { message });
        // Media download logic
        if (message.hasMedia && message._data?.size < maxAttachmentSize) {
          checkIfEventisEnabled('media').then((mediaEnabled: boolean) => {
            if (!mediaEnabled) return;
            message.downloadMedia()
              .then((messageMedia: any) => triggerWebhook(sessionWebhook, sessionId, 'media', { messageMedia, message }))
              .catch((e: any) => logger.error(`Media download error: ${e.message}`, { ...logContext, messageId: message.id?._serialized, error: e }));
          });
        }
        if (setMessagesAsSeen) {
          try {
            const chat = await message.getChat();
            await chat.sendSeen();
          } catch (seenErr: any) {
            logger.warn(`Failed to send seen for message ${message.id?._serialized || 'unknown'}: ${seenErr.message}`, { ...logContext, messageId: message.id?._serialized, error: seenErr });
          }
        }
      });
    }
  });

  checkIfEventisEnabled('message_ack').then((enabled: boolean) => {
    if (enabled) client.on('message_ack', (message: any, ack: any) => triggerWebhook(sessionWebhook, sessionId, 'message_ack', { message, ack }));
  });

  checkIfEventisEnabled('message_create').then((enabled: boolean) => {
    if (enabled) client.on('message_create', (message: any) => triggerWebhook(sessionWebhook, sessionId, 'message_create', { message }));
  });

  // Other Events
  checkIfEventisEnabled('call').then((e: boolean) => e && client.on('call', async (call: any) => triggerWebhook(sessionWebhook, sessionId, 'call', { call })));
  checkIfEventisEnabled('group_join').then((e: boolean) => e && client.on('group_join', (n: any) => triggerWebhook(sessionWebhook, sessionId, 'group_join', { notification: n })));
  checkIfEventisEnabled('group_leave').then((e: boolean) => e && client.on('group_leave', (n: any) => triggerWebhook(sessionWebhook, sessionId, 'group_leave', { notification: n })));
  checkIfEventisEnabled('group_update').then((e: boolean) => e && client.on('group_update', (n: any) => triggerWebhook(sessionWebhook, sessionId, 'group_update', { notification: n })));
  checkIfEventisEnabled('loading_screen').then((e: boolean) => e && client.on('loading_screen', (p: any, m: any) => triggerWebhook(sessionWebhook, sessionId, 'loading_screen', { percent: p, message: m })));
  checkIfEventisEnabled('media_uploaded').then((e: boolean) => e && client.on('media_uploaded', (msg: any) => triggerWebhook(sessionWebhook, sessionId, 'media_uploaded', { message: msg })));
  checkIfEventisEnabled('message_reaction').then((e: boolean) => e && client.on('message_reaction', (r: any) => triggerWebhook(sessionWebhook, sessionId, 'message_reaction', { reaction: r })));
  checkIfEventisEnabled('message_edit').then((e: boolean) => e && client.on('message_edit', (msg: any, n: any, p: any) => triggerWebhook(sessionWebhook, sessionId, 'message_edit', { message: msg, newBody: n, prevBody: p })));
  checkIfEventisEnabled('message_revoke_everyone').then((e: boolean) => e && client.on('message_revoke_everyone', (msg: any) => triggerWebhook(sessionWebhook, sessionId, 'message_revoke_everyone', { message: msg })));
  checkIfEventisEnabled('message_revoke_me').then((e: boolean) => e && client.on('message_revoke_me', (msg: any) => triggerWebhook(sessionWebhook, sessionId, 'message_revoke_me', { message: msg })));
  checkIfEventisEnabled('contact_changed').then((e: boolean) => e && client.on('contact_changed', (m: any, o: any, n: any, i: any) => triggerWebhook(sessionWebhook, sessionId, 'contact_changed', { message: m, oldId: o, newId: n, isContact: i })));
  checkIfEventisEnabled('chat_removed').then((e: boolean) => e && client.on('chat_removed', (c: any) => triggerWebhook(sessionWebhook, sessionId, 'chat_removed', { chat: c })));
  checkIfEventisEnabled('chat_archived').then((e: boolean) => e && client.on('chat_archived', (c: any, cs: any, ps: any) => triggerWebhook(sessionWebhook, sessionId, 'chat_archived', { chat: c, currState: cs, prevState: ps })));
  checkIfEventisEnabled('unread_count').then((e: boolean) => e && client.on('unread_count', (c: any) => triggerWebhook(sessionWebhook, sessionId, 'unread_count', { chat: c })));
};
