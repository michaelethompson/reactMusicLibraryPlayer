import { useEffect, useState } from 'react';
import type { Hymn, HymnInput, Track, Tune } from '@shared/types';
import { api, type ManagedHymnal } from '../../api/client';
import { Dialog } from '../../components/Dialog';
import { formatDuration, recordingLabel } from '../../lib/format';

interface Props {
  hymnId: number | null;
  hymnals: ManagedHymnal[];
  /** Pre-selects a recording to link when filing an unfiled upload. */
  initialTrack?: Track | null;
  onClose: () => void;
  onSaved: () => void;
}

type Draft = Omit<HymnInput, 'altTuneNames'> & { altTuneNames: string };

const emptyDraft = (hymnalId: number): Draft => ({
  hymnalId,
  numberRaw: '',
  title: '',
  firstLine: '',
  textAuthor: '',
  primaryTuneName: '',
  altTuneNames: '',
});

export function HymnEditor({ hymnId, hymnals, initialTrack, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(emptyDraft(hymnals[0]?.id ?? 0));
  const [detail, setDetail] = useState<Hymn | null>(null);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [tunes, setTunes] = useState<Tune[]>([]);
  const [pickTrack, setPickTrack] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.tracks().then(setAllTracks).catch(() => setAllTracks([]));
    api.tunes().then(setTunes).catch(() => setTunes([]));
  }, []);

  useEffect(() => {
    if (hymnId === null) return;
    api
      .hymn(hymnId)
      .then((hymn) => {
        setDetail(hymn);
        setDraft({
          hymnalId: hymn.hymnalId,
          numberRaw: hymn.numberRaw,
          title: hymn.title,
          firstLine: hymn.firstLine ?? '',
          textAuthor: hymn.textAuthor ?? '',
          primaryTuneName: hymn.primaryTuneName ?? '',
          altTuneNames: hymn.altTunes.map((tune) => tune.name).join(', '),
        });
      })
      .catch((err: Error) => setError(err.message));
  }, [hymnId]);

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function guard(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const payload: HymnInput = {
      ...draft,
      altTuneNames: draft.altTuneNames
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    };

    const ok = await guard(async () => {
      if (hymnId === null) {
        const created = await api.createHymn(payload);
        if (initialTrack) await api.linkTrack(created.id, initialTrack.id);
      } else {
        await api.updateHymn(hymnId, payload);
      }
    });
    if (ok) {
      onSaved();
      onClose();
    }
  }

  async function remove() {
    if (hymnId === null) return;
    const ok = await guard(() => api.deleteHymn(hymnId));
    if (ok) {
      onSaved();
      onClose();
    }
  }

  const linked = detail?.tracks ?? [];
  const linkable = allTracks.filter((track) => !linked.some((t) => t.id === track.id));

  return (
    <Dialog title={hymnId === null ? 'New hymn' : 'Edit hymn'} onClose={onClose} wide>
      {error && <p className="status status--error">{error}</p>}

      <datalist id="tune-names">
        {tunes.map((item) => (
          <option key={item.id} value={item.name} />
        ))}
      </datalist>

      <div className="form-grid">
        <label>
          Hymnal
          <select
            value={draft.hymnalId}
            onChange={(event) => field('hymnalId', Number(event.target.value))}
          >
            {hymnals.map((hymnal) => (
              <option key={hymnal.id} value={hymnal.id}>
                {hymnal.code} — {hymnal.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Number
          <input
            className="mono"
            value={draft.numberRaw}
            placeholder="507, 151a, S 280"
            onChange={(event) => field('numberRaw', event.target.value)}
          />
        </label>
        <label className="span-2">
          Title
          <input value={draft.title} onChange={(event) => field('title', event.target.value)} />
        </label>
        <label className="span-2">
          First line
          <input
            value={draft.firstLine ?? ''}
            onChange={(event) => field('firstLine', event.target.value)}
          />
        </label>
        <label>
          Text author
          <input
            value={draft.textAuthor ?? ''}
            onChange={(event) => field('textAuthor', event.target.value)}
          />
        </label>
        <label>
          Tune
          <input
            className="mono"
            list="tune-names"
            value={draft.primaryTuneName ?? ''}
            onChange={(event) => field('primaryTuneName', event.target.value)}
          />
        </label>
        <label className="span-2">
          Alternate tunes
          <input
            className="mono"
            placeholder="ST. DENIO, WONDROUS LOVE"
            value={draft.altTuneNames}
            onChange={(event) => field('altTuneNames', event.target.value)}
          />
        </label>
      </div>

      {hymnId !== null && (
        <>
          <h3>Recordings</h3>
          <p className="muted small">
            A recording can be filed under several hymns; unlinking here leaves the audio in the
            library.
          </p>
          <ul className="link-list">
            {linked.map((track) => (
              <li key={track.id}>
                <span className="mono">{recordingLabel(track)}</span>
                <span className="muted">{track.originalFilename}</span>
                <span className="mono muted">{formatDuration(track.durationMs)}</span>
                <span className="muted small">
                  {track.hymns.length > 1 ? `also under ${track.hymns.length - 1} other` : ''}
                </span>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    void guard(async () => {
                      setDetail(await api.unlinkTrack(hymnId, track.id));
                      onSaved();
                    })
                  }
                >
                  Unlink
                </button>
              </li>
            ))}
            {linked.length === 0 && <li className="muted">No recordings linked yet.</li>}
          </ul>

          <div className="filters">
            <select value={pickTrack} onChange={(event) => setPickTrack(event.target.value)}>
              <option value="">Link an existing recording…</option>
              {linkable.map((track) => (
                <option key={track.id} value={track.id}>
                  {recordingLabel(track)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!pickTrack || busy}
              onClick={() =>
                void guard(async () => {
                  setDetail(await api.linkTrack(hymnId, Number(pickTrack)));
                  setPickTrack('');
                  onSaved();
                })
              }
            >
              Link
            </button>
          </div>
        </>
      )}

      <footer className="dialog__footer">
        {hymnId !== null && (
          <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>
            Delete hymn
          </button>
        )}
        <span className="spacer" />
        <button type="button" onClick={onClose}>
          Done
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !draft.title.trim() || !draft.numberRaw.trim() || !draft.hymnalId}
          onClick={() => void save()}
        >
          Save
        </button>
      </footer>
    </Dialog>
  );
}
