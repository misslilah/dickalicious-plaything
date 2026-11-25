import type { ReactNode } from 'react';
import type { AvatarFrameId } from '../lib/avatarFrames';

/*
 * Vector art for avatar contours.
 *
 * Every contour is drawn in a 100×100 box centred on the avatar. The photo
 * (face) covers radius FACE_R, so rings are drawn BEHIND the photo and tuck a
 * hair under its edge: no gap, and nothing ever covers the face. Only the
 * crown overlaps the photo rim, on purpose.
 *
 * Layers (back → front): glow · body (ring, bevel, inner shade) · [photo] ·
 * ornaments · shine. Animated layers are their own <svg> so the browser can
 * animate them on the compositor (transform / opacity only).
 */

const C = 50;
/** Radius of the photo in the 100-unit box (avatar is 100 / 1.58 wide). */
const FACE_R = 31.65;
const TUCK = 0.3;

export type ContourDetail = {
  /** Draw fine layers (specular arcs, engraving, studs). Off for tiny sizes. */
  fine: boolean;
  /** Mount the animated layers (shine, flicker, flutter). Off for tiny sizes. */
  animated: boolean;
};

type Stop = [offset: number, color: string, alpha?: number];

/* ───────────── geometry + colour helpers ───────────── */

const f = (n: number) => n.toFixed(2);

