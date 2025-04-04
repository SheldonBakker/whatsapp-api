const fs = require('fs')
const path = require('path')

function ensureDirectories () {
  const dirs = [
    '.cache/puppeteer',
    '.wwebjs_auth',
    'sessions'
  ]

  dirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir)
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true })
      console.log(`Created directory: ${dir}`)
    }
  })
}

module.exports = { ensureDirectories }
