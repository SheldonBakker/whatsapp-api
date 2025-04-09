const { Client, LocalAuth } = require('whatsapp-web.js')
const fs = require('fs')
const path = require('path')
const { promisify } = require('util') // Used for async fs operations

const sessions = new Map()
const {
  baseWebhookURL,
  sessionFolderPath,
  maxAttachmentSize,
  setMessagesAsSeen,
  webVersion,
  webVersionCacheType,
  recoverSessions,
  headlessMode,
  puppeteerDebug
} = require('./config')
const { triggerWebhook, waitForNestedObject, checkIfEventisEnabled } = require('./utils')

const readdirAsync = promisify(fs.readdir)
const rmAsync = promisify(fs.rm)
const mkdirAsync = promisify(fs.mkdir)
const statAsync = promisify(fs.stat)
const realpathAsync = promisify(fs.realpath)

// --- Enhanced Utility: Safely Kill Puppeteer Browser ---
// Attempts graceful close, then force kill if necessary
const safeKillBrowser = async (client) => {
  if (!client || !client.pupBrowser) {
    return // No browser instance to kill
  }

  const browser = client.pupBrowser
  const browserProcess = browser.process() // Get the browser's child process

  try {
    if (browser.isConnected()) {
      console.log(`[Memory] Attempting graceful browser close for session ${client.options.clientId}`)
      // Give it a short timeout to close gracefully
      await Promise.race([
        browser.close(),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 sec timeout - Correct
      ])
      console.log(`[Memory] Browser closed gracefully for session ${client.options.clientId}`)
    }
  } catch (err) {
    console.warn(`[Memory] Graceful browser close failed for session ${client.options.clientId}: ${err.message}. Attempting force kill.`)
    // Force kill if graceful close fails or times out
    if (browserProcess && !browserProcess.killed) {
      try {
        // Use SIGKILL for a more forceful termination
        process.kill(browserProcess.pid, 'SIGKILL')
        console.log(`[Memory] Browser process ${browserProcess.pid} force-killed for session ${client.options.clientId}.`)
      } catch (killErr) {
        console.error(`[Memory] Failed to force-kill browser process ${browserProcess?.pid} for session ${client.options.clientId}: ${killErr.message}`)
      }
    }
  } finally {
    // Nullify references to potentially help GC, though process termination is key
    if (client) {
      client.pupBrowser = null
      client.pupPage = null
    }
  }
}

// --- Function to validate if the session is ready ---
const validateSession = async (sessionId) => {
  const returnData = { success: false, state: null, message: '' }
  const client = sessions.get(sessionId)

  // Session not tracked in memory 😢
  if (!client) {
    returnData.message = 'session_not_found_in_memory' // More specific message
    return returnData
  }

  try {
    // Early check: See if pupBrowser exists and is connected
    if (!client.pupBrowser || !client.pupBrowser.isConnected()) {
      // If we expect it to be connected, this is an issue.
      // However, it might be in the process of initializing or restarting.
      // Get state might still work or provide relevant info (like 'STARTING')
      try {
        const state = await client.getState()
        returnData.state = state
        returnData.message = state === 'CONNECTED' ? 'session_connected_but_browser_unresponsive' : `session_not_connected_state_${state}`
        return returnData
      } catch (stateError) {
        // If getState fails too, browser is likely dead or unreachable
        returnData.message = 'browser_unreachable_or_dead'
        return returnData
      }
    }

    // Wait for client.pupPage to exist (might not during early init)
    await waitForNestedObject(client, 'pupPage').catch((err) => {
      // If pupPage never appears, likely an init issue or early crash
      // Corrected return to ensure it's returned from validateSession
      returnData.success = false
      returnData.state = null
      returnData.message = `pupPage_unavailable: ${err.message}`
      return returnData // Exit function if pupPage fails
    })
    // If the above catch returned, the following code won't execute
    // Need an explicit check if the above modification changed returnData
    if (!returnData.success && returnData.message.startsWith('pupPage_unavailable')) {
      return returnData
    }

    // Check if page is closed *before* trying to evaluate
    if (!client.pupPage || client.pupPage.isClosed()) {
      return { success: false, state: null, message: 'browser_tab_closed' }
    }

    // Check if the page is usable with a timeout
    try {
      await Promise.race([
        client.pupPage.evaluate('1'), // Simple evaluation
        // *** FIXED HERE ***
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('page_evaluation_timeout')), 3000)) // 3 sec timeout
      ])
    } catch (error) {
      // If evaluation fails or times out, page/browser is likely unresponsive
      console.warn(`[Validation] Page evaluation failed for ${sessionId}: ${error.message}`)
      returnData.message = 'page_unresponsive'
      try {
        // Still try getting state as a fallback
        returnData.state = await client.getState()
      } catch {
        returnData.state = 'ERROR' // Mark state as ERROR if it also fails
      }
      return returnData
    }

    // If page is responsive, get the definitive state
    const state = await client.getState()
    returnData.state = state
    if (state !== 'CONNECTED') {
      returnData.message = 'session_not_connected'
      return returnData
    }

    // Session Connected 🎉
    returnData.success = true
    returnData.message = 'session_connected'
    return returnData
  } catch (error) {
    console.error(`[Validation Error] Session ${sessionId}:`, error)
    // Attempt to get state even on error, might give clues
    try {
      returnData.state = await client.getState()
    } catch {
      returnData.state = 'ERROR'
    }
    returnData.message = `validation_error: ${error.message}`
    return returnData
  }
}

