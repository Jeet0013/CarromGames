/**
 * The Carrom board.
 *
 * Assembles the playing surface, the raised rails, the corner pockets, and the
 * table beneath. All geometry derives from `BoardConfig`, which in turn derives
 * from regulation measurements — nothing here invents a dimension.
 *
 * Presentation only. Collision bodies for the rails and sensors for the pockets
 * are added in the physics phase, reading the same config.
 */

import * as THREE from 'three';

import { BOARD_CONFIG, POCKET_POSITIONS } from './BoardConfig';
import {
  createBoardTextures,
  createFrameTextures,
  type BoardTextures,
} from './BoardTexture';
import { Pockets } from './Pockets';
import { QualityTier } from '../core/types';

export class CarromBoard {
  readonly #group = new THREE.Group();
  readonly #pockets: Pockets;
  readonly #textures: BoardTextures;
  readonly #frameTextures: BoardTextures;
  readonly #disposables: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor(quality: QualityTier) {
    this.#group.name = 'CarromBoard';
    this.#textures = createBoardTextures(quality);
    this.#frameTextures = createFrameTextures(quality);

    this.#group.add(this.#buildSurface(quality));
    this.#group.add(this.#buildFrame(quality));

    this.#pockets = new Pockets();
    this.#group.add(this.#pockets.group);
  }

  get group(): THREE.Group {
    return this.#group;
  }

  /**
   * The playing surface: a slab with four circular holes cut at the corners.
   *
   * The holes are real geometry rather than dark paint, so a coin dropping
   * through a pocket in a later phase passes through an actual opening.
   */
  #buildSurface(quality: QualityTier): THREE.Mesh {
    const half = BOARD_CONFIG.halfSurface;
    const { thickness } = BOARD_CONFIG.surface;

    const shape = new THREE.Shape();
    shape.moveTo(-half, -half);
    shape.lineTo(half, -half);
    shape.lineTo(half, half);
    shape.lineTo(-half, half);
    shape.closePath();

    // Holes are cut in shape space. The extrusion is later rotated so that
    // shape-Y maps to world −Z, hence the negated Z below.
    for (const pocket of POCKET_POSITIONS) {
      const hole = new THREE.Path();
      hole.absarc(pocket.x, -pocket.z, BOARD_CONFIG.pocket.radius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 24,
    });

    // Lay the slab flat and put its top face at exactly y = 0, the plane every
    // piece slides on.
    geometry.rotateX(-Math.PI / 2);
    alignTop(geometry, 0);
    geometry.computeVertexNormals();
    applyPlanarUVs(geometry, half);

    const material = this.#createWoodMaterial(quality, {
      map: this.#textures.map,
      roughnessMap: this.#textures.roughnessMap,
      roughness: 0.55,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'PlayingSurface';
    mesh.receiveShadow = true;
    // The surface is flat and below everything; casting from it would only
    // produce self-shadow artefacts.
    mesh.castShadow = false;

    this.#disposables.push(geometry, material);
    return mesh;
  }

  /**
   * The raised rails, built as one continuous frame with a square hole.
   *
   * A single bevelled extrusion rather than four boxes: the bevel rounds the
   * rail edges in one pass and the corners meet exactly, with no seams to
   * catch the light where four separate boxes would butt together.
   */
  #buildFrame(quality: QualityTier): THREE.Mesh {
    const { width, height, outerSize, edgeRadius, cornerRadius } = BOARD_CONFIG.frame;
    const half = BOARD_CONFIG.halfSurface;
    void width;

    // ExtrudeGeometry grows the outline outward by `bevelSize` and shrinks
    // holes by the same amount, so both are inset here to land on the exact
    // dimensions after bevelling.
    const bevelThickness = Math.min(edgeRadius, height * 0.25);
    const bevelSize = Math.min(edgeRadius, height * 0.25);
    const outerHalf = outerSize / 2 - bevelSize;
    const innerHalf = half + bevelSize;

    // Rounded outer corners. The bevel already softens the frame's top and
    // bottom edges, but in plan view the corners were still sharp right angles.
    const shape = new THREE.Shape();
    traceRoundedRect(shape, outerHalf, Math.max(0, cornerRadius - bevelSize));

    const hole = new THREE.Path();
    hole.moveTo(-innerHalf, -innerHalf);
    hole.lineTo(-innerHalf, innerHalf);
    hole.lineTo(innerHalf, innerHalf);
    hole.lineTo(innerHalf, -innerHalf);
    hole.closePath();
    shape.holes.push(hole);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.01, height - bevelThickness * 2),
      bevelEnabled: true,
      bevelThickness,
      bevelSize,
      bevelOffset: 0,
      bevelSegments: 3,
      // Raised from 8: the corner arcs are the widest curves on the board and
      // faceting shows immediately at this scale.
      curveSegments: 14,
    });

    geometry.rotateX(-Math.PI / 2);
    // Sit the frame's underside flush with the surface slab's underside, so the
    // rail rises above the playing plane by the remainder of its height.
    alignBottom(geometry, -BOARD_CONFIG.surface.thickness);
    geometry.computeVertexNormals();
    // Project the grain across the frame's own footprint. Extrusion UVs are in
    // shape units and would smear the texture down the bevelled faces.
    applyPlanarUVs(geometry, outerSize / 2);

    const material = this.#createWoodMaterial(quality, {
      // No `color` tint — the texture already carries the timber colour, and
      // multiplying it by a second brown would crush the frame to near-black.
      map: this.#frameTextures.map,
      roughnessMap: this.#frameTextures.roughnessMap,
      roughness: 0.42,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Frame';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.#disposables.push(geometry, material);
    return mesh;
  }

  /**
   * Wood material, tiered by quality.
   *
   * `MeshPhysicalMaterial`'s clearcoat is what sells varnished wood — a second
   * specular lobe over the diffuse, so the board has a lacquer sheen rather
   * than looking like matte cardboard. It is meaningfully more expensive to
   * shade, so the low tier drops to `MeshStandardMaterial`.
   */
  #createWoodMaterial(
    quality: QualityTier,
    options: {
      map?: THREE.Texture;
      roughnessMap?: THREE.Texture;
      color?: number;
      roughness: number;
    },
  ): THREE.Material {
    const base = {
      ...(options.map ? { map: options.map } : {}),
      ...(options.roughnessMap ? { roughnessMap: options.roughnessMap } : {}),
      ...(options.color !== undefined ? { color: options.color } : {}),
      roughness: options.roughness,
      metalness: 0.02,
    };

    if (quality === QualityTier.Low) return new THREE.MeshStandardMaterial(base);

    return new THREE.MeshPhysicalMaterial({
      ...base,
      clearcoat: 0.65,
      clearcoatRoughness: 0.22,
      // Slight sheen picks out the grain at grazing angles, which is where a
      // polished board is most obviously polished.
      sheen: 0.15,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0xffe9c9),
    });
  }

  dispose(): void {
    this.#pockets.dispose();
    this.#textures.dispose();
    this.#frameTextures.dispose();
    for (const resource of this.#disposables) resource.dispose();
    this.#disposables.length = 0;
  }
}

