/**
 * Peer-to-peer multiplayer over WebRTC.
 *
 * One player hosts and shares a link; the other opens it and connects directly.
 * PeerJS's public broker is used only to introduce the two browsers — once the
 * WebRTC channel is open, shots travel between the devices with nothing in the
 * middle, which is why this works from a static site with no server.
 *
 * ## What crosses the wire
 *
 * Only `ShotCommand`s and, after each shot settles, an authoritative board
 * snapshot from the host. Sending shots alone would be tempting — the physics
 * is fixed-step and deterministic *on a given machine* — but Rapier's floating
 * point results are not guaranteed identical across CPUs and browsers, so two
 * boards would drift apart over a match and neither player would know. The host
 * is therefore the referee: the guest plays its own shots locally for
 * responsiveness, then accepts the host's positions as truth.
 *
 * This layer knows nothing about rules. It moves `ShotCommand`s, which is the
 * same serializable struct the pointer and the AI already produce.
 */

import type { EventBus } from '../core/EventBus';
import type { BoardPoint, PlayerSlot, ShotCommand } from '../core/types';

/** A piece's authoritative position, as sent by the host. */
export interface PieceSnapshot {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly active: boolean;
}

export type NetMessage =
  | { readonly type: 'hello'; readonly name: string }
  | { readonly type: 'welcome'; readonly youAre: PlayerSlot; readonly hostName: string }
  | { readonly type: 'shot'; readonly by: PlayerSlot; readonly shot: ShotCommand }
  | {
      readonly type: 'sync';
      readonly pieces: readonly PieceSnapshot[];
      readonly currentPlayer: PlayerSlot;
    }
  | { readonly type: 'rematch' };

export type NetRole = 'host' | 'guest' | 'offline';

export type NetStatus =
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

interface PeerLike {
  id: string;
  on(event: string, handler: (...args: never[]) => void): void;
  connect(id: string, options?: unknown): ConnectionLike;
  destroy(): void;
}

interface ConnectionLike {
  open: boolean;
  on(event: string, handler: (...args: never[]) => void): void;
  send(data: unknown): void;
  close(): void;
}

export class NetworkManager {
  readonly #events: EventBus;

  #peer: PeerLike | undefined;
  #connection: ConnectionLike | undefined;
  #role: NetRole = 'offline';
  #status: NetStatus = 'idle';
  #roomId = '';

  /** Set by Game so incoming shots can be replayed through the turn machine. */
  onShot: ((by: PlayerSlot, shot: ShotCommand) => void) | undefined;
  onSync: ((pieces: readonly PieceSnapshot[], currentPlayer: PlayerSlot) => void) | undefined;
  onStatus: ((status: NetStatus, detail?: string) => void) | undefined;
  onRematch: (() => void) | undefined;

  constructor(events: EventBus) {
    this.#events = events;
  }

  get role(): NetRole {
    return this.#role;
  }

  get status(): NetStatus {
    return this.#status;
  }

  get isOnline(): boolean {
    return this.#role !== 'offline';
  }

  get isHost(): boolean {
    return this.#role === 'host';
  }

  /** Which seat this device plays. Host takes the bottom, guest the top. */
  get localSlot(): PlayerSlot {
    return (this.#role === 'guest' ? 'PLAYER_TWO' : 'PLAYER_ONE') as PlayerSlot;
  }

  get roomId(): string {
    return this.#roomId;
  }

  /** Link to send the other player. */
  get shareLink(): string {
    if (!this.#roomId) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('join', this.#roomId);
    url.hash = '';
    return url.toString();
  }

  /** Room id from the current URL, if this page was opened from a share link. */
  static roomFromUrl(): string | null {
    try {
      return new URL(window.location.href).searchParams.get('join');
    } catch {
      return null;
    }
  }

  #setStatus(status: NetStatus, detail?: string): void {
    this.#status = status;
    this.onStatus?.(status, detail);
  }

  /**
   * PeerJS is loaded on demand.
   *
   * It is ~100 kB and only two of four modes ever need it, so it is kept out
   * of the initial download for everyone playing locally or against the AI.
   */
  async #createPeer(id?: string): Promise<PeerLike> {
    const { Peer } = await import('peerjs');
    // Short, readable room codes — the id ends up in a link people type or
    // paste, so a full UUID would be hostile.
    const peer = new Peer(id as string, {
      debug: 0,
    }) as unknown as PeerLike;
    return peer;
  }

