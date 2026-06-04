import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlashWordStreakPortal,
  type FlashWordStreakToast,
  type StreakToastPlacement,
} from './FlashWordStreakPortal';
import { useAppStore } from '../hooks/useAppStore';
import { useOptionalXpToast } from '../contexts/XpToastContext';
import {
  getFlashedWord,
  pickRandomCard,
  pickRandomFlashIndex,
  pickRandomTriplet,
  shuffleChoices,
  tripletWords,
  type FlashWordCard,
  type FlashWordGame,
  type FlashWordGameTriplet,
} from '../lib/flashWordGames';
import {
  fetchMiniGameUserBestStreak,
  upsertMiniGameBestStreak,
} from '../lib/miniGameLeaderboardDb';
import { flashWordZoneStyle } from '../lib/flashWordZonePosition';
import { useFlashWordImageLayout } from '../hooks/useFlashWordImageLayout';

type GamePhase = 'ready' | 'waiting' | 'flash' | 'choose' | 'result';

const WAIT_MIN_MS = 2000;
const WAIT_RANGE_MS = 8000;
const DISTRACTION_FLASH_MIN_MS = 300;
const DISTRACTION_FLASH_RANGE_MS = 250;
const DISTRACTION_GAP_MIN_MS = 800;
const DISTRACTION_GAP_RANGE_MS = 1200;
const STREAK_MESSAGE_MS = 4500;

function focusTrainingStreakKey(gameId: string): string {
  return `focus-training-streak-${gameId}`;
}

