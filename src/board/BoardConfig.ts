/**
 * Board geometry, derived from a regulation Carrom board.
 *
 * Every value starts as a real-world measurement in centimetres and is passed
 * through `cm()`, so the board stays proportionally correct and any dimension
 * can be checked against a physical board.
 *
 * ## Why world units instead of metres
 *
 * A regulation coin is 3 cm across. In SI units that is a 0.015 m collider,
 * small enough that Rapier's default contact margins and sleep thresholds —
 * tuned for objects around 0.1–10 m — start to dominate the simulation, giving
 * mushy collisions and coins that fall asleep while still visibly drifting.
 * Scaling by `UNITS.PER_METRE` (10) puts the board at 7.4 units and coins at
 * 0.3, squarely inside the engine's comfortable range. Gravity is scaled by
 * the same factor in `PhysicsConfig`.
 *
 * ## Axes
 *
 * The board lies flat in the XZ plane with Y as height. The origin is the
 * board's centre. Player One shoots from +Z (the near side, toward the
 * camera); Player Two from −Z.
 */

import { cm } from '../config/GameConfig';
import type { BoardPoint, PlayerSlot } from '../core/types';
import { PlayerSlot as Slot } from '../core/types';

/** Real-world reference dimensions, in centimetres. */
export const BOARD_DIMENSIONS_CM = {
  /** Regulation playing surface: 29 inches square. */
  playingSurface: 73.66,
  /** Wooden frame around the surface. */
  frameWidth: 6.5,
  frameHeight: 2.4,
  surfaceThickness: 1.2,
  /** Corner pocket opening. */
  pocketDiameter: 4.45,
  /** Centre circle: large outer ring and the small inner ring. */
  centerCircleOuterDiameter: 17.0,
  centerCircleInnerDiameter: 3.18,
  /** Baseline: two parallel lines the striker must be placed between. */
  baseLineLength: 45.7,
  /** Gap between the two baseline rules. */
  baseLineSeparation: 3.18,
  /** Distance from the inner frame edge to the outer baseline. */
  baseLineInset: 10.16,
  /**
   * Red circles capping each end of a baseline.
   *
   * 3.18 cm, not the pocket's 4.45 cm. At pocket size the circles from two
   * adjacent baselines overlap into a figure-8 near each corner, because their
   * centres are only ~4.2 cm apart.
   */
  baseCircleDiameter: 3.18,
  /** Painted line weight. */
  lineWidth: 0.2,
} as const;

const HALF_SURFACE = cm(BOARD_DIMENSIONS_CM.playingSurface) / 2;
const POCKET_RADIUS = cm(BOARD_DIMENSIONS_CM.pocketDiameter) / 2;

/**
 * Pocket centres, inset from each corner by one pocket radius so the opening
 * sits tangent to both frame edges, as it does on a real board.
 *
 * Order is fixed and load-bearing: `pocketIndex` in `pocket:scored` events and
 * the AI's pocket scoring both index into this array.
 */
export const POCKET_POSITIONS: readonly BoardPoint[] = [
  { x: -(HALF_SURFACE - POCKET_RADIUS), z: -(HALF_SURFACE - POCKET_RADIUS) }, // 0: far left
  { x: HALF_SURFACE - POCKET_RADIUS, z: -(HALF_SURFACE - POCKET_RADIUS) }, //  1: far right
  { x: HALF_SURFACE - POCKET_RADIUS, z: HALF_SURFACE - POCKET_RADIUS }, //     2: near right
  { x: -(HALF_SURFACE - POCKET_RADIUS), z: HALF_SURFACE - POCKET_RADIUS }, //  3: near left
] as const;

export const BOARD_CONFIG = {
  /** Playing surface half-extent — the inner wall position on both axes. */
  halfSurface: HALF_SURFACE,
  surface: {
    size: cm(BOARD_DIMENSIONS_CM.playingSurface),
    thickness: cm(BOARD_DIMENSIONS_CM.surfaceThickness),
    /** Play happens at y = 0; the surface slab sits just below it. */
    playHeight: 0,
  },
  frame: {
    width: cm(BOARD_DIMENSIONS_CM.frameWidth),
    height: cm(BOARD_DIMENSIONS_CM.frameHeight),
    /** Outer footprint including the frame. */
    outerSize: cm(BOARD_DIMENSIONS_CM.playingSurface + BOARD_DIMENSIONS_CM.frameWidth * 2),
    /** Softens the frame edge; purely visual. */
    edgeRadius: cm(0.8),
  },
  pocket: {
    radius: POCKET_RADIUS,
    /**
     * Sensor radius for pocket detection. Slightly under the visual opening so
     * a coin only counts once it is genuinely over the hole rather than
     * clipping the lip.
     */
    /*
     * Widened from 0.9. A real pocket swallows a coin once its centre is
     * roughly over the opening, and at 0.9 coins were skimming the lip and
     * surviving shots that should have dropped. Still under the full opening,
     * so a coin resting beside the hole is not counted.
     */
    sensorRadius: POCKET_RADIUS * 1.02,
    /** How far below the surface a pocketed piece falls before removal. */
    dropDepth: cm(4),
  },
  markings: {
    centerCircleOuterRadius: cm(BOARD_DIMENSIONS_CM.centerCircleOuterDiameter) / 2,
    centerCircleInnerRadius: cm(BOARD_DIMENSIONS_CM.centerCircleInnerDiameter) / 2,
    baseCircleRadius: cm(BOARD_DIMENSIONS_CM.baseCircleDiameter) / 2,
    lineWidth: cm(BOARD_DIMENSIONS_CM.lineWidth),
  },
  baseline: {
    /** Half the playable baseline span, measured from the board centre line. */
    halfLength: cm(BOARD_DIMENSIONS_CM.baseLineLength) / 2,
    separation: cm(BOARD_DIMENSIONS_CM.baseLineSeparation),
    /** Distance from board centre out to the midpoint between the two lines. */
    distanceFromCenter:
      HALF_SURFACE -
      cm(BOARD_DIMENSIONS_CM.baseLineInset) -
      cm(BOARD_DIMENSIONS_CM.baseLineSeparation) / 2,
  },
} as const;

/**
 * Which side of the board a seat shoots from, as a sign on the Z axis.
 * Player One is nearest the camera at +Z.
 */
export const baselineSign = (player: PlayerSlot): 1 | -1 =>
  player === Slot.One ? 1 : -1;

/**
 * The striker's resting Z for a seat — the midpoint between the two baseline
 * rules, which is where a striker legally sits.
 */
export const baselineZ = (player: PlayerSlot): number =>
  baselineSign(player) * BOARD_CONFIG.baseline.distanceFromCenter;

/**
 * Clamp an X position to the legal striker span for a seat.
 *
 * `strikerRadius` is subtracted so the striker's edge — not its centre — stops
 * at the baseline end, matching how the rule is applied on a physical board.
 * Enforced on every drag, which is what makes illegal placement impossible
 * rather than merely discouraged.
 */
export const clampToBaseline = (x: number, strikerRadius: number): number => {
  const limit = Math.max(0, BOARD_CONFIG.baseline.halfLength - strikerRadius);
  return Math.min(limit, Math.max(-limit, x));
};
