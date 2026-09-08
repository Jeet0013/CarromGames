/**
 * Board analysis and obstruction testing.
 *
 * Reads the same live board the player sees — no privileged information. The
 * AI knows exactly what is on the table and nothing about what will happen.
 */

import { BOARD_CONFIG, POCKET_POSITIONS } from '../board/BoardConfig';
import { effectiveColor, type MatchState } from '../core/GameState';
import { PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import type { Piece } from '../pieces/Piece';
import type { PieceFactory } from '../pieces/PieceFactory';
import { CoinColor, PieceKind, QueenState, type BoardPoint, type PlayerSlot } from '../core/types';

export interface BoardSnapshot {
  /** Coins the AI may legally pot for its own benefit. */
  readonly ownCoins: Piece[];
  readonly opponentCoins: Piece[];
  readonly queen: Piece | null;
  readonly allCoins: Piece[];
  readonly ownColor: CoinColor | null;
  readonly queenState: QueenState;
  readonly strikerRadius: number;
  readonly coinRadius: number;
}

export class AITargetAnalyzer {
  /**
   * Snapshot the board for one decision.
   *
   * Taken once per turn rather than per candidate — the board cannot change
   * mid-decision, and re-reading it for every one of up to 80 candidates would
   * be the AI's dominant cost for no benefit.
   */
  static analyze(
    pieces: PieceFactory,
    match: MatchState,
    slot: PlayerSlot,
  ): BoardSnapshot {
    const ownColor = effectiveColor(match, slot);
    const active = pieces.pieces.filter(
      (p) => p.active && p.kind !== PieceKind.Striker,
    );

    const coins = active.filter((p) => p.kind !== PieceKind.Queen);
    const queen = active.find((p) => p.kind === PieceKind.Queen) ?? null;

    // Before colours are claimed every coin is fair game — the first legal
    // pocket decides ownership, so the AI should be trying to claim one.
    const own = ownColor === null ? coins : coins.filter((c) => c.color === ownColor);
    const opponent = ownColor === null ? [] : coins.filter((c) => c.color !== ownColor);

    return {
      ownCoins: own,
      opponentCoins: opponent,
      queen,
      allCoins: coins,
      ownColor,
      queenState: match.queen,
      strikerRadius: PIECE_GEOMETRY.striker.radius,
      coinRadius: PIECE_GEOMETRY.coin.radius,
    };
  }

  /** All four pockets, with their index preserved for event reporting. */
  static pockets(): ReadonlyArray<{ index: number; position: BoardPoint }> {
    return POCKET_POSITIONS.map((position, index) => ({ index, position }));
  }

  /**
   * How blocked a straight path is, 0–1.
   *
   * Tests every other piece against the segment. A piece whose centre is closer
   * to the line than the combined radii would be clipped, and the closer it is
   * to dead centre the worse the obstruction — so this returns a gradient
   * rather than a boolean, which lets the scorer prefer a *slightly* tight line
   * over a fully blocked one instead of treating both as impossible.
   */
  static obstruction(
    from: BoardPoint,
    to: BoardPoint,
    movingRadius: number,
    obstacles: readonly Piece[],
    ignoreIds: readonly string[] = [],
  ): number {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSq = dx * dx + dz * dz;
    if (lengthSq < 1e-9) return 0;

    let worst = 0;
    for (const piece of obstacles) {
      if (!piece.active || ignoreIds.includes(piece.id)) continue;

      const p = piece.position;
      const t = Math.max(
        0,
        Math.min(1, ((p.x - from.x) * dx + (p.z - from.z) * dz) / lengthSq),
      );
      // Endpoints are excluded: the target itself always sits at t≈1, and the
      // striker at t≈0, and neither obstructs its own shot.
      if (t <= 0.02 || t >= 0.98) continue;

      const cx = from.x + dx * t;
      const cz = from.z + dz * t;
      const distance = Math.hypot(p.x - cx, p.z - cz);
      const clearance = movingRadius + PIECE_GEOMETRY.coin.radius;

      if (distance < clearance) {
        worst = Math.max(worst, 1 - distance / clearance);
        if (worst >= 0.98) return 1;
      }
    }
    return worst;
  }

  /**
   * Whether a point is far enough from a pocket to be a sane striker rest.
   *
   * Used to reject shots that would leave the striker hanging over a pocket.
   */
  static nearPocket(point: BoardPoint, margin: number): boolean {
    for (const pocket of POCKET_POSITIONS) {
      if (Math.hypot(pocket.x - point.x, pocket.z - point.z) < BOARD_CONFIG.pocket.radius + margin) {
        return true;
      }
    }
    return false;
  }
}
