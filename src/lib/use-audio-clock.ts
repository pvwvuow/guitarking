"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/** highlight a hair ahead of the sound so the eye lands ON the beat */
export const VISUAL_LEAD = 0.06;

/** Frame-accurate playback clock.
    `timeupdate` only fires ~4x per second, which made the sheet jump in
    chunks and chords switch late; this follows the audio every animation
    frame while playing. */
export function useAudioClock(
  audioRef: RefObject<HTMLAudioElement | null>,
  src?: string
) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (src && a.getAttribute("src") !== src) a.src = src;
    let raf = 0;
    const read = () => setTime(a.currentTime);
    const loop = () => {
      read();
      if (!a.paused && !a.ended) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      read();
    };
    const meta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    a.addEventListener("play", start);
    a.addEventListener("playing", start);
    a.addEventListener("pause", stop);
    a.addEventListener("ended", stop);
    a.addEventListener("seeked", read);
    a.addEventListener("loadedmetadata", meta);
    a.addEventListener("durationchange", meta);
    meta();
    if (!a.paused) start();
    return () => {
      cancelAnimationFrame(raf);
      a.removeEventListener("play", start);
      a.removeEventListener("playing", start);
      a.removeEventListener("pause", stop);
      a.removeEventListener("ended", stop);
      a.removeEventListener("seeked", read);
      a.removeEventListener("loadedmetadata", meta);
      a.removeEventListener("durationchange", meta);
    };
  }, [audioRef, src]);

  const seekTo = useCallback(
    (sec: number) => {
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = sec;
      setTime(sec);
    },
    [audioRef]
  );

  return { time, playing, duration, seekTo };
}
