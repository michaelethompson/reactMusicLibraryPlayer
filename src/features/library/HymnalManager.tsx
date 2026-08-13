import { useState } from 'react';
import type { HymnalInput } from '@shared/types';
import { api, type ManagedHymnal } from '../../api/client';
import { Dialog } from '../../components/Dialog';

interface Props {
  hymnals: ManagedHymnal[];
  onChange: (hymnals: ManagedHymnal[]) => void;
  onClose: () => void;
}

const BLANK: HymnalInput = { code: '', title: '', publisher: '', year: null };

export function HymnalManager({ hymnals, onChange, onClose }: Props) {
  const [draft, setDraft] = useState<HymnalInput>(BLANK);
  const [editing, setEditing] = useState<number | null>(null);
  const [aliasDraft, setAliasDraft] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ManagedHymnal[]>) {
    setError(null);
    try {
      onChange(await action());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    }
  }

  async function create() {
    if (await run(() => api.createHymnal(draft))) setDraft(BLANK);
  }

  return (
    <Dialog title="Hymnals" onClose={onClose} wide>
      {error && <p className="status status--error">{error}</p>}

      <table className="grid">
        <thead>
          <tr>
            <th>Code</th>
            <th>Title</th>
            <th>Publisher</th>
            <th>Year</th>
            <th>Hymns</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {hymnals.map((hymnal) => {
            const isEditing = editing === hymnal.id;
            return (
              <tr key={hymnal.id}>
                <td>
                  {isEditing ? (
                    <input
                      defaultValue={hymnal.code}
                      className="mono"
                      size={8}
                      onBlur={(event) =>
                        void run(() => api.updateHymnal(hymnal.id, { code: event.target.value }))
                      }
                    />
                  ) : (
                    <span className="mono">{hymnal.code}</span>
                  )}
                  <div className="aliases">
                    {hymnal.aliases.map((alias) => (
                      <button
                        key={alias}
                        type="button"
                        className="chip"
                        title="Remove alias"
                        onClick={() => void run(() => api.removeAlias(hymnal.id, alias))}
                      >
                        {alias} ✕
                      </button>
                    ))}
                    <input
                      className="chip-input"
                      placeholder="+ alias"
                      value={aliasDraft[hymnal.id] ?? ''}
                      onChange={(event) =>
                        setAliasDraft((current) => ({ ...current, [hymnal.id]: event.target.value }))
                      }
                      onKeyDown={async (event) => {
                        if (event.key !== 'Enter') return;
                        const value = (aliasDraft[hymnal.id] ?? '').trim();
                        if (!value) return;
                        if (await run(() => api.addAlias(hymnal.id, value))) {
                          setAliasDraft((current) => ({ ...current, [hymnal.id]: '' }));
                        }
                      }}
                    />
                  </div>
                </td>
                <td>
                  {isEditing ? (
                    <input
                      defaultValue={hymnal.title}
                      onBlur={(event) =>
                        void run(() => api.updateHymnal(hymnal.id, { title: event.target.value }))
                      }
                    />
                  ) : (
                    hymnal.title
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      defaultValue={hymnal.publisher ?? ''}
                      onBlur={(event) =>
                        void run(() => api.updateHymnal(hymnal.id, { publisher: event.target.value }))
                      }
                    />
                  ) : (
                    (hymnal.publisher ?? <span className="muted">—</span>)
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      type="number"
                      size={5}
                      defaultValue={hymnal.year ?? ''}
                      onBlur={(event) =>
                        void run(() =>
                          api.updateHymnal(hymnal.id, {
                            year: event.target.value ? Number(event.target.value) : null,
                          }),
                        )
                      }
                    />
                  ) : (
                    (hymnal.year ?? <span className="muted">—</span>)
                  )}
                </td>
                <td className="mono">{hymnal.hymnCount}</td>
                <td className="row-actions">
                  <button type="button" onClick={() => setEditing(isEditing ? null : hymnal.id)}>
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={hymnal.hymnCount > 0}
                    title={
                      hymnal.hymnCount > 0
                        ? 'Delete or move its hymns first'
                        : 'Delete this hymnal'
                    }
                    onClick={() => void run(() => api.deleteHymnal(hymnal.id))}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Add a hymnal</h3>
      <div className="filters">
        <input
          className="mono"
          size={8}
          placeholder="CODE"
          value={draft.code}
          onChange={(event) => setDraft({ ...draft, code: event.target.value })}
        />
        <input
          placeholder="Full title"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
        <input
          placeholder="Publisher"
          value={draft.publisher ?? ''}
          onChange={(event) => setDraft({ ...draft, publisher: event.target.value })}
        />
        <input
          type="number"
          size={5}
          placeholder="Year"
          value={draft.year ?? ''}
          onChange={(event) =>
            setDraft({ ...draft, year: event.target.value ? Number(event.target.value) : null })
          }
        />
        <button
          type="button"
          className="primary"
          disabled={!draft.code.trim() || !draft.title.trim()}
          onClick={() => void create()}
        >
          Add
        </button>
      </div>
      <p className="muted small">
        Aliases fold the messy hymnal names found in tags onto one code, so “Lutheran Service
        Book” and “LSB” file to the same place on ingest.
      </p>
    </Dialog>
  );
}
