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
  }
}

// Update the swagger object with the filtered paths
swagger.paths = filteredPaths

// Write the updated swagger object back to the file
fs.writeFileSync('./swagger.json', JSON.stringify(swagger, null, 2))

console.log('Swagger file updated successfully with only the required endpoints.')