// --- Function to handle client session restoration ---
const restoreSessions = async () => { // Make async
  try {
    // Ensure session folder exists
    try {
      await statAsync(sessionFolderPath)
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`[Restore] Session folder path "${sessionFolderPath}" not found. Creating...`)
        await mkdirAsync(sessionFolderPath, { recursive: true })
      } else {
        throw err // Re-throw other errors
      }
    }

    console.log('[Restore] Reading session directory:', sessionFolderPath)
    const files = await readdirAsync(sessionFolderPath)
    console.log('[Restore] Found items:', files)

    for (const file of files) {
      const match = file.match(/^session-(.+)$/)
      const fullPath = path.join(sessionFolderPath, file)

      // Ensure it's a directory before proceeding
      try {
        const stats = await statAsync(fullPath)
        if (match && stats.isDirectory()) {
          const sessionId = match[1]
          console.log(`[Restore] Existing session directory found for: ${sessionId}`)
          // Setup session without awaiting completion here, let them initialize in parallel
          setupSession(sessionId)
        } else if (!stats.isDirectory()) {
          console.warn(`[Restore] Found file "${file}" in session directory that is not a session folder. Skipping.`)
        }
      } catch (statErr) {
        console.error(`[Restore] Error accessing item "${file}": ${statErr.message}`)
      }
    }
  } catch (error) {
    console.error('[Restore] Failed to restore sessions:', error)
    // Depending on severity, might want to exit or notify admin
  }
}

