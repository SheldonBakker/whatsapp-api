import { logger } from './logger';
import { validateSession, setupSession, sessions } from '../sessions';
import { safeKillBrowser } from './puppeteerManager';

/**
 * Enhanced session recovery utility to handle browser failures
 */
export class SessionRecovery {
  private static readonly MAX_RECOVERY_ATTEMPTS = 3;
  private static readonly RECOVERY_DELAY = process.env.NODE_ENV === 'production' ? 10000 : 5000; // 10s in production, 5s in dev
  private static recoveryAttempts = new Map<string, number>();

  /**
   * Attempts to recover a session that has browser issues
   */
  static async recoverSession(sessionId: string): Promise<{
    success: boolean;
    message: string;
    action: string;
  }> {
    const logContext = { sessionId };
    const attempts = this.recoveryAttempts.get(sessionId) || 0;

    if (attempts >= this.MAX_RECOVERY_ATTEMPTS) {
      logger.error(`Max recovery attempts (${this.MAX_RECOVERY_ATTEMPTS}) reached for session`, logContext);
      this.recoveryAttempts.delete(sessionId);
      return {
        success: false,
        message: 'Max recovery attempts reached. Manual intervention required.',
        action: 'manual_intervention_required'
      };
    }

    this.recoveryAttempts.set(sessionId, attempts + 1);
    logger.info(`Starting recovery attempt ${attempts + 1}/${this.MAX_RECOVERY_ATTEMPTS}`, logContext);

    try {
      const client = sessions.get(sessionId);
      
      if (!client) {
        logger.info('Session not found in memory, attempting fresh setup', logContext);
        const setupResult = setupSession(sessionId);
        this.recoveryAttempts.delete(sessionId);
        return {
          success: setupResult.success,
          message: setupResult.message || 'Setup completed',
          action: 'fresh_setup'
        };
      }

      // Step 1: Force kill any existing browser processes
      logger.info('Killing existing browser processes', logContext);
      await safeKillBrowser(client);
      
      // Step 2: Mark client as destroyed and remove from sessions
      client._destroyed = true;
      sessions.delete(sessionId);
      
      // Step 3: Wait before attempting recovery
      logger.info(`Waiting ${this.RECOVERY_DELAY}ms before recovery`, logContext);
      await new Promise(resolve => setTimeout(resolve, this.RECOVERY_DELAY));
      
      // Step 4: Setup new session
      logger.info('Setting up new session after recovery', logContext);
      const setupResult = setupSession(sessionId);
      
      if (setupResult.success) {
        this.recoveryAttempts.delete(sessionId);
        logger.info('Session recovery successful', logContext);
        return {
          success: true,
          message: 'Session recovered successfully',
          action: 'recovered'
        };
      } else {
        logger.warn('Session setup failed during recovery', { ...logContext, setupResult });
        return {
          success: false,
          message: setupResult.message || 'Setup failed',
          action: 'setup_failed'
        };
      }
      
    } catch (error: any) {
      logger.error(`Recovery attempt failed: ${error.message}`, { ...logContext, error, attempt: attempts + 1 });
      return {
        success: false,
        message: `Recovery failed: ${error.message}`,
        action: 'recovery_failed'
      };
    }
  }

  /**
   * Checks if a session needs recovery based on validation result
   */
  static needsRecovery(validationResult: any): boolean {
    const recoveryTriggers = [
      'browser_unreachable_or_dead',
      'browser_tab_closed',
      'page_unresponsive',
      'session_destroyed',
      'pupPage_unavailable',
      'session_connected_but_browser_unresponsive'
    ];

    // Also check for Docker/container-specific errors
    if (validationResult.message && typeof validationResult.message === 'string') {
      const dockerErrors = [
        'Protocol error',
        'Target closed',
        'Session closed',
        'Navigation failed because browser has disconnected',
        'spawn /usr/bin/chromium-browser ENOENT',
        'Failed to launch the browser process'
      ];

      for (const error of dockerErrors) {
        if (validationResult.message.includes(error)) {
          return true;
        }
      }
    }

    return recoveryTriggers.includes(validationResult.message);
  }

  /**
   * Enhanced session status check with automatic recovery
   */
  static async getSessionStatusWithRecovery(sessionId: string): Promise<{
    success: boolean;
    message: string;
    state: string;
    qrStatus: string;
    qr?: string;
    recoveryAttempted?: boolean;
    recoveryResult?: any;
  }> {
    const logContext = { sessionId };
    
    try {
      // First, try normal validation
      const validation = await validateSession(sessionId);
      
      // Check if recovery is needed
      if (!validation.success && this.needsRecovery(validation)) {
        logger.warn('Session needs recovery, attempting automatic recovery', { ...logContext, validation });
        
        const recoveryResult = await this.recoverSession(sessionId);
        
        if (recoveryResult.success) {
          // Wait a bit for the new session to initialize
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Re-validate after recovery
          const newValidation = await validateSession(sessionId);
          const client = sessions.get(sessionId);
          
          let qrStatus = 'UNAVAILABLE';
          if (client) {
            if (client._initializing) {
              qrStatus = 'INITIALIZING';
            } else if (client.qr) {
              qrStatus = 'READY_FOR_SCAN';
            } else if (newValidation.state === 'CONNECTED') {
              qrStatus = 'SCANNED_AUTHENTICATED';
            }
          }
          
          return {
            success: true,
            message: newValidation.message || 'Session recovered and initializing',
            state: newValidation.state || 'INITIALIZING',
            qrStatus,
            ...(client?.qr && { qr: client.qr }),
            recoveryAttempted: true,
            recoveryResult
          };
        } else {
          return {
            success: false,
            message: recoveryResult.message,
            state: 'ERROR',
            qrStatus: 'ERROR',
            recoveryAttempted: true,
            recoveryResult
          };
        }
      }
      
      // Normal validation successful or no recovery needed
      const client = sessions.get(sessionId);
      let qrStatus = 'UNAVAILABLE';
      
      if (client) {
        if (client._initializing) {
          qrStatus = 'INITIALIZING';
        } else if (client.qr) {
          qrStatus = 'READY_FOR_SCAN';
        } else if (validation.state === 'CONNECTED') {
          qrStatus = 'SCANNED_AUTHENTICATED';
        }
      }
      
      return {
        success: validation.success,
        message: validation.message,
        state: validation.state || 'UNKNOWN',
        qrStatus,
        ...(client?.qr && { qr: client.qr }),
        recoveryAttempted: false
      };
      
    } catch (error: any) {
      logger.error(`Error in enhanced session status check: ${error.message}`, { ...logContext, error });
      return {
        success: false,
        message: `Status check failed: ${error.message}`,
        state: 'ERROR',
        qrStatus: 'ERROR',
        recoveryAttempted: false
      };
    }
  }

  /**
   * Clear recovery attempts for a session (call when session is successfully connected)
   */
  static clearRecoveryAttempts(sessionId: string): void {
    this.recoveryAttempts.delete(sessionId);
  }

  /**
   * Get current recovery attempt count for a session
   */
  static getRecoveryAttempts(sessionId: string): number {
    return this.recoveryAttempts.get(sessionId) || 0;
  }
}
