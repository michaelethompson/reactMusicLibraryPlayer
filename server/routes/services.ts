import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.ts';
import { getService, listServices } from '../db/queries.ts';
import type { ServiceItemKind } from '@shared/types';

const KINDS: ServiceItemKind[] = ['hymn', 'spoken', 'silence', 'note'];

function nextPosition(serviceId: number): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(position), 0) AS max FROM service_items WHERE service_id = ?')
    .get(serviceId) as { max: number };
  return Number(row.max) + 1024;
}

export const serviceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => listServices());

  app.post('/', async (request, reply) => {
    const body = request.body as {
      title?: string;
      serviceDate?: string;
      liturgicalDay?: string;
      notes?: string;
    };
    if (!body?.title?.trim()) return reply.code(400).send({ error: 'title is required' });

    const result = db
      .prepare(
        'INSERT INTO services (title, service_date, liturgical_day, notes) VALUES (?, ?, ?, ?)',
      )
      .run(body.title.trim(), body.serviceDate ?? null, body.liturgicalDay ?? null, body.notes ?? null);
    return reply.code(201).send(getService(Number(result.lastInsertRowid)));
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const service = getService(Number(id));
    if (!service) return reply.code(404).send({ error: 'Service not found' });
    return service;
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = db.prepare('DELETE FROM services WHERE id = ?').run(Number(id));
    if (result.changes === 0) return reply.code(404).send({ error: 'Service not found' });
    return reply.code(204).send();
  });

  app.post('/:id/items', async (request, reply) => {
    const { id } = request.params as { id: string };
    const serviceId = Number(id);
    if (!getService(serviceId)) return reply.code(404).send({ error: 'Service not found' });

    const body = request.body as {
      kind?: ServiceItemKind;
      trackId?: number | null;
      hymnId?: number | null;
      label?: string | null;
      verses?: string | null;
      gapAfterMs?: number;
      autoAdvance?: boolean;
    };
    const kind = body?.kind ?? 'hymn';
    if (!KINDS.includes(kind)) return reply.code(400).send({ error: `kind must be one of ${KINDS.join(', ')}` });
    if (kind === 'hymn' && !body?.trackId) {
      return reply.code(400).send({ error: 'trackId is required for hymn items' });
    }

    db.prepare(`
      INSERT INTO service_items
        (service_id, position, kind, track_id, hymn_id, label, verses, gap_after_ms, auto_advance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      serviceId,
      nextPosition(serviceId),
      kind,
      body.trackId ?? null,
      body.hymnId ?? null,
      body.label ?? null,
      body.verses ?? null,
      body.gapAfterMs ?? 0,
      body.autoAdvance ? 1 : 0,
    );

    return reply.code(201).send(getService(serviceId));
  });

  app.patch('/:id/items/:itemId', async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const body = request.body as {
      position?: number;
      label?: string | null;
      verses?: string | null;
      trackId?: number | null;
      gapAfterMs?: number;
      autoAdvance?: boolean;
    };

    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    if (body.position !== undefined) { sets.push('position = ?'); params.push(body.position); }
    if (body.label !== undefined) { sets.push('label = ?'); params.push(body.label); }
    if (body.verses !== undefined) { sets.push('verses = ?'); params.push(body.verses); }
    if (body.trackId !== undefined) { sets.push('track_id = ?'); params.push(body.trackId); }
    if (body.gapAfterMs !== undefined) { sets.push('gap_after_ms = ?'); params.push(body.gapAfterMs); }
    if (body.autoAdvance !== undefined) { sets.push('auto_advance = ?'); params.push(body.autoAdvance ? 1 : 0); }
    if (sets.length === 0) return reply.code(400).send({ error: 'No updatable fields supplied' });

    params.push(Number(itemId), Number(id));
    const result = db
      .prepare(`UPDATE service_items SET ${sets.join(', ')} WHERE id = ? AND service_id = ?`)
      .run(...params);
    if (result.changes === 0) return reply.code(404).send({ error: 'Item not found' });

    return getService(Number(id));
  });

  /** Accepts the full ordered list of item ids after a drag-and-drop reorder. */
  app.put('/:id/order', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { itemIds?: number[] };
    if (!Array.isArray(body?.itemIds)) return reply.code(400).send({ error: 'itemIds array is required' });

    const stmt = db.prepare('UPDATE service_items SET position = ? WHERE id = ? AND service_id = ?');
    body.itemIds.forEach((itemId, index) => stmt.run((index + 1) * 1024, itemId, Number(id)));
    return getService(Number(id));
  });

  app.delete('/:id/items/:itemId', async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const result = db
      .prepare('DELETE FROM service_items WHERE id = ? AND service_id = ?')
      .run(Number(itemId), Number(id));
    if (result.changes === 0) return reply.code(404).send({ error: 'Item not found' });
    return getService(Number(id));
  });
};
