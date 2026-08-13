import type {
  Hymn,
  Hymnal,
  HymnInput,
  HymnalInput,
  IngestResult,
  Service,
  ServiceDetail,
  ServiceItemKind,
  Track,
  TrackInput,
  Tune,
} from '@shared/types';

export type ManagedHymnal = Hymnal & { hymnCount: number; aliases: string[] };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Fastify rejects a JSON content-type with an empty body, so only set it when sending one.
  if (init?.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `Request failed: ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  hymns(params: { q?: string; hymnal?: string; tune?: string } = {}) {
    const search = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value) as [string, string][],
    );
    return request<Hymn[]>(`/api/library/hymns?${search}`);
  },

  unfiled: () => request<Track[]>('/api/library/unfiled'),

  tracks: () => request<Track[]>('/api/library/tracks'),
  updateTrack: (id: number, patch: TrackInput) =>
    request<Track>(`/api/library/tracks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTrack: (id: number) => request<void>(`/api/library/tracks/${id}`, { method: 'DELETE' }),

  hymnals: () => request<ManagedHymnal[]>('/api/library/hymnals'),
  createHymnal: (input: HymnalInput) =>
    request<ManagedHymnal[]>('/api/library/hymnals', { method: 'POST', body: JSON.stringify(input) }),
  updateHymnal: (id: number, patch: Partial<HymnalInput>) =>
    request<ManagedHymnal[]>(`/api/library/hymnals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteHymnal: (id: number) =>
    request<ManagedHymnal[]>(`/api/library/hymnals/${id}`, { method: 'DELETE' }),
  addAlias: (id: number, alias: string) =>
    request<ManagedHymnal[]>(`/api/library/hymnals/${id}/aliases`, {
      method: 'POST',
      body: JSON.stringify({ alias }),
    }),
  removeAlias: (id: number, alias: string) =>
    request<ManagedHymnal[]>(
      `/api/library/hymnals/${id}/aliases/${encodeURIComponent(alias)}`,
      { method: 'DELETE' },
    ),

  hymn: (id: number) => request<Hymn>(`/api/library/hymns/${id}`),
  createHymn: (input: HymnInput) =>
    request<Hymn>('/api/library/hymns', { method: 'POST', body: JSON.stringify(input) }),
  updateHymn: (id: number, patch: Partial<HymnInput>) =>
    request<Hymn>(`/api/library/hymns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteHymn: (id: number) => request<void>(`/api/library/hymns/${id}`, { method: 'DELETE' }),
  linkTrack: (hymnId: number, trackId: number) =>
    request<Hymn>(`/api/library/hymns/${hymnId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    }),
  unlinkTrack: (hymnId: number, trackId: number) =>
    request<Hymn>(`/api/library/hymns/${hymnId}/tracks/${trackId}`, { method: 'DELETE' }),

  tunes: () => request<Tune[]>('/api/library/tunes'),

  upload(files: File[]) {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return request<{ results: IngestResult[]; rejected: Array<{ filename: string; reason: string }> }>(
      '/api/upload',
      { method: 'POST', body: form },
    );
  },

  services: () => request<Service[]>('/api/services'),
  service: (id: number) => request<ServiceDetail>(`/api/services/${id}`),

  createService: (title: string, serviceDate: string | null) =>
    request<ServiceDetail>('/api/services', {
      method: 'POST',
      body: JSON.stringify({ title, serviceDate }),
    }),

  addItem: (
    serviceId: number,
    item: {
      kind: ServiceItemKind;
      hymnId?: number;
      trackId?: number | null;
      label?: string;
    },
  ) =>
    request<ServiceDetail>(`/api/services/${serviceId}/items`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  updateItem: (
    serviceId: number,
    itemId: number,
    patch: {
      label?: string | null;
      trackId?: number | null;
      autoAdvance?: boolean;
      gapAfterMs?: number;
    },
  ) =>
    request<ServiceDetail>(`/api/services/${serviceId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  reorder: (serviceId: number, itemIds: number[]) =>
    request<ServiceDetail>(`/api/services/${serviceId}/order`, {
      method: 'PUT',
      body: JSON.stringify({ itemIds }),
    }),

  removeItem: (serviceId: number, itemId: number) =>
    request<ServiceDetail>(`/api/services/${serviceId}/items/${itemId}`, { method: 'DELETE' }),
};

export const mediaUrl = (track: Track) => `/media/${track.storagePath}`;
