const GAIN_VOLUME = 0.15;
const GAIN_COOLDOWN_MS = 400;

let gainCtx: AudioContext | null = null;
let lastGainAt = 0;

function getGainContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!gainCtx) {
    gainCtx = new Ctor();
  }
  return gainCtx;
}

/** Quiet coin-pop chime when the user earns XP. Cooldown avoids stacked blasts. */
export function playXpGainSound(): void {
  const now = Date.now();
  if (now - lastGainAt < GAIN_COOLDOWN_MS) return;
  lastGainAt = now;

  try {
    const ctx = getGainContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = GAIN_VOLUME;
    master.connect(ctx.destination);

    const playTone = (
      type: OscillatorType,
      freq: number,
      start: number,
      dur: number,
      peak: number,
    ) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t + start);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + start);
      gain.gain.linearRampToValueAtTime(peak, t + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.02);
    };

    playTone('sine', 784, 0, 0.09, 0.26);
    playTone('triangle', 1175, 0.045, 0.11, 0.18);
    playTone('sine', 1568, 0.1, 0.16, 0.12);
  } catch {
    // Autoplay blocked or audio unavailable — stay silent.
  }
}
