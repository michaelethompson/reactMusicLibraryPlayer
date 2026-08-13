import { useCallback, useEffect, useState } from 'react';
import type { Hymn, Service, ServiceDetail } from '@shared/types';
import { api } from './api/client';
import { LibraryView } from './features/library/LibraryView';
import { ServiceView } from './features/service/ServiceView';
import { PlayerBar } from './features/player/PlayerBar';
import { usePlayer } from './features/player/PlayerProvider';

export function App() {
  const { setQueue } = usePlayer();
  const [services, setServices] = useState<Service[]>([]);
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.services().then(setServices).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    setQueue(service?.items ?? []);
  }, [service, setQueue]);

  const selectService = useCallback((id: number) => {
    api.service(id).then(setService).catch((err: Error) => setError(err.message));
  }, []);

  const handleCreated = useCallback((detail: ServiceDetail) => {
    setServices((current) => [detail, ...current]);
    setService(detail);
  }, []);

  const addHymn = useCallback(
    async (hymn: Hymn) => {
      if (!service) return;
      if (
        hymn.tracks.length === 0 &&
        !window.confirm(
          `${hymn.hymnalCode} ${hymn.numberRaw} “${hymn.title}” has no linked recording, so nothing will play for it.\n\nAdd it to the service anyway?`,
        )
      ) {
        return;
      }
      try {
        setService(await api.addItem(service.id, { kind: 'hymn', hymnId: hymn.id }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add item');
      }
    },
    [service],
  );

  return (
    <div className="app">
      <header className="app__header">
        <h1>Service Music Library</h1>
        {error && <span className="status status--error">{error}</span>}
      </header>

      <main className="app__main">
        <LibraryView onAddHymn={(hymn) => void addHymn(hymn)} canAdd={service !== null} />
        <ServiceView
          services={services}
          service={service}
          onSelect={selectService}
          onCreated={handleCreated}
          onChanged={setService}
        />
      </main>

      <PlayerBar />
    </div>
  );
}
