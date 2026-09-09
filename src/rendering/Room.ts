/**
 * The room the board sits in.
 *
 * ## What this replaces
 *
 * There was a table before — a flat, near-black plane under the board, three
 * times its size, there to catch the shadow. It did that job, but the frame it
 * produced was a board floating in a void: the plane ended at a hard edge, and
 * either side of that edge was the same near-black, so nothing read as a
 * surface. The board looked rendered rather than photographed.
 *
 * What makes a tabletop legible is not the tabletop. It is the pool of lamp
 * light falling on it, the grain catching that light at a glancing angle, and
 * the darkness it fades into before it ends. All three are here, and all three
 * are baked into textures rather than lit per frame, because none of them
 * change.
 *
 * ## Ownership
 *
 * The room is permanent furniture, like the lights. A match ending tears down
 * the board and the pieces; the table it was standing on does not go anywhere.
 * That is why this is its own object added via `addPermanent`, rather than
 * living inside `CarromBoard` as it used to.
 */

import * as THREE from 'three';

import { BOARD_CONFIG } from '../board/BoardConfig';
import { QualityTier } from '../core/types';

const TABLE = {
  /**
   * Extent of the tabletop, as a multiple of the board's footprint.
   *
   * Wide enough that the edge is outside the frame at every camera angle the
   * `CameraManager` allows — a visible table edge instantly reads as a prop.
   */
  spread: 7,
  /** Dark warm wood, a shade cooler and deeper than the board's own frame. */
  color: 0x171210,
  /** Polished, but not lacquered: the board should be the glossiest thing. */
  roughness: 0.62,
  /** Resolution of the baked light pool and grain. */
  textureSize: 1024,
} as const;

const BACKDROP = {
  /** Comfortably outside the tabletop, inside the camera's far plane. */
  radius: 90,
  /** Warm near-black at the horizon, lifting very slightly overhead. */
  horizon: 0x0d0b09,
  zenith: 0x1c1713,
  /** Below the table, where nothing should draw the eye. */
  nadir: 0x070605,
} as const;

export class Room {
  readonly #group = new THREE.Group();
  readonly #disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  constructor(quality: QualityTier) {
    this.#group.name = 'Room';
    this.#group.add(this.#buildTable(quality), this.#buildBackdrop());
  }

  get group(): THREE.Group {
    return this.#group;
  }

  /**
   * The tabletop.
   *
   * Its colour map carries two things a uniform plane cannot: a radial pool of
   * warm light centred a little off-axis, matching where the key light and the
   * environment's lamp both sit; and a grain that runs in one direction. The
   * pool is what stops the plane ending in a visible edge — by the time the
   * geometry runs out, the texture has already fallen to the backdrop's value.
   */
  #buildTable(quality: QualityTier): THREE.Mesh {
    const size = BOARD_CONFIG.frame.outerSize * TABLE.spread;

    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.rotateX(-Math.PI / 2);

    const map = bakeTableColor();
    const roughnessMap = bakeTableRoughness();

    // Low tier keeps the standard material: an extra specular lobe on a
    // surface this dark is not what a weak GPU should be spending on.
    const options: THREE.MeshStandardMaterialParameters = {
      map,
      roughnessMap,
      color: TABLE.color,
      roughness: TABLE.roughness,
      metalness: 0.04,
    };

    const material =
      quality === QualityTier.Low
        ? new THREE.MeshStandardMaterial(options)
        : new THREE.MeshPhysicalMaterial({
            ...options,
            // A waxed table, not a varnished one — half the board's clearcoat.
            clearcoat: 0.3,
            clearcoatRoughness: 0.45,
          });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Table';
    mesh.position.y = -BOARD_CONFIG.surface.thickness - 0.02;
    mesh.receiveShadow = true;
    // Nothing is under the table, and it is the largest surface in the frame.
    mesh.castShadow = false;

    this.#disposables.push(geometry, material, map, roughnessMap);
    return mesh;
  }

  /**
   * A dome standing in for the rest of the room.
   *
   * `MeshBasicMaterial` on the inside of a sphere: this is a backdrop, not a
   * surface, and it must not take light or cast into the shadow map. It
   * replaces the scene's flat background colour, which gave the frame no
   * horizon — everything beyond the table was one value, so there was no
   * distance for the eye to read.
   */
  #buildBackdrop(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(BACKDROP.radius, 24, 16);
    const texture = bakeBackdrop();

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      // Excluded from the depth buffer's arguments: it is always furthest.
      depthWrite: false,
      fog: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Backdrop';
    mesh.renderOrder = -1;

    this.#disposables.push(geometry, material, texture);
    return mesh;
  }

  dispose(): void {
    for (const item of this.#disposables) item.dispose();
    this.#disposables.length = 0;
  }
}

