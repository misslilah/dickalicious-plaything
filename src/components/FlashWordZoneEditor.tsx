import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  DEFAULT_DISTRACTION_ZONE,
  normalizeZone,
  type FlashWordDistractionZoneInput,
  type FlashWordZone,
} from '../lib/flashWordGames';
import {
  flashWordZoneStyle,
  getImageContentRect,
} from '../lib/flashWordZonePosition';
import { useFlashWordImageLayout } from '../hooks/useFlashWordImageLayout';

interface FlashWordZoneEditorProps {
  imageUrl: string;
  zone: FlashWordZone;
  onChange: (zone: FlashWordZone) => void;
  distractionZones?: FlashWordDistractionZoneInput[];
  onDistractionZonesChange?: (zones: FlashWordDistractionZoneInput[]) => void;
  showDistractionZones?: boolean;
}

type DragMode = 'move' | 'resize';
type DragTarget = { kind: 'main' } | { kind: 'distraction'; index: number };

export function FlashWordZoneEditor({
  imageUrl,
  zone,
  onChange,
  distractionZones = [],
  onDistractionZonesChange,
  showDistractionZones = false,
}: FlashWordZoneEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayLayoutStyle = useFlashWordImageLayout(
    containerRef,
    imageRef,
    imageUrl,
  );
  const dragRef = useRef<{
    target: DragTarget;
    mode: DragMode;
    startX: number;
    startY: number;
    startZone: FlashWordZone;
  } | null>(null);

  const onPointerDown =
    (target: DragTarget, mode: DragMode, startZone: FlashWordZone) =>
    (event: ReactPointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        target,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startZone,
      };
    };

  const applyZoneChange = useCallback(
    (target: DragTarget, nextZone: FlashWordZone) => {
      if (target.kind === 'main') {
        onChange(nextZone);
        return;
      }
      if (!onDistractionZonesChange) return;
      onDistractionZonesChange(
        distractionZones.map((entry, index) =>
          index === target.index ? { ...entry, zone: nextZone } : entry,
        ),
      );
    },
    [distractionZones, onChange, onDistractionZonesChange],
  );

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    const img = imageRef.current;
    if (!drag || !container || !img) return;

    const contentRect = getImageContentRect(img, container);
    if (!contentRect || contentRect.width <= 0 || contentRect.height <= 0) return;

    const dxPct = ((event.clientX - drag.startX) / contentRect.width) * 100;
    const dyPct = ((event.clientY - drag.startY) / contentRect.height) * 100;

    if (drag.mode === 'move') {
      applyZoneChange(
        drag.target,
        normalizeZone({
          ...drag.startZone,
          xPct: drag.startZone.xPct + dxPct,
          yPct: drag.startZone.yPct + dyPct,
        }),
      );
      return;
    }

    applyZoneChange(
      drag.target,
      normalizeZone({
        ...drag.startZone,
        widthPct: drag.startZone.widthPct + dxPct,
        heightPct: drag.startZone.heightPct + dyPct,
      }),
    );
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    if (dragRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  };

  const addDistractionZone = () => {
    if (!onDistractionZonesChange) return;
    const offset = distractionZones.length * 6;
    onDistractionZonesChange([
      ...distractionZones,
      {
        zone: normalizeZone({
          ...DEFAULT_DISTRACTION_ZONE,
          xPct: DEFAULT_DISTRACTION_ZONE.xPct + offset,
          yPct: DEFAULT_DISTRACTION_ZONE.yPct - offset,
        }),
        word: '',
      },
    ]);
  };

  const removeDistractionZone = (index: number) => {
    if (!onDistractionZonesChange) return;
    onDistractionZonesChange(distractionZones.filter((_, i) => i !== index));
  };

  const updateDistractionWord = (index: number, word: string) => {
    if (!onDistractionZonesChange) return;
    onDistractionZonesChange(
      distractionZones.map((entry, i) => (i === index ? { ...entry, word } : entry)),
    );
  };

  const normalizedMain = normalizeZone(zone);

  return (
    <div className="flash-zone-editor">
      <p className="muted flash-zone-editor__hint">
        Drag the purple box for the main flash zone (answer choices come from word combinations).
        {showDistractionZones &&
          ' Green boxes are distraction zones — visible here only; they flash extra words during the wait.'}
      </p>
      <div
        ref={containerRef}
        className="flash-zone-editor__canvas"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt=""
          className="flash-zone-editor__image"
          draggable={false}
        />
        <div
          className="flash-zone-editor__overlay"
          style={overlayLayoutStyle}
        >
          {showDistractionZones &&
            distractionZones.map((entry, index) => {
              const normalized = normalizeZone(entry.zone);
              return (
                <div
                  key={entry.id ?? `distraction-${index}`}
                  className="flash-zone-editor__zone flash-zone-editor__zone--distraction"
                  style={flashWordZoneStyle(normalized)}
                  onPointerDown={onPointerDown(
                    { kind: 'distraction', index },
                    'move',
                    normalized,
                  )}
                  role="presentation"
                >
                  <span className="flash-zone-editor__zone-label">Distraction zone</span>
                  {entry.word.trim() && (
                    <span className="flash-zone-editor__zone-word">{entry.word.trim()}</span>
                  )}
                  <button
                    type="button"
                    className="flash-zone-editor__resize"
                    aria-label="Resize distraction zone"
                    onPointerDown={onPointerDown(
                      { kind: 'distraction', index },
                      'resize',
                      normalized,
                    )}
                  />
                </div>
              );
            })}
          <div
            className="flash-zone-editor__zone flash-zone-editor__zone--main"
            style={flashWordZoneStyle(normalizedMain)}
            onPointerDown={onPointerDown({ kind: 'main' }, 'move', normalizedMain)}
            role="presentation"
          >
            <span className="flash-zone-editor__zone-label">Flash zone</span>
            <button
              type="button"
              className="flash-zone-editor__resize"
              aria-label="Resize flash zone"
              onPointerDown={onPointerDown({ kind: 'main' }, 'resize', normalizedMain)}
            />
          </div>
        </div>
      </div>

      {showDistractionZones && onDistractionZonesChange && (
        <div className="flash-zone-editor__distractions">
          <div className="flash-zone-editor__distractions-header">
            <h5 className="section-title">Distraction zones</h5>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={addDistractionZone}
            >
              Add distraction zone
            </button>
          </div>
          {distractionZones.length === 0 ? (
            <p className="muted">No distraction zones yet. Add one to place a green box on the card.</p>
          ) : (
            <ul className="flash-zone-editor__distraction-list">
              {distractionZones.map((entry, index) => (
                <li key={entry.id ?? `distraction-field-${index}`} className="flash-zone-editor__distraction-row">
                  <label className="form-field flash-zone-editor__distraction-word">
                    Distraction word {index + 1}
                    <input
                      type="text"
                      value={entry.word}
                      onChange={(e) => updateDistractionWord(index, e.target.value)}
                      placeholder="Word to flash as a distraction"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn--danger btn--small"
                    onClick={() => removeDistractionZone(index)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
