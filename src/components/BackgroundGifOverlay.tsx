import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import {
  DEFAULT_GIF_BANK_APPEARANCE_SETTINGS,
  fetchGifBank,
  fetchGifBankAppearanceSettings,
  randomAppearanceIntervalMs,
  subscribeGifBankSettingsChanged,
  type GifBankAppearanceSettings,
  type GifBankEntry,
} from '../lib/gifBank';
import { subscribeGifBankPreview } from '../lib/gifBankPreview';

const DISPLAY_MS = 5000;
const FADE_MS = 1500;
const POSITION_MARGIN_MIN = 3;
const POSITION_MARGIN_MAX = 68;

interface ActiveGif {
  entry: GifBankEntry;
  top: number;
  left: number;
  key: number;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randomPosition() {
  return {
    top: rand(POSITION_MARGIN_MIN, POSITION_MARGIN_MAX),
    left: rand(POSITION_MARGIN_MIN, POSITION_MARGIN_MAX),
  };
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

export function BackgroundGifOverlay() {
  const { session } = useAppStore();
  const [catalog, setCatalog] = useState<GifBankEntry[]>([]);
  const [appearanceSettings, setAppearanceSettings] = useState<GifBankAppearanceSettings>(
    DEFAULT_GIF_BANK_APPEARANCE_SETTINGS,
  );
  const [active, setActive] = useState<ActiveGif | null>(null);
  const [visible, setVisible] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<GifBankEntry | null>(null);
  const [previewOpacity, setPreviewOpacity] = useState<number | null>(null);
  const [scheduleEpoch, setScheduleEpoch] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(0);

  const clearTimers = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeRef.current) clearTimeout(fadeRef.current);
    if (displayRef.current) clearTimeout(displayRef.current);
  };

  const hideWithFade = (onHidden?: () => void) => {
    setVisible(false);
    fadeRef.current = setTimeout(() => {
      setActive(null);
      onHidden?.();
    }, FADE_MS);
  };

  const showWithAutoHide = (
    entry: GifBankEntry,
    onHidden?: () => void,
  ) => {
    keyRef.current += 1;
    const position = randomPosition();
    setActive({
      entry,
      top: position.top,
      left: position.left,
      key: keyRef.current,
    });
    requestAnimationFrame(() => setVisible(true));

    displayRef.current = setTimeout(() => {
      hideWithFade(onHidden);
    }, DISPLAY_MS);
  };

  useEffect(() => {
    return subscribeGifBankPreview(
      ({ entry, opacity }) => {
        clearTimers();
        setPreviewEntry(entry);
        setPreviewOpacity(opacity);
        showWithAutoHide(entry, () => {
          setPreviewEntry(null);
          setPreviewOpacity(null);
          setScheduleEpoch((epoch) => epoch + 1);
        });
      },
      () => {
        clearTimers();
        setPreviewEntry(null);
        setPreviewOpacity(null);
        setVisible(false);
        setActive(null);
        setScheduleEpoch((epoch) => epoch + 1);
      },
    );
  }, []);

  useEffect(() => {
    return subscribeGifBankSettingsChanged(() => {
      void (async () => {
        const result = await fetchGifBankAppearanceSettings();
        if (result.ok) {
          setAppearanceSettings(result.settings);
          setScheduleEpoch((epoch) => epoch + 1);
        }
      })();
    });
  }, []);

  useEffect(() => {
    if (!session) {
      setCatalog([]);
      setAppearanceSettings(DEFAULT_GIF_BANK_APPEARANCE_SETTINGS);
      if (!previewEntry) {
        setActive(null);
        setVisible(false);
        setPreviewOpacity(null);
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      const [catalogResult, settingsResult] = await Promise.all([
        fetchGifBank(),
        fetchGifBankAppearanceSettings(),
      ]);
      if (cancelled) return;
      if (catalogResult.ok) setCatalog(catalogResult.gifs);
      if (settingsResult.ok) setAppearanceSettings(settingsResult.settings);
    })();

    return () => {
      cancelled = true;
    };
  }, [session, previewEntry]);

  useEffect(() => {
    clearTimers();

    if (previewEntry) return;

    if (!session || catalog.length === 0) {
      setActive(null);
      setVisible(false);
      return;
    }

    const showNext = () => {
      const entry = pickRandom(catalog);
      if (!entry) return;
      showWithAutoHide(entry);
    };

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        showNext();
        schedule();
      }, randomAppearanceIntervalMs(appearanceSettings));
    };

    schedule();

    return clearTimers;
  }, [session, catalog, scheduleEpoch, previewEntry, appearanceSettings]);

  if (!active) return null;

  const opacity = visible
    ? previewOpacity ?? appearanceSettings.rotationOpacity
    : 0;

  return (
    <div
      className={`background-gif-overlay${previewEntry ? ' background-gif-overlay--preview' : ''}`}
      aria-hidden
    >
      <img
        key={active.key}
        className={`background-gif-overlay__img${visible ? ' background-gif-overlay__img--visible' : ''}`}
        src={active.entry.url}
        alt=""
        draggable={false}
        style={{
          opacity,
          top: `${active.top}%`,
          left: `${active.left}%`,
        }}
      />
    </div>
  );
}
