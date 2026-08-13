import { useEffect, useMemo, useRef, useState } from 'react';
import type { Hymnal, Track, Tune } from '@shared/types';
import { api } from '../../api/client';
import { usePlayer } from '../player/PlayerProvider';
import { copyrightLine, formatDuration, trackReference } from '../../lib/format';

interface Props {
  onAddTrack: (track: Track) => void;
  canAdd: boolean;
}

export function LibraryView({ onAddTrack, canAdd }: Props) {
  const { playTrack, currentTrack } = usePlayer();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [hymnals, setHymnals] = useState<Hymnal[]>([]);
  const [tunes, setTunes] = useState<Tune[]>([]);
  const [query, setQuery] = useState('');
  const [hymnal, setHymnal] = useState('');
  const [tune, setTune] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filters = useMemo(() => ({ q: query, hymnal, tune }), [query, hymnal, tune]);

  async function refresh() {
    setLoading(true);
    try {
      const [nextTracks, nextHymnals, nextTunes] = await Promise.all([
        api.tracks(filters),
        api.hymnals(),
        api.tunes(),
      ]);
      setTracks(nextTracks);
      setHymnals(nextHymnals);
      setTunes(nextTunes);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(refresh, query ? 200 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus('Reading tags…');
    try {
      const { results, rejected } = await api.upload(Array.from(files));
      const duplicates = results.filter((result) => result.duplicate).length;
      const problems = results.flatMap((result) => result.issues).filter((issue) => issue.severity === 'error');
      setStatus(
        [
          `${results.length - duplicates} added`,
          duplicates > 0 && `${duplicates} already in library`,
          problems.length > 0 && `${problems.length} need review`,
          rejected.length > 0 && `${rejected.length} rejected`,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Library</h2>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Add files…
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,audio/*"
          hidden
          onChange={(event) => void handleUpload(event.target.files)}
        />
      </header>

      <div className="filters">
        <input
          type="search"
          placeholder="Search title, first line, tune, or number"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={hymnal} onChange={(event) => setHymnal(event.target.value)}>
          <option value="">All hymnals</option>
          {hymnals.map((item) => (
            <option key={item.id} value={item.code}>
              {item.code}
            </option>
          ))}
        </select>
        <select value={tune} onChange={(event) => setTune(event.target.value)}>
          <option value="">All tunes</option>
          {tunes.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {status && <p className="status">{status}</p>}

      <ul className="track-list">
        {tracks.map((track) => (
          <li key={track.id} className={track.id === currentTrack?.id ? 'track is-current' : 'track'}>
            <div className="track__ref mono">{trackReference(track)}</div>
            <div className="track__body">
              <strong>{track.hymnTitle ?? track.originalFilename}</strong>
              <span className="muted">
                {[
                  track.tuneName,
                  track.tuneMeter,
                  track.arrangement,
                  track.altTunes.length > 0 && `alt: ${track.altTunes.join(', ')}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="muted small">{copyrightLine(track)}</span>
            </div>
            <div className="track__actions">
              <span className="mono muted">{formatDuration(track.durationMs)}</span>
              <button type="button" onClick={() => playTrack(track)} aria-label="Preview">
                ▶
              </button>
              <button type="button" onClick={() => onAddTrack(track)} disabled={!canAdd}>
                Add
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!loading && tracks.length === 0 && (
        <p className="empty">
          No tracks yet. Add tagged audio files and they will be filed by their HYMNAL and
          HYMN_NUMBER frames.
        </p>
      )}
    </section>
  );
}
