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

    // For each HTTP method in this endpoint, remove security
    for (const method in filteredPaths[endpoint]) {
      if (filteredPaths[endpoint][method].security) {
        delete filteredPaths[endpoint][method].security
      }

      // Remove 403 responses related to authentication
      if (filteredPaths[endpoint][method].responses &&
          filteredPaths[endpoint][method].responses['403']) {
        delete filteredPaths[endpoint][method].responses['403']
      }

      // Remove parameters related to API key
      if (filteredPaths[endpoint][method].parameters) {
        filteredPaths[endpoint][method].parameters = filteredPaths[endpoint][method].parameters.filter(
          param => !(param.name === 'x-api-key' && param.in === 'header')
        )
      }
    }
  }
}

// Update the swagger object with the filtered paths
swagger.paths = filteredPaths

// Remove security schemas from components
if (swagger.components && swagger.components.securitySchemes) {
  delete swagger.components.securitySchemes
}

// Remove global security if present
if (swagger.security) {
  delete swagger.security
}

// Write the updated swagger object back to the file
fs.writeFileSync('./swagger.json', JSON.stringify(swagger, null, 2))

console.log('Swagger file updated successfully with only the required endpoints and authentication removed.')
