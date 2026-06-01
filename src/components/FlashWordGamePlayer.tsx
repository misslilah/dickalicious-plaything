import { useCallback, useEffect, useRef, useState } from 'react';
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

type GamePhase = 'ready' | 'waiting' | 'flash' | 'choose' | 'result';

const WAIT_MIN_MS = 2000;
const WAIT_RANGE_MS = 8000;
const DISTRACTION_FLASH_MIN_MS = 300;
const DISTRACTION_FLASH_RANGE_MS = 250;
const DISTRACTION_GAP_MIN_MS = 800;
const DISTRACTION_GAP_RANGE_MS = 1200;

interface ImageLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FlashWordGamePlayerProps {
  game: FlashWordGame;
}

function computeContainedImageLayout(
  wrapWidth: number,
  wrapHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): ImageLayout | null {
  if (
    wrapWidth <= 0 ||
    wrapHeight <= 0 ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }

  const imageAspect = naturalWidth / naturalHeight;
  const wrapAspect = wrapWidth / wrapHeight;

  let width: number;
  let height: number;
  if (imageAspect > wrapAspect) {
    width = wrapWidth;
    height = wrapWidth / imageAspect;
  } else {
    height = wrapHeight;
    width = wrapHeight * imageAspect;
  }

  return {
    left: (wrapWidth - width) / 2,
    top: (wrapHeight - height) / 2,
    width,
    height,
  };
}

export function FlashWordGamePlayer({ game }: FlashWordGamePlayerProps) {
  const [phase, setPhase] = useState<GamePhase>('ready');
  const [activeCard, setActiveCard] = useState<FlashWordCard | null>(null);
  const [activeTriplet, setActiveTriplet] = useState<FlashWordGameTriplet | null>(null);
  const [flashIndex, setFlashIndex] = useState<0 | 1 | 2>(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);
  const [imageLayout, setImageLayout] = useState<ImageLayout | null>(null);
  const [distractionFlash, setDistractionFlash] = useState<{
    zoneId: string;
    word: string;
  } | null>(null);
  const waitTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const distractionTimerRef = useRef<number | null>(null);
  const phaseRef = useRef<GamePhase>('ready');
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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

  const syncImageLayout = useCallback(() => {
    const wrap = imageWrapRef.current;
    const img = imageRef.current;
    if (!wrap || !img || !img.complete || img.naturalWidth <= 0) {
      setImageLayout(null);
      return;
    }

    setImageLayout(
      computeContainedImageLayout(
        wrap.clientWidth,
        wrap.clientHeight,
        img.naturalWidth,
        img.naturalHeight,
      ),
    );
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    syncImageLayout();
  }, [syncImageLayout, activeCard?.imageUrl]);

  useEffect(() => {
    const wrap = imageWrapRef.current;
    const img = imageRef.current;
    if (!wrap) return;

    const observer = new ResizeObserver(() => syncImageLayout());
    observer.observe(wrap);
    img?.addEventListener('load', syncImageLayout);

    return () => {
      observer.disconnect();
      img?.removeEventListener('load', syncImageLayout);
    };
  }, [syncImageLayout, activeCard?.imageUrl]);

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

    const index = pickRandomFlashIndex();
    setActiveCard(card);
    setActiveTriplet(triplet);
    setFlashIndex(index);
    setChoices([]);
    setSelectedWord(null);
    setCorrect(null);
    setDistractionFlash(null);
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
    setStreak((prev) => (isCorrect ? prev + 1 : 0));
    setPhase('result');
  };

  const playAgain = () => {
    setActiveCard(null);
    setActiveTriplet(null);
    setChoices([]);
    setSelectedWord(null);
    setCorrect(null);
    setDistractionFlash(null);
    setPhase('ready');
  };

  const showCard = activeCard != null && phase !== 'ready';
  const zone = activeCard?.zone;

  const zoneClassName = [
    'flash-word-player__zone',
    phase === 'waiting' ? 'flash-word-player__zone--active' : '',
    phase === 'flash' ? 'flash-word-player__zone--flash' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flash-word-player">
      <div className="flash-word-player__stats">
        <span className="flash-word-player__streak">
          Streak: <strong>{streak}</strong>
        </span>
        <span className="muted">
          {game.cards.length} card{game.cards.length === 1 ? '' : 's'} ·{' '}
          {game.triplets.length} word combination
          {game.triplets.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flash-word-player__stage">
        <div className="flash-word-player__image-wrap" ref={imageWrapRef}>
          {showCard && activeCard && zone ? (
            <>
              <img
                ref={imageRef}
                src={activeCard.imageUrl}
                alt=""
                className="flash-word-player__image"
                draggable={false}
                onLoad={syncImageLayout}
              />
              {imageLayout && (
                <div
                  className="flash-word-player__image-overlay"
                  style={{
                    left: `${imageLayout.left}px`,
                    top: `${imageLayout.top}px`,
                    width: `${imageLayout.width}px`,
                    height: `${imageLayout.height}px`,
                  }}
                >
                  <div
                    className={zoneClassName}
                    style={{
                      left: `${zone.xPct}%`,
                      top: `${zone.yPct}%`,
                      width: `${zone.widthPct}%`,
                      height: `${zone.heightPct}%`,
                    }}
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
                        style={{
                          left: `${distractionZone.zone.xPct}%`,
                          top: `${distractionZone.zone.yPct}%`,
                          width: `${distractionZone.zone.widthPct}%`,
                          height: `${distractionZone.zone.heightPct}%`,
                        }}
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
            </>
          ) : (
            <div className="flash-word-player__placeholder" aria-hidden="true">
              <span className="flash-word-player__placeholder-icon">⚡</span>
              <span className="muted">Press Start when you&apos;re ready</span>
            </div>
          )}
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
            >
              Start
            </button>
          </>
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
                onClick={beginRound}
              >
                Play again
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={playAgain}
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
