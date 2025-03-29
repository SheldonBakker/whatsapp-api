const fs = require('fs')

// Load the current swagger.json file
const swagger = require('./swagger.json')

// Define the endpoints we want to keep
const keepEndpoints = [
  '/ping',
  '/localCallbackExample',
  '/session/start/{sessionId}',
  '/session/status/{sessionId}',
  '/session/qr/{sessionId}',
  '/session/qr/{sessionId}/image',
  '/session/restart/{sessionId}',
  '/session/terminate/{sessionId}',
  '/session/terminateInactive',
  '/session/terminateAll',
  '/client/getClassInfo/{sessionId}',
  '/client/getNumberId/{sessionId}',
  '/client/getState/{sessionId}',
  '/client/sendMessage/{sessionId}',
  '/client/getWWebVersion/{sessionId}',
  '/message/delete/{sessionId}'
]

// Filter the paths to only include the ones we want to keep
const filteredPaths = {}
for (const endpoint of keepEndpoints) {
  if (swagger.paths[endpoint]) {
    filteredPaths[endpoint] = swagger.paths[endpoint]

    // For each HTTP method in this endpoint, ensure it uses API Key auth only
    for (const method in filteredPaths[endpoint]) {
      // Set security to use API Key auth
      filteredPaths[endpoint][method].security = [{ apiKeyAuth: [] }]

      // Keep /ping endpoint without authentication
      if (endpoint === '/ping') {
        delete filteredPaths[endpoint][method].security
      }

      // Only remove parameters that aren't related to API Key auth
      if (filteredPaths[endpoint][method].parameters) {
        filteredPaths[endpoint][method].parameters = filteredPaths[endpoint][method].parameters.filter(
          param => !(param.in === 'header' && param.name !== 'x-api-key')
        )
      }
    }
  }
}

// Update the swagger object with the filtered paths
swagger.paths = filteredPaths

// Ensure only API Key auth is enabled in components
if (swagger.components && swagger.components.securitySchemes) {
  // Keep only the API Key auth scheme
  const apiKeyAuth = swagger.components.securitySchemes.apiKeyAuth ||
                    swagger.components.securitySchemes.ApiKeyAuth

  if (apiKeyAuth) {
    swagger.components.securitySchemes = {
      apiKeyAuth
    }
  } else {
    // If no API Key auth scheme exists, create one
    swagger.components.securitySchemes = {
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key'
      }
    }
  }
}

// Set global security for API Key
swagger.security = [{ apiKeyAuth: [] }]

// Write the updated swagger object back to the file
fs.writeFileSync('./swagger.json', JSON.stringify(swagger, null, 2))

console.log('Swagger file updated successfully with only the required endpoints and API Key authentication.')
