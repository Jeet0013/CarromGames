/**
 * Try a shot before playing it.
 *
 * The planner and scorer only *predict* — cut angle, clearance, distance — and
 * a prediction cannot know that the target will clip a coin on its way and
 * miss. This runs the candidate in a private physics world and reports what
 * actually happened, so the strong difficulties can pick shots that work rather
 * than shots that look right.
 *
 * ## This is foresight, not cheating
 *
 * It is a second `PhysicsWorld` — the same class, the same rails, the same
 * friction model — seeded from the live board and thrown away afterwards. It
 * cannot touch the real world, and the AI still applies its difficulty error
 * *after* choosing, so a simulated pot is no guarantee: the shot it finally
 * plays is a slightly different one, and it misses accordingly. What this buys
 * is judgement, which is exactly what separates a strong player from a lucky
 * one.
 *
 * Reserved for Hard and Expert. A weak AI having perfect foresight and then
 * fumbling the execution would feel arbitrary; a weak AI genuinely not seeing
 * the consequence is what being weak means.
 */

import { BOARD_CONFIG, POCKET_POSITIONS } from '../board/BoardConfig';
import { EventBus } from '../core/EventBus';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PHYSICS_CONFIG, PIECE_GEOMETRY, powerToImpulse } from '../physics/PhysicsConfig';
import { CoinColor, PieceKind, type BoardPoint, type ShotCommand } from '../core/types';

/** One piece as the simulator needs it. */
export interface SimPiece {
  readonly id: string;
  readonly kind: PieceKind;
  readonly color: CoinColor | null;
  readonly position: BoardPoint;
}

export interface SimResult {
  readonly ownPocketed: number;
  readonly opponentPocketed: number;
  readonly queenPocketed: boolean;
  readonly strikerPocketed: boolean;
  /** The striker touched at least one piece. */
  readonly madeContact: boolean;
  readonly steps: number;
}

/** Hard ceiling per simulation, in fixed steps. 600 ≈ 10 s of play. */
const MAX_STEPS = 600;

export class AIShotSimulator {
  readonly #events = new EventBus();
  #world: PhysicsWorld | undefined;

  /** Built lazily — an AI that never simulates should not pay for a world. */
  #ensureWorld(): PhysicsWorld {
    this.#world ??= new PhysicsWorld(this.#events);
    return this.#world;
  }

  /**
   * Play the shot out and report the result.
   *
   * @param pieces  the live board, including the striker's target placement
   * @param shot    the candidate, before difficulty error
   * @param ownColor the AI's colour, or null while colours are unclaimed
   */
  simulate(
    pieces: readonly SimPiece[],
    shot: ShotCommand,
    ownColor: CoinColor | null,
  ): SimResult {
    const world = this.#ensureWorld();
    world.clearPieces();

    const kinds = new Map<string, PieceKind>();
    const colors = new Map<string, CoinColor | null>();

    for (const piece of pieces) {
      const isStriker = piece.kind === PieceKind.Striker;
      const geometry = isStriker ? PIECE_GEOMETRY.striker : PIECE_GEOMETRY.coin;
      world.createPieceBody({
        id: piece.id,
        x: piece.id === 'striker' ? shot.origin.x : piece.position.x,
        z: piece.id === 'striker' ? shot.origin.z : piece.position.z,
        radius: geometry.radius,
        halfThickness: geometry.thickness / 2,
        mass: isStriker ? PHYSICS_CONFIG.STRIKER_MASS : PHYSICS_CONFIG.COIN_MASS,
        friction: isStriker ? PHYSICS_CONFIG.STRIKER_FRICTION : PHYSICS_CONFIG.COIN_FRICTION,
        restitution: isStriker
          ? PHYSICS_CONFIG.STRIKER_RESTITUTION
          : PHYSICS_CONFIG.COIN_RESTITUTION,
        ccd: isStriker,
      });
      kinds.set(piece.id, piece.kind);
      colors.set(piece.id, piece.color);
    }

    const impulse = powerToImpulse(shot.power);
    world.beginSettleWatch();
    world.applyImpulse('striker', shot.direction.x * impulse, shot.direction.z * impulse);

    // Swept pocket detection, matching PocketManager: a piece moving fast
    // enough can step clean over a pocket, and an overlap test would miss it.
    const previous = new Map<string, BoardPoint>();
    for (const piece of pieces) {
      const handle = world.get(piece.id);
      if (handle) {
        const t = handle.body.translation();
        previous.set(piece.id, { x: t.x, z: t.z });
      }
    }

    let ownPocketed = 0;
    let opponentPocketed = 0;
    let queenPocketed = false;
    let strikerPocketed = false;
    let madeContact = false;

    const offContact = this.#events.on('physics:contact', () => {
      madeContact = true;
    });

    let steps = 0;
    const delta = PHYSICS_CONFIG.FIXED_TIME_STEP;

    while (steps < MAX_STEPS) {
      world.step(delta);
      steps += 1;

      for (const [id] of kinds) {
        const handle = world.get(id);
        if (!handle) continue;
        const t = handle.body.translation();
        const current = { x: t.x, z: t.z };
        const from = previous.get(id) ?? current;

        if (sweptHitsPocket(from, current)) {
          const kind = kinds.get(id);
          if (kind === PieceKind.Striker) strikerPocketed = true;
          else if (kind === PieceKind.Queen) queenPocketed = true;
          else {
            const color = colors.get(id) ?? null;
            // Before colours are claimed, any coin is a gain.
            if (ownColor === null || color === ownColor) ownPocketed += 1;
            else opponentPocketed += 1;
          }
          world.removeBody(id);
          previous.delete(id);
          continue;
        }
        previous.set(id, current);
      }

      if (world.isAtRest) break;
    }

    offContact();
    return {
      ownPocketed,
      opponentPocketed,
      queenPocketed,
      strikerPocketed,
      madeContact,
      steps,
    };
  }

  dispose(): void {
    this.#world?.dispose();
    this.#world = undefined;
  }
}

/** Did the segment from `from` to `to` pass over a pocket? */
function sweptHitsPocket(from: BoardPoint, to: BoardPoint): boolean {
  const radius = BOARD_CONFIG.pocket.sensorRadius;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSq = dx * dx + dz * dz;

  for (const pocket of POCKET_POSITIONS) {
    let cx: number;
    let cz: number;
    if (lengthSq < 1e-12) {
      cx = from.x;
      cz = from.z;
    } else {
      const t = Math.max(
        0,
        Math.min(1, ((pocket.x - from.x) * dx + (pocket.z - from.z) * dz) / lengthSq),
      );
      cx = from.x + dx * t;
      cz = from.z + dz * t;
    }
    if (Math.hypot(pocket.x - cx, pocket.z - cz) <= radius) return true;
  }
  return false;
}
