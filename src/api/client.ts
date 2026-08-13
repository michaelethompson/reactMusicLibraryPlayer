import type {
  Hymnal,
  IngestResult,
  Service,
  ServiceDetail,
  ServiceItemKind,
  Track,
  Tune,
} from '@shared/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `Request failed: ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  tracks(params: { q?: string; hymnal?: string; tune?: string } = {}) {
    const search = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value) as [string, string][],
    );
    return request<Track[]>(`/api/library/tracks?${search}`);
  },

  hymnals: () => request<Hymnal[]>('/api/library/hymnals'),
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
    item: { kind: ServiceItemKind; trackId?: number; label?: string; verses?: string },
  ) =>
    request<ServiceDetail>(`/api/services/${serviceId}/items`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  updateItem: (
    serviceId: number,
    itemId: number,
    patch: { label?: string; verses?: string; autoAdvance?: boolean; gapAfterMs?: number },
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
