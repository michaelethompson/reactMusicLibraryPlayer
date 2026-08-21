import { usePlayer } from './PlayerProvider';
import { formatDuration, hymnReference } from '../../lib/format';

export function PlayerBar() {
  const { currentTrack, currentItem, isPlaying, currentTime, duration, toggle, stop, next, previous, seek } =
    usePlayer();

  const hymn = currentItem?.hymn ?? currentTrack?.hymns[0] ?? null;

  return (
    <footer className="player-bar">
      <div className="player-bar__now">
        {currentTrack ? (
          <>
            <strong>{hymn?.title ?? currentTrack.originalFilename}</strong>
            <span className="muted">
              {[hymn && hymnReference(hymn), currentTrack.tuneName, currentItem?.label]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        ) : (
          <span className="muted">Nothing loaded</span>
        )}
      </div>

      <div className="player-bar__transport">
        <button type="button" onClick={previous} disabled={!currentTrack || isPlaying} aria-label="Previous item">
          ⏮
        </button>
        <button
          type="button"
          className="primary"
          onClick={toggle}
          disabled={!currentTrack || isPlaying}
          aria-label="Play"
        >
          ▶
        </button>
        <button type="button" onClick={stop} disabled={!currentTrack} aria-label="Stop">
          ■
        </button>
        <button type="button" onClick={next} disabled={!currentTrack || isPlaying} aria-label="Next item">
          ⏭
        </button>
      </div>

      <div className="player-bar__scrub">
        <span className="mono">{formatDuration(currentTime * 1000)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.5}
          value={currentTime}
          onChange={(event) => seek(Number(event.target.value))}
          disabled={!currentTrack || duration === 0}
          aria-label="Seek"
        />
        <span className="mono">{formatDuration(duration * 1000)}</span>
      </div>
    </footer>
  );
}
