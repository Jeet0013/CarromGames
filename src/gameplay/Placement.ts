/**
 * Finding a legal spot to put a piece back on the board.
 *
 * Carrom returns pieces mid-match — an uncovered Queen, a coin surrendered to a
 * foul — and the centre is frequently occupied when that happens. The rules say
 * "as close to the centre as possible", so this searches outward in rings until
 * it finds clear space.
 *
 * Geometry only; the rules decide *that* a piece returns, this decides where.
 */

import { BOARD_CONFIG, POCKET_POSITIONS } from '../board/BoardConfig';
import { PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import type { BoardPoint } from '../core/types';

/** Clearance between a returned piece and an existing one. */
const CLEARANCE = 1.06;

export interface PlacementOptions {
  /** Positions already taken by pieces on the board. */
  readonly occupied: readonly BoardPoint[];
  /** Radius of the piece being placed. */
  readonly radius: number;
  /** Preferred spot; the search radiates from here. */
  readonly preferred?: BoardPoint;
}

/**
 * A free position at or near the preferred point.
 *
 * Searches concentric rings rather than a grid, so the first hit is genuinely
 * the nearest clear spot rather than merely the first cell that happened to be
 * scanned. Falls back to the preferred point if the board is impossibly full —
 * dropping a piece on top of another is bad, losing it entirely is worse.
 */
export function findFreePlacement(options: PlacementOptions): BoardPoint {
  const preferred = options.preferred ?? { x: 0, z: 0 };
  const step = PIECE_GEOMETRY.coin.radius * 1.4;
  const limit = BOARD_CONFIG.halfSurface - options.radius * 2;

  if (isClear(preferred, options, limit)) return preferred;

  for (let ring = 1; ring <= 14; ring += 1) {
    const distance = ring * step;
    // More samples further out, so angular resolution stays roughly constant.
    const samples = Math.max(8, ring * 8);

    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const candidate: BoardPoint = {
        x: preferred.x + Math.cos(angle) * distance,
        z: preferred.z + Math.sin(angle) * distance,
      };
      if (isClear(candidate, options, limit)) return candidate;
    }
  }

  return preferred;
}

function isClear(point: BoardPoint, options: PlacementOptions, limit: number): boolean {
  // Inside the playing area.
  if (Math.abs(point.x) > limit || Math.abs(point.z) > limit) return false;

  // Never place a returned piece where it would instantly fall in.
  for (const pocket of POCKET_POSITIONS) {
    const clearance = BOARD_CONFIG.pocket.radius + options.radius * 1.5;
    if (Math.hypot(pocket.x - point.x, pocket.z - point.z) < clearance) return false;
  }

  for (const other of options.occupied) {
    const minimum = (options.radius + PIECE_GEOMETRY.coin.radius) * CLEARANCE;
    if (Math.hypot(other.x - point.x, other.z - point.z) < minimum) return false;
  }

  return true;
}
