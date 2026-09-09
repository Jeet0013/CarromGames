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
  /**
   * Warm mid-brown timber.
   *
   * Lifted from the near-black it was, to the wooden table the artwork puts the
   * board on. It can be this light now without competing: the frame beside it
   * is crimson lacquer, so the two separate by hue rather than by value.
   */
  color: 0x2b1d13,
  /** Polished, but not lacquered: the board should be the glossiest thing. */
  roughness: 0.62,
  /** Resolution of the baked light pool. */
  textureSize: 1024,
  /**
   * How many times the grain tiles across the tabletop.
   *
   * The grain lives in its own texture rather than in the colour map because
   * the two want opposite things: the light pool must span the whole table
   * exactly once, and the grain must be small enough to read as wood. Stretched
   * across 60 units to match the pool, it vanished — the table came out looking
   * like a smooth plastic ramp.
   */
  grainRepeat: 7,
  /** Shallow. Grain you can see the depth of is a carving, not a polish. */
  bumpScale: 0.012,
} as const;

const CONTACT = {
  /** How far the occlusion skirt reaches past the board, in board footprints. */
  spread: 1.55,
  /** Darkest value in the crevice where board meets table. */
  opacity: 0.82,
  size: 512,
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
    this.#group.add(this.#buildTable(quality), this.#buildContact(), this.#buildBackdrop());
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
    const bumpMap = bakeTableGrain();

    // Low tier keeps the standard material: an extra specular lobe on a
    // surface this dark is not what a weak GPU should be spending on.
    const options: THREE.MeshStandardMaterialParameters = {
      map,
      roughnessMap,
      bumpMap,
      bumpScale: TABLE.bumpScale,
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

    this.#disposables.push(geometry, material, map, roughnessMap, bumpMap);
    return mesh;
  }

  /**
   * The occlusion skirt that grounds the board on the table.
   *
   * ## Why the cast shadow was not enough
   *
   * The key light is high and offset, so the board's shadow falls away from
   * the camera and lands where the lamp pool has already gone dark — correct,
   * and invisible. Worse, it is the wrong phenomenon: the board rests flush on
   * the table, and what grounds an object in contact with a surface is not a
   * cast shadow at all. It is ambient occlusion — the crevice between the two
   * seeing less of the room than the open table does. Without it the board
   * reads as pasted onto a photograph of a table.
   *
   * So this is a soft dark skirt following the board's footprint, dense at the
   * edge and falling off within about half a board width. It is biased very
   * slightly away from the lamp, which lets it stand in for the near part of
   * the cast shadow as well.
   *
   * Unlit and unshadowed by design: it *is* the shadow. Lighting it would ask
   * the renderer to shade a shadow.
   */
  #buildContact(): THREE.Mesh {
    const size = BOARD_CONFIG.frame.outerSize * CONTACT.spread;

    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.rotateX(-Math.PI / 2);

    const texture = bakeContact();
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      // Never writes depth: it sits a hair above the table and must not
      // occlude the board's own frame at grazing angles.
      depthWrite: false,
      color: 0x000000,
      fog: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'ContactShadow';
    // A hair above the tabletop — enough to beat z-fighting, far too little to
    // read as a gap.
    mesh.position.set(0, -BOARD_CONFIG.surface.thickness - 0.012, 0);
    // Nudged away from the lamp, so the densest edge is the one a shadow
    // would fall on.
    mesh.position.x -= 0.05;
    mesh.position.z -= 0.05;
    mesh.renderOrder = 1;

    this.#disposables.push(geometry, material, texture);
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
 * The pool of lamp light on the table.
 *
 * Multiplied against the material's base colour, so this is a light map in all
 * but name — warm where the lamp lands, black at the corners.
 *
 * The falloff is deliberately fast. A gentle one spread the light across the
 * whole 60-unit plane and read as a smooth ramp rather than a lamp; darkness
 * has to return well before the geometry ends, both because that is what a
 * lamp in a dark room does and because it is what hides the plane's edge.
 */
function bakeTableColor(): THREE.CanvasTexture {
  const size = TABLE.textureSize;
  const ctx = canvas2d(size);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  // Offset towards the lamp rather than centred on the board. A perfectly
  // centred pool reads as a studio spotlight; an offset one reads as a lamp
  // standing somewhere in the room.
  const cx = size * 0.45;
  const cy = size * 0.42;
  const pool = ctx.createRadialGradient(cx, cy, size * 0.02, cx, cy, size * 0.34);
  pool.addColorStop(0, '#fff4e2');
  pool.addColorStop(0.28, '#a78a6e');
  pool.addColorStop(0.6, '#2b231d');
  pool.addColorStop(1, '#000000');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Wood grain, as a tiling height field.
 *
 * A bump map rather than a normal map: the difference is invisible on a
 * surface this shallow, and this one is a greyscale canvas rather than a
 * hand-packed RGB one. What matters is that it tiles, so the grain stays the
 * size of grain no matter how large the tabletop is.
 */
function bakeTableGrain(): THREE.CanvasTexture {
  const size = 512;
  const ctx = canvas2d(size);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // Lines run in one direction and vary in weight and darkness — the two
  // things that separate wood from corduroy.
  for (let i = 0; i < 260; i += 1) {
    const y = Math.random() * size;
    const dark = Math.random() > 0.5;
    const tone = dark ? 90 : 190;
    ctx.strokeStyle = `rgba(${tone}, ${tone}, ${tone}, ${0.1 + Math.random() * 0.35})`;
    ctx.lineWidth = 0.5 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    // A slight waver, so the grain drifts the way sawn timber does. Both
    // endpoints stay on the same y so the tile still meets itself.
    ctx.bezierCurveTo(size * 0.33, y + wobble(), size * 0.66, y - wobble(), size, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.NoColorSpace;
  tile(texture);
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
  tile(texture);
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

/**
 * The occlusion skirt's alpha.
 *
 * Black everywhere; only the alpha varies. The board's footprint is a rounded
 * square, so the dense core is drawn as one — a radial gradient would leave
 * the corners ungrounded and darken the middle of each edge too much.
 *
 * Built by drawing the footprint at full opacity and then blurring it, which
 * is what an area light does to an edge and is far more convincing than any
 * hand-authored falloff.
 */
function bakeContact(): THREE.CanvasTexture {
  const size = CONTACT.size;
  const ctx = canvas2d(size);

  // The board occupies 1 / CONTACT.spread of this texture, centred.
  const inset = (size * (1 - 1 / CONTACT.spread)) / 2;
  const footprint = size - inset * 2;
  const radius = footprint * 0.06;

  // Three passes, widest first. Occlusion in a crevice is not one even blur:
  // it is a narrow, nearly black line where the two surfaces meet, and a long
  // faint tail spreading out from it. A single wide blur gives only the tail,
  // which is why the first attempt at this read as a vague smudge rather than
  // as contact.
  const passes = [
    { blur: 0.055, alpha: CONTACT.opacity * 0.45 },
    { blur: 0.022, alpha: CONTACT.opacity * 0.7 },
    { blur: 0.006, alpha: CONTACT.opacity },
  ];

  for (const pass of passes) {
    ctx.filter = `blur(${Math.max(1, Math.round(size * pass.blur))}px)`;
    ctx.fillStyle = `rgba(0, 0, 0, ${pass.alpha})`;
    roundedRect(ctx, inset, inset, footprint, footprint, radius);
    ctx.fill();
  }
  ctx.filter = 'none';

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** Repeat a texture across the tabletop at grain scale. */
function tile(texture: THREE.Texture): void {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(TABLE.grainRepeat, TABLE.grainRepeat);
}

function wobble(): number {
  return (Math.random() - 0.5) * 26;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
