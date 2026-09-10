/**
 * Hero sprite art — "Alexios" (spec 01 §7.2, P2.E1.T1–T3).
 *
 * 16×24 tall sprites in the Greek vase-painting style (spec 01 §7.1):
 * black outline, ivory skin, gold chiton, red chlamys, wood spear.
 * Every pixel comes from the locked palette via a char legend.
 *
 * Frame inventory (P2.E1.T1–T3):
 *   idle   4 frames × 4 directions   (16)
 *   walk   6 frames × 4 directions   (24)
 *   attack 3 frames (front)          (3)
 *   hit    2 frames (front)          (2)
 *   death  4 frames (front)          (4)
 *   ---------------------------------
 *   total                            49 frames
 *
 * Authoring strategy: one hand-drawn torso grid per direction (down /
 * up / left; right = mirrored left), plus procedural layers — leg
 * poses, swinging arms, cloak flutter, spear overlay — and composition
 * transforms (bob / lean / blink). This keeps the 49 frames
 * consistent by construction and lets the cycle *feel* alive: arms
 * counter-swing against the legs, the chlamys trails the stride, the
 * body dips on foot contacts and rises on passing poses.
 */

import { buildLegend } from './palette';
import { rasterFromRows, type Raster } from './png';

// ---------------------------------------------------------------------------
// Legend (all colors from the locked 32-color palette, spec 12 §2.1)
// ---------------------------------------------------------------------------

const LEGEND = buildLegend({
  K: 'outline_black', // silhouette outline
  S: 'marble_ivory', // skin
  s: 'earth_light', // skin shadow (jaw, ankles)
  G: 'gold', // chiton (tunic)
  g: 'gold_mid', // chiton shading / hem
  h: 'gold_dark', // hair
  H: 'gold_mid', // hair shine (crown catch-light)
  R: 'cloth_red_light', // chlamys (cloak)
  r: 'cloth_red', // chlamys shading
  W: 'wood_highlight', // spear shaft (lit side)
  w: 'wood_light', // spear shaft (shaded side)
  T: 'stone_light', // spear tip
  F: 'fire_light', // attack impact glint
});

export const HERO_FRAME_WIDTH = 16;
export const HERO_FRAME_HEIGHT = 24;

/** Torso band: rows 0–16 (head + shoulders + chiton hem). */
const TORSO_ROWS = 17;
/** Leg band: rows 17–23 (thighs → sandals → ground outline). */
const LEG_ROWS = HERO_FRAME_HEIGHT - TORSO_ROWS;

// ---------------------------------------------------------------------------
// Torso grids (17 rows × 16 chars each)
//
// Hands are NOT part of the torso — arms are drawn procedurally over
// the cloak columns (see drawArmFront / drawArmSide) so swing poses
// never fight the static grid.
// ---------------------------------------------------------------------------

/** Down-facing torso (front view). Eyes at row 4, hair shine at row 2. */
const TORSO_DOWN = [
  '................',
  '.....KKKKKK.....',
  '....KhHhhHhK....',
  '...KhhhhhhhhK...',
  '...KhKSSSSKhK...',
  '...KhSSSSSShK...',
  '....KSSSSSSK....',
  '....KsSSSSsK....',
  '...KKGGGGGGKK...',
  '..KRRGGGGGGRRK..',
  '..KrRGGGGGGRrK..',
  '..KrRGGGGGGRrK..',
  '..KrRGGGGGGRrK..',
  '...KGGGGGGGGK...',
  '...KgGGGGGGgK...',
  '....KGGGGGGK....',
  '....KgGGGGgK....',
];

/** Up-facing torso (back view — cloak covers the back, no face). */
const TORSO_UP = [
  '................',
  '.....KKKKKK.....',
  '....KhHhhHhK....',
  '...KhhhhhhhhK...',
  '...KhhhhhhhhK...',
  '...KhhhhhhhhK...',
  '....KhhhhhhK....',
  '....KssssssK....',
  '...KKGGGGGGKK...',
  '..KRRRRRRRRRRK..',
  '..KrRRRRRRRRrK..',
  '..KrRRRRRRRRrK..',
  '..KrRRRRRRRRrK..',
  '...KRRRRRRRRK...',
  '...KrRRRRRRrK...',
  '....KRRRRRRK....',
  '....KrRRRRrK....',
];

