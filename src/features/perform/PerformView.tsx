import { useCallback, useEffect, useState } from 'react';
import type { Service, ServiceDetail } from '@shared/types';
import { api } from '../../api/client';
import { usePlayer } from '../player/PlayerProvider';
import { PlayerBar } from '../player/PlayerBar';
import { formatDuration, hymnReference, recordingLabel } from '../../lib/format';

interface Props {
  serviceId: number | null;
}

/** Read-only running order for use during the service: play it, but never edit it. */
export function PerformView({ serviceId }: Props) {
  const { setQueue, playIndex, toggle, currentItem, isPlaying } = usePlayer();
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (serviceId === null) {
      try {
        setServices(await api.services());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load services');
      }
      return;
    }
    try {
      setService(await api.service(serviceId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the service');
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pick up edits made in the planner window without a manual reload.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  useEffect(() => {
    setQueue(service?.items ?? []);
  }, [service, setQueue]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || target?.closest('button, input, select, textarea')) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  if (serviceId === null) {
    return (
      <div className="perform perform--picker">
        <header className="perform__header">
          <h1>Service view</h1>
          <a className="button-link" href="#/">
            Planner
          </a>
        </header>
        {error && <p className="status status--error">{error}</p>}
        <ul className="perform-list">
          {services.map((item) => (
            <li key={item.id}>
              <a className="perform-item perform-item--pick" href={`#/perform/${item.id}`}>
                <span className="perform-item__title">{item.title}</span>
                <span className="muted">{item.serviceDate ?? ''}</span>
              </a>
            </li>
          ))}
        </ul>
        {services.length === 0 && <p className="empty">No services have been planned yet.</p>}
      </div>
    );
  }

  return (
    <div className="perform">
      <header className="perform__header">
        <div>
          <h1>{service?.title ?? 'Service'}</h1>
          <span className="muted">
            {[service?.serviceDate, service?.liturgicalDay].filter(Boolean).join(' · ')}
          </span>
        </div>
        <span className="spacer" />
        <button type="button" onClick={() => void load()}>
          Refresh
        </button>
        <a className="button-link" href="#/">
          Planner
        </a>
      </header>

      {error && <p className="status status--error">{error}</p>}

      <ol className="perform-list">
        {service?.items.map((item, index) => {
          const isCurrent = currentItem?.id === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={isCurrent ? 'perform-item is-current' : 'perform-item'}
                disabled={!item.track || isPlaying}
                onClick={() => playIndex(index)}
              >
                <span className="perform-item__index mono">
                  {isCurrent && isPlaying ? '▶' : index + 1}
                </span>
                <span className="perform-item__main">
                  {item.label && <span className="perform-item__label">{item.label}</span>}
                  <span className="perform-item__title">
                    {item.hymn?.title ?? item.track?.originalFilename ?? '—'}
                  </span>
                  <span className="perform-item__meta">
                    {item.hymn && <span className="mono">{hymnReference(item.hymn)}</span>}
                    {item.track ? (
                      <span>{recordingLabel(item.track)}</span>
                    ) : (
                      <span className="warn">⚠ No recording selected</span>
                    )}
                  </span>
                </span>
                <span className="perform-item__time mono">
                  {formatDuration(item.track?.durationMs)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {service?.items.length === 0 && <p className="empty">This service has no items yet.</p>}

      <PlayerBar />
    </div>
  );
}