function readPersistedStreak(gameId: string): number {
  try {
    const raw = sessionStorage.getItem(focusTrainingStreakKey(gameId));
    if (raw == null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writePersistedStreak(gameId: string, value: number): void {
  try {
    sessionStorage.setItem(focusTrainingStreakKey(gameId), String(Math.max(0, value)));
  } catch {
    /* sessionStorage unavailable */
  }
}

export type FlashWordGameQuitHandler = () => void;

function randomStreakSidePlacement(): StreakToastPlacement {
  return Math.random() < 0.5 ? 'left' : 'right';
}

interface FlashWordGamePlayerProps {
  game: FlashWordGame;
  /** Called on mount with quit handler; modal should invoke before closing. */
  onRegisterQuitHandler?: (handler: FlashWordGameQuitHandler | null) => void;
}

export function FlashWordGamePlayer({
  game,
  onRegisterQuitHandler,
}: FlashWordGamePlayerProps) {
  const { awardBonusXp } = useAppStore();
  const xpToast = useOptionalXpToast();
  const streakTiers = game.streakTiers ?? [];

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [activeCard, setActiveCard] = useState<FlashWordCard | null>(null);
  const [activeTriplet, setActiveTriplet] = useState<FlashWordGameTriplet | null>(null);
  const [flashIndex, setFlashIndex] = useState<0 | 1 | 2>(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(() => readPersistedStreak(game.id));
  const [roundCommitted, setRoundCommitted] = useState(false);
  const [sessionBestStreak, setSessionBestStreak] = useState(0);
  const [allTimeBestStreak, setAllTimeBestStreak] = useState(0);
  const sessionBestStreakRef = useRef(0);
  const [streakToast, setStreakToast] = useState<FlashWordStreakToast | null>(null);
  const playerRootRef = useRef<HTMLDivElement>(null);
  const imageFrameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [distractionFlash, setDistractionFlash] = useState<{
    zoneId: string;
    word: string;
  } | null>(null);
  const waitTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const distractionTimerRef = useRef<number | null>(null);
  const streakToastTimerRef = useRef<number | null>(null);
  const awardedStreakThresholdsRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef<GamePhase>('ready');
  const streakAtRiskRef = useRef(false);
  const streakRef = useRef(streak);

  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase === 'result') {
      streakAtRiskRef.current = false;
      setRoundCommitted(false);
    }
  }, [phase]);

  useEffect(() => {
    writePersistedStreak(game.id, streak);
  }, [game.id, streak]);

  const clearStreakToastTimer = useCallback(() => {
    if (streakToastTimerRef.current != null) {
      window.clearTimeout(streakToastTimerRef.current);
      streakToastTimerRef.current = null;
    }
  }, []);

  const showStreakMessage = useCallback(
    (message: string, placement: StreakToastPlacement) => {
      clearStreakToastTimer();
      setStreakToast({ message, placement });
      streakToastTimerRef.current = window.setTimeout(() => {
        streakToastTimerRef.current = null;
        setStreakToast(null);
      }, STREAK_MESSAGE_MS);
    },
    [clearStreakToastTimer],
  );

  const playStreakAudio = useCallback((url: string) => {
    const audio = new Audio(url);
    audio.volume = 1;
    void audio.play().catch(() => undefined);
  }, []);

  const applyStreakRewards = useCallback(
    (newStreak: number) => {
      const matching = streakTiers.filter(
        (tier) => tier.streakThreshold === newStreak,
      );
      for (const tier of matching) {
        if (awardedStreakThresholdsRef.current.has(tier.streakThreshold)) continue;
        awardedStreakThresholdsRef.current.add(tier.streakThreshold);

        if (tier.xpReward > 0) {
          awardBonusXp(tier.xpReward);
          xpToast?.showXpGain(tier.xpReward);
        }
        if (tier.message?.trim()) {
          showStreakMessage(tier.message.trim(), randomStreakSidePlacement());
        }
        if (tier.audioUrl) {
          playStreakAudio(tier.audioUrl);
        }
      }
    },
    [awardBonusXp, playStreakAudio, showStreakMessage, streakTiers, xpToast],
  );

  const clearTimers = useCallback(() => {
    if (waitTimerRef.current != null) {
      window.clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    if (flashTimerRef.current != null) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    if (distractionTimerRef.current != null) {
      window.clearTimeout(distractionTimerRef.current);
      distractionTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearTimers();
    clearStreakToastTimer();
  }, [clearTimers, clearStreakToastTimer]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchMiniGameUserBestStreak('flash_cards', game.id);
      if (cancelled || !result.ok) return;
      setAllTimeBestStreak(result.bestStreak);
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  const persistSessionBestStreak = useCallback(() => {
    const best = sessionBestStreakRef.current;
    if (best <= 0) return;
    void (async () => {
      const result = await upsertMiniGameBestStreak('flash_cards', game.id, best);
      if (result.ok && best > allTimeBestStreak) {
        setAllTimeBestStreak(best);
      }
    })();
  }, [game.id, allTimeBestStreak]);

  useEffect(() => {
    return () => {
      if (streakAtRiskRef.current) {
        writePersistedStreak(game.id, 0);
      } else {
        writePersistedStreak(game.id, streakRef.current);
      }
      persistSessionBestStreak();
    };
  }, [game.id, persistSessionBestStreak]);

  const resetStreakToZero = useCallback(() => {
    setStreak(0);
    writePersistedStreak(game.id, 0);
  }, [game.id]);

  const applyQuitPenalty = useCallback(() => {
    if (!streakAtRiskRef.current) return;
    resetStreakToZero();
  }, [resetStreakToZero]);

  const applyQuitStreakRules = useCallback(() => {
    applyQuitPenalty();
    if (!streakAtRiskRef.current) {
      writePersistedStreak(game.id, streakRef.current);
    }
    persistSessionBestStreak();
  }, [applyQuitPenalty, game.id, persistSessionBestStreak]);

  useEffect(() => {
    onRegisterQuitHandler?.(applyQuitStreakRules);
    return () => onRegisterQuitHandler?.(null);
  }, [applyQuitStreakRules, onRegisterQuitHandler]);

  const recordStreak = useCallback((next: number) => {
    if (next > sessionBestStreakRef.current) {
      sessionBestStreakRef.current = next;
      setSessionBestStreak(next);
      if (next > allTimeBestStreak) {
        void (async () => {
          const result = await upsertMiniGameBestStreak('flash_cards', game.id, next);
          if (result.ok) setAllTimeBestStreak(next);
        })();
      }
    }
  }, [allTimeBestStreak, game.id]);

  useEffect(() => {
    setImageFailed(false);
  }, [activeCard?.imageUrl]);

  useEffect(() => {
    if (phase !== 'waiting' || !game.distractionZonesEnabled || !activeCard) {
      setDistractionFlash(null);
      if (distractionTimerRef.current != null) {
        window.clearTimeout(distractionTimerRef.current);
        distractionTimerRef.current = null;
      }
      return;
    }

    const zones = activeCard.distractionZones.filter((zone) => zone.word.trim());
    if (zones.length === 0) {
      setDistractionFlash(null);
      return;
    }

    const scheduleNextDistraction = () => {
      const gapMs = DISTRACTION_GAP_MIN_MS + Math.random() * DISTRACTION_GAP_RANGE_MS;
      distractionTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== 'waiting') return;

        const zone = zones[Math.floor(Math.random() * zones.length)]!;
        setDistractionFlash({ zoneId: zone.id, word: zone.word.trim() });

        const flashMs =
          DISTRACTION_FLASH_MIN_MS + Math.random() * DISTRACTION_FLASH_RANGE_MS;
        distractionTimerRef.current = window.setTimeout(() => {
          setDistractionFlash(null);
          if (phaseRef.current === 'waiting') scheduleNextDistraction();
        }, flashMs);
      }, gapMs);
    };

    scheduleNextDistraction();

    return () => {
      if (distractionTimerRef.current != null) {
        window.clearTimeout(distractionTimerRef.current);
        distractionTimerRef.current = null;
      }
      setDistractionFlash(null);
    };
  }, [phase, activeCard, game.distractionZonesEnabled]);

  const flashedWord =
    activeTriplet != null ? getFlashedWord(activeTriplet, flashIndex) : '';

  const beginRound = () => {
    clearTimers();
    const card = pickRandomCard(game.cards);
    const triplet = pickRandomTriplet(game.triplets);
    if (!card || !triplet) return;

    if (!card.imageUrl.trim()) {
      if (import.meta.env.DEV) {
        console.warn('[FlashWordGame] Card has empty imageUrl', card.id, card.imagePath);
      }
      setActiveCard(card);
      setActiveTriplet(triplet);
      setPhase('waiting');
      return;
    }

    const index = pickRandomFlashIndex();
    setActiveCard(card);
    setActiveTriplet(triplet);
    setFlashIndex(index);
    setChoices([]);
    setSelectedWord(null);
    setCorrect(null);
    setDistractionFlash(null);
    setImageFailed(false);
    setPhase('waiting');

    const delayMs = WAIT_MIN_MS + Math.random() * WAIT_RANGE_MS;
    waitTimerRef.current = window.setTimeout(() => {
      waitTimerRef.current = null;
      setPhase('flash');
      flashTimerRef.current = window.setTimeout(() => {
        flashTimerRef.current = null;
        setChoices(shuffleChoices(tripletWords(triplet)));
        setPhase('choose');
      }, game.flashDurationMs);
    }, delayMs);
  };

  const pickAnswer = (word: string) => {
    if (phase !== 'choose' || !activeTriplet || selectedWord != null) return;
    setSelectedWord(word);
    const isCorrect = word === flashedWord;
    setCorrect(isCorrect);
    if (isCorrect) {
      setStreak((prev) => {
        const next = prev + 1;
        applyStreakRewards(next);
        recordStreak(next);
        return next;
      });
    } else {
      resetStreakToZero();
    }
    setPhase('result');
  };

  const backToStart = () => {
    if (streakAtRiskRef.current) {
      resetStreakToZero();
    }
    clearTimers();
    clearStreakToastTimer();
    setStreakToast(null);
    setActiveCard(null);
    setActiveTriplet(null);
    setChoices([]);
    setSelectedWord(null);
    setCorrect(null);
    setDistractionFlash(null);
    setImageFailed(false);
    streakAtRiskRef.current = false;
    setRoundCommitted(false);
    setPhase('ready');
  };

  const playAgainFromResult = () => {
    streakAtRiskRef.current = true;
    setRoundCommitted(true);
    beginRound();
  };

  const displayedBestStreak = Math.max(sessionBestStreak, allTimeBestStreak);

  const showCard = activeCard != null && phase !== 'ready';
  const zone = activeCard?.zone;
  const imageUrl = activeCard?.imageUrl?.trim() ?? '';
  const overlayLayoutStyle = useFlashWordImageLayout(
    imageFrameRef,
    imageRef,
    imageUrl,
  );
  const missingImageUrl = showCard && activeCard != null && !imageUrl;

  const blurImageForChoices =
    phase === 'choose' || phase === 'result';

  const zoneClassName = [
    'flash-word-player__zone',
    phase === 'waiting' ? 'flash-word-player__zone--active' : '',
    phase === 'flash' ? 'flash-word-player__zone--flash' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flash-word-player" ref={playerRootRef}>
      <FlashWordStreakPortal toast={streakToast} anchorRef={playerRootRef} />
      <div className="flash-word-player__stats">
        <span className="flash-word-player__streak">
          Streak: <strong>{streak}</strong>
          {displayedBestStreak > 0 && (
            <>
              {' '}
              · Best: <strong>{displayedBestStreak}</strong>
            </>
          )}
        </span>
        <span className="muted">
          {game.cards.length} card{game.cards.length === 1 ? '' : 's'} ·{' '}
          {game.triplets.length} word combination
          {game.triplets.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flash-word-player__stage-layout">
        <div className="flash-word-player__stage-row">
          <div className="flash-word-player__stage">
          <div
            className={[
              'flash-word-player__image-wrap',
              imageFailed || missingImageUrl
                ? 'flash-word-player__image-wrap--failed'
                : '',
              blurImageForChoices
                ? 'flash-word-player__image-wrap--image-blurred'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {showCard && activeCard ? (
              missingImageUrl ? (
                <div className="flash-word-player__placeholder" role="alert">
                  <span className="flash-word-player__placeholder-icon">🖼</span>
                  <span>Card image URL is missing</span>
                  {import.meta.env.DEV && (
                    <span className="flash-word-player__debug">
                      path: {activeCard.imagePath || '(empty)'}
                    </span>
                  )}
                </div>
              ) : imageFailed ? (
                <div className="flash-word-player__placeholder" role="alert">
                  <span className="flash-word-player__placeholder-icon">🖼</span>
                  <span>Card image could not load</span>
                  {import.meta.env.DEV && (
                    <span className="flash-word-player__debug">{imageUrl}</span>
                  )}
                </div>
              ) : (
                <div className="flash-word-player__image-frame" ref={imageFrameRef}>
                  <img
                    ref={imageRef}
                    key={imageUrl}
                    src={imageUrl}
                    alt=""
                    className="flash-word-player__image"
                    draggable={false}
                    onError={() => setImageFailed(true)}
                  />
                  {zone && (
                    <div
                      className="flash-word-player__image-overlay"
                      style={overlayLayoutStyle}
                    >
                      <div
                        className={zoneClassName}
                        style={flashWordZoneStyle(zone)}
                      >
                        {phase === 'flash' && (
                          <span className="flash-word-player__flash-word" aria-live="off">
                            {flashedWord}
                          </span>
                        )}
                      </div>
                      {game.distractionZonesEnabled &&
                        activeCard.distractionZones.map((distractionZone) => (
                          <div
                            key={distractionZone.id}
                            className="flash-word-player__distraction-zone"
                            style={flashWordZoneStyle(distractionZone.zone)}
                          >
                            {distractionFlash?.zoneId === distractionZone.id && (
                              <span className="flash-word-player__flash-word" aria-live="off">
                                {distractionFlash.word}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="flash-word-player__placeholder">
                <span className="flash-word-player__placeholder-icon" aria-hidden="true">
                  ⚡
                </span>
                <span className="flash-word-player__placeholder-label">Press Start</span>
                <span className="muted">when you&apos;re ready</span>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      <div className="flash-word-player__panel">
        {phase === 'ready' && (
          <>
            <p className="flash-word-player__instruction">
              Stay focused. A flash card image appears with a highlight zone — watch
              for a brief word flash, then pick what you saw from three choices.
            </p>
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={beginRound}
              disabled={game.cards.length === 0}
            >
              Start
            </button>
          </>
        )}

        {roundCommitted && phase !== 'ready' && phase !== 'result' && (
          <p className="flash-word-player__quit-hint muted" aria-live="polite">
            Leaving now resets your streak.
          </p>
        )}

        {phase === 'waiting' && (
          <p className="flash-word-player__waiting muted" aria-live="polite">
            Watch the highlight zone — a word will flash soon.
          </p>
        )}

        {phase === 'flash' && (
          <p className="flash-word-player__waiting muted" aria-live="polite">
            Look!
          </p>
        )}

        {phase === 'choose' && (
          <>
            <p className="flash-word-player__instruction">Which word did you see?</p>
            <div className="flash-word-player__choices">
              {choices.map((word) => (
                <button
                  key={word}
                  type="button"
                  className="btn btn--ghost flash-word-player__choice"
                  onClick={() => pickAnswer(word)}
                >
                  {word}
                </button>
              ))}
            </div>
          </>
        )}

        {phase === 'result' && activeTriplet && (
          <>
            <p
              className={
                correct
                  ? 'flash-word-player__feedback flash-word-player__feedback--success'
                  : 'flash-word-player__feedback flash-word-player__feedback--error'
              }
            >
              {correct ? 'Correct!' : `Wrong — it was "${flashedWord}".`}
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={playAgainFromResult}
              >
                Play again
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={backToStart}
              >
                Back to start
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