/** Left-facing torso (profile, facing left; hair sweeps back). Eye at row 3. */
const TORSO_LEFT = [
  '................',
  '....KKKKKK......',
  '...KhHhhhhK.....',
  '...KhKSShhhhK...',
  '..KsSSSSShhhhK..',
  '..KSSSSShhhhhK..',
  '...KSSSSshhhhK..',
  '....KsSSshhhK...',
  '...KKGGGGGGKK...',
  '..KRRGGGGGGRRK..',
  '..KrRGGGGGGRrK..',
  '..KrRGGGGGGRrK..',
  '..KrRGGGGGGRrK..',
  '...KGGGGGGGGK...',
  '...KgGGGGGGgK...',
  '....KGGGGGGK....',
  '....KgGGGGgK....',
];

// ---------------------------------------------------------------------------
// Small pixel utilities (all operate on string row arrays)
// ---------------------------------------------------------------------------

const blankFrame = (): string[] =>
  Array.from({ length: HERO_FRAME_HEIGHT }, () => '.'.repeat(HERO_FRAME_WIDTH));

/** Mirror a frame horizontally (left ↔ right). */
function mirror(rows: readonly string[]): string[] {
  return rows.map((row) => row.split('').reverse().join(''));
}

/** Overlay `src` onto `dst` at (ox, oy); transparent (`.`) pixels skip. */
function blit(dst: string[], src: readonly string[], ox = 0, oy = 0): void {
  for (let y = 0; y < src.length; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= dst.length) continue;
    const row = src[y];
    let out = dst[ty].split('');
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const tx = ox + x;
      if (tx < 0 || tx >= dst[ty].length) continue;
      out[tx] = ch;
    }
    dst[ty] = out.join('');
  }
}

/** Set a single pixel if inside bounds. */
function setPx(dst: string[], x: number, y: number, ch: string): void {
  if (y < 0 || y >= dst.length) return;
  if (x < 0 || x >= dst[y].length) return;
  const out = dst[y].split('');
  out[x] = ch;
  dst[y] = out.join('');
}

/** Replace every `from` char with `to` in a horizontal span of a row. */
function replaceSpan(
  rows: string[],
  y: number,
  x0: number,
  x1: number,
  from: string,
  to: string,
): void {
  if (y < 0 || y >= rows.length) return;
  const out = rows[y].split('');
  for (let x = Math.max(0, x0); x <= Math.min(rows[y].length - 1, x1); x++) {
    if (out[x] === from) out[x] = to;
  }
  rows[y] = out.join('');
}

// ---------------------------------------------------------------------------
// Procedural legs
// ---------------------------------------------------------------------------

/** One leg's pose relative to its standing position. */
interface LegPose {
  /** Horizontal offset in px (negative = forward for side views). */
  readonly dx: number;
  /** Vertical lift in px (foot raises, leg shortens). */
  readonly lift: number;
}

const STAND: LegPose = { dx: 0, lift: 0 };

/**
 * Draw a 2px-wide leg with outline, ankle shade, sandal, and a ground
 * outline row. `x0` is the leg's outline column; skin occupies x0+1..x0+2.
 *
 * Lift L shifts the sandal + ground rows up by L and empties the rows
 * below (a stepping / bent-knee read).
 */
function drawLeg(
  dst: string[],
  x0: number,
  pose: LegPose,
  /** z-order: legs drawn later overwrite earlier ones. */
  side: 'left' | 'right',
): void {
  const x = x0 + pose.dx;
  const L = pose.lift;
  // Skin rows y0..y4-L (ankle shade on y4-L).
  for (let y = 0; y <= 4 - L && y < LEG_ROWS; y++) {
    const shade = y === 4 - L ? 's' : 'S';
    setPx(dst, x, TORSO_ROWS + y, 'K');
    setPx(dst, x + 1, TORSO_ROWS + y, shade);
    setPx(dst, x + 2, TORSO_ROWS + y, shade);
    setPx(dst, x + 3, TORSO_ROWS + y, 'K');
  }
  // Sandal row (y5-L): wood strap outer + skin, with ground outline below.
  const sandalY = TORSO_ROWS + 5 - L;
  if (L <= 5) {
    setPx(dst, x + 1, sandalY, 'S');
    setPx(dst, x + 2, sandalY, 'S');
    if (side === 'left') {
      setPx(dst, x - 1, sandalY, 'K');
      setPx(dst, x, sandalY, 'w');
      setPx(dst, x + 3, sandalY, 'K');
      for (let k = -1; k <= 3; k++) setPx(dst, x + k, sandalY + 1, 'K');
    } else {
      setPx(dst, x, sandalY, 'K');
      setPx(dst, x + 3, sandalY, 'w');
      setPx(dst, x + 4, sandalY, 'K');
      for (let k = 0; k <= 4; k++) setPx(dst, x + k, sandalY + 1, 'K');
    }
  }
}

