import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import {
  CLIENT_DIST,
  CORS_ORIGINS,
  HOST,
  MAX_UPLOAD_BYTES,
  MEDIA_ROOT,
  PORT,
  isProduction,
} from './config.ts';
import { libraryRoutes } from './routes/library.ts';
import { serviceRoutes } from './routes/services.ts';
import { uploadRoutes } from './routes/upload.ts';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  // Behind a reverse proxy, trust X-Forwarded-* so logged IPs are the real ones.
  trustProxy: isProduction,
});

if (CORS_ORIGINS.length > 0) {
  await app.register(cors, { origin: CORS_ORIGINS });
} else if (!isProduction) {
  await app.register(cors, { origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] });
}

await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 50 } });

// @fastify/static handles Range requests, which is what makes seeking work.
await app.register(fastifyStatic, {
  root: MEDIA_ROOT,
  prefix: '/media/',
  index: false,
  cacheControl: true,
  maxAge: '1y',
  immutable: true,
});

await app.register(libraryRoutes, { prefix: '/api/library' });
await app.register(serviceRoutes, { prefix: '/api/services' });
await app.register(uploadRoutes, { prefix: '/api/upload' });

app.get('/api/health', async () => ({ ok: true }));

// In development Vite serves the UI; in production this process does.
if (existsSync(CLIENT_DIST)) {
  await app.register(fastifyStatic, {
    root: CLIENT_DIST,
    prefix: '/',
    decorateReply: false,
    index: 'index.html',
  });

  // Routing is hash-based, so any unmatched non-API path is just the app shell.
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/media/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html', CLIENT_DIST);
  });
} else if (isProduction) {
  app.log.warn(`No built client at ${CLIENT_DIST}; run "npm run build" first.`);
}

try {
  await app.listen({ port: PORT, host: HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
