const NOTIFY_VOLUME = 0.14;
const NOTIFY_COOLDOWN_MS = 750;

let notifyCtx: AudioContext | null = null;
let lastNotifyAt = 0;

function getNotifyContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!notifyCtx) {
    notifyCtx = new Ctor();
  }
  return notifyCtx;
}

/** Quiet two-tone ping when unread chat arrives and the widget is closed. */
export function playCommunityChatNotifySound(): void {
  const now = Date.now();
  if (now - lastNotifyAt < NOTIFY_COOLDOWN_MS) return;
  lastNotifyAt = now;

  try {
    const ctx = getNotifyContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = NOTIFY_VOLUME;
    master.connect(ctx.destination);

    const playTone = (freq: number, start: number, dur: number, peak: number) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + start);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + start);
      gain.gain.linearRampToValueAtTime(peak, t + start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.02);
    };

    playTone(880, 0, 0.09, 0.22);
    playTone(1175, 0.08, 0.14, 0.16);
  } catch {
    // Autoplay blocked or audio unavailable — stay silent.
  }
}
