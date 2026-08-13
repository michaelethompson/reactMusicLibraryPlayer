import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Hymn, Track, Tune } from '@shared/types';
import { api, type ManagedHymnal } from '../../api/client';
import { usePlayer } from '../player/PlayerProvider';
import { copyrightLine, formatDuration, hymnReference, recordingLabel } from '../../lib/format';
import { HymnalManager } from './HymnalManager';
import { HymnEditor } from './HymnEditor';
import { RecordingReview } from './RecordingReview';

interface Props {
  onAddHymn: (hymn: Hymn) => void;
  canAdd: boolean;
}

interface EditorTarget {
  hymnId: number | null;
  track: Track | null;
}

export function LibraryView({ onAddHymn, canAdd }: Props) {
  const { playTrack, currentTrack } = usePlayer();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [hymns, setHymns] = useState<Hymn[]>([]);
  const [unfiled, setUnfiled] = useState<Track[]>([]);
  const [hymnals, setHymnals] = useState<ManagedHymnal[]>([]);
  const [tunes, setTunes] = useState<Tune[]>([]);
  const [query, setQuery] = useState('');
  const [hymnal, setHymnal] = useState('');
  const [tune, setTune] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHymnals, setShowHymnals] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [review, setReview] = useState<Track[] | null>(null);

  const filters = useMemo(() => ({ q: query, hymnal, tune }), [query, hymnal, tune]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextHymns, nextUnfiled, nextHymnals, nextTunes] = await Promise.all([
        api.hymns(filters),
        api.unfiled(),
        api.hymnals(),
        api.tunes(),
      ]);
      setHymns(nextHymns);
      setUnfiled(nextUnfiled);
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

  function toggle(hymnId: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(hymnId)) next.add(hymnId);
      return next;
    });
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus('Reading tags…');
    try {
      const { results, rejected } = await api.upload(Array.from(files));
      setStatus(
        [
          `${results.filter((r) => !r.duplicate).length} added`,
          results.some((r) => r.duplicate) && `${results.filter((r) => r.duplicate).length} already on disk`,
          rejected.length > 0 && `${rejected.length} rejected`,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      await refresh();
      // Every new file gets its tune, tempo, key and verse count confirmed.
      if (results.length > 0) setReview(results.map((result) => result.track));
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
      </div>

      {status && <p className="status">{status}</p>}

      <ul className="track-list">
        {hymns.map((hymn) => {
          const isOpen = expanded.has(hymn.id);
          return (
            <li key={hymn.id} className="track">
              <div className="track__ref mono">{hymnReference(hymn)}</div>
              <div className="track__body">
                <strong>{hymn.title}</strong>
                <span className="muted">
                  {[
                    hymn.primaryTuneName,
                    hymn.altTunes.length > 0 &&
                      `alt: ${hymn.altTunes.map((t) => t.name).join(', ')}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || <span className="muted">No tune named</span>}
                </span>
                {hymn.tracks.length === 0 ? (
                  <span className="warn small">⚠ No linked recording</span>
                ) : (
                  <button type="button" className="linkish small" onClick={() => toggle(hymn.id)}>
                    {isOpen ? '▾' : '▸'} {hymn.tracks.length} recording
                    {hymn.tracks.length === 1 ? '' : 's'}
                  </button>
                )}

                {isOpen && (
                  <ul className="recording-list">
                    {hymn.tracks.map((track) => (
                      <li key={track.id}>
                        <button
                          type="button"
                          onClick={() => playTrack(track)}
                          aria-label="Preview recording"
                          className={track.id === currentTrack?.id ? 'is-current' : undefined}
                        >
                          ▶
                        </button>
                        <span className="mono">{recordingLabel(track)}</span>
                        <span className="mono muted">{formatDuration(track.durationMs)}</span>
                        <span className="muted small">{copyrightLine(track)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="track__actions">
                <button type="button" onClick={() => setEditor({ hymnId: hymn.id, track: null })}>
                  Edit
                </button>
                <button type="button" onClick={() => onAddHymn(hymn)} disabled={!canAdd}>
                  Add
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {!loading && hymns.length === 0 && (
        <p className="empty">
          No hymns match. Add tagged audio and it will be filed by its HYMNAL and HYMN_NUMBER
          frames, or create a hymn and link a recording to it.
        </p>
      )}

      {unfiled.length > 0 && (
        <>
          <h3 className="section-heading">Unfiled recordings ({unfiled.length})</h3>
          <ul className="track-list track-list--short">
            {unfiled.map((track) => (
              <li key={track.id} className={track.id === currentTrack?.id ? 'track is-current' : 'track'}>
                <div className="track__body">
                  <strong className="small">{track.originalFilename}</strong>
                  <span className="muted small">{recordingLabel(track)}</span>
                </div>
                <div className="track__actions">
                  <span className="mono muted">{formatDuration(track.durationMs)}</span>
                  <button type="button" onClick={() => playTrack(track)} aria-label="Preview">
                    ▶
                  </button>
                  <button type="button" onClick={() => setReview([track])}>
                    Details
                  </button>
                  <button type="button" onClick={() => setEditor({ hymnId: null, track })}>
                    File…
                  </button>
                  <button
                    type="button"
                    className="danger"
                    aria-label="Delete recording"
                    onClick={() => void deleteTrack(track)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
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

      {review && (
        <RecordingReview
          tracks={review}
          tuneNames={tunes.map((item) => item.name)}
          onClose={() => setReview(null)}
          onSaved={() => void refresh()}
        />
      )}
    </section>
  );
}