function pt(deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arcPath(r: number, a0: number, a1: number): string {
  const [x0, y0] = pt(a0, r);
  const [x1, y1] = pt(a1, r);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} ${sweep} ${f(x1)} ${f(y1)}`;
}

/** Ring centre radius for a ring of width w that starts just under the photo. */
const ringR = (w: number) => FACE_R - TUCK + w / 2;

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
}

/** Interpolates a few key colours into many closely spaced stops (no banding). */
function smoothStops(keys: Stop[], count = 16): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    let k = 0;
    while (k < keys.length - 2 && t > keys[k + 1][0]) k += 1;
    const [o0, c0, a0 = 1] = keys[k];
    const [o1, c1, a1 = 1] = keys[k + 1];
    const span = o1 - o0 || 1;
    const u = Math.min(1, Math.max(0, (t - o0) / span));
    const eased = u * u * (3 - 2 * u);
    out.push(
      <stop
        key={i}
        offset={f(t)}
        stopColor={mix(c0, c1, eased)}
        stopOpacity={f(a0 + (a1 - a0) * eased)}
      />,
    );
  }
  return out;
}

function LinearRamp({
  id,
  keys,
  dir = [0, 0, 1, 1],
  count,
}: {
  id: string;
  keys: Stop[];
  dir?: [number, number, number, number];
  count?: number;
}) {
  return (
    <linearGradient id={id} x1={dir[0]} y1={dir[1]} x2={dir[2]} y2={dir[3]}>
      {smoothStops(keys, count)}
    </linearGradient>
  );
}

/** Radial ramp in user space, keys are radii in the 100-unit box. */
function RadialRamp({
  id,
  rMax,
  keys,
  count = 18,
}: {
  id: string;
  rMax: number;
  keys: Stop[];
  count?: number;
}) {
  return (
    <radialGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      cx={C}
      cy={C}
      r={rMax}
    >
      {smoothStops(
        keys.map(([r, c, a]) => [r / rMax, c, a] as Stop),
        count,
      )}
    </radialGradient>
  );
}

/** Soft gaussian-like halo as a radial gradient (no filters, no banding). */
function GlowDefs({
  id,
  color,
  peak,
  sigma,
  strength,
  rMax = 49.6,
}: {
  id: string;
  color: string;
  peak: number;
  sigma: number;
  strength: number;
  rMax?: number;
}) {
  const stops: ReactNode[] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i += 1) {
    const r = 28 + ((rMax - 28) * i) / steps;
    const g = Math.exp(-(((r - peak) / sigma) ** 2));
    const t = Math.min(1, Math.max(0, (rMax - r) / 7));
    const taper = t * t * (3 - 2 * t);
    stops.push(
      <stop
        key={i}
        offset={f(r / rMax)}
        stopColor={color}
        stopOpacity={f(strength * g * taper)}
      />,
    );
  }
  return (
    <radialGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      cx={C}
      cy={C}
      r={rMax}
    >
      {stops}
    </radialGradient>
  );
}

function Glow({ id, rMax = 49.6 }: { id: string; rMax?: number }) {
  return <circle cx={C} cy={C} r={rMax} fill={`url(#${id})`} />;
}

/* ───────────── shared defs: bevel highlight, inner shade ───────────── */

function CommonDefs({ uid }: { uid: string }) {
  return (
    <>
      <LinearRamp
        id={`${uid}-hl`}
        dir={[0, 0, 1, 1]}
        keys={[
          [0, '#ffffff', 0.85],
          [0.45, '#ffffff', 0.1],
          [0.75, '#ffffff', 0.05],
          [1, '#ffffff', 0.35],
        ]}
      />
      <LinearRamp
        id={`${uid}-spec`}
        dir={[0, 1, 1, 0]}
        keys={[
          [0, '#ffffff', 0],
          [0.5, '#ffffff', 0.95],
          [1, '#ffffff', 0],
        ]}
        count={12}
      />
      <RadialRamp
        id={`${uid}-shade`}
        rMax={38}
        keys={[
          [0, '#0b0414', 0.6],
          [FACE_R, '#0b0414', 0.6],
          [FACE_R + 1.2, '#0b0414', 0.34],
          [FACE_R + 3.4, '#0b0414', 0.1],
          [FACE_R + 5.6, '#0b0414', 0],
          [38, '#0b0414', 0],
        ]}
        count={24}
      />
    </>
  );
}

/** Bevel: outer lip light, inner lip shade, optional specular glint. */
function Bevel({
  uid,
  r,
  w,
  fine,
  glint = true,
}: {
  uid: string;
  r: number;
  w: number;
  fine: boolean;
  glint?: boolean;
}) {
  return (
    <>
      <circle
        cx={C}
        cy={C}
        r={r + w / 2 - 0.3}
        fill="none"
        stroke={`url(#${uid}-hl)`}
        strokeWidth={fine ? 0.6 : 0.8}
      />
      <circle
        cx={C}
        cy={C}
        r={r - w / 2 + 0.35}
        fill="none"
        stroke="#0b0414"
        strokeOpacity="0.38"
        strokeWidth={fine ? 0.7 : 0.9}
      />
      {fine && glint ? (
        <path
          d={arcPath(r, -158, -112)}
          fill="none"
          stroke={`url(#${uid}-spec)`}
          strokeWidth={Math.max(0.9, w * 0.3)}
          strokeLinecap="round"
        />
      ) : null}
    </>
  );
}

function InnerShade({ uid }: { uid: string }) {
  return <circle cx={C} cy={C} r="38" fill={`url(#${uid}-shade)`} />;
}

/** Soft bell-shaped light arc; the layer it lives in spins and fades. */
function ShineArc({
  r,
  w,
  color,
  start = -128,
  span = 70,
  peak = 0.95,
}: {
  r: number;
  w: number;
  color: string;
  start?: number;
  span?: number;
  peak?: number;
}) {
  const segs = 26;
  const out: ReactNode[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a0 = start + (i * span) / segs;
    const a1 = a0 + span / segs + 0.7;
    const t = (i + 0.5) / segs;
    const o = Math.sin(Math.PI * t) ** 2;
    out.push(
      <path
        key={`g${i}`}
        d={arcPath(r, a0, a1)}
        fill="none"
        stroke={color}
        strokeOpacity={f(o * peak * 0.16)}
        strokeWidth={w * 2.2}
      />,
      <path
        key={`c${i}`}
        d={arcPath(r, a0, a1)}
        fill="none"
        stroke={color}
        strokeOpacity={f(o * peak)}
        strokeWidth={w}
      />,
    );
  }
  return <>{out}</>;
}

type LayerZ = 'back' | 'front';

function Layer({
  z,
  anim,
  children,
}: {
  z: LayerZ;
  anim?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={`user-avatar__fx user-avatar__fx--${z}${anim ? ` uac-${anim}` : ''}`}
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

type FxProps = { uid: string; detail: ContourDetail };

/* ───────────── COMMON · Amethyst Ring ───────────── */

function AmethystFx({ uid, detail }: FxProps) {
  const w = detail.fine ? 3.4 : 4.2;
  const r = ringR(w);
  return (
    <Layer z="back">
      <defs>
        <CommonDefs uid={uid} />
        <LinearRamp
          id={`${uid}-body`}
          keys={[
            [0, '#f6e6ff'],
            [0.28, '#cf9bfd'],
            [0.58, '#8f4bd8'],
            [0.82, '#b57bf0'],
            [1, '#e4c6ff'],
          ]}
        />
      </defs>
      <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${uid}-body)`} strokeWidth={w} />
      <InnerShade uid={uid} />
      <Bevel uid={uid} r={r} w={w} fine={detail.fine} />
    </Layer>
  );
}

/* ───────────── RARE · Neon Pulse ───────────── */

function NeonFx({ uid, detail }: FxProps) {
  const pinkW = detail.fine ? 2.5 : 3.2;
  const pinkR = ringR(pinkW) + 0.3;
  const cyanW = detail.fine ? 1.5 : 2;
  const cyanR = 38.4;
  return (
    <>
      <Layer z="back" anim="breathe">
        <defs>
          <GlowDefs id={`${uid}-gp`} color="#e879f9" peak={36.5} sigma={5.4} strength={0.55} />
          <GlowDefs id={`${uid}-gc`} color="#22d3ee" peak={41} sigma={3.6} strength={0.4} />
        </defs>
        <Glow id={`${uid}-gp`} />
        <Glow id={`${uid}-gc`} />
      </Layer>
      <Layer z="back">
        <defs>
          <CommonDefs uid={uid} />
          <LinearRamp
            id={`${uid}-pink`}
            keys={[
              [0, '#fbd0ff'],
              [0.4, '#ec7cf7'],
              [0.75, '#c43fe0'],
              [1, '#f0a2fb'],
            ]}
          />
          <LinearRamp
            id={`${uid}-cyan`}
            dir={[1, 0, 0, 1]}
            keys={[
              [0, '#c4f6ff'],
              [0.5, '#34d8f0'],
              [1, '#0ea5c4'],
            ]}
          />
        </defs>
        <InnerShade uid={uid} />
        {/* dark tube housing gives the neon its contrast */}
        <circle cx={C} cy={C} r={pinkR} fill="none" stroke="#12051f" strokeOpacity="0.38" strokeWidth={pinkW + 1.4} />
        <circle cx={C} cy={C} r={pinkR} fill="none" stroke={`url(#${uid}-pink)`} strokeWidth={pinkW} />
        <circle cx={C} cy={C} r={pinkR} fill="none" stroke="#ffffff" strokeOpacity="0.8" strokeWidth={pinkW * 0.3} />
        <circle cx={C} cy={C} r={cyanR} fill="none" stroke="#12051f" strokeOpacity="0.4" strokeWidth={cyanW + 1.2} />
        <circle cx={C} cy={C} r={cyanR} fill="none" stroke={`url(#${uid}-cyan)`} strokeWidth={cyanW} />
        <circle cx={C} cy={C} r={cyanR} fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth={cyanW * 0.3} />
      </Layer>
    </>
  );
}

/* ───────────── RARE · Gilded Halo ───────────── */

const GOLD: Stop[] = [
  [0, '#fff7d6'],
  [0.22, '#f8d978'],
  [0.5, '#c58f27'],
  [0.76, '#f3c64a'],
  [1, '#fff0b8'],
];

function sparklePath(cx: number, cy: number, s: number): string {
  const k = s * 0.22;
  return `M${f(cx)} ${f(cy - s)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + s)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + s)}Q${f(cx - k)} ${f(cy + k)} ${f(cx - s)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - s)}Z`;
}

function HaloFx({ uid, detail }: FxProps) {
  const w = detail.fine ? 3.4 : 4.2;
  const r = ringR(w);
  return (
    <Layer z="back">
      <defs>
        <CommonDefs uid={uid} />
        <LinearRamp id={`${uid}-gold`} keys={GOLD} />
        <GlowDefs id={`${uid}-glow`} color="#f5c84c" peak={36} sigma={5} strength={0.4} />
      </defs>
      <Glow id={`${uid}-glow`} />
      <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${uid}-gold)`} strokeWidth={w} />
      <InnerShade uid={uid} />
      <Bevel uid={uid} r={r} w={w} fine={detail.fine} />
      <circle
        cx={C}
        cy={C}
        r={detail.fine ? 38.4 : 39}
        fill="none"
        stroke={`url(#${uid}-gold)`}
        strokeOpacity="0.7"
        strokeWidth={detail.fine ? 0.7 : 1.1}
      />
      {detail.fine ? (
        <path d={sparklePath(...pt(-90, 38.4), 3.1)} fill="#fff7d6" fillOpacity="0.95" />
      ) : null}
    </Layer>
  );
}

/* ───────────── RARE · Liquid Silver ───────────── */

function MercuryFx({ uid, detail }: FxProps) {
  const w = detail.fine ? 3.9 : 4.6;
  const r = ringR(w);
  const outer = r + w / 2;
  const beads: Array<[number, number]> = [
    [-125, 2.1],
    [-55, 2.1],
    [90, 2.7],
    [160, 1.3],
    [20, 1.3],
  ];
  return (
    <Layer z="back">
      <defs>
        <CommonDefs uid={uid} />
        <LinearRamp
          id={`${uid}-chrome`}
          keys={[
            [0, '#ffffff'],
            [0.2, '#cdd6e2'],
            [0.4, '#6b7a90'],
            [0.54, '#dde4ee'],
            [0.74, '#8493a8'],
            [0.9, '#eef2f8'],
            [1, '#ffffff'],
          ]}
          count={22}
        />
        <radialGradient id={`${uid}-bead`} cx="35%" cy="30%" r="75%">
          {smoothStops(
            [
              [0, '#ffffff'],
              [0.35, '#d8dfe9'],
              [0.75, '#7f8da2'],
              [1, '#4a566b'],
            ],
            10,
          )}
        </radialGradient>
        <GlowDefs id={`${uid}-glow`} color="#cbd5e1" peak={36.5} sigma={5} strength={0.3} />
      </defs>
      <Glow id={`${uid}-glow`} />
      <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${uid}-chrome)`} strokeWidth={w} />
      <InnerShade uid={uid} />
      <Bevel uid={uid} r={r} w={w} fine={detail.fine} />
      {beads
        .filter(([, br]) => detail.fine || br > 2)
        .map(([a, br], i) => {
          const [bx, by] = pt(a, outer - br * 0.35);
          return (
            <g key={i}>
              <circle cx={f(bx)} cy={f(by)} r={br} fill={`url(#${uid}-bead)`} stroke="#3b465a" strokeOpacity="0.55" strokeWidth="0.35" />
              <circle cx={f(bx - br * 0.32)} cy={f(by - br * 0.36)} r={br * 0.26} fill="#ffffff" fillOpacity="0.95" />
            </g>
          );
        })}
    </Layer>
  );
}

