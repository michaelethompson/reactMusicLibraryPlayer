import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Service, ServiceDetail, ServiceItem } from '@shared/types';
import { api } from '../../api/client';
import { usePlayer } from '../player/PlayerProvider';
import { formatDuration, hymnReference, recordingLabel } from '../../lib/format';

interface Props {
  services: Service[];
  service: ServiceDetail | null;
  onSelect: (id: number) => void;
  onCreated: (detail: ServiceDetail) => void;
  onChanged: (detail: ServiceDetail) => void;
}

function SortableRow({
  item,
  index,
  onLabel,
  onPickTrack,
  onRemove,
  onToggleAuto,
}: {
  item: ServiceItem;
  index: number;
  onLabel: (label: string) => void;
  onPickTrack: (trackId: number | null) => void;
  onRemove: () => void;
  onToggleAuto: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const { playIndex, currentItem, isPlaying } = usePlayer();
  const [label, setLabel] = useState(item.label ?? '');
  const isCurrent = currentItem?.id === item.id;
  const recordings = item.hymn?.tracks ?? [];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={isCurrent ? 'service-item is-current' : 'service-item'}
    >
      <button type="button" className="grip" {...attributes} {...listeners} aria-label="Reorder">
        ⠿
      </button>

      <div className="service-item__body">
        <input
          className="item-label"
          placeholder="Opening Hymn"
          aria-label="Item heading"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => label !== (item.label ?? '') && onLabel(label)}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
        <strong>{item.hymn?.title ?? item.track?.originalFilename ?? '—'}</strong>
        <span className="muted small">{item.hymn ? hymnReference(item.hymn) : 'No hymn'}</span>

        {item.hymn &&
          (recordings.length === 0 ? (
            <span className="warn small">⚠ No recording linked to this hymn</span>
          ) : (
            <select
              className="tune-picker"
              aria-label="Tune"
              value={item.trackId ?? ''}
              onChange={(event) =>
                onPickTrack(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">Choose a tune…</option>
              {recordings.map((track) => (
                <option key={track.id} value={track.id}>
                  {recordingLabel(track)}
                </option>
              ))}
            </select>
          ))}
      </div>

      <div className="service-item__actions">
        <span className="mono muted">{formatDuration(item.track?.durationMs)}</span>
        <label className="auto" title="Automatically start the next item when this one ends">
          <input type="checkbox" checked={item.autoAdvance} onChange={onToggleAuto} />
          auto
        </label>
        <button type="button" onClick={() => playIndex(index)} disabled={!item.track || isPlaying}>
          ▶
        </button>
        <button type="button" className="danger" onClick={onRemove} aria-label="Remove item">
          ✕
        </button>
      </div>
    </li>
  );
}

export function ServiceView({ services, service, onSelect, onCreated, onChanged }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!service || !over || active.id === over.id) return;
    const oldIndex = service.items.findIndex((item) => item.id === active.id);
    const newIndex = service.items.findIndex((item) => item.id === over.id);
    const reordered = arrayMove(service.items, oldIndex, newIndex);
    onChanged({ ...service, items: reordered });
    onChanged(await api.reorder(service.id, reordered.map((item) => item.id)));
  }

  async function handleCreate() {
    if (!title.trim()) return;
    onCreated(await api.createService(title.trim(), date || null));
    setTitle('');
    setDate('');
  }

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Service order</h2>
        <select value={service?.id ?? ''} onChange={(event) => onSelect(Number(event.target.value))}>
          <option value="" disabled>
            Select a service
          </option>
          {services.map((item) => (
            <option key={item.id} value={item.id}>
              {item.serviceDate ? `${item.serviceDate} — ${item.title}` : item.title}
            </option>
          ))}
        </select>
        {service && (
          <a
            className="button-link"
            href={`#/perform/${service.id}`}
            target="_blank"
            rel="noreferrer"
            title="Open the read-only running order, e.g. on the console screen"
          >
            Service view ↗
          </a>
        )}
      </header>

      <div className="filters">
        <input
          placeholder="New service title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <button type="button" onClick={() => void handleCreate()} disabled={!title.trim()}>
          Create
        </button>
      </div>

      {!service && <p className="empty">Create or select a service to build its order.</p>}

      {service && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={service.items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="service-list">
              {service.items.map((item, index) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  index={index}
                  onLabel={async (label) =>
                    onChanged(await api.updateItem(service.id, item.id, { label }))
                  }
                  onPickTrack={async (trackId) =>
                    onChanged(await api.updateItem(service.id, item.id, { trackId }))
                  }
                  onRemove={async () => onChanged(await api.removeItem(service.id, item.id))}
                  onToggleAuto={async () =>
                    onChanged(
                      await api.updateItem(service.id, item.id, { autoAdvance: !item.autoAdvance }),
                    )
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {service && service.items.length === 0 && (
        <p className="empty">Empty. Add hymns from the library on the left.</p>
      )}
    </section>
  );
}
