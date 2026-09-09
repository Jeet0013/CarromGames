/**
 * Image-based lighting, baked from a room we build in code.
 *
 * ## Why this exists
 *
 * The board, the coins and the striker are all `MeshPhysicalMaterial` with a
 * clearcoat — a second specular lobe sitting over the diffuse, which is what
 * separates lacquered wood from painted cardboard. A specular lobe reflects
 * its surroundings. With three point-like lights and nothing else, the only
 * thing there is to reflect is three points, so every polished surface gets
 * three small highlights and is otherwise dead. The materials were already
 * asking for a room; there just wasn't one.
 *
 * `scene.environment` answers that: every rough-to-glossy surface picks up
 * light from every direction, so the varnish sweeps as the camera moves, the
 * coin bevels catch the ceiling, and the frame's shoulder rounds off against
 * the wall behind it instead of falling to flat black.
 *
 * ## Why a hand-built room rather than an HDRI
 *
 * The game ships as one self-contained HTML file — a `.hdr` fetch would be a
 * second request that the single-file build cannot inline, and the file is
 * already 3.5 MB. This scene is a few boxes and costs nothing to ship. It is
 * also authored rather than photographed, so the lamp sits where our key light
 * sits and the reflections agree with the shading instead of fighting it.
 *
 * Baked exactly once, at construction. Nothing here runs per frame.
 */

import * as THREE from 'three';

/**
 * The room, in the same units as the board (~8.7 across).
 *
 * Scale barely matters for an environment map — only the angles a surface sees
 * do — but keeping it in board units makes the numbers legible next to
 * `BoardConfig`.
 */
const ROOM = {
  width: 60,
  height: 34,
  depth: 60,
} as const;

/**
 * Emissive values are HDR: above 1.0 on purpose.
 *
 * A tone-mapped renderer expects light values outside display range — that
 * headroom is what gives a highlight somewhere to roll off to. Clamping the
 * lamp to 1.0 would make it read as a light grey card rather than a lamp.
 */
const SURFACES = {
  /** The warm overhead lamp, matching `LIGHTING_SETTINGS.keyColor`. */
  lamp: { color: 0xfff1dc, intensity: 14 },
  /** Cool daylight from one side, so the shadow side is not a dead warm grey. */
  window: { color: 0xbcd4ff, intensity: 3.4 },
  /** A second, weaker warm source opposite the lamp — a wall sconce's bounce. */
  bounce: { color: 0xffd9a8, intensity: 1.6 },
  /** The room itself: warm, dark, and very slightly lighter towards the top. */
  wall: 0x241d18,
  ceiling: 0x2e2620,
  floor: 0x140f0c,
} as const;

/** Blur applied while pre-filtering. A little softening hides the box edges. */
const BAKE_BLUR = 0.05;

export class Environment {
  #texture: THREE.Texture | null = null;

  /**
   * Bake the room and hand back the prefiltered cube map.
   *
   * The renderer is borrowed, not kept: `PMREMGenerator` needs a live WebGL
   * context to render the six faces and run the roughness prefilter, and this
   * class has no business holding onto one afterwards.
   */
  build(renderer: THREE.WebGLRenderer): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(renderer);
    // Compiling ahead of the bake keeps the first frame from stalling on
    // shader compilation at the same moment the board appears.
    pmrem.compileEquirectangularShader();

    const room = buildRoomScene();
    const target = pmrem.fromScene(room, BAKE_BLUR);

    disposeScene(room);
    pmrem.dispose();

    this.#texture = target.texture;
    return this.#texture;
  }

  dispose(): void {
    this.#texture?.dispose();
    this.#texture = null;
  }
}

/**
 * A box turned inside out, with light panels inside it.
 *
 * `BackSide` on the shell is what makes it a room rather than a crate: the
 * camera at the centre sees the inner faces.
 */
function buildRoomScene(): THREE.Scene {
  const scene = new THREE.Scene();

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM.width, ROOM.height, ROOM.depth),
    new THREE.MeshStandardMaterial({ color: SURFACES.wall, side: THREE.BackSide, roughness: 1 }),
  );
  scene.add(shell);

  // Ceiling and floor as their own planes rather than shell faces, so the
  // vertical gradient — lighter above, darker below — actually exists. It is
  // what gives a curved surface a top and a bottom.
  scene.add(
    panel(ROOM.width, ROOM.depth, SURFACES.ceiling, [0, ROOM.height / 2 - 0.1, 0], [Math.PI / 2, 0, 0]),
  );
  scene.add(
    panel(ROOM.width, ROOM.depth, SURFACES.floor, [0, -ROOM.height / 2 + 0.1, 0], [-Math.PI / 2, 0, 0]),
  );

  // The lamp, overhead and offset to the same side as the key light so the
  // brightest reflection and the cast shadow tell the same story.
  scene.add(
    light(22, 22, SURFACES.lamp, [ROOM.width * 0.13, ROOM.height / 2 - 0.4, ROOM.depth * 0.16], [
      Math.PI / 2,
      0,
      0,
    ]),
  );

  // A tall cool panel on the fill side, standing in for a window.
  scene.add(
    light(4, 20, SURFACES.window, [-ROOM.width / 2 + 0.4, 2, -ROOM.depth * 0.1], [0, Math.PI / 2, 0]),
  );

  // Warm bounce from the opposite wall, low and wide — the light a real room
  // returns off its own surfaces, which is most of what fills a shadow.
  scene.add(light(26, 6, SURFACES.bounce, [0, -4, -ROOM.depth / 2 + 0.4], [0, 0, 0]));

  return scene;
}

function panel(
  width: number,
  height: number,
  color: number,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }),
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  return mesh;
}

/**
 * An emitting panel.
 *
 * `MeshBasicMaterial` rather than an emissive standard material: this surface
 * is a light source, and running a lighting model over it would only let the
 * room's own darkness drag its value down.
 */
function light(
  width: number,
  height: number,
  source: { readonly color: number; readonly intensity: number },
  position: readonly [number, number, number],
  rotation: readonly [number, number, number],
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  material.color.setHex(source.color).multiplyScalar(source.intensity);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  return mesh;
}

/** The bake is a one-shot; the scene it read from is rubbish immediately after. */
function disposeScene(scene: THREE.Scene): void {
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const material: THREE.Material | THREE.Material[] = node.material;
    if (Array.isArray(material)) for (const m of material) m.dispose();
    else material.dispose();
  });
}
