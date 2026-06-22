import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FFT_SIZE, SAMPLE_TRACK_URL } from "../config";

/**
 * Web Audio engine.
 *
 * Owns the single <audio> element, the AudioContext, and the AnalyserNode that
 * the 3D scene reads from every frame for the sonar wall + equalizer.
 *
 * Why refs over state: per-frame frequency data must NOT trigger React
 * re-renders. Components read `getFrequencyData()` inside their useFrame loop.
 * Only coarse UI state (isPlaying, duration, a throttled currentTime) lives in
 * React state for the player chrome.
 */

interface AudioContextValue {
  /** The underlying media element (read currentTime directly for tight sync). */
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  /** Throttled playback position (updated a few times per second) for the UI. */
  currentTime: number;
  duration: number;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  restart: () => void;
  /** Swap the audio source (e.g. when the player loads their own track). */
  setSource: (url: string) => void;
  /** Latest frequency magnitudes (0–255). Returns null before the graph exists. */
  getFrequencyData: () => Uint8Array | null;
}

const Ctx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Lazily create the <audio> element once.
  if (!audioRef.current && typeof Audio !== "undefined") {
    const el = new Audio(SAMPLE_TRACK_URL);
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    audioRef.current = el;
  }

  /**
   * Build the Web Audio graph: media element -> analyser -> destination.
   * Must run after a user gesture (browser autoplay policy), so we call it
   * from play().
   */
  const ensureGraph = useCallback(() => {
    if (contextRef.current || !audioRef.current) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    const source = ctx.createMediaElementSource(audioRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    contextRef.current = ctx;
    analyserRef.current = analyser;
    freqRef.current = new Uint8Array(analyser.frequencyBinCount);
  }, []);

  const play = useCallback(async () => {
    if (!audioRef.current) return;
    ensureGraph();
    if (contextRef.current?.state === "suspended") {
      await contextRef.current.resume();
    }
    await audioRef.current.play();
    setIsPlaying(true);
  }, [ensureGraph]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else void play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const restart = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
  }, []);

  // Swap the playing source. The Web Audio graph hangs off the <audio> element
  // (not the URL), so changing src keeps the analyser wired up.
  const setSource = useCallback((url: string) => {
    const el = audioRef.current;
    if (!el || el.src === url) return;
    el.pause();
    el.src = url;
    el.load();
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, []);

  const getFrequencyData = useCallback((): Uint8Array | null => {
    if (!analyserRef.current || !freqRef.current) return null;
    analyserRef.current.getByteFrequencyData(freqRef.current);
    return freqRef.current;
  }, []);

  // Wire up element events: duration, throttled time, end-of-track.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onLoaded = () => setDuration(el.duration || 0);
    const onEnded = () => setIsPlaying(false);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("ended", onEnded);

    // Throttle UI time updates to ~5/sec; the 3D layer reads currentTime raw.
    const interval = window.setInterval(() => {
      if (!el.paused) setCurrentTime(el.currentTime);
    }, 200);

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("ended", onEnded);
      window.clearInterval(interval);
      // Release audio resources on unmount / hot reload.
      el.pause();
      el.removeAttribute("src");
      el.load();
      analyserRef.current?.disconnect();
      void contextRef.current?.close();
    };
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      audioRef,
      isPlaying,
      currentTime,
      duration,
      play,
      pause,
      toggle,
      seek,
      restart,
      setSource,
      getFrequencyData,
    }),
    [isPlaying, currentTime, duration, play, pause, toggle, seek, restart, setSource, getFrequencyData],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudio(): AudioContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudio must be used within an AudioProvider");
  return ctx;
}
