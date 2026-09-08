/**
 * Which edge of the board a seat shoots from.
 *
 * ## Why this exists rather than rotating the UI
 *
 * With four players around one device, the obvious fix is to rotate the screen
 * for whoever is shooting. That is the wrong answer: it spins the other three
 * players' panels upside down, breaks text, and makes the board lurch every
 * turn.
 *
 * Instead the *board* stays fixed and the input is transformed. Every seat aims
 * in world coordinates — drag back from the striker, shoot away from the drag —
 * which already reads correctly from any edge, because pulling back toward
 * yourself always sends the striker toward the centre. What actually changes
 * per seat is which axis the striker slides along and which way its baseline
 * faces, and that is all this module encodes.
 */

import { BOARD_CONFIG } from '../board/BoardConfig';
import type { BoardPoint } from './types';

export const PlayerSide = {
  Bottom: 'BOTTOM',
  Top: 'TOP',
  Left: 'LEFT',
  Right: 'RIGHT',
} as const;
export type PlayerSide = (typeof PlayerSide)[keyof typeof PlayerSide];

/** Geometry of one seat's baseline. */
export interface BaselineGeometry {
  /** The axis the striker slides along. */
  readonly slideAxis: 'x' | 'z';
  /** The axis held fixed at the baseline. */
  readonly fixedAxis: 'x' | 'z';
  /** Value of the fixed axis — signed distance from the board centre. */
  readonly fixedValue: number;
  /** Unit vector pointing from this seat toward the board centre. */
  readonly inward: BoardPoint;
}

const DISTANCE = BOARD_CONFIG.baseline.distanceFromCenter;

const GEOMETRY: Record<PlayerSide, BaselineGeometry> = {
  [PlayerSide.Bottom]: {
    slideAxis: 'x',
    fixedAxis: 'z',
    fixedValue: DISTANCE,
    inward: { x: 0, z: -1 },
  },
  [PlayerSide.Top]: {
    slideAxis: 'x',
    fixedAxis: 'z',
    fixedValue: -DISTANCE,
    inward: { x: 0, z: 1 },
  },
  [PlayerSide.Left]: {
    slideAxis: 'z',
    fixedAxis: 'x',
    fixedValue: -DISTANCE,
    inward: { x: 1, z: 0 },
  },
  [PlayerSide.Right]: {
    slideAxis: 'z',
    fixedAxis: 'x',
    fixedValue: DISTANCE,
    inward: { x: -1, z: 0 },
  },
};

export const baselineOf = (side: PlayerSide): BaselineGeometry => GEOMETRY[side];

/** Centre of a seat's baseline — where the striker starts each turn. */
export function strikerHome(side: PlayerSide): BoardPoint {
  const geometry = GEOMETRY[side];
  return geometry.fixedAxis === 'z'
    ? { x: 0, z: geometry.fixedValue }
    : { x: geometry.fixedValue, z: 0 };
}

/**
 * Snap a pointer position onto a seat's legal striker placement.
 *
 * The free axis is clamped to the baseline's span and the fixed axis is pinned,
 * so an illegal position is unrepresentable rather than rejected after the
 * fact. `strikerRadius` is subtracted so the striker's *edge* stops at the end
 * of the baseline, as it does on a real board.
 */
export function clampToBaseline(
  side: PlayerSide,
  point: BoardPoint,
  strikerRadius: number,
): BoardPoint {
  const geometry = GEOMETRY[side];
  const limit = Math.max(0, BOARD_CONFIG.baseline.halfLength - strikerRadius);

  if (geometry.slideAxis === 'x') {
    return {
      x: Math.min(limit, Math.max(-limit, point.x)),
      z: geometry.fixedValue,
    };
  }
  return {
    x: geometry.fixedValue,
    z: Math.min(limit, Math.max(-limit, point.z)),
  };
}

/**
 * Is this drag a sensible shot for this seat?
 *
 * A shot must travel with some component toward the board, not straight back
 * off the edge behind the player. Used to reject a drag that would fire the
 * striker into the rail at their own back.
 */
export function isForwardShot(side: PlayerSide, direction: BoardPoint): boolean {
  const inward = GEOMETRY[side].inward;
  const forward = direction.x * inward.x + direction.z * inward.z;

  /*
   * Only a clearly backward shot is rejected.
   *
   * Requiring a strictly positive forward component blocked bank shots: firing
   * along your own baseline into a side rail is a legitimate and common Carrom
   * shot, and its forward component is exactly zero. A small negative
   * allowance also permits the slightly-behind angles a rail rebound needs,
   * while still refusing a shot aimed off the back of the board.
   */
  return forward > -0.2;
}

/** Seat order clockwise from the bottom — the turn order for four-player. */
export const CLOCKWISE_ORDER: readonly PlayerSide[] = [
  PlayerSide.Bottom,
  PlayerSide.Left,
  PlayerSide.Top,
  PlayerSide.Right,
];
