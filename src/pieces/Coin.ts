/**
 * A white or black Carrom coin.
 *
 * Carries the colour; the *owner* stays null until the rule layer assigns
 * colours from the first valid pocket, which is when Carrom actually decides
 * who plays which side.
 */

import { Piece, type PieceOptions } from './Piece';
import { CoinColor, PieceKind } from '../core/types';

export class Coin extends Piece {
  constructor(options: Omit<PieceOptions, 'kind'> & { color: CoinColor }) {
    super({
      ...options,
      kind: options.color === CoinColor.White ? PieceKind.WhiteCoin : PieceKind.BlackCoin,
    });
  }

  get isWhite(): boolean {
    return this.color === CoinColor.White;
  }
}
