export function buildContentSecurityPolicy(production: boolean): string {
  const scriptSources = ["'self'", "'unsafe-inline'", ...(production ? [] : ["'unsafe-eval'"])]
  const connectSources = [
    "'self'",
    'https:',
    ...(production ? [] : ['http://localhost:*', 'http://127.0.0.1:*', 'ws:', 'wss:']),
  ]

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(' ')}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join('; ')
}
