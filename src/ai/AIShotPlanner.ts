/**
 * Shot generation.
 *
 * For every target coin and every pocket, works out where the striker would
 * have to be and which way it would have to travel — the classic "ghost ball"
 * construction, which is how human players actually aim a cut.
 */

import { clampToBaseline, strikerHome, type PlayerSide } from '../core/PlayerSide';
import { baselineOf } from '../core/PlayerSide';
import { AITargetAnalyzer, type BoardSnapshot } from './AITargetAnalyzer';
import { AIPowerCalculator } from './AIPowerCalculator';
import type { AIShotCandidate } from './AIShotCandidate';
import type { AIConfig } from './AIConfig';
import { PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import { PieceKind, type BoardPoint } from '../core/types';

/** Striker placements sampled along the baseline per target. */
const PLACEMENT_SAMPLES = 9;

export class AIShotPlanner {
  /**
   * Generate candidates for every (target, pocket) pair.
   *
   * The striker is not free to stand anywhere — it must sit on the baseline —
   * so for each pair the baseline is sampled and the placement giving the
   * straightest cut is kept. That mirrors what a player does: slide the striker
   * along until the angle looks makeable.
   */
  static plan(
    snapshot: BoardSnapshot,
    side: PlayerSide,
    config: AIConfig,
  ): AIShotCandidate[] {
    const candidates: AIShotCandidate[] = [];
    const pockets = AITargetAnalyzer.pockets();

    const targets = [...snapshot.ownCoins];
    // The Queen is only worth planning for while she is still on the board.
    if (snapshot.queen) targets.push(snapshot.queen);

    for (const target of targets) {
      const coin = target.position;

      for (const pocket of pockets) {
        const candidate = this.#buildCandidate(snapshot, side, target.id, coin, pocket, target.kind === PieceKind.Queen);
        if (candidate) candidates.push(candidate);
      }
    }

    // A weak AI genuinely considers fewer options — this is search width, not
    // a handicap applied after the fact.
    return candidates.slice(0, Math.max(4, config.maxShotCandidates * 4));
  }

  static #buildCandidate(
    snapshot: BoardSnapshot,
    side: PlayerSide,
    targetId: string,
    coin: BoardPoint,
    pocket: { index: number; position: BoardPoint },
    isQueen: boolean,
  ): AIShotCandidate | null {
    const toPocketX = pocket.position.x - coin.x;
    const toPocketZ = pocket.position.z - coin.z;
    const coinToPocket = Math.hypot(toPocketX, toPocketZ);
    if (coinToPocket < 1e-4) return null;

    const dirX = toPocketX / coinToPocket;
    const dirZ = toPocketZ / coinToPocket;

    // The ghost ball: where the striker's centre must be at contact for the
    // coin to depart toward the pocket. One combined radius back along the
    // coin→pocket line.
    const contactGap = snapshot.coinRadius + snapshot.strikerRadius;
    const impact: BoardPoint = {
      x: coin.x - dirX * contactGap,
      z: coin.z - dirZ * contactGap,
    };

    // Try several legal baseline placements and keep the straightest cut.
    const geometry = baselineOf(side);
    const home = strikerHome(side);
    const limit = 2.079; // baseline half-span minus striker radius
    let best: { position: BoardPoint; aim: BoardPoint; cut: number; distance: number } | null =
      null;

    for (let i = 0; i < PLACEMENT_SAMPLES; i += 1) {
      const offset = (i / (PLACEMENT_SAMPLES - 1)) * 2 * limit - limit;
      const raw: BoardPoint =
        geometry.slideAxis === 'x'
          ? { x: offset, z: home.z }
          : { x: home.x, z: offset };
      const position = clampToBaseline(side, raw, PIECE_GEOMETRY.striker.radius);

      const ax = impact.x - position.x;
      const az = impact.z - position.z;
      const distance = Math.hypot(ax, az);
      if (distance < 1e-4) continue;

      const aim: BoardPoint = { x: ax / distance, z: az / distance };

      // Cut angle: between the striker's approach and the coin's departure.
      const dot = Math.max(-1, Math.min(1, aim.x * dirX + aim.z * dirZ));
      const cut = Math.acos(dot);

      // Beyond ~72° the coin barely moves; treat as unplayable rather than
      // letting the power calculator ask for an impossible force.
      if (cut > 1.26) continue;

      if (!best || cut < best.cut) best = { position, aim, cut, distance };
    }

    if (!best) return null;

    // Obstruction on both legs: striker → impact, and coin → pocket.
    const approachBlocked = AITargetAnalyzer.obstruction(
      best.position,
      impact,
      snapshot.strikerRadius,
      snapshot.allCoins.concat(snapshot.queen ? [snapshot.queen] : []),
      [targetId],
    );
    const departBlocked = AITargetAnalyzer.obstruction(
      coin,
      pocket.position,
      snapshot.coinRadius,
      snapshot.allCoins.concat(snapshot.queen ? [snapshot.queen] : []),
      [targetId],
    );

    return {
      targetCoinId: targetId,
      targetCoinPosition: coin,
      targetPocketIndex: pocket.index,
      targetPocketPosition: pocket.position,
      strikerPosition: best.position,
      requiredAimDirection: best.aim,
      estimatedShotForce: AIPowerCalculator.powerFor(best.distance, coinToPocket, best.cut),
      shotAngle: best.cut,
      targetDistance: coinToPocket,
      strikerDistance: best.distance,
      pathObstruction: Math.max(approachBlocked, departBlocked),
      difficultyScore: 0,
      riskScore: 0,
      expectedReward: 0,
      finalScore: 0,
      isQueenShot: isQueen,
    };
  }
}
