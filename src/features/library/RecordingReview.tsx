import { useState } from 'react';
import type { Track, TrackInput } from '@shared/types';
import { api } from '../../api/client';
import { Dialog } from '../../components/Dialog';
import { formatDuration } from '../../lib/format';

interface Props {
  tracks: Track[];
  tuneNames: string[];
  onClose: () => void;
  onSaved: () => void;
}

const KEYS = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
  'Am', 'Bm', 'Cm', 'Dm', 'Em', 'Fm', 'Gm',
];

type Draft = Required<Pick<TrackInput, 'tuneName' | 'tempoBpm' | 'musicKey' | 'verseCount' | 'arrangement'>>;

const draftOf = (track: Track): Draft => ({
  tuneName: track.tuneName ?? '',
  tempoBpm: track.tempoBpm,
  musicKey: track.musicKey ?? '',
  verseCount: track.verseCount,
  arrangement: track.arrangement ?? '',
});

/** Shown straight after upload so every recording is identified before it is filed. */
export function RecordingReview({ tracks, tuneNames, onClose, onSaved }: Props) {
  const [drafts, setDrafts] = useState<Record<number, Draft>>(
    Object.fromEntries(tracks.map((track) => [track.id, draftOf(track)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function field<K extends keyof Draft>(id: number, key: K, value: Draft[K]) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }

  async function saveAll() {
    setBusy(true);
    setError(null);
    try {
      for (const track of tracks) {
        await api.updateTrack(track.id, drafts[track.id]);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save recording details');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Identify ${tracks.length} recording${tracks.length === 1 ? '' : 's'}`} onClose={onClose} wide>
      {error && <p className="status status--error">{error}</p>}
      <p className="muted small">
        Tags supply what they can. Confirm the tune, tempo, key and verse count — these are what
        tell two recordings of the same hymn apart.
      </p>

      <datalist id="tune-names">
        {tuneNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="music-keys">
        {KEYS.map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>

      <table className="grid">
        <thead>
          <tr>
            <th>File</th>
            <th>Tune</th>
            <th>Tempo</th>
            <th>Key</th>
            <th>Verses</th>
            <th>Arrangement</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => {
            const draft = drafts[track.id];
            return (
              <tr key={track.id}>
                <td className="small">
                  <div>{track.originalFilename}</div>
                  <span className="mono muted">{formatDuration(track.durationMs)}</span>
                </td>
                <td>
                  <input
                    className="mono"
                    list="tune-names"
                    value={draft.tuneName ?? ''}
                    onChange={(event) => field(track.id, 'tuneName', event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={20}
                    max={300}
                    placeholder="bpm"
                    value={draft.tempoBpm ?? ''}
                    onChange={(event) =>
                      field(track.id, 'tempoBpm', event.target.value ? Number(event.target.value) : null)
                    }
                  />
                </td>
                <td>
                  <input
                    className="mono"
                    list="music-keys"
                    value={draft.musicKey ?? ''}
                    onChange={(event) => field(track.id, 'musicKey', event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={draft.verseCount ?? ''}
                    onChange={(event) =>
                      field(track.id, 'verseCount', event.target.value ? Number(event.target.value) : null)
                    }
                  />
                </td>
                <td>
                  <input
                    placeholder="organ, brass…"
                    value={draft.arrangement ?? ''}
                    onChange={(event) => field(track.id, 'arrangement', event.target.value)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer className="dialog__footer">
        <span className="spacer" />
        <button type="button" onClick={onClose}>
          Skip for now
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => void saveAll()}>
          Save details
        </button>
      </footer>
    </Dialog>
  );
}
