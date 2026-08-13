import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { MEDIA_ROOT } from './db/index.ts';
import { libraryRoutes } from './routes/library.ts';
import { serviceRoutes } from './routes/services.ts';
import { uploadRoutes } from './routes/upload.ts';

const PORT = Number(process.env.PORT ?? 5174);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

await app.register(cors, { origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] });
await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 50 } });

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

try {
  await app.listen({ port: PORT, host: HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
