/**
 * The red Queen.
 *
 * Physically identical to a coin — same size, same mass — so it behaves no
 * differently under collision. Everything that makes the Queen special lives in
 * the rules, not here.
 */

import { Piece, type PieceOptions } from './Piece';
import { PieceKind } from '../core/types';

export class Queen extends Piece {
  constructor(options: Omit<PieceOptions, 'kind' | 'color'>) {
    super({ ...options, kind: PieceKind.Queen, color: null });
  }
}
