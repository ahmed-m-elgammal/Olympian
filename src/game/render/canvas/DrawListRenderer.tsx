/**
 * DrawListRenderer — paints the render bus mailbox with Skia
 * (spec 07 §3.1–§3.3).
 *
 * Subscribes to `renderBus` (one re-render per published frame) and
 * records every {@link DrawCommand} into a single `SkPicture`, drawn
 * inside a `<Group>` carrying the camera transform. Commands are
 * world-space; the group applies scale + translation exactly once:
 *
 *     screen = zoom × (world − camera.topLeft)
 *
 * Supported commands: `sprite`, `tile`, `rect`, `circle`. `text`,
 * `particle` and `shake` have no P2.E1 producers (they arrive with the
 * combat/FX epics) and are ignored here.
 *
 * Performance notes (spec 07 §8):
 *  - One `<Picture>` per frame — reconciliation is trivial.
 *  - Atlas sampling is nearest-neighbour (`fastSample = true`) so the
 *    baked pixel art stays crisp under integer zoom.
 *  - The tile/sprite src rects resolve through the atlas registry; a
 *    command whose image has not finished loading yet is skipped for
 *    that frame (it appears on the next frame after load).
 *
 * @packageDocumentation
 */

import React, { useMemo } from 'react';
import {
  Group,
  Picture,
  Skia,
  useImage,
  type SkCanvas,
  type SkImage,
  type SkPaint,
  type SkPicture,
  type SkRect,
} from '@shopify/react-native-skia';

import type { DrawCommand } from '@/game/engine/render/DrawCommand';
import { useRenderBus } from '@/data/stores/renderBus';
import {
  ATLAS_IDS,
  frameRectOf,
  tileEntries,
  type AtlasFrameRect,
} from '@/game/render/atlas/atlasRegistry';
import { ATLAS_IMAGE_SOURCES } from '@/game/render/atlas/atlasImages';

/** Images available to the painter, keyed by atlas id. */
type AtlasImages = Readonly<Record<string, SkImage | null>>;

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Shared paint for atlas blits (alpha is mutated per command). */
const blitPaint: SkPaint = Skia.Paint();
/** Shared paint for flat fills (color/alpha mutated per command). */
const fillPaint: SkPaint = Skia.Paint();

/**
 * Draw one atlas frame at `dest`, honoring `flipX`/`flipY` via mirrored
 * canvas transforms (pivots on the dest rect so flips are in-place).
 * Nearest-neighbour sampling keeps pixel edges crisp.
 */
function drawAtlasRect(
  canvas: SkCanvas,
  image: SkImage,
  src: AtlasFrameRect,
  dest: SkRect,
  flipX: boolean,
  flipY: boolean,
  alpha: number,
): void {
  blitPaint.setAlphaf(alpha);
  if (!flipX && !flipY) {
    canvas.drawImageRect(
      image,
      Skia.XYWHRect(src.x, src.y, src.width, src.height),
      dest,
      blitPaint,
      true,
    );
    return;
  }
  // Pivot the mirror inside the dest rect (same recipe as the
  // imperative TileRenderer): scale(-1, 1) around the right edge for
  // flipX, scale(1, -1) around the bottom edge for flipY.
  canvas.save();
  canvas.translate(flipX ? dest.x + dest.width : dest.x, flipY ? dest.y + dest.height : dest.y);
  canvas.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(src.x, src.y, src.width, src.height),
    Skia.XYWHRect(0, 0, dest.width, dest.height),
    blitPaint,
    true,
  );
  canvas.restore();
}

/** Tileset-local tile id → src rect in the tiles atlas. */
function tileSrcRect(tileId: number): AtlasFrameRect | undefined {
  const entry = tileEntries(ATLAS_IDS.tiles)[tileId];
  return entry ? frameRectOf(ATLAS_IDS.tiles, entry.name) : undefined;
}

/** Record every command into one picture (world space). */
function buildPicture(
  commands: readonly DrawCommand[],
  images: AtlasImages,
): SkPicture | null {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording();

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'sprite': {
        const image = cmd.atlas !== undefined ? images[cmd.atlas] : undefined;
        const src = cmd.atlas && cmd.sprite
          ? frameRectOf(cmd.atlas, cmd.sprite)
          : undefined;
        if (!image || !src) break; // atlas/frame not (yet) available
        drawAtlasRect(
          canvas,
          image,
          src,
          Skia.XYWHRect(cmd.x, cmd.y, cmd.width, cmd.height),
          cmd.flipX ?? false,
          cmd.flipY ?? false,
          cmd.alpha ?? 1,
        );
        break;
      }
      case 'tile': {
        const src = tileSrcRect(cmd.tileId ?? -1);
        const image = images[ATLAS_IDS.tiles];
        if (!image || !src) break;
        drawAtlasRect(
          canvas,
          image,
          src,
          Skia.XYWHRect(cmd.x, cmd.y, cmd.width, cmd.height),
          cmd.flipX ?? false,
          cmd.flipY ?? false,
          cmd.alpha ?? 1,
        );
        break;
      }
      case 'rect': {
        if (!cmd.color) break;
        fillPaint.setColor(Skia.Color(cmd.color));
        fillPaint.setAlphaf(cmd.alpha ?? 1);
        canvas.drawRect(
          Skia.XYWHRect(cmd.x, cmd.y, cmd.width, cmd.height),
          fillPaint,
        );
        break;
      }
      case 'circle': {
        if (!cmd.color) break;
        fillPaint.setColor(Skia.Color(cmd.color));
        fillPaint.setAlphaf(cmd.alpha ?? 1);
        canvas.drawCircle(cmd.x, cmd.y, cmd.width / 2, fillPaint);
        break;
      }
      default:
        // 'text' | 'particle' | 'shake' — no producers in P2.E1 (spec
        // 07 §3.2); they arrive with the combat/FX epics.
        break;
    }
  }

  return recorder.finishRecordingAsPicture();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Paint the current render-bus frame. MUST be mounted inside a
 * `<GameCanvas>` (it emits Skia drawing nodes).
 */
export function DrawListRenderer(): React.JSX.Element {
  // Subscribe to the mailbox — each publish bumps frameId, which is
  // what forces the picture rebuild below.
  const frameId = useRenderBus((s) => s.frameId);
  const drawList = useRenderBus((s) => s.drawList);
  const transform = useRenderBus((s) => s.camera);

  const heroImage = useImage(ATLAS_IMAGE_SOURCES[ATLAS_IDS.hero]);
  const tilesImage = useImage(ATLAS_IMAGE_SOURCES[ATLAS_IDS.tiles]);

  const images = useMemo<AtlasImages>(
    () => ({ [ATLAS_IDS.hero]: heroImage, [ATLAS_IDS.tiles]: tilesImage }),
    [heroImage, tilesImage],
  );

  const picture = useMemo<SkPicture | null>(
    () => (drawList.length === 0 ? null : buildPicture(drawList, images)),
    // frameId: the mailbox epoch — every publish must rebuild the
    // picture even if a frame happens to be byte-identical.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frameId, drawList, images],
  );

  if (!transform || !picture) {
    return null as unknown as React.JSX.Element;
  }

  return (
    <Group
      transform={[
        { translateX: transform.translateX },
        { translateY: transform.translateY },
        { scale: transform.scale },
      ]}
    >
      <Picture picture={picture} />
    </Group>
  );
}

export default DrawListRenderer;
