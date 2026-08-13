import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ServiceItem, Track } from '@shared/types';
import { mediaUrl } from '../../api/client';

interface PlayerState {
  queue: ServiceItem[];
  currentIndex: number;
  currentItem: ServiceItem | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  setQueue: (items: ServiceItem[]) => void;
  playIndex: (index: number) => void;
  playTrack: (track: Track) => void;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
}

const PlayerContext = createContext<PlayerState | null>(null);

/**
 * One long-lived <audio> element lives here for the whole app. Mounting an
 * element per row is the usual source of stutter and double playback.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const advanceTimer = useRef<number | null>(null);

  const [queue, setQueueState] = useState<ServiceItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [previewTrack, setPreviewTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const currentItem = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;
  const currentTrack = previewTrack ?? currentItem?.track ?? null;

  const currentItemIdRef = useRef<number | null>(null);
  useEffect(() => {
    currentItemIdRef.current = currentItem?.id ?? null;
  }, [currentItem]);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  const load = useCallback(
    (track: Track | null, autoplay: boolean) => {
      const audio = audioRef.current;
      if (!audio) return;
      clearAdvanceTimer();

      if (!track) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        return;
      }

      const url = mediaUrl(track);
      if (audio.src !== new URL(url, window.location.href).href) {
        audio.src = url;
        audio.load();
      }
      if (autoplay) void audio.play().catch(() => setIsPlaying(false));
    },
    [clearAdvanceTimer],
  );

  const playIndex = useCallback(
    (index: number) => {
      const item = queue[index];
      if (!item?.track) return;
      setPreviewTrack(null);
      setCurrentIndex(index);
      load(item.track, true);
    },
    [queue, load],
  );

  const playTrack = useCallback(
    (track: Track) => {
      setCurrentIndex(-1);
      setPreviewTrack(track);
      load(track, true);
    },
    [load],
  );

  const next = useCallback(() => {
    const upcoming = queue.findIndex((item, index) => index > currentIndex && item.track !== null);
    if (upcoming !== -1) playIndex(upcoming);
  }, [queue, currentIndex, playIndex]);

  const previous = useCallback(() => {
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      if (queue[index]?.track) {
        playIndex(index);
        return;
      }
    }
  }, [queue, currentIndex, playIndex]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    clearAdvanceTimer();
    if (audio.paused) void audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [currentTrack, clearAdvanceTimer]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    clearAdvanceTimer();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
  }, [clearAdvanceTimer]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration)) audio.currentTime = seconds;
  }, []);

  const setQueue = useCallback(
    (items: ServiceItem[]) => {
      setQueueState(items);

      // Follow the playing item by id so a reorder does not leave the index
      // pointing at a different hymn.
      const playingId = currentItemIdRef.current;
      if (playingId === null) return;
      const next = items.findIndex((item) => item.id === playingId);
      setCurrentIndex(next);
      if (next === -1) load(null, false);
    },
    [load],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => {
      setIsPlaying(false);
      // Nothing may start on its own unless the operator opted in for this item.
      if (!currentItem?.autoAdvance) return;
      advanceTimer.current = window.setTimeout(next, currentItem.gapAfterMs ?? 0);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
    };
  }, [currentItem, next]);

  useEffect(() => clearAdvanceTimer, [clearAdvanceTimer]);

  const value = useMemo<PlayerState>(
    () => ({
      queue,
      currentIndex,
      currentItem,
      currentTrack,
      isPlaying,
      currentTime,
      duration,
      setQueue,
      playIndex,
      playTrack,
      toggle,
      stop,
      next,
      previous,
      seek,
    }),
    [
      queue, currentIndex, currentItem, currentTrack, isPlaying, currentTime, duration,
      setQueue, playIndex, playTrack, toggle, stop, next, previous, seek,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" />
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used inside a PlayerProvider');
  return context;
}