/* ───────────── EPIC · Thorn Ring ───────────── */

function thornPath(a: number, tipR: number, halfW: number): string {
  const baseR = 33.2;
  const [x0, y0] = pt(a - halfW, baseR);
  const [x1, y1] = pt(a + halfW, baseR);
  const [tx, ty] = pt(a, tipR);
  const [c0x, c0y] = pt(a - halfW * 0.18, baseR + (tipR - baseR) * 0.5);
  const [c1x, c1y] = pt(a + halfW * 0.18, baseR + (tipR - baseR) * 0.5);
  return `M${f(x0)} ${f(y0)}Q${f(c0x)} ${f(c0y)} ${f(tx)} ${f(ty)}Q${f(c1x)} ${f(c1y)} ${f(x1)} ${f(y1)}Z`;
}

function ThornsFx({ uid, detail }: FxProps) {
  const w = detail.fine ? 3.2 : 4;
  const r = ringR(w);
  const count = detail.fine ? 12 : 8;
  const thorns: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = -90 + (i * 360) / count;
    const long = i % 2 === 0;
    thorns.push(
      <path
        key={i}
        d={thornPath(a, long ? 43.6 : 40.2, long ? 4.6 : 3.6)}
        fill={`url(#${uid}-thorn)`}
        stroke="#04230f"
        strokeOpacity="0.85"
        strokeWidth={detail.fine ? 0.5 : 0.7}
        strokeLinejoin="round"
      />,
    );
  }
  return (
    <>
      <Layer z="back">
        <defs>
          <CommonDefs uid={uid} />
          <LinearRamp
            id={`${uid}-vine`}
            keys={[
              [0, '#3f8f5c'],
              [0.3, '#15572f'],
              [0.65, '#0a3a1f'],
              [1, '#2d7a4a'],
            ]}
          />
          <RadialRamp
            id={`${uid}-thorn`}
            rMax={44}
            keys={[
              [32, '#0a3a1f'],
              [36, '#145a31'],
              [40, '#2f8a55'],
              [44, '#b6f0c8'],
            ]}
          />
          <GlowDefs id={`${uid}-glow`} color="#4ade80" peak={38.5} sigma={5} strength={0.28} />
        </defs>
        <Glow id={`${uid}-glow`} />
        {thorns}
        <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${uid}-vine)`} strokeWidth={w} />
        <InnerShade uid={uid} />
        <Bevel uid={uid} r={r} w={w} fine={detail.fine} />
      </Layer>
      {detail.animated ? (
        <Layer z="front" anim="shine">
          <ShineArc r={r + 3.2} w={2.2} color="#d1fae5" />
        </Layer>
      ) : null}
    </>
  );
}

/* ───────────── EPIC · Violet Aurora ───────────── */

function diamondPath(cx: number, cy: number, s: number): string {
  return `M${f(cx)} ${f(cy - s)}L${f(cx + s * 0.78)} ${f(cy)}L${f(cx)} ${f(cy + s)}L${f(cx - s * 0.78)} ${f(cy)}Z`;
}

function AuroraFx({ uid, detail }: FxProps) {
  const w = detail.fine ? 4.2 : 4.8;
  const r = ringR(w);
  const studs: ReactNode[] = [];
  if (detail.fine) {
    for (let i = 0; i < 48; i += 1) {
      const [x, y] = pt((i * 360) / 48, 39.6);
      const big = i % 4 === 0;
      studs.push(
        <circle key={i} cx={f(x)} cy={f(y)} r={big ? 0.62 : 0.4} fill="#fbd6ff" fillOpacity={big ? 0.95 : 0.65} />,
      );
    }
  }
  const gems = [-90, 0, 90, 180].map((a) => pt(a, r));
  return (
    <>
      <Layer z="back" anim="breathe">
        <defs>
          <GlowDefs id={`${uid}-glow`} color="#e879f9" peak={37.5} sigma={5.8} strength={0.5} />
        </defs>
        <Glow id={`${uid}-glow`} />
      </Layer>
      <Layer z="back">
        <defs>
          <CommonDefs uid={uid} />
          <LinearRamp
            id={`${uid}-body`}
            keys={[
              [0, '#fde0ff'],
              [0.22, '#f0a7fb'],
              [0.46, '#b873f5'],
              [0.7, '#e47ef5'],
              [1, '#fbd0f5'],
            ]}
            count={20}
          />
          <linearGradient id={`${uid}-gem`} x1="0" y1="0" x2="1" y2="1">
            {smoothStops(
              [
                [0, '#ffffff'],
                [0.4, '#f5c6ff'],
                [1, '#a64be0'],
              ],
              10,
            )}
          </linearGradient>
        </defs>
        <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${uid}-body)`} strokeWidth={w} />
        <InnerShade uid={uid} />
        <Bevel uid={uid} r={r} w={w} fine={detail.fine} />
        {/* inner engraved line */}
        <circle cx={C} cy={C} r={r} fill="none" stroke="#5a1c8c" strokeOpacity="0.4" strokeWidth="0.5" />
        {studs}
        {gems.map(([gx, gy], i) => (
          <path
            key={i}
            d={diamondPath(gx, gy, detail.fine ? 3.3 : 3.6)}
            fill={`url(#${uid}-gem)`}
            stroke="#5a1c8c"
            strokeOpacity="0.7"
            strokeWidth="0.45"
            strokeLinejoin="round"
          />
        ))}
      </Layer>
      {detail.animated ? (
        <Layer z="front" anim="shine">
          <ShineArc r={r} w={2.6} color="#fff0ff" />
        </Layer>
      ) : null}
    </>
  );
}