  /** Create a room and wait for someone to join. */
  async host(): Promise<string> {
    this.#teardown();
    this.#role = 'host';
    this.#setStatus('creating');

    const roomId = `carrom-${Math.random().toString(36).slice(2, 8)}`;
    const peer = await this.#createPeer(roomId);
    this.#peer = peer;

    return new Promise<string>((resolve, reject) => {
      peer.on('open', ((id: string) => {
        this.#roomId = id;
        this.#setStatus('waiting');
        resolve(id);
      }) as never);

      peer.on('connection', ((connection: ConnectionLike) => {
        // One opponent at a time; a second joiner is refused rather than
        // silently taking over the first player's seat.
        if (this.#connection?.open) {
          connection.close();
          return;
        }
        this.#connection = connection;
        this.#bindConnection(connection);
        connection.on('open', (() => {
          this.#setStatus('connected');
          this.#send({ type: 'welcome', youAre: 'PLAYER_TWO' as PlayerSlot, hostName: 'Host' });
        }) as never);
      }) as never);

      peer.on('error', ((error: { type?: string; message?: string }) => {
        this.#setStatus('error', error?.message ?? error?.type ?? 'connection failed');
        reject(new Error(error?.message ?? 'peer error'));
      }) as never);
    });
  }

  /** Join a room created by someone else. */
  async join(roomId: string): Promise<void> {
    this.#teardown();
    this.#role = 'guest';
    this.#roomId = roomId;
    this.#setStatus('connecting');

    const peer = await this.#createPeer();
    this.#peer = peer;

    return new Promise<void>((resolve, reject) => {
      peer.on('open', (() => {
        const connection = peer.connect(roomId, { reliable: true });
        this.#connection = connection;
        this.#bindConnection(connection);

        connection.on('open', (() => {
          this.#setStatus('connected');
          this.#send({ type: 'hello', name: 'Guest' });
          resolve();
        }) as never);
      }) as never);

      peer.on('error', ((error: { type?: string; message?: string }) => {
        const message =
          error?.type === 'peer-unavailable'
            ? 'That game is no longer open.'
            : (error?.message ?? 'connection failed');
        this.#setStatus('error', message);
        reject(new Error(message));
      }) as never);
    });
  }

  #bindConnection(connection: ConnectionLike): void {
    connection.on('data', ((raw: unknown) => this.#receive(raw)) as never);
    connection.on('close', (() => this.#setStatus('disconnected')) as never);
    connection.on('error', (() => this.#setStatus('error', 'connection lost')) as never);
  }

  #receive(raw: unknown): void {
    const message = raw as NetMessage;
    if (!message || typeof message !== 'object') return;

    switch (message.type) {
      case 'shot':
        this.onShot?.(message.by, message.shot);
        break;
      case 'sync':
        // Only the guest accepts positions; the host *is* the authority.
        if (this.#role === 'guest') this.onSync?.(message.pieces, message.currentPlayer);
        break;
      case 'rematch':
        this.onRematch?.();
        break;
      case 'hello':
        this.#setStatus('connected');
        break;
      case 'welcome':
        this.#setStatus('connected');
        break;
      default:
        break;
    }
  }

  #send(message: NetMessage): void {
    if (!this.#connection?.open) return;
    try {
      this.#connection.send(message);
    } catch {
      this.#setStatus('error', 'send failed');
    }
  }

  /** Tell the other device about a shot taken here. */
  sendShot(by: PlayerSlot, shot: ShotCommand): void {
    this.#send({ type: 'shot', by, shot });
  }

  /** Host only: publish the authoritative board after a shot settles. */
  sendSync(pieces: readonly PieceSnapshot[], currentPlayer: PlayerSlot): void {
    if (this.#role !== 'host') return;
    this.#send({ type: 'sync', pieces, currentPlayer });
  }

  sendRematch(): void {
    this.#send({ type: 'rematch' });
  }

  #teardown(): void {
    this.#connection?.close();
    this.#connection = undefined;
    this.#peer?.destroy();
    this.#peer = undefined;
  }

  disconnect(): void {
    this.#teardown();
    this.#role = 'offline';
    this.#roomId = '';
    this.#setStatus('idle');
    void this.#events;
  }
}

/** Board point helper, kept here so callers need not import types twice. */
export type { BoardPoint };
