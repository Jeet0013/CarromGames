/**
 * The striker.
 *
 * Larger and roughly three times a coin's mass, which is what lets it drive
 * coins rather than bounce off them. It is the only piece the player moves
 * directly, and the only one with CCD enabled — it is also the only piece that
 * ever travels fast enough to risk tunnelling through a rail.
 */

import { Piece, type PieceOptions } from './Piece';
import { PieceKind } from '../core/types';

export class Striker extends Piece {
  constructor(options: Omit<PieceOptions, 'kind' | 'color'>) {
    super({ ...options, kind: PieceKind.Striker, color: null });
  }
}
