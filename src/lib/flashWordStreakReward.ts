export const STREAK_MESSAGE_MS = 4500;

/** Same clip playback as in-game streak rewards. */
export function playFlashWordStreakAudio(url: string): HTMLAudioElement {
  const audio = new Audio(url);
  audio.volume = 1;
  void audio.play().catch(() => undefined);
  return audio;
}

export function stopFlashWordStreakAudio(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}
