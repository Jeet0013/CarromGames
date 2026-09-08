/**
 * Input orientation for seats around the board.
 *
 * The board never rotates and neither does the DOM. Instead, input vectors are
 * transformed between three frames:
 *
 * - **Screen space** — pixels, y down.
 * - **Board space** — world XZ, the frame physics and rules live in.
 * - **Player-relative space** — each seat's own idea of "forward" (into the
 *   board) and "right" (along their baseline).
 *
 * Player-relative space is what makes the controls feel identical from every
 * edge: "pull toward me, shoot away" is `forward` for all four seats, and the
 * transform decides what that means in board coordinates.
 *
 * Pure functions on plain numbers — no Three.js, no DOM — so every
 * transformation is directly testable, which the spec requires.
 */

import { PlayerSide } from '../core/PlayerSide';
import type { BoardPoint } from '../core/types';

/**
 * Each seat's basis in board space.
 *
 * `forward` points from the seat into the board; `right` is 90° clockwise from
 * forward, so a player's "right" is their own right as they face the board.
 * These two vectors are the whole system — every transform below is a change of
 * basis using them.
 */
interface SeatBasis {
  readonly forward: BoardPoint;
  readonly right: BoardPoint;
}

const BASIS: Record<PlayerSide, SeatBasis> = {
  // Sits at +Z, faces −Z.
  [PlayerSide.Bottom]: { forward: { x: 0, z: -1 }, right: { x: 1, z: 0 } },
  // Sits at −Z, faces +Z.
  [PlayerSide.Top]: { forward: { x: 0, z: 1 }, right: { x: -1, z: 0 } },
  // Sits at −X, faces +X.
  [PlayerSide.Left]: { forward: { x: 1, z: 0 }, right: { x: 0, z: 1 } },
  // Sits at +X, faces −X.
  [PlayerSide.Right]: { forward: { x: -1, z: 0 }, right: { x: 0, z: -1 } },
};

export const basisOf = (side: PlayerSide): SeatBasis => BASIS[side];

/**
 * Screen delta → board delta.
 *
 * Screen y grows downward while board z grows toward the viewer, so the y axis
 * is negated. `scale` converts pixels to world units; the caller supplies it
 * because only the camera knows the current projection.
 *
 * Note this is a *direction* transform — it deliberately ignores perspective
 * foreshortening, which is why picking an exact board point still goes through
 * a ray-cast rather than this.
 */
export function screenVectorToBoardVector(
  screen: { readonly x: number; readonly y: number },
  scale = 1,
): BoardPoint {
  return { x: screen.x * scale, z: -screen.y * scale };
}

/**
 * Board vector → player-relative vector.
 *
 * Returns `{ x: sideways, z: forward }` in the seat's own frame: positive z is
 * into the board, positive x is to the player's right.
 */
export function boardVectorToPlayerRelativeVector(
  side: PlayerSide,
  board: BoardPoint,
): BoardPoint {
  const { forward, right } = BASIS[side];
  return {
    x: board.x * right.x + board.z * right.z,
    z: board.x * forward.x + board.z * forward.z,
  };
}

/**
 * Player-relative vector → board vector.
 *
 * The exact inverse of the above; the basis is orthonormal, so the inverse is
 * the transpose and no division is involved.
 */
export function playerRelativeVectorToBoardVector(
  side: PlayerSide,
  relative: BoardPoint,
): BoardPoint {
  const { forward, right } = BASIS[side];
  return {
    x: relative.x * right.x + relative.z * forward.x,
    z: relative.x * right.z + relative.z * forward.z,
  };
}

/**
 * How far into the board a direction points, −1…1.
 *
 * 1 is straight at the centre, 0 is parallel to the baseline, negative is
 * backwards off the player's own edge. Used to reject a shot fired behind the
 * player and to score how "forward" an aim is.
 */
export function forwardComponent(side: PlayerSide, direction: BoardPoint): number {
  const { forward } = BASIS[side];
  return direction.x * forward.x + direction.z * forward.z;
}

/** Normalise a board vector; returns the seat's forward if it has no length. */
export function normalise(side: PlayerSide, v: BoardPoint): BoardPoint {
  const length = Math.hypot(v.x, v.z);
  if (length < 1e-9) return BASIS[side].forward;
  return { x: v.x / length, z: v.z / length };
}
