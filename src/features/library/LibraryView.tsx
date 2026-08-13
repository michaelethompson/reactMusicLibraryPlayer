import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryEntry, Track, Tune } from '@shared/types';
import { api, type ManagedHymnal } from '../../api/client';
import { usePlayer } from '../player/PlayerProvider';
import { copyrightLine, formatDuration, hymnReference } from '../../lib/format';
import { HymnalManager } from './HymnalManager';
import { HymnEditor } from './HymnEditor';

interface Props {
  onAddEntry: (entry: LibraryEntry) => void;
  canAdd: boolean;
}

interface EditorTarget {
  hymnId: number | null;
  track: Track | null;
}

export function LibraryView({ onAddEntry, canAdd }: Props) {
  const { playTrack, currentTrack } = usePlayer();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [hymnals, setHymnals] = useState<ManagedHymnal[]>([]);
  const [tunes, setTunes] = useState<Tune[]>([]);
  const [query, setQuery] = useState('');
  const [hymnal, setHymnal] = useState('');
  const [tune, setTune] = useState('');
  const [unfiled, setUnfiled] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHymnals, setShowHymnals] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const filters = useMemo(() => ({ q: query, hymnal, tune, unfiled }), [query, hymnal, tune, unfiled]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextEntries, nextHymnals, nextTunes] = await Promise.all([
        api.entries(filters),
        api.hymnals(),
        api.tunes(),
      ]);
      setEntries(nextEntries);
      setHymnals(nextHymnals);
      setTunes(nextTunes);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(refresh, query ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [refresh, query]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus('Reading tags…');
    try {
      const { results, rejected } = await api.upload(Array.from(files));
      const duplicates = results.filter((result) => result.duplicate).length;
      const problems = results
        .flatMap((result) => result.issues)
        .filter((issue) => issue.severity === 'error');
      setStatus(
        [
          `${results.length - duplicates} added`,
          duplicates > 0 && `${duplicates} already on disk`,
          problems.length > 0 && `${problems.length} need filing`,
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

  async function deleteTrack(track: Track) {
    if (!window.confirm(`Permanently delete ${track.originalFilename ?? 'this audio file'}?`)) return;
    try {
      await api.deleteTrack(track.id);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Delete failed');
    }
  }

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Library</h2>
        <button type="button" onClick={() => setShowHymnals(true)}>
          Hymnals…
        </button>
        <button
          type="button"
          disabled={hymnals.length === 0}
          title={hymnals.length === 0 ? 'Add a hymnal first' : 'Create a hymn'}
          onClick={() => setEditor({ hymnId: null, track: null })}
        >
          New hymn
        </button>
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
        <label className="auto">
          <input
            type="checkbox"
            checked={unfiled}
            onChange={(event) => setUnfiled(event.target.checked)}
          />
          unfiled only
        </label>
      </div>

      {status && <p className="status">{status}</p>}

      <ul className="track-list">
        {entries.map((entry) => {
          const { hymn, track } = entry;
          return (
            <li
              key={entry.id}
              className={track && track.id === currentTrack?.id ? 'track is-current' : 'track'}
            >
              <div className="track__ref mono">{hymnReference(hymn)}</div>
              <div className="track__body">
                <strong>{hymn?.title ?? track?.originalFilename}</strong>
                <span className="muted">
                  {[
                    track?.tuneName ?? hymn?.primaryTuneName,
                    track?.tuneMeter,
                    track?.arrangement,
                    hymn && hymn.altTunes.length > 0 &&
                      `alt: ${hymn.altTunes.map((t) => t.name).join(', ')}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="muted small">
                  {track ? copyrightLine(track) : 'No recording yet'}
                  {track && track.hymns.length > 1 && (
                    <span
                      className="chip chip--info"
                      title={track.hymns.map((h) => `${h.hymnalCode} ${h.numberRaw}`).join(', ')}
                    >
                      shared by {track.hymns.length} hymns
                    </span>
                  )}
                </span>
              </div>
              <div className="track__actions">
                <span className="mono muted">{formatDuration(track?.durationMs)}</span>
                <button
                  type="button"
                  onClick={() => track && playTrack(track)}
                  disabled={!track}
                  aria-label="Preview"
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={() => setEditor({ hymnId: hymn?.id ?? null, track })}
                  title={hymn ? 'Edit hymn details' : 'File this recording under a hymn'}
                >
                  {hymn ? 'Edit' : 'File…'}
                </button>
                <button
                  type="button"
                  onClick={() => onAddEntry(entry)}
                  disabled={!canAdd || !hymn || !track}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={!track || track.hymns.length > 0}
                  aria-label="Delete recording"
                  title={
                    track && track.hymns.length > 0
                      ? 'Unlink it from every hymn before deleting the audio'
                      : 'Delete this audio file'
                  }
                  onClick={() => track && void deleteTrack(track)}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {!loading && entries.length === 0 && (
        <p className="empty">
          Nothing here. Add tagged audio files and they will be filed by their HYMNAL and
          HYMN_NUMBER frames; anything untagged lands under “unfiled”.
        </p>
      )}

      {showHymnals && (
        <HymnalManager
          hymnals={hymnals}
          onChange={(next) => {
            setHymnals(next);
            void refresh();
          }}
          onClose={() => setShowHymnals(false)}
        />
      )}

      {editor && (
        <HymnEditor
          hymnId={editor.hymnId}
          hymnals={hymnals}
          initialTrack={editor.track}
          onClose={() => setEditor(null)}
          onSaved={() => void refresh()}
        />
      )}
    </section>
  );
}
