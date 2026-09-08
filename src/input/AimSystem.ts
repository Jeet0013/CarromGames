/**
 * Aim visuals: the line, the direction arrow, and the power meter.
 *
 * Presentation only — it renders an aim, it never decides one. `InputManager`
 * computes direction and power and hands them here.
 *
 * The line and arrow live in the 3D scene so they sit on the board in
 * perspective; the power meter is DOM, because a readable numeric bar pinned to
 * the screen edge is not something 3D geometry does well.
 */

import * as THREE from 'three';

import { BOARD_CONFIG } from '../board/BoardConfig';
import { PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import { AimMode, type BoardPoint } from '../core/types';

/** Aim line length at full power, in world units. */
const MAX_LINE_LENGTH = BOARD_CONFIG.halfSurface * 1.5;
const MIN_LINE_LENGTH = BOARD_CONFIG.halfSurface * 0.35;
/** Just above the pieces, so the line is never hidden by a coin. */
const LINE_HEIGHT = PIECE_GEOMETRY.striker.thickness + 0.01;

export class AimSystem {
  readonly #group = new THREE.Group();
  readonly #line: THREE.Line;
  readonly #arrow: THREE.Mesh;
  readonly #pullLine: THREE.Line;
  readonly #meter: HTMLElement;
  readonly #meterFill: HTMLElement;

  readonly #disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
  #mode: AimMode = AimMode.Assisted;

  constructor(container: HTMLElement) {
    this.#group.name = 'AimSystem';
    this.#group.visible = false;

    // ── Aim line: striker → target direction ──────────────────────────────
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    /*
     * Red, not cream.
     *
     * The aim line sits on pale polished wood, and a warm off-white had almost
     * no contrast against it — legible on a desktop monitor indoors, close to
     * invisible on a phone screen in daylight, which is exactly when a player
     * needs it. Red is the one hue on this board that nothing else uses at
     * strength except the Queen, and she is a single small disc at the centre.
     */
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.85,
      // Drawn over the board rather than into it — an aim guide that
      // disappears behind a coin is worse than useless.
      depthTest: false,
    });
    this.#line = new THREE.Line(lineGeometry, lineMaterial);
    this.#line.renderOrder = 900;

    // ── Direction arrow at the far end of the line ────────────────────────
    const arrowGeometry = new THREE.ConeGeometry(0.13, 0.34, 16);
    // Cones point +Y; rotate so it points down −Z, the line's direction.
    arrowGeometry.rotateX(-Math.PI / 2);
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5146,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.#arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    this.#arrow.renderOrder = 901;

    // ── Pull line: striker → pointer, showing the drag itself ─────────────
    const pullGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
    ]);
    const pullMaterial = new THREE.LineDashedMaterial({
      color: 0x8fbfff,
      dashSize: 0.12,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
    });
    this.#pullLine = new THREE.Line(pullGeometry, pullMaterial);
    this.#pullLine.renderOrder = 899;

    this.#group.add(this.#line, this.#arrow, this.#pullLine);
    this.#disposables.push(
      lineGeometry,
      lineMaterial,
      arrowGeometry,
      arrowMaterial,
      pullGeometry,
      pullMaterial,
    );

    // ── Power meter ───────────────────────────────────────────────────────
    this.#meter = document.createElement('div');
    this.#meter.style.cssText = [
      'position:absolute',
      'left:50%',
      'bottom:max(18px, env(safe-area-inset-bottom))',
      'transform:translateX(-50%)',
      'width:min(280px, 60vw)',
      'height:10px',
      'border-radius:999px',
      'background:rgba(18,16,14,0.75)',
      'border:1px solid rgba(176,122,69,0.45)',
      'overflow:hidden',
      'opacity:0',
      'transition:opacity 140ms ease',
      'pointer-events:none',
      'z-index:20',
    ].join(';');

    this.#meterFill = document.createElement('div');
    this.#meterFill.style.cssText =
      'height:100%;width:0%;border-radius:999px;transition:width 40ms linear';
    this.#meter.append(this.#meterFill);
    container.append(this.#meter);
  }

  get group(): THREE.Group {
    return this.#group;
  }

  setMode(mode: AimMode): void {
    this.#mode = mode;
  }

  /**
   * Update the guides.
   *
   * @param origin   striker position
   * @param direction unit vector the shot will travel
   * @param power    normalised 0–1
   * @param pullTo   where the pointer currently is
   */
  show(origin: BoardPoint, direction: BoardPoint, power: number, pullTo: BoardPoint): void {
    this.#group.visible = true;

    // Classic aim shows only a short stub — enough to read the direction, not
    // enough to line up a shot with. Assisted extends with power.
    const length =
      this.#mode === AimMode.Classic
        ? MIN_LINE_LENGTH * 0.6
        : MIN_LINE_LENGTH + (MAX_LINE_LENGTH - MIN_LINE_LENGTH) * power;

    const positions = this.#line.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, origin.x, LINE_HEIGHT, origin.z);
    positions.setXYZ(
      1,
      origin.x + direction.x * length,
      LINE_HEIGHT,
      origin.z + direction.z * length,
    );
    positions.needsUpdate = true;

    this.#arrow.position.set(
      origin.x + direction.x * length,
      LINE_HEIGHT,
      origin.z + direction.z * length,
    );
    // Cone's local −Z is forward after the geometry rotation above.
    this.#arrow.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI;
    this.#arrow.visible = this.#mode === AimMode.Assisted;

    const pull = this.#pullLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    pull.setXYZ(0, origin.x, LINE_HEIGHT, origin.z);
    pull.setXYZ(1, pullTo.x, LINE_HEIGHT, pullTo.z);
    pull.needsUpdate = true;
    // Dashed lines need their distances recomputed whenever endpoints move,
    // or the dashes stretch instead of repeating.
    this.#pullLine.computeLineDistances();

    this.#setPower(power);
  }

  hide(): void {
    this.#group.visible = false;
    this.#meter.style.opacity = '0';
  }

  #setPower(power: number): void {
    this.#meter.style.opacity = '1';
    this.#meterFill.style.width = `${(power * 100).toFixed(1)}%`;
    // Green → amber → red, so power is readable at a glance without numbers.
    const hue = 130 - power * 130;
    this.#meterFill.style.background = `hsl(${hue.toFixed(0)}, 78%, 52%)`;
  }

  dispose(): void {
    for (const resource of this.#disposables) resource.dispose();
    this.#disposables.length = 0;
    this.#meter.remove();
  }
}
