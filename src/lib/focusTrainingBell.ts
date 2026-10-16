const BELL_VOLUME = 0.22;
const BELL_COOLDOWN_MS = 700;

let bellCtx: AudioContext | null = null;
let lastBellAt = 0;

function getBellContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!bellCtx) {
    bellCtx = new Ctor();
  }
  return bellCtx;
}

function isAudioMuted(): boolean {
  if (typeof document !== 'undefined' && document.hidden) return true;
  try {
    const keys = ['dp-audio-muted', 'audio-muted', 'sound-muted'];
    return keys.some((key) => localStorage.getItem(key) === 'true');
  } catch {
    return false;
  }
}

/** Short synthesized bell on Focus Training success. One chime per win (cooldown). */
export function playFocusTrainingBell(): void {
  const now = Date.now();
  if (now - lastBellAt < BELL_COOLDOWN_MS) return;
  lastBellAt = now;
  if (isAudioMuted()) return;

  try {
    const ctx = getBellContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = BELL_VOLUME;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5200, t);
    filter.frequency.exponentialRampToValueAtTime(1800, t + 0.7);
    filter.Q.value = 0.7;
    filter.connect(master);

    const fundamental = 784;
    const partials = [
      { ratio: 1, peak: 0.34, decay: 0.72 },
      { ratio: 2.01, peak: 0.16, decay: 0.48 },
      { ratio: 2.99, peak: 0.09, decay: 0.34 },
      { ratio: 4.07, peak: 0.05, decay: 0.22 },
      { ratio: 5.43, peak: 0.028, decay: 0.16 },
    ];

    for (const partial of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental * partial.ratio, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(partial.peak, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + partial.decay);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(t);
      osc.stop(t + partial.decay + 0.04);
    }
  } catch {
    // Autoplay blocked or audio unavailable — stay silent.
  }
}
