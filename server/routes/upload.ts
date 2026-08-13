import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { UPLOAD_TMP } from '../db/index.ts';
import { ingestFile } from '../ingest/index.ts';
import type { IngestResult } from '@shared/types';

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wav']);

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(415).send({ error: 'Expected multipart/form-data' });
    }

    const results: IngestResult[] = [];
    const rejected: Array<{ filename: string; reason: string }> = [];

    for await (const part of request.files()) {
      // Never trust the client filename for a path; only its extension is used.
      const filename = path.basename(part.filename ?? 'upload');
      const ext = path.extname(filename).toLowerCase();

      if (!ALLOWED_EXTENSIONS.has(ext)) {
        await part.toBuffer().catch(() => {});
        rejected.push({ filename, reason: `Unsupported file type: ${ext || 'unknown'}` });
        continue;
      }

      const tmpPath = path.join(UPLOAD_TMP, `${randomUUID()}${ext}`);
      await pipeline(part.file, createWriteStream(tmpPath));

      if (part.file.truncated) {
        await unlink(tmpPath).catch(() => {});
        rejected.push({ filename, reason: 'File exceeded the maximum upload size' });
        continue;
      }

      try {
        results.push(await ingestFile(tmpPath, filename, part.mimetype));
      } catch (error) {
        await unlink(tmpPath).catch(() => {});
        request.log.error({ err: error, filename }, 'Ingest failed');
        rejected.push({ filename, reason: 'Could not read audio metadata' });
      }
    }

    return reply.code(results.length > 0 ? 201 : 400).send({ results, rejected });
  });
};
