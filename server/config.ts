import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Everything mutable lives under here: the SQLite file and the uploaded audio.
 * Point it at persistent storage in production; the default keeps a dev checkout
 * self-contained.
 */
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : serverDir;

export const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(DATA_DIR, 'db', 'library.db');
export const MEDIA_ROOT = path.join(DATA_DIR, 'media', 'audio');
export const UPLOAD_TMP = path.join(DATA_DIR, 'media', 'tmp');
export const ORIGINALS_ROOT = path.join(DATA_DIR, 'media', 'originals');

/** Schema ships with the code, not the data. */
export const SCHEMA_PATH = path.join(serverDir, 'db', 'schema.sql');

export const CLIENT_DIST = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.join(serverDir, '..', 'dist');

export const PORT = Number(process.env.PORT ?? 5174);
// Bind to loopback unless told otherwise, so a reverse proxy is the only way in.
export const HOST = process.env.HOST ?? '127.0.0.1';

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 200 * 1024 * 1024);

/** Only needed when the API is served from a different origin than the UI. */
export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
