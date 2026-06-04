import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  DEFAULT_DISTRACTION_ZONE,
  DEFAULT_HARD_HIGHLIGHT_ZONE,
  FLASH_HARD_MODE_STREAK_THRESHOLD,
  normalizeZone,
  type FlashWordDistractionZoneInput,
  type FlashWordHardDistractionZoneInput,
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
  hardModeHighlightZones?: FlashWordZone[];
  onHardModeHighlightZonesChange?: (zones: FlashWordZone[]) => void;
  hardDistractionZones?: FlashWordHardDistractionZoneInput[];
  onHardDistractionZonesChange?: (zones: FlashWordHardDistractionZoneInput[]) => void;
}

type DragMode = 'move' | 'resize';
type DragTarget =
  | { kind: 'main' }
  | { kind: 'distraction'; index: number }
  | { kind: 'hardHighlight'; index: number }
  | { kind: 'hardDistraction'; index: number };

const HARD_HIGHLIGHT_COLOR_COUNT = 3;

function hardHighlightEditorClass(index: number): string {
  return `flash-zone-editor__zone flash-zone-editor__zone--hard-highlight flash-zone-editor__zone--hard-highlight-${index % HARD_HIGHLIGHT_COLOR_COUNT}`;
}

export function FlashWordZoneEditor({
  imageUrl,
  zone,
  onChange,
  distractionZones = [],
  onDistractionZonesChange,
  showDistractionZones = false,
  hardModeHighlightZones = [],
  onHardModeHighlightZonesChange,
  hardDistractionZones = [],
  onHardDistractionZonesChange,
}: FlashWordZoneEditorProps) {
  const showHardMode =
    onHardModeHighlightZonesChange != null || onHardDistractionZonesChange != null;

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
      if (target.kind === 'distraction') {
        if (!onDistractionZonesChange) return;
        onDistractionZonesChange(
          distractionZones.map((entry, index) =>
            index === target.index ? { ...entry, zone: nextZone } : entry,
          ),
        );
        return;
      }
      if (target.kind === 'hardHighlight') {
        if (!onHardModeHighlightZonesChange) return;
        onHardModeHighlightZonesChange(
          hardModeHighlightZones.map((entry, index) =>
            index === target.index ? nextZone : entry,
          ),
        );
        return;
      }
      if (!onHardDistractionZonesChange) return;
      onHardDistractionZonesChange(
        hardDistractionZones.map((entry, index) =>
          index === target.index ? { ...entry, zone: nextZone } : entry,
        ),
      );
    },
    [
      distractionZones,
      hardDistractionZones,
      hardModeHighlightZones,
      onChange,
      onDistractionZonesChange,
      onHardDistractionZonesChange,
      onHardModeHighlightZonesChange,
    ],
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

  const addHardHighlightZone = () => {
    if (!onHardModeHighlightZonesChange) return;
    const offset = hardModeHighlightZones.length * 7;
    onHardModeHighlightZonesChange([
      ...hardModeHighlightZones,
      normalizeZone({
        ...DEFAULT_HARD_HIGHLIGHT_ZONE,
        xPct: DEFAULT_HARD_HIGHLIGHT_ZONE.xPct + offset,
        yPct: DEFAULT_HARD_HIGHLIGHT_ZONE.yPct + offset * 0.5,
      }),
    ]);
  };

  const removeHardHighlightZone = (index: number) => {
    if (!onHardModeHighlightZonesChange) return;
    onHardModeHighlightZonesChange(hardModeHighlightZones.filter((_, i) => i !== index));
  };

  const addHardDistractionZone = () => {
    if (!onHardDistractionZonesChange) return;
    const offset = hardDistractionZones.length * 6;
    onHardDistractionZonesChange([
      ...hardDistractionZones,
      {
        zone: normalizeZone({
          ...DEFAULT_DISTRACTION_ZONE,
          xPct: DEFAULT_DISTRACTION_ZONE.xPct + offset + 20,
          yPct: DEFAULT_DISTRACTION_ZONE.yPct - offset,
        }),
        word: '',
      },
    ]);
  };

  const removeHardDistractionZone = (index: number) => {
    if (!onHardDistractionZonesChange) return;
    onHardDistractionZonesChange(hardDistractionZones.filter((_, i) => i !== index));
  };

  const updateHardDistractionWord = (index: number, word: string) => {
    if (!onHardDistractionZonesChange) return;
    onHardDistractionZonesChange(
      hardDistractionZones.map((entry, i) => (i === index ? { ...entry, word } : entry)),
    );
  };

  const normalizedMain = normalizeZone(zone);

  return (
    <div className="flash-zone-editor">
      <p className="muted flash-zone-editor__hint">
        Drag the purple box for the main flash zone (answer choices come from word combinations).
        {showDistractionZones &&
          ' Green boxes are distraction zones — visible here only; they flash extra words during the wait.'}
        {showHardMode &&
          ' Hard mode boxes (cyan, orange, amber) appear only when a player streak reaches 20+.'}
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
          {onHardModeHighlightZonesChange &&
            hardModeHighlightZones.map((entry, index) => {
              const normalized = normalizeZone(entry);
              return (
                <div
                  key={`hard-highlight-${index}`}
                  className={hardHighlightEditorClass(index)}
                  style={flashWordZoneStyle(normalized)}
                  onPointerDown={onPointerDown(
                    { kind: 'hardHighlight', index },
                    'move',
                    normalized,
                  )}
                  role="presentation"
                >
                  <span className="flash-zone-editor__zone-label">Hard highlight</span>
                  <button
                    type="button"
                    className="flash-zone-editor__resize"
                    aria-label="Resize hard mode highlight zone"
                    onPointerDown={onPointerDown(
                      { kind: 'hardHighlight', index },
                      'resize',
                      normalized,
                    )}
                  />
                </div>
              );
            })}
          {onHardDistractionZonesChange &&
            hardDistractionZones.map((entry, index) => {
              const normalized = normalizeZone(entry.zone);
              return (
                <div
                  key={entry.id ?? `hard-distraction-${index}`}
                  className="flash-zone-editor__zone flash-zone-editor__zone--hard-distraction"
                  style={flashWordZoneStyle(normalized)}
                  onPointerDown={onPointerDown(
                    { kind: 'hardDistraction', index },
                    'move',
                    normalized,
                  )}
                  role="presentation"
                >
                  <span className="flash-zone-editor__zone-label">Hard distraction</span>
                  {entry.word.trim() && (
                    <span className="flash-zone-editor__zone-word">{entry.word.trim()}</span>
                  )}
                  <button
                    type="button"
                    className="flash-zone-editor__resize"
                    aria-label="Resize hard mode distraction zone"
                    onPointerDown={onPointerDown(
                      { kind: 'hardDistraction', index },
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

      {showHardMode && (
        <div className="flash-zone-editor__hard-mode">
          <h5 className="section-title">Hard mode</h5>
          <p className="muted flash-zone-editor__hard-mode-desc">
            Applies in-game when the player streak reaches {FLASH_HARD_MODE_STREAK_THRESHOLD} or
            higher. Extra colored highlight zones and faster distraction flashes stack on top of
            normal zones.
          </p>

          {onHardModeHighlightZonesChange && (
            <div className="flash-zone-editor__hard-highlights">
              <div className="flash-zone-editor__distractions-header">
                <h6 className="section-title">Hard mode highlight zones</h6>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={addHardHighlightZone}
                >
                  Add highlight zone
                </button>
              </div>
              {hardModeHighlightZones.length === 0 ? (
                <p className="muted">
                  No hard highlight zones — add decoy highlight boxes (cyan / orange / amber).
                </p>
              ) : (
                <ul className="flash-zone-editor__distraction-list">
                  {hardModeHighlightZones.map((_, index) => (
                    <li
                      key={`hard-highlight-field-${index}`}
                      className="flash-zone-editor__distraction-row"
                    >
                      <span className="muted">Highlight zone {index + 1}</span>
                      <button
                        type="button"
                        className="btn btn--danger btn--small"
                        onClick={() => removeHardHighlightZone(index)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {onHardDistractionZonesChange && (
            <div className="flash-zone-editor__hard-distractions">
              <div className="flash-zone-editor__distractions-header">
                <h6 className="section-title">Hard mode distraction zones</h6>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={addHardDistractionZone}
                >
                  Add hard distraction
                </button>
              </div>
              {hardDistractionZones.length === 0 ? (
                <p className="muted">
                  No hard distraction zones — add words that flash more often during hard mode.
                </p>
              ) : (
                <ul className="flash-zone-editor__distraction-list">
                  {hardDistractionZones.map((entry, index) => (
                    <li
                      key={entry.id ?? `hard-distraction-field-${index}`}
                      className="flash-zone-editor__distraction-row"
                    >
                      <label className="form-field flash-zone-editor__distraction-word">
                        Hard distraction word {index + 1}
                        <input
                          type="text"
                          value={entry.word}
                          onChange={(e) => updateHardDistractionWord(index, e.target.value)}
                          placeholder="Extra word during hard mode"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn--danger btn--small"
                        onClick={() => removeHardDistractionZone(index)}
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
      )}
    </div>
  );
}
