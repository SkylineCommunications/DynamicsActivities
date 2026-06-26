import { app } from '@azure/functions'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function withCors(handler) {
  return async (request, context) => {
    if (request.method === 'OPTIONS') return { status: 204, headers: CORS }
    const res = await handler(request, context)
    return { ...res, headers: { ...(res.headers || {}), ...CORS } }
  }
}

export function preflight(name, route) {
  app.http(name, {
    methods: ['OPTIONS'],
    route,
    authLevel: 'anonymous',
    handler: () => ({ status: 204, headers: CORS }),
  })
}
