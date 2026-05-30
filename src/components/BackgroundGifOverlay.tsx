import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { fetchGifBank, type GifBankEntry } from '../lib/gifBank';
import { subscribeGifBankPreview } from '../lib/gifBankPreview';

const MIN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_INTERVAL_MS = 10 * 60 * 1000;
const FADE_MS = 1500;
const GIF_OPACITY = 0.03;

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface ActiveGif {
  entry: GifBankEntry;
  corner: Corner;
  key: number;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randomIntervalMs() {
  return rand(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

const CORNERS: Corner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

export function BackgroundGifOverlay() {
  const { session } = useAppStore();
  const [catalog, setCatalog] = useState<GifBankEntry[]>([]);
  const [active, setActive] = useState<ActiveGif | null>(null);
  const [visible, setVisible] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<GifBankEntry | null>(null);
  const [scheduleEpoch, setScheduleEpoch] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    return subscribeGifBankPreview(
      (entry) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (fadeRef.current) clearTimeout(fadeRef.current);
        keyRef.current += 1;
        setPreviewEntry(entry);
        setActive({
          entry,
          corner: pickRandom(CORNERS) ?? 'bottom-right',
          key: keyRef.current,
        });
        setVisible(true);
      },
      () => {
        setPreviewEntry(null);
        setVisible(false);
        setActive(null);
        setScheduleEpoch((epoch) => epoch + 1);
      },
    );
  }, []);

  useEffect(() => {
    if (!session) {
      setCatalog([]);
      if (!previewEntry) {
        setActive(null);
        setVisible(false);
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await fetchGifBank();
      if (cancelled) return;
      if (result.ok) setCatalog(result.gifs);
    })();

    return () => {
      cancelled = true;
    };
  }, [session, previewEntry]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeRef.current) clearTimeout(fadeRef.current);

    if (previewEntry) return;

    if (!session || catalog.length === 0) {
      setActive(null);
      setVisible(false);
      return;
    }

    const showNext = () => {
      const entry = pickRandom(catalog);
      if (!entry) return;

      setVisible(false);
      fadeRef.current = setTimeout(() => {
        keyRef.current += 1;
        setActive({
          entry,
          corner: pickRandom(CORNERS) ?? 'bottom-right',
          key: keyRef.current,
        });
        requestAnimationFrame(() => setVisible(true));
      }, FADE_MS);
    };

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        showNext();
        schedule();
      }, randomIntervalMs());
    };

    schedule();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    };
  }, [session, catalog, scheduleEpoch, previewEntry]);

  if (!active) return null;

  return (
    <div className="background-gif-overlay" aria-hidden>
      <img
        key={active.key}
        className={`background-gif-overlay__img background-gif-overlay__img--${active.corner}${visible ? ' background-gif-overlay__img--visible' : ''}`}
        src={active.entry.url}
        alt=""
        draggable={false}
        style={{ opacity: visible ? GIF_OPACITY : 0 }}
      />
    </div>
  );
}