/** Standing leg band (rows 17–23) for front/back views. */
function legsDown(left: LegPose, right: LegPose): string[] {
  const dst = blankFrame();
  // Draw back-to-front: shifted legs first so the planted leg reads on top.
  const order: Array<[number, LegPose, 'left' | 'right']> = [];
  if (left.dx > right.dx) order.push([8, right, 'right'], [4, left, 'left']);
  else order.push([4, left, 'left'], [8, right, 'right']);
  for (const [x0, pose, side] of order) drawLeg(dst, x0, pose, side);
  return dst;
}

/**
 * Profile leg band for the left-facing hero: leg "L" is the front leg,
 * leg "R" the back leg. The lifted leg is drawn first (behind).
 */
function legsSide(front: LegPose, back: LegPose): string[] {
  const dst = blankFrame();
  if (front.lift > 0) {
    drawLeg(dst, 8, back, 'right');
    drawLeg(dst, 4, front, 'left');
  } else {
    drawLeg(dst, 4, front, 'left');
    drawLeg(dst, 8, back, 'right');
  }
  return dst;
}

// ---------------------------------------------------------------------------
// Procedural arms (drawn over the cloak columns of the torso)
// ---------------------------------------------------------------------------

/** Neutral hand row for a standing arm. */
const ARM_REST_ROW = 12;
/** Shoulder row where every arm starts. */
const ARM_TOP_ROW = 10;

/**
 * Front/back-view arm: a 3px column (outline / skin / outline) from
 * the shoulder down to `handRow`. Rows above the shoulder are allowed
 * (raised arms for the attack windup). `ox/oy` follow the torso
 * offset so arms stay glued to the body during bob/lean.
 */
function drawArmFront(
  dst: string[],
  side: 'left' | 'right',
  handRow: number,
  ox: number,
  oy: number,
): void {
  const x0 = side === 'left' ? 2 : 11;
  const top = Math.min(ARM_TOP_ROW, handRow);
  const bottom = Math.max(ARM_TOP_ROW, handRow);
  for (let y = top; y <= bottom; y++) {
    setPx(dst, ox + x0, oy + y, 'K');
    setPx(dst, ox + x0 + 1, oy + y, 'S');
    setPx(dst, ox + x0 + 2, oy + y, 'K');
  }
}

/**
 * Profile-view (left-facing) arm: the near arm swings horizontally —
 * `x0` is the outline column (1 = swung forward, 2 = rest, 3 = back).
 */
function drawArmSide(dst: string[], x0: number, ox: number, oy: number): void {
  for (let y = ARM_TOP_ROW; y <= ARM_REST_ROW; y++) {
    setPx(dst, ox + x0, oy + y, 'K');
    setPx(dst, ox + x0 + 1, oy + y, 'S');
    setPx(dst, ox + x0 + 2, oy + y, 'K');
  }
}

/** Hand-row pairs for a walk step (arm swings opposite to the leg). */
const ARMS_STEP_L: ArmPose = {
  front: ARM_REST_ROW - 1,
  back: ARM_REST_ROW + 1,
  sideX: 2,
};
const ARMS_STEP_R: ArmPose = {
  front: ARM_REST_ROW + 1,
  back: ARM_REST_ROW - 1,
  sideX: 2,
};

// ---------------------------------------------------------------------------
// Cloak flutter — 1px chlamys trail escaping the silhouette
// ---------------------------------------------------------------------------