/**
 * Trace a rounded rectangle into a shape or path.
 *
 * Quadratic curves with the true corner as the control point: the result is
 * visually indistinguishable from a circular fillet at this radius, and it
 * keeps the outline a single continuous curve for the extruder to bevel.
 */
function traceRoundedRect(shape: THREE.Shape, half: number, radius: number): void {
  const r = Math.min(radius, half);
  if (r <= 0) {
    shape.moveTo(-half, -half);
    shape.lineTo(half, -half);
    shape.lineTo(half, half);
    shape.lineTo(-half, half);
    shape.closePath();
    return;
  }

  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half);
  shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);
  shape.closePath();
}

/**
 * Shift a geometry so its highest point sits at `y`.
 *
 * `ExtrudeGeometry` does not place its output where the caller assumes:
 * extruding by `depth` spans 0…depth, and enabling a bevel extends past both
 * ends. Hard-coding an offset therefore silently misplaces the mesh — which is
 * exactly what happened here, leaving the play surface 0.12 units too high and
 * the coins buried inside it. Measuring the result removes the guesswork.
 */
function alignTop(geometry: THREE.BufferGeometry, y: number): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  geometry.translate(0, y - box.max.y, 0);
}

/** Shift a geometry so its lowest point sits at `y`. */
function alignBottom(geometry: THREE.BufferGeometry, y: number): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  geometry.translate(0, y - box.min.y, 0);
}

/**
 * Replace `ExtrudeGeometry`'s UVs with a planar projection in board space.
 *
 * Extrusion generates UVs in shape units, which do not correspond to the board
 * texture at all — the markings would land in the wrong place and the side
 * walls would smear. Projecting from world XZ instead means a vertex at board
 * position (x, z) samples exactly the pixel drawn for (x, z).
 */
function applyPlanarUVs(geometry: THREE.BufferGeometry, half: number): void {
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const span = half * 2;

  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = (position.getX(i) + half) / span;
    uv[i * 2 + 1] = (position.getZ(i) + half) / span;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
