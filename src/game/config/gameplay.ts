/**
 * Gameplay tuning constants (P2.E1).
 *
 * Every gameplay number lives here — systems and entities reference
 * these instead of inline literals so tuning never requires touching
 * logic. Values are documented with their provenance (spec section or
 * a deliberate vertical-slice choice).
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Hero (spec 01 §7.1/§7.2)
// ---------------------------------------------------------------------------

/**
 * Hero walk speed at full joystick deflection, px/second.
 * 64 px/s = 4 tiles/s (tile = 16px, spec 01 §7.1) — a brisk but
 * readable top-down pace for a 320×180 logical viewport.
 */
export const HERO_SPEED_PX_SEC = 64;

/**
 * Hero collider (feet box) in px. Deliberately narrower than the 16px
 * sprite so the hero can brush walls without snagging corners, and
 * shallow (8px) so overhead sprites overlap believably.
 */
export const HERO_COLLIDER_WIDTH = 10;
export const HERO_COLLIDER_HEIGHT = 8;

/** Idle frame the hero spawns on / resets to. */
export const HERO_SPAWN_FACING = 'down' as const;

// ---------------------------------------------------------------------------
// Input (spec 07 §4.1)
// ---------------------------------------------------------------------------

/** Joystick touch box — 200×200 per spec 07 §4.1. */
export const JOYSTICK_TOUCH_BOX = 200;

/** Visual joystick diameter — 100px per spec 07 §4.1. */
export const JOYSTICK_VISUAL_DIAMETER = 100;

/** Knob travel is clamped to this radius (visual diameter / 2). */
export const JOYSTICK_RADIUS = JOYSTICK_VISUAL_DIAMETER / 2;

/** Knob (thumb cap) diameter in px — sized to the thumb pad, ~44% of the base. */
export const JOYSTICK_KNOB_DIAMETER = 44;

/**
 * Deadzone in px: translations below this snap to zero so a resting
 * thumb doesn't produce drift. ~10% of the travel radius.
 */
export const JOYSTICK_DEADZONE_PX = 6;

// ---------------------------------------------------------------------------
// Camera (spec 07 §3.5)
// ---------------------------------------------------------------------------

/**
 * Camera follow rate (1/s). The spec lerps with `min(1, dt*5)`; we use
 * the frame-rate-independent equivalent `1 - exp(-rate*dt)`, which
 * matches the spec's value at 60Hz (≈0.08/frame) and stays stable at
 * any tick rate.
 */
export const CAMERA_FOLLOW_RATE = 5;

/**
 * Camera zoom for the vertical slice. Logical resolution is 320×180
 * (spec 01 §7.1) with 16px tiles; ×2 shows a comfortable ~12-tile-wide
 * window on a phone in portrait while keeping pixels crisp (integer
 * scaling only — fractional zoom shimmers).
 */
export const GAME_ZOOM = 2;

// ---------------------------------------------------------------------------
// Animation (P2.E1 AC: locomotion cycles play at 8fps)
// ---------------------------------------------------------------------------

/**
 * Default playback rate for animations that don't declare their own
 * fps in the atlas manifest. Hero idle/walk declare 8 explicitly; this
 * default exists so a malformed manifest entry still animates.
 */
export const DEFAULT_ANIMATION_FPS = 8;

/**
 * Epsilon below which a movement speed is treated as "stopped" — used
 * to switch between walk and idle animation keys without flicker.
 */
export const MOVEMENT_IDLE_EPSILON = 1e-3;
