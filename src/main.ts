/**
 * Application entry point.
 *
 * Initialises Rapier's WebAssembly module, constructs the `Game`, and starts
 * the loop. Rapier's async init is the one genuinely failure-prone step in the
 * stack, so it is awaited before anything is built on top of it — even though
 * no physics runs yet.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import { REVISION as THREE_REVISION } from 'three';

import { Game } from './core/Game';
import { NetworkManager } from './net/NetworkManager';
import { GAME_CONFIG, IS_DEV } from './config/GameConfig';
import { PHYSICS_CONFIG } from './physics/PhysicsConfig';

const bootEl = document.getElementById('boot');
const statusEl = document.getElementById('boot-status');

function setStatus(message: string): void {
  if (statusEl) statusEl.textContent = message;
}

/** Show a readable failure instead of a blank screen. */
function reportFailure(error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('[Carrom Arena 3D] startup failed:', error);

  if (!bootEl) return;
  bootEl.hidden = false;
  bootEl.classList.remove('is-hidden');
  bootEl.querySelector('.boot__ring')?.remove();
  setStatus('Failed to start.');

  const pre = document.createElement('p');
  pre.className = 'boot__error';
  pre.textContent = detail;
  bootEl.append(pre);
}

async function bootstrap(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  setStatus('Initialising physics engine…');
  // Rapier ships as WebAssembly; none of its constructors exist until this
  // resolves.
  await RAPIER.init();

  setStatus('Building scene…');
  const game = new Game({ container });

  game.events.once('game:ready', () => {
    // Fade out, then take the overlay out of the layout entirely so it can
    // never intercept a striker drag.
    bootEl?.classList.add('is-hidden');
    window.setTimeout(() => {
      if (bootEl) bootEl.hidden = true;
    }, 450);
  });

  game.start();

  // Opened from a shared link: go straight into joining that room.
  const room = NetworkManager.roomFromUrl();
  if (room) void game.joinOnline(room);

  if (IS_DEV) {
    console.info(
      `%c${GAME_CONFIG.name} v${GAME_CONFIG.version}`,
      'color:#b07a45;font-weight:600',
    );
    console.table({
      'Three.js': `r${THREE_REVISION}`,
      Rapier: RAPIER.version(),
      'Fixed step': `${GAME_CONFIG.simulation.fixedTimeStepMs.toFixed(2)} ms`,
      Gravity: PHYSICS_CONFIG.GRAVITY_Y,
      Quality: game.renderer.quality,
    });

    // Expose for console poking during development only.
    Reflect.set(globalThis, 'game', game);
  }
}

void bootstrap().catch(reportFailure);
