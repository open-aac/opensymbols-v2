import { Hono } from 'hono'

export const app = new Hono()

app.get('/api/health', (context) => context.json({ status: 'ok' as const }))
