import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { MEDIA_ROOT, db, reindexHymn, transaction } from '../db/index.ts';
import {
  getHymn,
  getTrack,
  listEntries,
  listHymnals,
  listHymns,
  listTracks,
  listTunes,
  tracksForHymn,
} from '../db/queries.ts';
import { lastId, linkTrack, resolveTune, setAltTunes, unlinkTrack } from '../db/resolvers.ts';
import { canonicalHymnalCode, clean, parseHymnNumber } from '../ingest/normalize.ts';
import type { HymnInput, HymnalInput, TrackInput } from '@shared/types';

function conflict(reply: FastifyReply, error: unknown, message: string) {
  if (error instanceof Error && /UNIQUE constraint/i.test(error.message)) {
    return reply.code(409).send({ error: message });
  }
  throw error;
}

export const libraryRoutes: FastifyPluginAsync = async (app) => {
  /* ---------------------------------------------------------------- browse */

  app.get('/entries', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    return listEntries({
      q: q.q,
      hymnal: q.hymnal,
      tune: q.tune,
      unfiled: q.unfiled === 'true',
      limit: Math.min(Number(q.limit ?? 200), 500),
    });
  });

  app.get('/tracks', async (request) => {
    const q = request.query as Record<string, string | undefined>;
    return listTracks({ q: q.q, tune: q.tune, limit: Math.min(Number(q.limit ?? 200), 500) });
  });

  app.get('/tracks/:id', async (request, reply) => {
    const track = getTrack(Number((request.params as { id: string }).id));
    return track ?? reply.code(404).send({ error: 'Track not found' });
  });

  app.patch('/tracks/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!getTrack(id)) return reply.code(404).send({ error: 'Track not found' });

    const body = request.body as TrackInput;
    const sets: string[] = [];
    const params: Array<string | number | null> = [];

    if (body.arrangement !== undefined) { sets.push('arrangement = ?'); params.push(clean(body.arrangement)); }
    if (body.verses !== undefined) { sets.push('verses = ?'); params.push(clean(body.verses)); }
    if (body.tuneName !== undefined) {
      const name = clean(body.tuneName);
      sets.push('tune_id = ?');
      params.push(name ? resolveTune(name) : null);
    }
    if (sets.length === 0) return reply.code(400).send({ error: 'No updatable fields supplied' });

    params.push(id);
    db.prepare(`UPDATE tracks SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return getTrack(id);
  });

  app.delete('/tracks/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const row = db.prepare('SELECT storage_path FROM tracks WHERE id = ?').get(id) as
      | { storage_path: string }
      | undefined;
    if (!row) return reply.code(404).send({ error: 'Track not found' });

    // Deleting audio is irreversible, so require it to be unfiled first.
    const filed = db.prepare('SELECT COUNT(*) AS n FROM hymn_tracks WHERE track_id = ?').get(id) as {
      n: number;
    };
    if (Number(filed.n) > 0) {
      return reply
        .code(409)
        .send({ error: `Still filed under ${filed.n} hymn(s); unlink it before deleting` });
    }

    db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
    await unlink(path.join(MEDIA_ROOT, row.storage_path)).catch(() => {});
    return reply.code(204).send();
  });

  /* -------------------------------------------------------------- hymnals */

  app.get('/hymnals', async () => listHymnals());

  app.post('/hymnals', async (request, reply) => {
    const body = request.body as HymnalInput;
    const code = canonicalHymnalCode(body?.code);
    const title = clean(body?.title);
    if (!code || !title) return reply.code(400).send({ error: 'code and title are required' });

    try {
      db.prepare('INSERT INTO hymnals (code, title, publisher, year) VALUES (?, ?, ?, ?)').run(
        code,
        title,
        clean(body.publisher),
        body.year ?? null,
      );
    } catch (error) {
      return conflict(reply, error, `A hymnal with code ${code} already exists`);
    }
    return reply.code(201).send(listHymnals());
  });

  app.patch('/hymnals/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as Partial<HymnalInput>;
    const sets: string[] = [];
    const params: Array<string | number | null> = [];

    if (body.code !== undefined) {
      const code = canonicalHymnalCode(body.code);
      if (!code) return reply.code(400).send({ error: 'code cannot be empty' });
      sets.push('code = ?');
      params.push(code);
    }
    if (body.title !== undefined) {
      const title = clean(body.title);
      if (!title) return reply.code(400).send({ error: 'title cannot be empty' });
      sets.push('title = ?');
      params.push(title);
    }
    if (body.publisher !== undefined) { sets.push('publisher = ?'); params.push(clean(body.publisher)); }
    if (body.year !== undefined) { sets.push('year = ?'); params.push(body.year ?? null); }
    if (sets.length === 0) return reply.code(400).send({ error: 'No updatable fields supplied' });

    params.push(id);
    try {
      const result = db.prepare(`UPDATE hymnals SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      if (result.changes === 0) return reply.code(404).send({ error: 'Hymnal not found' });
    } catch (error) {
      return conflict(reply, error, 'Another hymnal already uses that code');
    }
    return listHymnals();
  });

  app.delete('/hymnals/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const count = db.prepare('SELECT COUNT(*) AS n FROM hymns WHERE hymnal_id = ?').get(id) as {
      n: number;
    };
    // Deleting cascades to every hymn inside it, so make the caller empty it first.
    if (Number(count.n) > 0) {
      return reply.code(409).send({ error: `Hymnal still contains ${count.n} hymn(s)` });
    }
    const result = db.prepare('DELETE FROM hymnals WHERE id = ?').run(id);
    if (result.changes === 0) return reply.code(404).send({ error: 'Hymnal not found' });
    return listHymnals();
  });

  app.post('/hymnals/:id/aliases', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const alias = canonicalHymnalCode((request.body as { alias?: string })?.alias);
    if (!alias) return reply.code(400).send({ error: 'alias is required' });
    if (!db.prepare('SELECT 1 FROM hymnals WHERE id = ?').get(id)) {
      return reply.code(404).send({ error: 'Hymnal not found' });
    }
    // An alias matching another hymnal's code would silently divert its ingests.
    const shadowed = db.prepare('SELECT id FROM hymnals WHERE code = ? AND id != ?').get(alias, id) as
      | { id: number }
      | undefined;
    if (shadowed) {
      return reply
        .code(409)
        .send({ error: `${alias} is already a hymnal code; delete that hymnal first` });
    }
    try {
      db.prepare('INSERT INTO hymnal_aliases (alias, hymnal_id) VALUES (?, ?)').run(alias, id);
    } catch (error) {
      return conflict(reply, error, `${alias} is already mapped to a hymnal`);
    }
    return reply.code(201).send(listHymnals());
  });

  app.delete('/hymnals/:id/aliases/:alias', async (request, reply) => {
    const { id, alias } = request.params as { id: string; alias: string };
    const result = db
      .prepare('DELETE FROM hymnal_aliases WHERE hymnal_id = ? AND alias = ?')
      .run(Number(id), alias.toUpperCase());
    if (result.changes === 0) return reply.code(404).send({ error: 'Alias not found' });
    return listHymnals();
  });

  /* ---------------------------------------------------------------- hymns */

  app.get('/hymns', async (request) => {
    const { hymnal } = request.query as { hymnal?: string };
    return listHymns(hymnal);
  });

  app.get('/hymns/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const hymn = getHymn(id);
    if (!hymn) return reply.code(404).send({ error: 'Hymn not found' });
    return { ...hymn, tracks: tracksForHymn(id) };
  });

  app.post('/hymns', async (request, reply) => {
    const body = request.body as HymnInput;
    const number = parseHymnNumber(body?.numberRaw);
    const title = clean(body?.title);
    if (!body?.hymnalId || !number || !title) {
      return reply.code(400).send({ error: 'hymnalId, numberRaw and title are required' });
    }

    try {
      const id = transaction(() => {
        const tuneId = body.primaryTuneName ? resolveTune(body.primaryTuneName) : null;
        const created = lastId(
          db
            .prepare(`
              INSERT INTO hymns
                (hymnal_id, number_raw, number_sort, number_suffix, title, first_line, text_author, primary_tune_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              body.hymnalId,
              number.raw,
              number.sort,
              number.suffix,
              title,
              clean(body.firstLine),
              clean(body.textAuthor),
              tuneId,
            ),
        );
        setAltTunes(created, body.altTuneNames ?? []);
        reindexHymn(created);
        return created;
      });
      return reply.code(201).send(getHymn(id));
    } catch (error) {
      return conflict(reply, error, 'That hymnal already has a hymn with this number');
    }
  });

  app.patch('/hymns/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!getHymn(id)) return reply.code(404).send({ error: 'Hymn not found' });

    const body = request.body as Partial<HymnInput>;
    const sets: string[] = [];
    const params: Array<string | number | null> = [];

    if (body.hymnalId !== undefined) { sets.push('hymnal_id = ?'); params.push(body.hymnalId); }
    if (body.numberRaw !== undefined) {
      const number = parseHymnNumber(body.numberRaw);
      if (!number) return reply.code(400).send({ error: 'numberRaw cannot be empty' });
      sets.push('number_raw = ?', 'number_sort = ?', 'number_suffix = ?');
      params.push(number.raw, number.sort, number.suffix);
    }
    if (body.title !== undefined) {
      const title = clean(body.title);
      if (!title) return reply.code(400).send({ error: 'title cannot be empty' });
      sets.push('title = ?');
      params.push(title);
    }
    if (body.firstLine !== undefined) { sets.push('first_line = ?'); params.push(clean(body.firstLine)); }
    if (body.textAuthor !== undefined) { sets.push('text_author = ?'); params.push(clean(body.textAuthor)); }
    if (body.primaryTuneName !== undefined) {
      const name = clean(body.primaryTuneName);
      sets.push('primary_tune_id = ?');
      params.push(name ? resolveTune(name) : null);
    }

    try {
      transaction(() => {
        if (sets.length > 0) {
          db.prepare(`UPDATE hymns SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
        }
        if (body.altTuneNames !== undefined) setAltTunes(id, body.altTuneNames);
        reindexHymn(id);
      });
    } catch (error) {
      return conflict(reply, error, 'That hymnal already has a hymn with this number');
    }
    return getHymn(id);
  });

  app.delete('/hymns/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const result = db.prepare('DELETE FROM hymns WHERE id = ?').run(id);
    if (result.changes === 0) return reply.code(404).send({ error: 'Hymn not found' });
    reindexHymn(id);
    return reply.code(204).send();
  });

  app.post('/hymns/:id/tracks', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const trackId = Number((request.body as { trackId?: number })?.trackId);
    if (!getHymn(id)) return reply.code(404).send({ error: 'Hymn not found' });
    if (!getTrack(trackId)) return reply.code(404).send({ error: 'Track not found' });

    linkTrack(id, trackId);
    return reply.code(201).send({ ...getHymn(id), tracks: tracksForHymn(id) });
  });

  app.delete('/hymns/:id/tracks/:trackId', async (request, reply) => {
    const { id, trackId } = request.params as { id: string; trackId: string };
    if (unlinkTrack(Number(id), Number(trackId)) === 0) {
      return reply.code(404).send({ error: 'That recording is not linked to this hymn' });
    }
    return { ...getHymn(Number(id)), tracks: tracksForHymn(Number(id)) };
  });

  /* ---------------------------------------------------------- tunes, misc */

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