/**
 * Warm light pool plus directional grain.
 *
 * Multiplied against the material's base colour, so this is a light map in all
 * but name — white where the lamp lands, near-black at the corners.
 */
function bakeTableColor(): THREE.CanvasTexture {
  const size = TABLE.textureSize;
  const ctx = canvas2d(size);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  // The pool, offset towards the lamp rather than centred on the board. A
  // perfectly centred pool reads as a spotlight in a studio; an offset one
  // reads as a lamp in the corner of a room.
  const cx = size * 0.44;
  const cy = size * 0.4;
  const pool = ctx.createRadialGradient(cx, cy, size * 0.04, cx, cy, size * 0.52);
  pool.addColorStop(0, '#fff4e2');
  pool.addColorStop(0.35, '#b4977c');
  pool.addColorStop(0.72, '#3a2f27');
  pool.addColorStop(1, '#000000');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, size, size);

  // Grain, running in one direction and varying in weight, drawn over the
  // pool so it is only visible where there is light to reveal it — which is
  // exactly how grain behaves on a real table.
  ctx.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 620; i += 1) {
    const y = Math.random() * size;
    const width = 0.6 + Math.random() * 2.4;
    const alpha = 0.02 + Math.random() * 0.06;
    ctx.strokeStyle = `rgba(255, 226, 190, ${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, y);
    // A slight waver, so the grain is wood rather than corduroy.
    ctx.bezierCurveTo(size * 0.3, y + wobble(), size * 0.7, y - wobble(), size, y + wobble());
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Roughness variation.
 *
 * A perfectly uniform roughness is the clearest tell of a computer-generated
 * surface: real polish is uneven, worn where hands rest and where a board has
 * been dragged across it. Mid-grey base with soft blotches either side.
 */
function bakeTableRoughness(): THREE.CanvasTexture {
  const size = TABLE.textureSize / 2;
  const ctx = canvas2d(size);

  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = size * (0.03 + Math.random() * 0.12);
    const smoother = Math.random() > 0.5;
    const blotch = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = smoother ? '120, 120, 120' : '190, 190, 190';
    blotch.addColorStop(0, `rgba(${tone}, 0.5)`);
    blotch.addColorStop(1, `rgba(${tone}, 0)`);
    ctx.fillStyle = blotch;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Vertical gradient for the dome, as a tall thin strip.
 *
 * One pixel wide would do — the gradient has no horizontal variation — but a
 * few pixels avoids any filtering surprise at the seam.
 */
function bakeBackdrop(): THREE.CanvasTexture {
  const height = 256;
  const ctx = canvas2d(8, height);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, hex(BACKDROP.zenith));
  // The horizon sits behind the table, so it is placed where the table's own
  // falloff has already reached darkness — the two meet without a seam.
  gradient.addColorStop(0.52, hex(BACKDROP.horizon));
  gradient.addColorStop(1, hex(BACKDROP.nadir));

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, height);

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function canvas2d(width: number, height = width): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Room: 2D canvas context unavailable.');
  return ctx;
}

function wobble(): number {
  return (Math.random() - 0.5) * 26;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
