import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  isVideoSectionPath,
  useVideoPlayback,
} from '../contexts/VideoPlaybackContext';
import { useAppStore } from '../hooks/useAppStore';
import {
  DEFAULT_GIF_BANK_APPEARANCE_SETTINGS,
  fetchGifBank,
  fetchGifBankAppearanceSettings,
  randomAppearanceIntervalMs,
  subscribeGifBankCatalogChanged,
  subscribeGifBankSettingsChanged,
  type GifBankAppearanceSettings,
  type GifBankEntry,
} from '../lib/gifBank';
import { subscribeGifBankPreview } from '../lib/gifBankPreview';

/** How long each GIF stays fully visible — never tied to appearance interval settings. */
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
  const { pathname } = useLocation();
  const { isPlaybackActive } = useVideoPlayback();
  const [catalog, setCatalog] = useState<GifBankEntry[]>([]);
  const [appearanceSettings, setAppearanceSettings] = useState<GifBankAppearanceSettings>(
    DEFAULT_GIF_BANK_APPEARANCE_SETTINGS,
  );
  const [active, setActive] = useState<ActiveGif | null>(null);
  const [visible, setVisible] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<GifBankEntry | null>(null);
  const [previewOpacity, setPreviewOpacity] = useState<number | null>(null);
  const [scheduleEpoch, setScheduleEpoch] = useState(0);
  const scheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(0);
  const isDisplayingRef = useRef(false);
  const appearanceSettingsRef = useRef(appearanceSettings);
  const catalogRef = useRef(catalog);
  const activeEntryIdRef = useRef<string | null>(null);

  appearanceSettingsRef.current = appearanceSettings;
  catalogRef.current = catalog;
  activeEntryIdRef.current = active?.entry.id ?? null;

  const suppressGifs =
    !previewEntry && (isVideoSectionPath(pathname) || isPlaybackActive);

  const clearScheduleTimer = () => {
    if (scheduleRef.current) {
      clearTimeout(scheduleRef.current);
      scheduleRef.current = null;
    }
  };

  const clearDisplayTimers = () => {
    if (displayRef.current) {
      clearTimeout(displayRef.current);
      displayRef.current = null;
    }
    if (fadeRef.current) {
      clearTimeout(fadeRef.current);
      fadeRef.current = null;
    }
    isDisplayingRef.current = false;
  };

  const clearAllTimers = () => {
    clearScheduleTimer();
    clearDisplayTimers();
  };

  const hideWithFade = (onHidden?: () => void) => {
    if (fadeRef.current) clearTimeout(fadeRef.current);
    setVisible(false);
    fadeRef.current = setTimeout(() => {
      fadeRef.current = null;
      setActive(null);
      isDisplayingRef.current = false;
      onHidden?.();
    }, FADE_MS);
  };

  const showWithAutoHide = (
    entry: GifBankEntry,
    onHidden?: () => void,
  ) => {
    clearDisplayTimers();
    keyRef.current += 1;
    const position = randomPosition();
    setActive({
      entry,
      top: position.top,
      left: position.left,
      key: keyRef.current,
    });
    requestAnimationFrame(() => setVisible(true));

    isDisplayingRef.current = true;
    displayRef.current = setTimeout(() => {
      displayRef.current = null;
      hideWithFade(onHidden);
    }, DISPLAY_MS);
  };

  const scheduleNextAppearanceRef = useRef<() => void>(() => {});

  scheduleNextAppearanceRef.current = () => {
    clearScheduleTimer();
    scheduleRef.current = setTimeout(() => {
      scheduleRef.current = null;
      const entry = pickRandom(catalogRef.current);
      if (!entry) {
        scheduleNextAppearanceRef.current();
        return;
      }
      showWithAutoHide(entry, () => {
        scheduleNextAppearanceRef.current();
      });
    }, randomAppearanceIntervalMs(appearanceSettingsRef.current));
  };

  useEffect(() => {
    return subscribeGifBankPreview(
      ({ entry, opacity }) => {
        clearAllTimers();
        setPreviewEntry(entry);
        setPreviewOpacity(opacity);
        showWithAutoHide(entry, () => {
          setPreviewEntry(null);
          setPreviewOpacity(null);
          setScheduleEpoch((epoch) => epoch + 1);
        });
      },
      () => {
        clearAllTimers();
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
    return subscribeGifBankCatalogChanged(() => {
      void (async () => {
        const result = await fetchGifBank();
        if (!result.ok) return;

        const activeId = activeEntryIdRef.current;
        const deletedActive =
          activeId != null && !result.gifs.some((gif) => gif.id === activeId);

        if (deletedActive) {
          clearAllTimers();
          setActive(null);
          setVisible(false);
        }

        setCatalog(result.gifs);
        setScheduleEpoch((epoch) => epoch + 1);
      })();
    });
  }, []);

  useEffect(() => {
    if (!session) {
      setCatalog([]);
      setAppearanceSettings(DEFAULT_GIF_BANK_APPEARANCE_SETTINGS);
      if (!previewEntry) {
        clearAllTimers();
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
    if (suppressGifs) {
      clearAllTimers();
      setActive(null);
      setVisible(false);
    }
  }, [suppressGifs]);

  useEffect(() => {
    clearScheduleTimer();

    if (previewEntry) return;

    if (suppressGifs) {
      clearAllTimers();
      setActive(null);
      setVisible(false);
      return;
    }

    if (!session || catalog.length === 0) {
      clearAllTimers();
      setActive(null);
      setVisible(false);
      return;
    }

    if (!isDisplayingRef.current) {
      scheduleNextAppearanceRef.current();
    }

    return clearScheduleTimer;
  }, [
    session,
    catalog,
    scheduleEpoch,
    previewEntry,
    appearanceSettings,
    suppressGifs,
  ]);

  if (suppressGifs || !active) return null;

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
