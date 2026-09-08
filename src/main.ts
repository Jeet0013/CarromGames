/**
 * Application entry point.
 *
 * Phase 1 boots the toolchain and proves the two engines are live: Three.js
 * imports cleanly, and Rapier's WebAssembly module compiles and initialises in
 * the browser. Rapier's async init is the one genuinely failure-prone step in
 * this stack, so it is verified before anything is built on top of it.
 *
 * Phase 2 replaces the boot report with the renderer, scene, camera, and
 * lighting.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import { REVISION as THREE_REVISION } from 'three';

import { BOARD_CONFIG, POCKET_POSITIONS } from './board/BoardConfig';
import { EventBus } from './core/EventBus';
import { GAME_CONFIG, IS_DEV } from './config/GameConfig';
import { PHYSICS_CONFIG, PIECE_GEOMETRY } from './physics/PhysicsConfig';

const statusEl = document.getElementById('boot-status');
const bootEl = document.getElementById('boot');

/** Update the boot overlay. Safe to call before the DOM query resolved. */
function setStatus(message: string): void {
  if (statusEl) statusEl.textContent = message;
}

/** Replace the spinner with a readable failure instead of a blank screen. */
function reportFailure(error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('[Carrom Arena 3D] startup failed:', error);

  if (!bootEl) return;
  bootEl.querySelector('.boot__ring')?.remove();
  setStatus('Failed to start.');

  const pre = document.createElement('p');
  pre.className = 'boot__error';
  pre.textContent = detail;
  bootEl.append(pre);
}

async function bootstrap(): Promise<void> {
  setStatus('Initialising physics engine…');

  // Rapier ships as WebAssembly and must finish compiling before any of its
  // constructors exist. Everything downstream depends on this resolving.
  await RAPIER.init();

  setStatus('Verifying engines…');

  // A throwaway world confirms the WASM module is genuinely usable, not merely
  // loaded. Disposed immediately — PhysicsWorld owns the real one in Phase 4.
  const probe = new RAPIER.World({ x: 0, y: PHYSICS_CONFIG.GRAVITY_Y, z: 0 });
  probe.timestep = PHYSICS_CONFIG.FIXED_TIME_STEP;
  probe.step();
  probe.free();

  // The bus is the spine every later system plugs into; construct it now so
  // Phase 2 wires the renderer to an existing instance rather than inventing one.
  const events = new EventBus();

  if (IS_DEV) {
    console.info(
      `%c${GAME_CONFIG.name} v${GAME_CONFIG.version}`,
      'color:#b07a45;font-weight:600',
    );
    console.table({
      'Three.js': `r${THREE_REVISION}`,
      Rapier: RAPIER.version(),
      'Board size (world units)': BOARD_CONFIG.surface.size.toFixed(2),
      'Coin radius': PIECE_GEOMETRY.coin.radius.toFixed(3),
      'Striker radius': PIECE_GEOMETRY.striker.radius.toFixed(3),
      Pockets: POCKET_POSITIONS.length,
      'Fixed step': `${GAME_CONFIG.simulation.fixedTimeStepMs.toFixed(2)} ms`,
    });
  }

  // The overlay stays up: until Phase 2 draws a scene there is nothing behind
  // it, and this line is the only visible proof the toolchain works end to end.
  events.once('game:ready', () => {
    bootEl?.querySelector('.boot__ring')?.remove();
    setStatus(`Phase 1 ready — Three.js r${THREE_REVISION}, Rapier ${RAPIER.version()}`);
  });

  events.emit('game:ready');
}

void bootstrap().catch(reportFailure);
