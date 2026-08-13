import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.ts';
import { getTrack, listHymnals, listTracks, listTunes } from '../db/queries.ts';

export const libraryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tracks', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    return listTracks({
      q: q.q,
      hymnal: q.hymnal,
      tune: q.tune,
      limit: Math.min(Number(q.limit ?? 200), 500),
      offset: Number(q.offset ?? 0),
    });
  });

  app.get('/tracks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = getTrack(Number(id));
    if (!track) return reply.code(404).send({ error: 'Track not found' });
    return track;
  });

  app.delete('/tracks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = db.prepare('DELETE FROM tracks WHERE id = ?').run(Number(id));
    if (result.changes === 0) return reply.code(404).send({ error: 'Track not found' });
    return reply.code(204).send();
  });

  app.get('/hymnals', async () => listHymnals());
  app.get('/tunes', async () => listTunes());

  app.get('/issues', async () =>
    db
      .prepare(`
        SELECT id, track_id AS trackId, severity, field, message, created_at AS createdAt
        FROM ingest_issues
        ORDER BY id DESC
        LIMIT 200
      `)
      .all(),
  );
};
