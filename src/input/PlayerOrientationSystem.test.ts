/**
 * Orientation transform validation.
 *
 * The spec requires every side tested individually and every transformation
 * tested. These run headlessly — the transforms are pure functions on numbers.
 */

import { describe, expect, it } from 'vitest';

import { PlayerSide } from '../core/PlayerSide';
import { clampToBaseline, strikerHome } from '../core/PlayerSide';
import {
  boardVectorToPlayerRelativeVector,
  forwardComponent,
  playerRelativeVectorToBoardVector,
  screenVectorToBoardVector,
} from './PlayerOrientationSystem';
import type { BoardPoint } from '../core/types';

const ALL_SIDES = [
  PlayerSide.Bottom,
  PlayerSide.Top,
  PlayerSide.Left,
  PlayerSide.Right,
] as const;

const close = (a: number, b: number): void => expect(a).toBeCloseTo(b, 6);
const closePoint = (a: BoardPoint, b: BoardPoint): void => {
  close(a.x, b.x);
  close(a.z, b.z);
};

/** "Pull toward me, shoot away" — forward in every seat's own frame. */
const FORWARD: BoardPoint = { x: 0, z: 1 };

describe('screenVectorToBoardVector', () => {
  it('flips the y axis, because screen y grows downward and board z toward the viewer', () => {
    closePoint(screenVectorToBoardVector({ x: 10, y: 20 }), { x: 10, z: -20 });
  });

  it('applies the caller-supplied pixel-to-world scale', () => {
    closePoint(screenVectorToBoardVector({ x: 100, y: -50 }, 0.01), { x: 1, z: 0.5 });
  });
});

describe('aim direction per side', () => {
  // The spec's required behaviour, stated literally.
  it('bottom player aims toward the top of the board (−Z)', () => {
    closePoint(playerRelativeVectorToBoardVector(PlayerSide.Bottom, FORWARD), { x: 0, z: -1 });
  });

  it('top player aims toward the bottom of the board (+Z)', () => {
    closePoint(playerRelativeVectorToBoardVector(PlayerSide.Top, FORWARD), { x: 0, z: 1 });
  });

  it('left player aims toward the right of the board (+X)', () => {
    closePoint(playerRelativeVectorToBoardVector(PlayerSide.Left, FORWARD), { x: 1, z: 0 });
  });

  it('right player aims toward the left of the board (−X)', () => {
    closePoint(playerRelativeVectorToBoardVector(PlayerSide.Right, FORWARD), { x: -1, z: 0 });
  });
});

describe('transform round-trips', () => {
  it.each(ALL_SIDES)('board → relative → board is identity for %s', (side) => {
    for (const v of [
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -0.6, z: 0.8 },
      { x: 3.2, z: -1.7 },
    ]) {
      const relative = boardVectorToPlayerRelativeVector(side, v);
      closePoint(playerRelativeVectorToBoardVector(side, relative), v);
    }
  });

  it.each(ALL_SIDES)('preserves vector length for %s', (side) => {
    const v = { x: 3, z: 4 };
    const relative = boardVectorToPlayerRelativeVector(side, v);
    close(Math.hypot(relative.x, relative.z), 5);
  });

  it.each(ALL_SIDES)('a forward pull reads as forward for %s', (side) => {
    const board = playerRelativeVectorToBoardVector(side, FORWARD);
    const back = boardVectorToPlayerRelativeVector(side, board);
    closePoint(back, FORWARD);
  });
});

describe('forwardComponent', () => {
  it.each(ALL_SIDES)('is +1 straight into the board for %s', (side) => {
    const inward = playerRelativeVectorToBoardVector(side, FORWARD);
    close(forwardComponent(side, inward), 1);
  });

  it.each(ALL_SIDES)('is −1 straight backwards for %s', (side) => {
    const backward = playerRelativeVectorToBoardVector(side, { x: 0, z: -1 });
    close(forwardComponent(side, backward), -1);
  });

  it.each(ALL_SIDES)('is 0 along the baseline for %s', (side) => {
    const sideways = playerRelativeVectorToBoardVector(side, { x: 1, z: 0 });
    close(forwardComponent(side, sideways), 0);
  });
});

describe('striker placement per side', () => {
  it('puts each seat on its own edge', () => {
    // Bottom/top vary in z; left/right vary in x — and with opposite signs.
    expect(strikerHome(PlayerSide.Bottom).z).toBeGreaterThan(0);
    expect(strikerHome(PlayerSide.Top).z).toBeLessThan(0);
    expect(strikerHome(PlayerSide.Left).x).toBeLessThan(0);
    expect(strikerHome(PlayerSide.Right).x).toBeGreaterThan(0);
  });

  it('keeps every seat the same distance from the centre', () => {
    const distances = ALL_SIDES.map((side) => {
      const home = strikerHome(side);
      return Math.hypot(home.x, home.z);
    });
    for (const d of distances) close(d, distances[0] as number);
  });

  it.each(ALL_SIDES)('clamps the free axis and pins the fixed axis for %s', (side) => {
    const home = strikerHome(side);
    const wild = clampToBaseline(side, { x: 99, z: 99 }, 0.206);

    // Whichever axis is fixed must still match the seat's home value exactly.
    if (Math.abs(home.x) > Math.abs(home.z)) close(wild.x, home.x);
    else close(wild.z, home.z);

    // And the free axis must be inside the legal span.
    expect(Math.abs(wild.x)).toBeLessThanOrEqual(3.7);
    expect(Math.abs(wild.z)).toBeLessThanOrEqual(3.7);
  });

  it.each(ALL_SIDES)('gives every seat an identical legal span for %s', (side) => {
    const low = clampToBaseline(side, { x: -99, z: -99 }, 0.206);
    const high = clampToBaseline(side, { x: 99, z: 99 }, 0.206);
    const span = Math.hypot(high.x - low.x, high.z - low.z);
    // 2 × (halfLength − strikerRadius) = 2 × (2.285 − 0.206)
    close(span, 4.158);
  });
});