// --- Setup Session ---
const setupSession = (sessionId) => {
  // Added return type hint for clarity
  // : { success: boolean, message: string, client: Client | null }
  try {
    if (sessions.has(sessionId)) {
      console.warn(`[Setup] Attempted to set up existing session: ${sessionId}. Returning existing client.`)
      return { success: false, message: `Session already exists for: ${sessionId}`, client: sessions.get(sessionId) }
    }
    console.log(`[Setup] Initiating session: ${sessionId}`)

    const sessionDir = path.join(sessionFolderPath, `session-${sessionId}`)
    try {
      // Ensure directory exists synchronously during setup if not using async file ops everywhere
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true })
      }
    } catch (mkdirErr) {
      console.error(`[Setup Critical Error] Failed to create session directory ${sessionDir}:`, mkdirErr)
      return { success: false, message: `Failed to create session directory: ${mkdirErr.message}`, client: null }
    }

    const localAuth = new LocalAuth({
      clientId: sessionId,
      dataPath: sessionFolderPath
      // dataUncompressed: true // Consider if needed; potentially more reliable but uses more disk
    })
    // Simplify logout override
    localAuth.logout = () => {
      console.log(`[Auth] Logout called for session ${sessionId}, but overridden to prevent data deletion.`)
    }

    // Base Puppeteer args for resource optimization
    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu', // Often saves resources, unless GPU needed for rendering specific things
      '--disable-dev-shm-usage', // Crucial in limited memory environments (like Docker)
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // Reduces process count, can help memory but might impact stability slightly
      '--disable-extensions',
      '--disable-popup-blocking',
      '--disable-sync',
      '--disable-features=IsolateOrigins,site-per-process', // Reduce process count
      '--bwsi' // Browse without sign-in - may help avoid Google sync popups etc.
      // Experiment with these if memory is still high:
      // '--mute-audio',
      // '--disable-background-networking',
      // '--disable-background-timer-throttling',
      // '--disable-backgrounding-occluded-windows',
      // '--disable-breakpad',
      // '--disable-client-side-phishing-detection',
      // '--disable-component-update',
      // '--disable-default-apps',
      // '--disable-domain-reliability',
      // '--disable-features=AudioServiceOutOfProcess',
      // '--disable-hang-monitor',
      // '--disable-ipc-flooding-protection',
      // '--disable-notifications',
      // '--disable-offer-store-unmasked-wallet-cards',
      // '--disable-print-preview',
      // '--disable-prompt-on-repost',
      // '--disable-renderer-backgrounding',
      // '--disable-speech-api',
      // '--disable-translate',
      // '--hide-scrollbars',
      // '--metrics-recording-only',
      // '--no-default-browser-check',
      // '--no-pings',
    ]

    const customUserAgent = process.env[`${sessionId.toUpperCase()}_USER_AGENT`] ||
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' // Update UA periodically if needed

    if (puppeteerDebug) {
      console.log(`[DEBUG] Session ${sessionId} Puppeteer Config:`)
      console.log(`[DEBUG] - Headless: ${headlessMode ? 'new' : 'false'}`)
      console.log(`[DEBUG] - Executable Path: ${process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || 'Default'}`)
      console.log(`[DEBUG] - User Agent: ${customUserAgent}`)
      console.log(`[DEBUG] - Args: ${puppeteerArgs.join(' ')}`)
    }

    const clientOptions = {
      puppeteer: {
        headless: headlessMode ? 'new' : false,
        args: puppeteerArgs,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || undefined, // Use undefined for default
        dumpio: puppeteerDebug, // Log browser IO if debugging
        // Set higher timeout for initialization, especially on slow systems
        timeout: 180000 // 3 minutes
        // userDataDir: sessionDir, // Can potentially conflict with LocalAuth, use LocalAuth's dataPath
      },
      userAgent: customUserAgent,
      authStrategy: localAuth,
      restartOnAuthFail: true, // Keep true - attempts re-auth automatically
      takeoverOnConflict: true, // Recommended: Allows this instance to take over if session is open elsewhere
      qrMaxRetries: 3, // Lower retries if QR scanning isn't primary auth method
      clientId: sessionId // Explicitly pass clientId for internal referencing
    }

    // Web Version Cache (No change needed here, seems fine)
    if (webVersion) {
      clientOptions.webVersion = webVersion
      // ... (rest of webVersionCache logic remains the same)
      switch (webVersionCacheType.toLowerCase()) {
        case 'local':
          clientOptions.webVersionCache = { type: 'local' }
          break
        case 'remote':
          clientOptions.webVersionCache = { type: 'remote', remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${webVersion}.html` }
          break
        default:
          clientOptions.webVersionCache = { type: 'none' }
      }
    }

    const client = new Client(clientOptions)

    // Track initialization status to prevent race conditions on errors/restarts
    client._initializing = true
    client._destroyed = false

    // Initialization with Retry Logic
    const initializeWithRetry = async (maxRetries = 3, delay = 10000) => { // Increased delay
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Ensure client hasn't been destroyed externally (e.g., by deleteSession)
        if (client._destroyed) {
          console.log(`[Init] Initialization cancelled for ${sessionId}, client already destroyed.`)
          return
        }
        console.log(`[Init] Initializing session ${sessionId} (Attempt ${attempt}/${maxRetries})...`)
        try {
          initializeEvents(client, sessionId) // Initialize events *before* first initialize call
          await client.initialize()
          console.log(`[Init] Session ${sessionId} initialized successfully via WWebJS.`)
          client._initializing = false // Mark as done
          // No need for complex QR check here; 'qr' and 'ready'/'authenticated' events handle this
          return // Success
        } catch (err) {
          console.error(`[Init Error] Attempt ${attempt}/${maxRetries} for session ${sessionId}: ${err.message}`)
          if (err.stack && puppeteerDebug) {
            console.error(`[Init Error Stack] ${err.stack}`)
          }

          // Check for common fatal errors
          if (err.message.includes('Target closed') || err.message.includes('Protocol error') || err.message.includes('Navigation failed because browser has disconnected')) {
            console.error(`[Init Error] Potentially unrecoverable browser error for ${sessionId}.`)
            // Clean up the likely dead browser process
            await safeKillBrowser(client)
            // Exit retry loop for this type of error
            break
          } else if (err.message.includes('Timeout')) {
            console.error(`[Init Error] Initialization timed out for ${sessionId}. Retrying might help.`)
          } else {
            // Log other errors
            console.error(`[Init Error] Unexpected error during initialization for ${sessionId}.`)
          }

          if (attempt < maxRetries) {
            console.log(`[Init] Retrying initialization for ${sessionId} in ${delay / 1000} seconds...`)
            await new Promise(resolve => setTimeout(resolve, delay)) // Correct
            // Clean slate attempt: Try closing previous failed attempt's browser *before* retry
            console.log(`[Init] Cleaning up browser before retry for ${sessionId}...`)
            await safeKillBrowser(client) // Ensure old process is gone before retrying
          } else {
            console.error(`[Init Fatal] Failed to initialize session ${sessionId} after ${maxRetries} attempts.`)
            client._initializing = false // Mark as done (failed)
            await handleInitializationFailure(sessionId, client)
            // Do NOT throw here, let handleInitializationFailure manage cleanup
            return // Stop the process for this session
          }
        }
      }
      // If loop finishes due to break (fatal browser error)
      if (client._initializing) { // Check if we didn't succeed or fail explicitly
        client._initializing = false
        await handleInitializationFailure(sessionId, client)
      }
    }

    // Start initialization asynchronously
    initializeWithRetry().catch(err => {
      // This catch is unlikely to be hit if initializeWithRetry handles its errors
      console.error(`[Init Unexpected] Uncaught error during async initialization for ${sessionId}:`, err)
      handleInitializationFailure(sessionId, client) // Ensure cleanup even here
    })

    // Store the client immediately (even before initialized) to allow tracking/deletion
    sessions.set(sessionId, client)
    console.log(`[Setup] Session ${sessionId} added to active sessions map.`)

    return { success: true, message: 'Session initialization started', client }
  } catch (error) {
    console.error(`[Setup Critical Error] Failed to create Client instance for ${sessionId}:`, error)
    // Don't add to sessions map if Client constructor failed
    return { success: false, message: `Critical setup error: ${error.message}`, client: null }
  }
}

// --- Helper for Handling Initialization Failure ---
const handleInitializationFailure = async (sessionId, client) => {
  console.error(`[Cleanup] Handling fatal initialization failure for session ${sessionId}.`)
  if (client && !client._destroyed) {
    await safeKillBrowser(client) // Ensure browser is killed
    client._destroyed = true // Mark as destroyed
  }
  sessions.delete(sessionId) // Remove from active sessions
  console.log(`[Cleanup] Session ${sessionId} removed due to initialization failure.`)
  // Optionally trigger a webhook or alert about the failure
  // triggerWebhook(baseWebhookURL, sessionId, 'status', { status: 'INITIALIZATION_FAILED' });

  // Optionally, attempt to clean the session folder IF corrupted data is suspected
  // Be cautious with this, as it might delete a recoverable session
  // console.warn(`[Cleanup] Consider manually deleting session folder for ${sessionId} if issues persist.`);
  // await deleteSessionFolder(sessionId).catch(e => console.error(`[Cleanup] Error deleting session folder during cleanup: ${e.message}`));
}

// --- Initialize Client Events ---
const initializeEvents = (client, sessionId) => {
  console.log(`[Events] Initializing event listeners for session: ${sessionId}`)
  const sessionWebhook = process.env[sessionId.toUpperCase() + '_WEBHOOK_URL'] || baseWebhookURL

  // Flag to prevent multiple restart attempts in quick succession
  let restartInProgress = false

  // Handle unexpected browser/page closure more robustly
  const handleUnexpectedClosure = async (type, error = null) => {
    if (restartInProgress || client._initializing || client._destroyed) {
      console.log(`[Events] Closure (${type}) for ${sessionId} ignored (Already handling: ${restartInProgress}, Initializing: ${client._initializing}, Destroyed: ${client._destroyed})`)
      return
    }
    restartInProgress = true
    console.warn(`[Events] Browser ${type} detected for session ${sessionId}. Error: ${error || 'N/A'}`)
    triggerWebhook(sessionWebhook, sessionId, 'status', { status: 'DISCONNECTED', reason: `Browser ${type}` })

    if (recoverSessions) {
      console.log(`[Events] Attempting to recover session ${sessionId}...`)
      // Remove from sessions map BEFORE attempting destroy/setup to prevent race conditions
      sessions.delete(sessionId)

      // Try to destroy cleanly, but don't wait forever / fail hard if it errors
      try {
        console.log(`[Events] Destroying old client instance for ${sessionId} before restart...`)
        if (client.pupBrowser && client.pupBrowser.isConnected()) {
          await client.destroy() // Use destroy which includes browser close attempt
        } else {
          // If browser isn't connected, destroy() might hang, just kill process
          await safeKillBrowser(client)
        }
        client._destroyed = true // Mark manually if destroy fails
      } catch (destroyErr) {
        console.error(`[Events] Error destroying client during recovery for ${sessionId}: ${destroyErr.message}. Attempting hard kill.`)
        await safeKillBrowser(client) // Ensure kill on error
        client._destroyed = true
      }

      // Wait a moment before restarting to allow resources to free up
      await new Promise(resolve => setTimeout(resolve, 5000)) // 5 seconds grace period - Correct

      console.log(`[Events] Re-initializing session ${sessionId} after closure.`)
      setupSession(sessionId) // Re-run setup
      // Reset flag after setup is *initiated* (it runs async)
      // A short delay might be safer if setupSession fails instantly
      setTimeout(() => { restartInProgress = false }, 1000)
    } else {
      console.log(`[Events] Session recovery disabled. Removing session ${sessionId} permanently.`)
      // Ensure cleanup even if not recovering
      await safeKillBrowser(client)
      client._destroyed = true
      sessions.delete(sessionId) // Ensure removal
      // Optionally delete folder if not recovering
      // await deleteSessionFolder(sessionId);
      restartInProgress = false // Reset flag
    }
  }

  // Listen on the browser instance itself if possible, more reliable than page events sometimes
  // Debounce or add check before adding listener
  const addDisconnectedListener = () => {
    if (client.pupBrowser && !client.pupBrowser.listenerCount('disconnected')) {
      client.pupBrowser.once('disconnected', () => handleUnexpectedClosure('disconnected'))
    }
  }

  if (client.pupBrowser) {
    addDisconnectedListener()
  } else {
    // Fallback: listen after initialization promise (though might miss early crashes)
    // Use .then() on the promise returned by initialize() if available,
    // otherwise just check again on ready event
  }

  // Listen for page crash/close events as secondary checks
  client.once('ready', () => { // Attach page listeners only when page is somewhat ready
    if (client.pupPage) {
      // Check if listener already exists from browser disconnect
      if (!client.pupBrowser || !client.pupBrowser.listenerCount('disconnected')) {
        // Add page listeners only if browser listener wasn't successful or doesn't exist
        client.pupPage.once('close', () => handleUnexpectedClosure('page closed'))
        client.pupPage.once('error', (err) => handleUnexpectedClosure('page error', err)) // Generic page error
        client.pupPage.once('crash', () => handleUnexpectedClosure('page crashed')) // Specific crash event
      }
      // Ensure browser disconnect listener is attached if possible now
      addDisconnectedListener()
    } else {
      console.warn(`[Events] Client ready for ${sessionId}, but pupPage not available to attach close/error listeners.`)
      // Attempt to attach browser listener again if pupBrowser exists now
      addDisconnectedListener()
    }
  })

  // --- Standard WWebJS Event Listeners ---
  // (Wrap in checkIfEventisEnabled for efficiency)

  checkIfEventisEnabled('auth_failure').then(enabled => {
    if (enabled) client.on('auth_failure', (msg) => triggerWebhook(sessionWebhook, sessionId, 'status', { status: 'AUTH_FAILURE', message: msg }))
  })

  checkIfEventisEnabled('authenticated').then(enabled => {
    if (enabled) client.on('authenticated', () => triggerWebhook(sessionWebhook, sessionId, 'authenticated'))
  })

  checkIfEventisEnabled('change_state').then(enabled => {
    if (enabled) client.on('change_state', state => triggerWebhook(sessionWebhook, sessionId, 'change_state', { state }))
  })

  checkIfEventisEnabled('disconnected').then(enabled => {
    if (enabled) {
      client.on('disconnected', (reason) => {
        console.log(`[Events] Client disconnected event for ${sessionId}. Reason:`, reason)
        // Avoid triggering recovery if it was an intentional logout/destroy
        if (reason === 'NAVIGATION' || reason === 'LOGOUT') {
          console.log(`[Events] Disconnect reason (${reason}) likely intentional, not triggering recovery for ${sessionId}.`)
          // Ensure cleanup if disconnected state is reached unexpectedly after intentional logout failed?
          if (!client._destroyed) {
            console.warn(`[Events] Client disconnected (${reason}) but not marked destroyed for ${sessionId}. Forcing cleanup.`)
            // Mark as destroyed and remove
            client._destroyed = true
            sessions.delete(sessionId)
            safeKillBrowser(client) // Ensure browser is gone
          }
          return
        }
        // Handle unexpected disconnects if recovery is enabled
        // The browser 'disconnected' event might be more reliable, but this can be a fallback
        // handleUnexpectedClosure('client disconnected', reason); // Potentially redundant if browser event fires
        triggerWebhook(sessionWebhook, sessionId, 'disconnected', { reason })
      })
    }
  })

  // QR Code Handling
  client.on('qr', (qr) => {
    console.log(`[Events] QR code received for ${sessionId}`)
    client.qr = qr // Store QR on client instance for potential retrieval
    checkIfEventisEnabled('qr').then(enabled => {
      if (enabled) triggerWebhook(sessionWebhook, sessionId, 'qr', { qr })
    })
  })

  checkIfEventisEnabled('ready').then(enabled => {
    if (enabled) {
      client.on('ready', () => {
        console.log(`[Events] Client is ready for ${sessionId}!`)
        client._initializing = false // Ensure init flag is false on ready
        triggerWebhook(sessionWebhook, sessionId, 'ready')
      })
    }
  })

  // Message Related Events
  checkIfEventisEnabled('message').then(enabled => {
    if (enabled) {
      client.on('message', async (message) => {
        triggerWebhook(sessionWebhook, sessionId, 'message', { message })
        // Media download logic... (ensure size check is efficient)
        if (message.hasMedia && message._data?.size < maxAttachmentSize) {
          checkIfEventisEnabled('media').then(mediaEnabled => {
            if (!mediaEnabled) return
            message.downloadMedia()
              .then(messageMedia => triggerWebhook(sessionWebhook, sessionId, 'media', { messageMedia, message }))
              .catch(e => console.error(`[Events] Media download error for ${sessionId}: ${e.message}`))
          })
        }
        if (setMessagesAsSeen) {
          try {
            const chat = await message.getChat()
            await chat.sendSeen()
          } catch (seenErr) {
            console.warn(`[Events] Failed to send seen for message ${message.id?._serialized || 'unknown'} in session ${sessionId}: ${seenErr.message}`)
          }
        }
      })
    }
  })

  checkIfEventisEnabled('message_ack').then(enabled => {
    if (enabled) client.on('message_ack', (message, ack) => triggerWebhook(sessionWebhook, sessionId, 'message_ack', { message, ack }))
  })

  checkIfEventisEnabled('message_create').then(enabled => {
    // Be mindful: message_create fires for outgoing messages too. Avoid 'sendSeen' here usually.
    if (enabled) client.on('message_create', (message) => triggerWebhook(sessionWebhook, sessionId, 'message_create', { message }))
  })

  // Other Events (Keep as is, wrapping in checkIfEventisEnabled is good practice)
  checkIfEventisEnabled('call').then(e => e && client.on('call', async (call) => triggerWebhook(sessionWebhook, sessionId, 'call', { call })))
  checkIfEventisEnabled('group_join').then(e => e && client.on('group_join', (n) => triggerWebhook(sessionWebhook, sessionId, 'group_join', { notification: n })))
  checkIfEventisEnabled('group_leave').then(e => e && client.on('group_leave', (n) => triggerWebhook(sessionWebhook, sessionId, 'group_leave', { notification: n })))
  checkIfEventisEnabled('group_update').then(e => e && client.on('group_update', (n) => triggerWebhook(sessionWebhook, sessionId, 'group_update', { notification: n })))
  checkIfEventisEnabled('loading_screen').then(e => e && client.on('loading_screen', (p, m) => triggerWebhook(sessionWebhook, sessionId, 'loading_screen', { percent: p, message: m })))
  checkIfEventisEnabled('media_uploaded').then(e => e && client.on('media_uploaded', (msg) => triggerWebhook(sessionWebhook, sessionId, 'media_uploaded', { message: msg })))
  checkIfEventisEnabled('message_reaction').then(e => e && client.on('message_reaction', (r) => triggerWebhook(sessionWebhook, sessionId, 'message_reaction', { reaction: r })))
  checkIfEventisEnabled('message_edit').then(e => e && client.on('message_edit', (msg, n, p) => triggerWebhook(sessionWebhook, sessionId, 'message_edit', { message: msg, newBody: n, prevBody: p })))
  checkIfEventisEnabled('message_revoke_everyone').then(e => e && client.on('message_revoke_everyone', (msg) => triggerWebhook(sessionWebhook, sessionId, 'message_revoke_everyone', { message: msg })))
  checkIfEventisEnabled('message_revoke_me').then(e => e && client.on('message_revoke_me', (msg) => triggerWebhook(sessionWebhook, sessionId, 'message_revoke_me', { message: msg })))
  checkIfEventisEnabled('contact_changed').then(e => e && client.on('contact_changed', (m, o, n, i) => triggerWebhook(sessionWebhook, sessionId, 'contact_changed', { message: m, oldId: o, newId: n, isContact: i })))
  checkIfEventisEnabled('chat_removed').then(e => e && client.on('chat_removed', (c) => triggerWebhook(sessionWebhook, sessionId, 'chat_removed', { chat: c })))
  checkIfEventisEnabled('chat_archived').then(e => e && client.on('chat_archived', (c, cs, ps) => triggerWebhook(sessionWebhook, sessionId, 'chat_archived', { chat: c, currState: cs, prevState: ps })))
  checkIfEventisEnabled('unread_count').then(e => e && client.on('unread_count', (c) => triggerWebhook(sessionWebhook, sessionId, 'unread_count', { chat: c })))

  // Potential: Add listener for 'error' on client itself, though specific errors are often handled elsewhere
  // client.on('error', (err) => {
  //     console.error(`[Events] General client error for session ${sessionId}:`, err);
  //     // Decide if this warrants session restart/shutdown
  // });
}

// --- Function to delete client session folder ---
const deleteSessionFolder = async (sessionId) => {
  const targetDirPath = path.join(sessionFolderPath, `session-${sessionId}`)
  console.log(`[FS] Attempting to delete session folder: ${targetDirPath}`)
  try {
    // Basic path check (relative paths)
    if (targetDirPath.includes('..')) {
      throw new Error('Invalid path: Directory traversal detected.')
    }
    // Use realpath for symlink resolution and better validation
    const resolvedTargetDirPath = await realpathAsync(targetDirPath).catch(err => {
      if (err.code === 'ENOENT') return null // Folder doesn't exist, nothing to delete
      throw err // Other error during realpath
    })

    // Ensure resolvedSessionPath calculation happens only if target exists or no error
    let resolvedSessionPath
    if (resolvedTargetDirPath !== undefined) { // Check if realpath didn't throw ENOENT or other critical error
      try {
        resolvedSessionPath = await realpathAsync(sessionFolderPath)
      } catch (sessionPathErr) {
        console.error(`[FS Error] Failed to resolve session root path "${sessionFolderPath}": ${sessionPathErr.message}`)
        throw sessionPathErr // Cannot proceed without valid root path
      }
    }

    if (!resolvedTargetDirPath) {
      console.log(`[FS] Session folder "${targetDirPath}" does not exist. Skipping deletion.`)
      return
    }

    // Final safety check: ensure target is within the main session folder
    if (!resolvedTargetDirPath.startsWith(resolvedSessionPath + path.sep)) {
      throw new Error(`Invalid path: Resolved path "${resolvedTargetDirPath}" is outside session root "${resolvedSessionPath}".`)
    }

    console.log(`[FS] Deleting directory: ${resolvedTargetDirPath}`)
    await rmAsync(resolvedTargetDirPath, { recursive: true, force: true, maxRetries: 3 }) // Added retries
    console.log(`[FS] Successfully deleted directory: ${resolvedTargetDirPath}`)
  } catch (error) {
    console.error(`[FS Error] Failed to delete session folder "${targetDirPath}": ${error.message}`)
    // Rethrow to indicate failure upstream if necessary
    throw error
  }
}

// --- Function to reload client session (re-init without deleting folder) ---
const reloadSession = async (sessionId) => {
  console.log(`[Session] Reload requested for session: ${sessionId}`)
  const client = sessions.get(sessionId)

  if (!client) {
    console.error(`[Session Reload] Cannot reload session ${sessionId}: Not found in active sessions.`)
    throw new Error(`Session ${sessionId} not found.`)
  }

  // Prevent reload if already destroying/initializing
  if (client._destroyed || client._initializing) {
    console.warn(`[Session Reload] Reload cancelled for ${sessionId}: Client state is (Destroyed: ${client._destroyed}, Initializing: ${client._initializing})`)
    return
  }

  // Mark as destroyed to prevent event handlers from interfering during reload
  client._destroyed = true

  // Remove from active sessions *before* killing browser to prevent setup race conditions
  sessions.delete(sessionId)
  console.log(`[Session Reload] Session ${sessionId} removed from active map.`)

  try {
    // Attempt to kill the browser associated with the old client instance
    console.log(`[Session Reload] Shutting down existing browser for ${sessionId}...`)
    await safeKillBrowser(client) // Use robust kill util

    console.log(`[Session Reload] Restarting session ${sessionId}...`)
    // Wait a moment before setting up again
    await new Promise(resolve => setTimeout(resolve, 2000)) // 2s grace - Correct
    setupSession(sessionId) // Re-initialize
    console.log(`[Session Reload] Session ${sessionId} re-initialization process started.`)
  } catch (error) {
    console.error(`[Session Reload Error] Failed during reload for session ${sessionId}:`, error)
    // Even on error, ensure it's removed from map (already done) and browser *should* be killed by safeKillBrowser
    // Optionally try deleting folder if reload fails badly?
    // await deleteSessionFolder(sessionId).catch(e => {});
    throw error // Rethrow to signal failure
  }
}

// --- Function to delete session (logout/destroy + remove folder) ---
const deleteSession = async (sessionId) => {
  console.log(`[Session Delete] Deletion requested for session: ${sessionId}`)
  const client = sessions.get(sessionId)
  const validation = await validateSession(sessionId) // Validate before proceeding

  if (!client && validation.message === 'session_not_found_in_memory') {
    console.log(`[Session Delete] Session ${sessionId} not found in memory. Attempting folder deletion only.`)
    // Still try to delete the folder if it exists but isn't in memory
    try {
      await deleteSessionFolder(sessionId)
    } catch (folderErr) {
      console.error(`[Session Delete] Error deleting folder for inactive session ${sessionId}: ${folderErr.message}`)
      // Don't necessarily fail the whole operation, but log it
    }
    return // Session wasn't active, folder cleanup attempted
  }

  if (!client) {
    console.error(`[Session Delete] Cannot delete session ${sessionId}: Not found (State: ${validation.message}). Folder deletion might be needed manually.`)
    // Cannot proceed with client operations if no client object
    return
  }

  // Prevent double deletion / race conditions
  if (client._destroyed) {
    console.warn(`[Session Delete] Session ${sessionId} already marked as destroyed. Skipping client operations, ensuring removal.`)
    sessions.delete(sessionId) // Ensure removal from map
    await safeKillBrowser(client) // Attempt kill just in case
    await deleteSessionFolder(sessionId).catch(e => console.error(`[Session Delete] Error deleting folder for already-destroyed session ${sessionId}: ${e.message}`))
    return
  }

  // Mark as destroyed immediately
  client._destroyed = true

  // Remove from active sessions map *early*
  sessions.delete(sessionId)
  console.log(`[Session Delete] Session ${sessionId} removed from active map.`)

  try {
    let shutdownMethod = 'none'
    // Decide how to shut down the client based on validation state
    if (validation.success && validation.state === 'CONNECTED') {
      // Client Connected, try graceful logout first
      shutdownMethod = 'logout'
      console.log(`[Session Delete] Attempting logout for connected session ${sessionId}...`)
      try {
        await Promise.race([
          client.logout(),
          // *** FIXED HERE *** (and removed eslint-disable comment)
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Logout timeout')), 15000)) // 15s timeout for logout
        ])
        console.log(`[Session Delete] Logout successful for ${sessionId}.`)
      } catch (logoutErr) {
        console.warn(`[Session Delete] Logout failed or timed out for ${sessionId}: ${logoutErr.message}. Proceeding to destroy/kill.`)
        shutdownMethod = 'destroy_after_logout_fail' // Update method for clarity
        // Fall through to destroy/kill
      }
    }

    // If not logged out successfully, or wasn't connected, use destroy/kill
    if (shutdownMethod !== 'logout') {
      if (validation.state && validation.state !== 'CONNECTED') {
        shutdownMethod = 'destroy (not connected)'
        console.log(`[Session Delete] Session ${sessionId} state is ${validation.state}. Attempting destroy...`)
      } else if (shutdownMethod === 'destroy_after_logout_fail') {
        // Already logged the reason
        console.log(`[Session Delete] Attempting destroy after failed logout for ${sessionId}...`)
      } else {
        // Default case or if validation failed unexpectedly
        shutdownMethod = 'destroy (unknown state)'
        console.log(`[Session Delete] Session ${sessionId} in uncertain state (${validation.message}). Attempting destroy...`)
      }

      try {
        // Destroy should handle browser closing, but we add safeKillBrowser as fallback
        if (client.pupBrowser) { // Check if browser instance exists
          await client.destroy()
          console.log(`[Session Delete] Client destroy successful for ${sessionId}.`)
        } else {
          console.log(`[Session Delete] No browser instance found on client for ${sessionId}. Skipping destroy, attempting kill.`)
        }
      } catch (destroyErr) {
        console.warn(`[Session Delete] Client destroy failed for ${sessionId}: ${destroyErr.message}. Attempting force kill.`)
        // Fall through to safeKillBrowser
      }
    }

    // Regardless of logout/destroy outcome, ensure the browser process is terminated
    console.log(`[Session Delete] Ensuring browser process is terminated for ${sessionId}...`)
    await safeKillBrowser(client)

    // Finally, delete the session folder
    console.log(`[Session Delete] Deleting session data folder for ${sessionId}...`)
    await deleteSessionFolder(sessionId)

    console.log(`[Session Delete] Session ${sessionId} terminated and data cleaned successfully.`)
  } catch (error) {
    console.error(`[Session Delete Error] Error during termination/cleanup for session ${sessionId}:`, error)
    // Ensure browser kill is attempted even if other steps failed
    await safeKillBrowser(client)
    // Folder deletion might have failed, may require manual intervention
    throw error // Rethrow to indicate deletion failed
  } finally {
    // Final check to ensure it's removed from the map
    if (sessions.has(sessionId)) {
      console.warn(`[Session Delete] Session ${sessionId} was still in map after deletion process. Removing forcefully.`)
      sessions.delete(sessionId)
    }
  }
}

// --- Function to handle session flush ---
const flushSessions = async (deleteOnlyInactive) => {
  console.log(`[Session Flush] Starting flush process. Delete only inactive: ${deleteOnlyInactive}`)
  try {
    // Get session IDs from the folder structure first
    const sessionFolders = new Set()
    try {
      const files = await readdirAsync(sessionFolderPath)
      for (const file of files) {
        const match = file.match(/^session-(.+)$/)
        const fullPath = path.join(sessionFolderPath, file)
        try {
          const stats = await statAsync(fullPath)
          if (match && stats.isDirectory()) {
            sessionFolders.add(match[1])
          }
        } catch (statErr) {
          // Ignore errors for individual files (like .DS_Store or temp files)
          if (statErr.code !== 'ENOENT') {
            console.warn(`[Session Flush] Error stating file ${file}: ${statErr.message}`)
          }
        }
      }
    } catch (readErr) {
      if (readErr.code === 'ENOENT') {
        console.log('[Session Flush] Session folder does not exist. Nothing to flush.')
        return
      }
      throw readErr // Rethrow other directory read errors
    }

    // Also consider sessions currently in the memory map, might not have folders yet or vice-versa
    const activeSessionIds = new Set(sessions.keys())
    const allSessionIds = new Set([...sessionFolders, ...activeSessionIds])

    console.log(`[Session Flush] Found ${sessionFolders.size} session folders and ${activeSessionIds.size} active sessions. Total unique IDs: ${allSessionIds.size}`)

    let deletedCount = 0
    for (const sessionId of allSessionIds) {
      console.log(`[Session Flush] Processing session ID: ${sessionId}`)
      const validation = await validateSession(sessionId) // Check current state

      let shouldDelete = false
      if (!deleteOnlyInactive) {
        // Delete ALL sessions if flag is false
        shouldDelete = true
        console.log(`[Session Flush] Deleting session ${sessionId} (flush all).`)
      } else if (!validation.success || validation.state !== 'CONNECTED') {
        // Delete if inactive: not successful validation OR state isn't CONNECTED
        shouldDelete = true
        console.log(`[Session Flush] Deleting inactive session ${sessionId} (State: ${validation.state || 'Unknown'}, Success: ${validation.success}).`)
      } else {
        console.log(`[Session Flush] Skipping active session ${sessionId}.`)
      }

      if (shouldDelete) {
        try {
          await deleteSession(sessionId) // Use the robust delete function
          deletedCount++
        } catch (deleteErr) {
          console.error(`[Session Flush] Failed to delete session ${sessionId} during flush: ${deleteErr.message}`)
          // Continue flushing other sessions
        }
      }
    }
    console.log(`[Session Flush] Flush process completed. Deleted ${deletedCount} sessions.`)
  } catch (error) {
    console.error('[Session Flush Error] An error occurred during the flush process:', error)
    throw error // Rethrow to indicate failure
  }
}

// --- Module Exports ---
module.exports = {
  sessions,
  setupSession,
  restoreSessions,
  validateSession,
  deleteSession,
  reloadSession,
  flushSessions
  // Expose potentially useful utils if needed externally
  // safeKillBrowser
}
