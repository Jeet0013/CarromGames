/**
 * Corner pocket visuals.
 *
 * Each pocket is a recessed cavity with a dark interior and a brass lip that
 * catches the key light — the detail that makes a hole read as a hole rather
 * than a black circle painted on the wood.
 *
 * Physics sensors are added on top of these positions in the physics phase;
 * this module is presentation only, and `POCKET_POSITIONS` stays the single
 * source of truth for where they are.
 */

import * as THREE from 'three';

import { BOARD_CONFIG, POCKET_POSITIONS } from './BoardConfig';

const CAVITY_SEGMENTS = 32;

export class Pockets {
  readonly #group = new THREE.Group();
  readonly #disposables: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor() {
    this.#group.name = 'Pockets';

    const { radius, dropDepth } = BOARD_CONFIG.pocket;

    // One geometry and one material per part, shared across all four pockets.
    const wallGeometry = new THREE.CylinderGeometry(
      radius,
      radius * 0.82, // taper inward, so the cavity reads as having depth
      dropDepth,
      CAVITY_SEGMENTS,
      1,
      true, // open-ended — the lid would be the board surface itself
    );
    const floorGeometry = new THREE.CircleGeometry(radius * 0.82, CAVITY_SEGMENTS);
    // A visible brass ring at the rim. The first attempt used a tube 7% of the
    // pocket radius, which at this board scale was under a pixel on screen and
    // left the pockets reading as flat painted dots. At 16% it catches the key
    // light and gives the eye the highlight it needs to read depth.
    const lipGeometry = new THREE.TorusGeometry(
      radius * 0.99,
      radius * 0.16,
      10,
      CAVITY_SEGMENTS,
    );

    const cavityMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d0906,
      roughness: 0.95,
      metalness: 0,
      side: THREE.BackSide, // seen from outside, so render the inner faces
    });
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x080604,
      roughness: 1,
      metalness: 0,
    });
    const lipMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a6b3f,
      roughness: 0.35,
      metalness: 0.85,
    });

    this.#disposables.push(
      wallGeometry,
      floorGeometry,
      lipGeometry,
      cavityMaterial,
      floorMaterial,
      lipMaterial,
    );

    for (const [index, position] of POCKET_POSITIONS.entries()) {
      const pocket = new THREE.Group();
      pocket.name = `Pocket_${index}`;
      pocket.position.set(position.x, 0, position.z);

      const wall = new THREE.Mesh(wallGeometry, cavityMaterial);
      wall.position.y = -dropDepth / 2;
      // The cavity is unlit interior; having it receive shadows costs a shadow
      // lookup per fragment for no visible gain.
      wall.receiveShadow = false;

      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -dropDepth;

      const lip = new THREE.Mesh(lipGeometry, lipMaterial);
      lip.rotation.x = -Math.PI / 2;
      // Sunk so only the upper half of the tube shows above the playing plane —
      // a ring flush with the wood, not a doughnut sitting on top of it.
      lip.position.y = -BOARD_CONFIG.pocket.radius * 0.1;
      lip.castShadow = false;
      lip.receiveShadow = true;

      // Meshes share geometry and materials owned by this class, so the scene
      // graph's recursive disposal must leave them alone.
      for (const mesh of [wall, floor, lip]) mesh.userData['sharedResources'] = true;

      pocket.add(wall, floor, lip);
      this.#group.add(pocket);
    }
  }

  get group(): THREE.Group {
    return this.#group;
  }

  dispose(): void {
    for (const resource of this.#disposables) resource.dispose();
    this.#disposables.length = 0;
  }
}
