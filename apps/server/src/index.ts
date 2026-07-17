import { serve } from '@hono/node-server'
import { app } from './app.js'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`OpenSymbols server listening on http://localhost:${info.port}`)
})

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down`)
  server.close((error) => {
    if (error) {
      console.error(error)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