/* ───────────── LEGENDARY · Gilded Crown ───────────── */

function CrownFx({ uid, detail }: FxProps) {
  const w = detail.fine ? 3.6 : 4.4;
  const r = ringR(w);
  const dots: ReactNode[] = [];
  if (detail.fine) {
    for (let i = 0; i < 40; i += 1) {
      const a = (i * 360) / 40;
      // keep the engraving clear of the crown
      if (a > 244 && a < 296) continue;
      const [x, y] = pt(a, r);
      dots.push(<circle key={i} cx={f(x)} cy={f(y)} r="0.5" fill="#6b3f06" fillOpacity="0.55" />);
    }
  }
  const [bl, bt] = pt(-114, 36.2);
  const [br] = pt(-66, 36.2);
  const body = `M${f(bl)} ${f(bt)}L32.6 3.6L41.2 11.6L50 -2.6L58.8 11.6L67.4 3.6L${f(br)} ${f(bt)}A36.2 36.2 0 0 0 ${f(bl)} ${f(bt)}Z`;
  const inner = `M${f(bl + 1.6)} ${f(bt - 1.4)}L35.2 8.4L41.4 14L50 3.4L58.6 14L64.8 8.4L${f(br - 1.6)} ${f(bt - 1.4)}A33.4 33.4 0 0 0 ${f(bl + 1.6)} ${f(bt - 1.4)}Z`;
  return (
    <>
      <Layer z="back">
        <defs>
          <CommonDefs uid={uid} />
          <LinearRamp id={`${uid}-gold`} keys={GOLD} count={20} />
          <GlowDefs id={`${uid}-glow`} color="#f5c84c" peak={37} sigma={5.4} strength={0.5} />
        </defs>
        <Glow id={`${uid}-glow`} />
        <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${uid}-gold)`} strokeWidth={w} />
        <InnerShade uid={uid} />
        <Bevel uid={uid} r={r} w={w} fine={detail.fine} />
        {dots}
      </Layer>
      <Layer z="front" anim="bob">
        <defs>
          <LinearRamp
            id={`${uid}-crown`}
            dir={[0.1, 0, 0.5, 1]}
            keys={[
              [0, '#fff6cf'],
              [0.3, '#f7d56e'],
              [0.62, '#d49f2e'],
              [1, '#9a6416'],
            ]}
            count={18}
          />
          <LinearRamp
            id={`${uid}-crown-in`}
            dir={[0, 0, 0, 1]}
            keys={[
              [0, '#8a5a12', 0.55],
              [1, '#f0c250', 0.1],
            ]}
            count={8}
          />
          <radialGradient id={`${uid}-ruby`} cx="35%" cy="30%" r="75%">
            {smoothStops(
              [
                [0, '#ffe3ea'],
                [0.4, '#fb6f8f'],
                [1, '#a3123a'],
              ],
              10,
            )}
          </radialGradient>
          <radialGradient id={`${uid}-amy`} cx="35%" cy="30%" r="75%">
            {smoothStops(
              [
                [0, '#f6e4ff'],
                [0.4, '#c084fc'],
                [1, '#6b21a8'],
              ],
              10,
            )}
          </radialGradient>
          <radialGradient id={`${uid}-pearl`} cx="35%" cy="30%" r="75%">
            {smoothStops(
              [
                [0, '#ffffff'],
                [0.6, '#f6e8c8'],
                [1, '#c9a35a'],
              ],
              8,
            )}
          </radialGradient>
        </defs>
        {/* soft contact shadow where the crown meets the ring */}
        <ellipse cx="50" cy="19.6" rx="17" ry="2" fill="#2a0a3d" fillOpacity="0.28" />
        <path d={body} fill={`url(#${uid}-crown)`} stroke="#6b3f06" strokeWidth="0.8" strokeLinejoin="round" />
        <path d={inner} fill={`url(#${uid}-crown-in)`} />
        {detail.fine ? (
          <path
            d="M36 15L33.6 6.6M43.4 12.2L50 1.4M56.6 12.2L50 1.4"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.55"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        ) : null}
        <circle cx="50" cy="9.4" r="2.5" fill={`url(#${uid}-ruby)`} stroke="#5c0f26" strokeOpacity="0.8" strokeWidth="0.45" />
        <circle cx="40.6" cy="13.6" r="1.8" fill={`url(#${uid}-amy)`} stroke="#3b0f66" strokeOpacity="0.8" strokeWidth="0.4" />
        <circle cx="59.4" cy="13.6" r="1.8" fill={`url(#${uid}-amy)`} stroke="#3b0f66" strokeOpacity="0.8" strokeWidth="0.4" />
        <circle cx="50" cy="-2.6" r="1.7" fill={`url(#${uid}-pearl)`} stroke="#8a6212" strokeOpacity="0.7" strokeWidth="0.35" />
        <circle cx="32.6" cy="3.6" r="1.5" fill={`url(#${uid}-pearl)`} stroke="#8a6212" strokeOpacity="0.7" strokeWidth="0.35" />
        <circle cx="67.4" cy="3.6" r="1.5" fill={`url(#${uid}-pearl)`} stroke="#8a6212" strokeOpacity="0.7" strokeWidth="0.35" />
        <circle cx="49.4" cy="8.6" r="0.7" fill="#ffffff" fillOpacity="0.9" />
      </Layer>
      {detail.animated ? (
        <Layer z="front" anim="shine-legend">
          <ShineArc r={r} w={2.4} color="#fff7d6" />
        </Layer>
      ) : null}
    </>
  );
}

/* ───────────── LEGENDARY · Ember Ring ───────────── */

/**
 * Flame tongue in a local frame: x runs outward from the ring, y runs along
 * the rim. Both flanks are S-curves that meet in a leaning tip.
 */
function flamePath(a: number, tipR: number, halfW: number, lean: number): string {
  const baseR = 32.6;
  const L = tipR - baseR;
  // halfW / lean arrive in degrees of arc; convert to rim units.
  const hw = (halfW * Math.PI * baseR) / 180;
  const ln = (lean * Math.PI * baseR) / 180;
  const lp = (x: number, y: number) => {
    const r = baseR + x;
    return pt(a + ((y / r) * 180) / Math.PI, r);
  };
  const p = (x: number, y: number) => {
    const [px, py] = lp(x, y);
    return `${f(px)} ${f(py)}`;
  };
  return (
    `M${p(0, -hw)}` +
    `C${p(L * 0.18, -hw * 1.5)} ${p(L * 0.66, -hw * 0.6 + ln * 0.3)} ${p(L, ln)}` +
    `C${p(L * 0.62, hw * 0.5 + ln * 0.8)} ${p(L * 0.28, hw * 1.25)} ${p(0, hw)}Z`
  );
}

function flameLayer(
  count: number,
  offset: number,
  lengths: number[],
  halfW: number,
  lean: number,
  fill: string,
): ReactNode {
  const paths: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = -90 + offset + (i * 360) / count;
    paths.push(
      <path key={i} d={flamePath(a, lengths[i % lengths.length], halfW, lean)} fill={fill} />,
    );
  }
  return <>{paths}</>;
}

function FlameFx({ uid, detail }: FxProps) {
  const w = detail.fine ? 3.4 : 4.2;
  const r = ringR(w);
  const n = detail.fine ? 12 : 9;
  const step = 360 / n;
  return (
    <>
      <Layer z="back" anim="breathe-fast">
        <defs>
          <GlowDefs id={`${uid}-glow`} color="#fb923c" peak={38} sigma={6} strength={0.55} />
        </defs>
        <Glow id={`${uid}-glow`} />
      </Layer>
      <Layer z="back" anim="flicker-a">
        <defs>
          <RadialRamp
            id={`${uid}-f1`}
            rMax={50}
            keys={[
              [32, '#fb923c'],
              [38, '#ea4a1f'],
              [44, '#c4123f', 0.85],
              [50, '#7a0f3a', 0],
            ]}
          />
        </defs>
        {flameLayer(n, 0, [48.4, 42.4, 49.2, 43.4], step * 0.46, step * 0.3, `url(#${uid}-f1)`)}
      </Layer>
      <Layer z="back" anim="flicker-b">
        <defs>
          <RadialRamp
            id={`${uid}-f2`}
            rMax={46}
            keys={[
              [32, '#fde047'],
              [36, '#fbab2d'],
              [41, '#f97316', 0.92],
              [46, '#e5391e', 0],
            ]}
          />
        </defs>
        {flameLayer(n, step / 2, [44.6, 39.6, 45.4, 40.4], step * 0.38, step * 0.26, `url(#${uid}-f2)`)}
      </Layer>
      <Layer z="back" anim="flicker-c">
        <defs>
          <RadialRamp
            id={`${uid}-f3`}
            rMax={41}
            keys={[
              [32, '#ffffff'],
              [35, '#fff3b0'],
              [38, '#fde047', 0.9],
              [41, '#fb923c', 0],
            ]}
          />
        </defs>
        {flameLayer(n, 0, [40, 37, 41, 37.6], step * 0.27, step * 0.2, `url(#${uid}-f3)`)}
      </Layer>
      <Layer z="back">
        <defs>
          <CommonDefs uid={uid} />
          <LinearRamp
            id={`${uid}-ember`}
            dir={[0, 1, 1, 0]}
            keys={[
              [0, '#fde68a'],
              [0.3, '#f97316'],
              [0.62, '#9a2a0e'],
              [1, '#f97316'],
            ]}
            count={18}
          />
        </defs>
        <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${uid}-ember)`} strokeWidth={w} />
        <InnerShade uid={uid} />
        <Bevel uid={uid} r={r} w={w} fine={detail.fine} />
      </Layer>
      {detail.animated ? (
        <Layer z="front" anim="shine-legend">
          <ShineArc r={r} w={2.4} color="#fff3c4" />
        </Layer>
      ) : null}
    </>
  );
}

/* ───────────── LEGENDARY · Seraph Wings ───────────── */

type FeatherRow = {
  angles: number[];
  length: number[];
  width: number;
  anchor: [number, number];
  fill: string;
};

function Feather({
  ax,
  ay,
  angle,
  length,
  width,
  fill,
  fine,
}: {
  ax: number;
  ay: number;
  angle: number;
  length: number;
  width: number;
  fill: string;
  fine: boolean;
}) {
  const d = `M0 0C${f(length * 0.28)} ${f(-width * 0.9)} ${f(length * 0.78)} ${f(-width * 0.75)} ${f(length)} 0C${f(length * 0.78)} ${f(width * 0.75)} ${f(length * 0.28)} ${f(width * 0.9)} 0 0Z`;
  return (
    <g transform={`translate(${f(ax)} ${f(ay)}) rotate(${angle})`}>
      <path d={d} fill={fill} stroke="#9a6416" strokeOpacity="0.5" strokeWidth="0.4" strokeLinejoin="round" />
      {fine ? (
        <path
          d={`M${f(length * 0.14)} 0L${f(length * 0.9)} 0`}
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="0.35"
          strokeLinecap="round"
        />
      ) : null}
    </g>
  );
}

function WingSvg({
  uid,
  detail,
  side,
}: FxProps & { side: 'left' | 'right' }) {
  const rows: FeatherRow[] = [
    {
      angles: [-80, -62, -44, -26, -8, 10, 28],
      length: [24, 28, 31, 32, 31, 28, 23],
      width: 7.4,
      anchor: [70, 47],
      fill: `url(#${uid}-fe1)`,
    },
    {
      angles: [-71, -53, -35, -17, 1, 19],
      length: [18, 21, 23, 23, 21, 17],
      width: 6.2,
      anchor: [70, 47],
      fill: `url(#${uid}-fe2)`,
    },
    {
      angles: [-62, -44, -26, -8, 10],
      length: [11, 13.5, 15, 14.5, 12],
      width: 5,
      anchor: [70, 47],
      fill: `url(#${uid}-fe3)`,
    },
  ];
  return (
    <Layer z="back" anim={`flutter-${side === 'left' ? 'l' : 'r'}`}>
      <g transform={side === 'left' ? 'translate(100 0) scale(-1 1)' : undefined}>
        {rows.map((row, ri) =>
          row.angles.map((angle, i) => (
            <Feather
              key={`${ri}-${i}`}
              ax={row.anchor[0]}
              ay={row.anchor[1]}
              angle={angle}
              length={row.length[i]}
              width={row.width}
              fill={row.fill}
              fine={detail.fine && ri < 2}
            />
          )),
        )}
      </g>
    </Layer>
  );
}