/**
 * Add a cloak trail pixel beside the hem on one side (`left`/`right`
 * are screen-relative). The trail sits on the body row just below the
 * cloak columns so it reads as fabric caught mid-swing.
 */
function drawFlutter(dst: string[], side: 'left' | 'right', ox: number, oy: number): void {
  const x = side === 'left' ? 2 : 13;
  setPx(dst, ox + x, oy + 13, 'r');
  setPx(dst, ox + x, oy + 14, 'r');
}

// ---------------------------------------------------------------------------
// Spear overlay (full-frame; held in the right hand at col 12–14)
// ---------------------------------------------------------------------------

interface SpearSpec {
  /** Row of the tip's top pixel (pointing up). */
  readonly tipRow: number;
  /** Row of the shaft's bottom pixel. */
  readonly buttRow: number;
  /** Optional fist patch row (the right hand grips the shaft here). */
  readonly fistRow?: number;
}

/** Resting carry: tip just above the head, butt at shin height. */
const SPEAR_CARRY: SpearSpec = { tipRow: 3, buttRow: 20, fistRow: 12 };

/**
 * Vertical spear: stone tip + double wood shaft + right-edge outline at
 * cols 13–15. Drawn with the same shift as the torso (held in hand).
 */
function drawSpear(dst: string[], spec: SpearSpec, ox: number, oy: number): void {
  const { tipRow, buttRow, fistRow } = spec;
  setPx(dst, ox + 13, oy + tipRow, 'T');
  setPx(dst, ox + 14, oy + tipRow, 'T');
  setPx(dst, ox + 15, oy + tipRow, 'K');
  for (let y = tipRow + 1; y <= buttRow; y++) {
    setPx(dst, ox + 13, oy + y, 'W');
    setPx(dst, ox + 14, oy + y, 'w');
    setPx(dst, ox + 15, oy + y, 'K');
  }
  if (fistRow !== undefined) {
    replaceSpan(dst, oy + fistRow, ox + 12, ox + 14, '.', 'S');
    setPx(dst, ox + 12, oy + fistRow, 'S');
  }
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** Arm pose for one frame. `front`/`back` = hand rows (down/up views);
 * `sideX` = profile arm outline column (left-facing). */
interface ArmPose {
  readonly front: number;
  readonly back: number;
  /** Profile arm outline column (1 fwd / 2 rest / 3 back). */
  readonly sideX: number;
}

const ARMS_STAND: ArmPose = {
  front: ARM_REST_ROW,
  back: ARM_REST_ROW,
  sideX: 2,
};

interface ComposeOptions {
  /** Torso grid for the direction. */
  readonly torso: readonly string[];
  /** Pre-composed leg band (full-frame with legs at rows 17–23). */
  readonly legs: readonly string[];
  /** Arm pose (counter-swings against the legs in walk cycles). */
  readonly arms?: ArmPose;
  /** Spear spec, or null for no spear (dropped / on the ground). */
  readonly spear?: SpearSpec | null;
  /** Vertical body offset (breathing bob / crouch), 0..3. */
  readonly bob?: number;
  /** Horizontal body lean in px (negative = screen-left). */
  readonly lean?: number;
  /** Blink: replace eye pixels with skin. */
  readonly blink?: boolean;
  /** Direction-specific eye row spans (x0..x1) for the blink. */
  readonly eyeSpans?: ReadonlyArray<{ row: number; x0: number; x1: number }>;
  /** Cloak trail side, or null for no flutter. */
  readonly flutter?: 'left' | 'right' | null;
  /** Extra decorative pixels painted last (attack glint), in frame space. */
  readonly accents?: ReadonlyArray<{ x: number; y: number; ch: string }>;
}

function composeFrame(opts: ComposeOptions): string[] {
  const frame = opts.legs.map((row) => row);
  const bob = opts.bob ?? 0;
  const lean = opts.lean ?? 0;
  const arms = opts.arms ?? ARMS_STAND;

  // Torso (blitted at an offset so bob/lean move the whole upper body).
  blit(frame, opts.torso, lean, bob);

  // Arms over the torso, following the same offset.
  const isProfile = opts.torso === TORSO_LEFT;
  if (isProfile) {
    drawArmSide(frame, arms.sideX, lean, bob);
  } else {
    drawArmFront(frame, 'left', arms.front, lean, bob);
    drawArmFront(frame, 'right', arms.back, lean, bob);
  }

  // Blink — mapped through the same offset as the torso.
  if (opts.blink && opts.eyeSpans) {
    for (const eye of opts.eyeSpans) {
      replaceSpan(frame, eye.row + bob, eye.x0 + lean, eye.x1 + lean, 'K', 'S');
    }
  }

  // Spear on top (in front of the body, same body offset).
  if (opts.spear) drawSpear(frame, opts.spear, lean, bob);

  // Cloak trail (fabric motion).
  if (opts.flutter) drawFlutter(frame, opts.flutter, lean, bob);

  // Decorative accents (impact glints), frame space.
  for (const a of opts.accents ?? []) setPx(frame, a.x, a.y, a.ch);

  return frame;
}

/** Convert authored rows into an RGBA raster. */
function toRaster(rows: readonly string[]): Raster {
  return rasterFromRows(
    rows,
    LEGEND,
    HERO_FRAME_WIDTH,
    HERO_FRAME_HEIGHT,
  );
}

// ---------------------------------------------------------------------------
// Idle (4 frames × 4 directions)
// ---------------------------------------------------------------------------

const EYES_DOWN = [{ row: 4, x0: 5, x1: 10 }];
const EYES_LEFT = [{ row: 3, x0: 4, x1: 6 }];

/**
 * Idle cycle: rest → dip + cloak sway (left) → dip + sway (right) →
 * blink. Looping at 8fps ≈ one breath every 0.5s with living fabric.
 */
function idleFrames(torso: readonly string[], legs: string[], eyeSpans: ReadonlyArray<{ row: number; x0: number; x1: number }>): string[][] {
  const rest = composeFrame({ torso, legs, spear: SPEAR_CARRY, eyeSpans });
  const swayL = composeFrame({ torso, legs, spear: SPEAR_CARRY, eyeSpans, bob: 1, flutter: 'left' });
  const swayR = composeFrame({ torso, legs, spear: SPEAR_CARRY, eyeSpans, bob: 1, flutter: 'right' });
  const blink = composeFrame({ torso, legs, spear: SPEAR_CARRY, eyeSpans, bob: 1, blink: true });
  return [rest, swayL, swayR, blink];
}

// ---------------------------------------------------------------------------
// Walk (6 frames × 4 directions)
// ---------------------------------------------------------------------------

/**
 * Front/back walk: alternating lifted feet with a passing pose. The
 * body dips on foot contacts (bob 1) and rises on passing poses, and
 * the arms counter-swing against the legs.
 */
function walkDownFrames(torso: readonly string[]): string[][] {
  const stepL = legsDown({ dx: -1, lift: 1 }, STAND);
  const pass = legsDown(STAND, STAND);
  const stepR = legsDown(STAND, { dx: 1, lift: 1 });
  const poses = [stepL, pass, stepR, pass, stepL, pass];
  const bobs = [1, 0, 1, 0, 1, 0];
  const arms = [ARMS_STEP_L, ARMS_STAND, ARMS_STEP_R, ARMS_STAND, ARMS_STEP_L, ARMS_STAND];
  const flutters: Array<'left' | 'right' | null> = ['left', null, 'right', null, 'left', null];
  return poses.map((legs, i) =>
    composeFrame({
      torso,
      legs,
      arms: arms[i],
      spear: SPEAR_CARRY,
      bob: bobs[i],
      flutter: flutters[i],
    }),
  );
}

/**
 * Profile walk: scissor strides + passing poses (classic 6-frame
 * cycle), the body leaning into the run and the near arm swinging.
 * The cloak trails behind (screen-right for a left-facing hero).
 */
function walkSideFrames(torso: readonly string[]): string[][] {
  const strideA = legsSide({ dx: -2, lift: 0 }, { dx: 1, lift: 1 });
  const strideB = legsSide({ dx: 1, lift: 1 }, { dx: -2, lift: 0 });
  const passLegs = legsSide(STAND, STAND);
  const poses = [strideA, passLegs, strideB, passLegs, strideA, passLegs];
  const bobs = [1, 0, 1, 0, 1, 0];
  // Left-facing: forward swing = smaller x. Arms oppose the stride.
  const sideXs = [3, 2, 1, 2, 3, 2];
  const leans = [1, 0, 1, 0, 1, 0];
  const arms: ArmPose[] = sideXs.map((sideX) => ({ ...ARMS_STAND, sideX }));
  return poses.map((legs, i) =>
    composeFrame({
      torso,
      legs,
      arms: arms[i],
      spear: SPEAR_CARRY,
      bob: bobs[i],
      lean: leans[i],
      flutter: 'right',
    }),
  );
}

// ---------------------------------------------------------------------------
// Attack / hit / death (front-facing "down"; combat cameras face the hero)
// ---------------------------------------------------------------------------

/**
 * Attack 3-frame: windup with the spear raised overhead and the body
 * coiled back → downward smash with a leg lunge and impact glint →
 * recover to the carry pose.
 */
function attackFrames(): string[][] {
  const windup = composeFrame({
    torso: TORSO_DOWN,
    legs: legsDown(STAND, STAND),
    arms: { front: 11, back: 8, sideX: 2 }, // right arm raised high
    spear: { tipRow: 1, buttRow: 17, fistRow: 9 },
    lean: 1,
    eyeSpans: EYES_DOWN,
  });
  const strike = composeFrame({
    torso: TORSO_DOWN,
    legs: legsDown({ dx: -1, lift: 0 }, { dx: 1, lift: 0 }),
    arms: { front: 12, back: 14, sideX: 2 }, // right arm smashed down
    spear: { tipRow: 4, buttRow: 21, fistRow: 14 },
    bob: 1,
    eyeSpans: EYES_DOWN,
    accents: [
      { x: 11, y: 4, ch: 'F' },
      { x: 12, y: 3, ch: 'F' },
    ],
  });
  const recover = composeFrame({
    torso: TORSO_DOWN,
    legs: legsDown(STAND, STAND),
    arms: ARMS_STAND,
    spear: SPEAR_CARRY,
    eyeSpans: EYES_DOWN,
  });
  return [windup, strike, recover];
}

/** Hit 2-frame: recoil with the spear lowered → recover. */
function hitFrames(): string[][] {
  const stagger = composeFrame({
    torso: TORSO_DOWN,
    legs: legsDown({ dx: -1, lift: 1 }, STAND),
    arms: { front: 13, back: 13, sideX: 2 }, // arms thrown out
    spear: { tipRow: 5, buttRow: 19, fistRow: 12 },
    lean: -2,
    blink: true,
    eyeSpans: EYES_DOWN,
  });
  const recover = composeFrame({
    torso: TORSO_DOWN,
    legs: legsDown(STAND, STAND),
    arms: ARMS_STAND,
    spear: SPEAR_CARRY,
    eyeSpans: EYES_DOWN,
  });
  return [stagger, recover];
}

/**
 * Death 4-frame: buckle (spear lowering) → sink to knees (spear
 * dropped) → collapse → flat. The last two frames are bespoke grids
 * (the body is horizontal).
 */
function deathFrames(): string[][] {
  const d0 = composeFrame({
    torso: TORSO_DOWN,
    legs: legsDown({ dx: -1, lift: 2 }, STAND),
    arms: { front: 13, back: 13, sideX: 2 },
    spear: { tipRow: 6, buttRow: 18, fistRow: 12 },
    lean: -2,
    bob: 1,
    blink: true,
    eyeSpans: EYES_DOWN,
  });
  const d1 = composeFrame({
    torso: TORSO_DOWN,
    legs: legsDown({ dx: -1, lift: 2 }, { dx: 1, lift: 2 }),
    arms: { front: 13, back: 13, sideX: 2 },
    spear: null, // spear dropped out of frame
    bob: 3,
    blink: true,
    eyeSpans: EYES_DOWN,
  });
  const d2 = toFrameRows([
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...KKKK.........',
    '..KhhSSSKGGGGK..',
    '..KhKSSSKGGGGGK.',
    '..KsSSSShGgGGK..',
    '...KKSSKGGKKKK..',
    '....KKKKKKKK....',
  ]);
  const d3 = toFrameRows([
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..KKKK..........',
    '.KhSSSSKKKKKK...',
    '.KSKSSGGGGGGGgK.',
    '..KKKKKKKKKKKK..',
  ]);
  return [d0, d1, d2, d3];
}

function toFrameRows(rows: readonly string[]): string[] {
  if (rows.length !== HERO_FRAME_HEIGHT) {
    throw new Error(`heroArt: frame needs ${HERO_FRAME_HEIGHT} rows, got ${rows.length}`);
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== HERO_FRAME_WIDTH) {
      throw new Error(
        `heroArt: row ${i} is ${rows[i].length} chars (expected ${HERO_FRAME_WIDTH}): "${rows[i]}"`,
      );
    }
  }
  return [...rows];
}

