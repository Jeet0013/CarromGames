/**
 * Creates and owns every game piece.
 *
 * Geometry and materials are built once and shared across all 20 pieces —
 * three geometries and four materials total, rather than 20 of each. That is
 * the single biggest draw-call and memory win available here, and the reason
 * `SceneManager`'s recursive disposal is told to skip these meshes: their
 * lifetime belongs to this factory.
 */

import * as THREE from 'three';

import { baselineZ } from '../board/BoardConfig';
import { Coin } from './Coin';
import { Piece } from './Piece';
import { Queen } from './Queen';
import { Striker } from './Striker';
import { PHYSICS_CONFIG, PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { createFaceTexture, type FaceKind } from './PieceTexture';
import { CoinColor, PlayerSlot, type BoardPoint } from '../core/types';

/**
 * Opening arrangement radii, as multiples of the coin radius.
 *
 * Geometrically the tightest possible rings are 2·r and 3.86·r — the distances
 * at which six and twelve touching coins fit exactly. Both are nudged out
 * slightly: starting the simulation with coins in exact contact means the
 * solver's first step sees a stack of borderline overlaps and pushes the whole
 * cluster apart before anyone has taken a shot.
 */
const INNER_RING_RADIUS = 2.06;
const OUTER_RING_RADIUS = 4.2;

export class PieceFactory {
  readonly #group = new THREE.Group();
  readonly #physics: PhysicsWorld;

  readonly #pieces: Piece[] = [];
  readonly #byId = new Map<string, Piece>();
  #striker!: Striker;
  #queen!: Queen;

  // Shared resources, owned here.
  readonly #coinGeometry: THREE.BufferGeometry;
  readonly #strikerGeometry: THREE.BufferGeometry;
  readonly #materials: Record<string, THREE.Material>;
  /** Top-face decals: the turned rings that make each piece identifiable. */
  readonly #faceGeometry: Record<'coin' | 'striker', THREE.BufferGeometry>;
  readonly #faceMaterials: Record<FaceKind, THREE.Material>;

  constructor(physics: PhysicsWorld) {
    this.#physics = physics;
    this.#group.name = 'Pieces';

    const coin = PIECE_GEOMETRY.coin;
    const striker = PIECE_GEOMETRY.striker;

    this.#coinGeometry = createDiscGeometry(coin.radius, coin.thickness);
    this.#strikerGeometry = createDiscGeometry(striker.radius, striker.thickness);

    this.#materials = {
      white: new THREE.MeshPhysicalMaterial({
        color: 0xe8d9bd,
        roughness: 0.34,
        metalness: 0.02,
        clearcoat: 0.5,
        clearcoatRoughness: 0.25,
      }),
      black: new THREE.MeshPhysicalMaterial({
        color: 0x2a1c12,
        roughness: 0.32,
        metalness: 0.04,
        clearcoat: 0.55,
        clearcoatRoughness: 0.22,
      }),
      queen: new THREE.MeshPhysicalMaterial({
        color: 0x9b1f18,
        roughness: 0.28,
        metalness: 0.05,
        clearcoat: 0.7,
        clearcoatRoughness: 0.18,
      }),
      striker: new THREE.MeshPhysicalMaterial({
        color: 0xf2ece0,
        roughness: 0.18,
        metalness: 0.08,
        clearcoat: 0.85,
        clearcoatRoughness: 0.1,
      }),
    };

    // A thin disc laid on each piece's top face. The lathe body handles the
    // silhouette and the rim; this carries the markings, because a lathe's UVs
    // wrap around the axis and cannot hold a concentric pattern.
    const faceDisc = (radius: number): THREE.BufferGeometry => {
      const geometry = new THREE.CircleGeometry(radius * 0.995, 40);
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    };
    this.#faceGeometry = {
      coin: faceDisc(coin.radius),
      striker: faceDisc(striker.radius),
    };

    const faceMaterial = (kind: FaceKind, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({
        map: createFaceTexture(kind),
        transparent: true,
        roughness: 0.34,
        metalness: 0.02,
        // Sits a hair above the body; without this the two coplanar faces
        // z-fight and the markings flicker as the camera moves.
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        ...extra,
      });

    this.#faceMaterials = {
      light: faceMaterial('light'),
      dark: faceMaterial('dark'),
      queen: faceMaterial('queen'),
      // The striker is lacquered harder than a wooden coin.
      striker: faceMaterial('striker', { roughness: 0.18, metalness: 0.06 }),
    };

    this.#build();
  }

  get group(): THREE.Group {
    return this.#group;
  }

  get pieces(): readonly Piece[] {
    return this.#pieces;
  }

  get striker(): Striker {
    return this.#striker;
  }

  get queen(): Queen {
    return this.#queen;
  }

  get(id: string): Piece | undefined {
    return this.#byId.get(id);
  }

  /** Pieces still in play. */
  get activePieces(): Piece[] {
    return this.#pieces.filter((piece) => piece.active);
  }

  /** Copy simulated transforms onto meshes. Once per frame. */
  sync(): void {
    for (const piece of this.#pieces) piece.sync();
  }

  /**
   * Return every piece to its opening position and put it back in play.
   *
   * Deliberately reuses the existing pieces rather than tearing down and
   * rebuilding: meshes, materials, and ids all survive, so anything holding a
   * reference to a piece across a reset stays valid.
   */
  resetBoard(): void {
    for (const piece of this.#pieces) piece.reset(this.#physics, piece.home);
  }

  #build(): void {
    const layout = buildOpeningLayout();

    this.#queen = new Queen({
      id: 'queen',
      mesh: this.#createMesh(this.#coinGeometry, 'queen', 'queen'),
      handle: this.#createBody('queen', layout.queen, PIECE_GEOMETRY.coin.radius, false),
      home: layout.queen,
    });
    this.#queen.bodyTemplate = this.#coinTemplate();
    this.#register(this.#queen);

    layout.coins.forEach((entry, index) => {
      const id = `coin_${entry.color === CoinColor.White ? 'w' : 'b'}_${index}`;
      const coin = new Coin({
        id,
        color: entry.color,
        mesh: this.#createMesh(
          this.#coinGeometry,
          entry.color === CoinColor.White ? 'white' : 'black',
          entry.color === CoinColor.White ? 'light' : 'dark',
        ),
        handle: this.#createBody(id, entry.at, PIECE_GEOMETRY.coin.radius, false),
        home: entry.at,
      });
      coin.bodyTemplate = this.#coinTemplate();
      this.#register(coin);
    });

    const strikerHome: BoardPoint = { x: 0, z: baselineZ(PlayerSlot.One) };
    this.#striker = new Striker({
      id: 'striker',
      mesh: this.#createMesh(this.#strikerGeometry, 'striker', 'striker', true),
      handle: this.#createBody(
        'striker',
        strikerHome,
        PIECE_GEOMETRY.striker.radius,
        true,
      ),
      home: strikerHome,
    });
    this.#striker.bodyTemplate = {
      radius: PIECE_GEOMETRY.striker.radius,
      halfThickness: PIECE_GEOMETRY.striker.thickness / 2,
      mass: PHYSICS_CONFIG.STRIKER_MASS,
      friction: PHYSICS_CONFIG.STRIKER_FRICTION,
      restitution: PHYSICS_CONFIG.STRIKER_RESTITUTION,
      ccd: true,
    };
    this.#register(this.#striker);
  }

  #coinTemplate() {
    return {
      radius: PIECE_GEOMETRY.coin.radius,
      halfThickness: PIECE_GEOMETRY.coin.thickness / 2,
      mass: PHYSICS_CONFIG.COIN_MASS,
      friction: PHYSICS_CONFIG.COIN_FRICTION,
      restitution: PHYSICS_CONFIG.COIN_RESTITUTION,
      ccd: false,
    };
  }

  #register(piece: Piece): void {
    this.#pieces.push(piece);
    this.#byId.set(piece.id, piece);
    this.#group.add(piece.mesh);
    piece.sync();
  }

  #createMesh(
    geometry: THREE.BufferGeometry,
    material: string,
    face: FaceKind,
    isStriker = false,
  ): THREE.Mesh {
    const mat = this.#materials[material];
    if (!mat) throw new Error(`Unknown piece material: ${material}`);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Geometry and material are shared and owned by this factory.
    mesh.userData['sharedResources'] = true;

    // The marked face, parented so it follows the piece for free.
    const spec = isStriker ? PIECE_GEOMETRY.striker : PIECE_GEOMETRY.coin;
    const decal = new THREE.Mesh(
      this.#faceGeometry[isStriker ? 'striker' : 'coin'],
      this.#faceMaterials[face],
    );
    decal.position.y = spec.thickness / 2 + 0.0015;
    decal.userData['sharedResources'] = true;
    mesh.add(decal);

    return mesh;
  }

  #createBody(id: string, at: BoardPoint, radius: number, isStriker: boolean) {
    const geometry = isStriker ? PIECE_GEOMETRY.striker : PIECE_GEOMETRY.coin;
    return this.#physics.createPieceBody({
      id,
      x: at.x,
      z: at.z,
      radius,
      halfThickness: geometry.thickness / 2,
      mass: isStriker ? PHYSICS_CONFIG.STRIKER_MASS : PHYSICS_CONFIG.COIN_MASS,
      friction: isStriker ? PHYSICS_CONFIG.STRIKER_FRICTION : PHYSICS_CONFIG.COIN_FRICTION,
      restitution: isStriker
        ? PHYSICS_CONFIG.STRIKER_RESTITUTION
        : PHYSICS_CONFIG.COIN_RESTITUTION,
      ccd: isStriker,
    });
  }

  dispose(): void {
    for (const piece of this.#pieces) this.#physics.removeBody(piece.id);
    this.#pieces.length = 0;
    this.#byId.clear();
    this.#coinGeometry.dispose();
    this.#strikerGeometry.dispose();
    for (const material of Object.values(this.#materials)) material.dispose();
    for (const geometry of Object.values(this.#faceGeometry)) geometry.dispose();
    for (const material of Object.values(this.#faceMaterials)) {
      (material as THREE.MeshStandardMaterial).map?.dispose();
      material.dispose();
    }
  }
}

/**
 * The standard opening arrangement.
 *
 * Queen dead centre, a ring of six around her, then a ring of twelve — 19
 * pieces, nine of each colour. Colours alternate around both rings, and the
 * outer ring is rotated half a step so its coins nest into the gaps of the
 * inner one rather than sitting directly behind them.
 */
function buildOpeningLayout(): {
  queen: BoardPoint;
  coins: Array<{ color: CoinColor; at: BoardPoint }>;
} {
  const r = PIECE_GEOMETRY.coin.radius;
  const coins: Array<{ color: CoinColor; at: BoardPoint }> = [];

  const ring = (count: number, radius: number, offset: number, startWhite: boolean): void => {
    for (let i = 0; i < count; i += 1) {
      const angle = offset + (i / count) * Math.PI * 2;
      const white = startWhite ? i % 2 === 0 : i % 2 === 1;
      coins.push({
        color: white ? CoinColor.White : CoinColor.Black,
        at: { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius },
      });
    }
  };

  // Six inner (3 white, 3 black), twelve outer (6 and 6) — nine each.
  ring(6, r * INNER_RING_RADIUS, 0, true);
  ring(12, r * OUTER_RING_RADIUS, Math.PI / 12, false);

  return { queen: { x: 0, z: 0 }, coins };
}

/**
 * A disc with a rounded rim, built as a lathe.
 *
 * A plain cylinder gives coins a hard 90° edge that catches the key light as a
 * bright wire along the silhouette and reads as cheap. The rounded profile
 * costs a handful of extra vertices on geometry that is instanced 20 times.
 */
function createDiscGeometry(radius: number, thickness: number): THREE.BufferGeometry {
  const half = thickness / 2;
  const corner = Math.min(thickness * 0.35, radius * 0.25);
  const points: THREE.Vector2[] = [];
  const arcSteps = 4;

  points.push(new THREE.Vector2(0, -half));
  points.push(new THREE.Vector2(radius - corner, -half));
  for (let i = 1; i <= arcSteps; i += 1) {
    const a = (i / arcSteps) * (Math.PI / 2);
    points.push(
      new THREE.Vector2(
        radius - corner + Math.sin(a) * corner,
        -half + (1 - Math.cos(a)) * corner,
      ),
    );
  }
  for (let i = 0; i <= arcSteps; i += 1) {
    const a = (i / arcSteps) * (Math.PI / 2);
    points.push(
      new THREE.Vector2(
        radius - corner + Math.cos(a) * corner,
        half - corner + Math.sin(a) * corner,
      ),
    );
  }
  points.push(new THREE.Vector2(0, half));

  const geometry = new THREE.LatheGeometry(points, 32);
  geometry.computeVertexNormals();
  return geometry;
}