function WingsFx({ uid, detail }: FxProps) {
  const w = detail.fine ? 3.4 : 4.2;
  const r = ringR(w);
  return (
    <>
      <Layer z="back" anim="breathe">
        <defs>
          <GlowDefs id={`${uid}-glow`} color="#fde08c" peak={38} sigma={7} strength={0.5} />
          <LinearRamp id={`${uid}-fe1`} dir={[0, 0, 1, 0]} keys={[[0, '#fff9e2'], [0.5, '#f9ebb8'], [1, '#e0a93a']]} count={14} />
          <LinearRamp id={`${uid}-fe2`} dir={[0, 0, 1, 0]} keys={[[0, '#fffdf2'], [0.55, '#fdf3cc'], [1, '#efc660']]} count={14} />
          <LinearRamp id={`${uid}-fe3`} dir={[0, 0, 1, 0]} keys={[[0, '#ffffff'], [0.6, '#fff8e0'], [1, '#f6dc94']]} count={14} />
        </defs>
        <Glow id={`${uid}-glow`} />
      </Layer>
      <WingSvg uid={uid} detail={detail} side="left" />
      <WingSvg uid={uid} detail={detail} side="right" />
      <Layer z="back">
        <defs>
          <CommonDefs uid={uid} />
          <LinearRamp id={`${uid}-gold`} keys={GOLD} count={20} />
        </defs>
        <circle cx={C} cy={C} r={r} fill="none" stroke={`url(#${uid}-gold)`} strokeWidth={w} />
        <InnerShade uid={uid} />
        <Bevel uid={uid} r={r} w={w} fine={detail.fine} />
        {detail.fine ? (
          <path d={sparklePath(...pt(-90, r), 2.8)} fill="#ffffff" fillOpacity="0.95" />
        ) : null}
      </Layer>
      {detail.animated ? (
        <Layer z="front" anim="shine-legend">
          <ShineArc r={r} w={2.4} color="#fffbe6" />
        </Layer>
      ) : null}
    </>
  );
}

/* ───────────── entry point ───────────── */

export function AvatarContourFx({
  frame,
  uid,
  detail,
}: {
  frame: AvatarFrameId;
  uid: string;
  detail: ContourDetail;
}) {
  const props = { uid, detail };
  switch (frame) {
    case 'amethyst':
      return <AmethystFx {...props} />;
    case 'neon':
      return <NeonFx {...props} />;
    case 'halo':
      return <HaloFx {...props} />;
    case 'mercury':
      return <MercuryFx {...props} />;
    case 'thorns':
      return <ThornsFx {...props} />;
    case 'aurora':
      return <AuroraFx {...props} />;
    case 'crown':
      return <CrownFx {...props} />;
    case 'flame':
      return <FlameFx {...props} />;
    case 'wings':
      return <WingsFx {...props} />;
    default:
      return null;
  }
}