// ---------------------------------------------------------------------------
// Assembly — frame list + animation manifest
// ---------------------------------------------------------------------------

/** Hero animation keys (also used by the runtime, see heroDef.ts). */
export const HERO_ANIM_KEYS = {
  idleDown: 'hero_idle_down',
  idleUp: 'hero_idle_up',
  idleLeft: 'hero_idle_left',
  idleRight: 'hero_idle_right',
  walkDown: 'hero_walk_down',
  walkUp: 'hero_walk_up',
  walkLeft: 'hero_walk_left',
  walkRight: 'hero_walk_right',
  attack: 'hero_attack_down',
  hit: 'hero_hit_down',
  death: 'hero_death_down',
} as const;

/** Frames per second of the hero's locomotion cycles (P2.E1 AC: 8fps). */
export const HERO_LOCOMOTION_FPS = 8;

interface AnimationManifestEntry {
  readonly frames: readonly string[];
  readonly fps: number;
  readonly loop: boolean;
}

/**
 * Build every hero frame (name → pixels) plus the animation manifest
 * that ships inside `atlas_hero.json`. Frame names are `<anim>_<i>`.
 */
export function buildHeroArt(): {
  frames: ReadonlyArray<{ name: string; raster: Raster }>;
  animations: Readonly<Record<string, AnimationManifestEntry>>;
} {
  const frames: Array<{ name: string; raster: Raster }> = [];
  const animations: Record<string, AnimationManifestEntry> = {};

  const push = (key: string, sets: string[][], fps: number, loop: boolean): void => {
    animations[key] = { frames: sets.map((_, i) => `${key}_${i}`), fps, loop };
    sets.forEach((rows, i) => {
      frames.push({ name: `${key}_${i}`, raster: toRaster(rows) });
    });
  };

  const idleDown = idleFrames(TORSO_DOWN, legsDown(STAND, STAND), EYES_DOWN);
  const idleUp = idleFrames(TORSO_UP, legsDown(STAND, STAND), []);
  const idleLeft = idleFrames(TORSO_LEFT, legsSide(STAND, STAND), EYES_LEFT);

  push(HERO_ANIM_KEYS.idleDown, idleDown, HERO_LOCOMOTION_FPS, true);
  push(HERO_ANIM_KEYS.idleUp, idleUp, HERO_LOCOMOTION_FPS, true);
  push(HERO_ANIM_KEYS.idleLeft, idleLeft, HERO_LOCOMOTION_FPS, true);
  push(
    HERO_ANIM_KEYS.idleRight,
    idleLeft.map(mirror),
    HERO_LOCOMOTION_FPS,
    true,
  );

  push(HERO_ANIM_KEYS.walkDown, walkDownFrames(TORSO_DOWN), HERO_LOCOMOTION_FPS, true);
  push(HERO_ANIM_KEYS.walkUp, walkDownFrames(TORSO_UP), HERO_LOCOMOTION_FPS, true);
  push(HERO_ANIM_KEYS.walkLeft, walkSideFrames(TORSO_LEFT), HERO_LOCOMOTION_FPS, true);
  push(
    HERO_ANIM_KEYS.walkRight,
    walkSideFrames(TORSO_LEFT).map((frame) => mirror(frame)),
    HERO_LOCOMOTION_FPS,
    true,
  );

  push(HERO_ANIM_KEYS.attack, attackFrames(), 12, false);
  push(HERO_ANIM_KEYS.hit, hitFrames(), 10, false);
  push(HERO_ANIM_KEYS.death, deathFrames(), 6, false);

  return { frames, animations };
}
