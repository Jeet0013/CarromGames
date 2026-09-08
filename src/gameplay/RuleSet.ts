/**
 * Configurable rulesets.
 *
 * Carrom has no single agreed rulebook — house rules, state associations, and
 * the ICF tournament code all differ, mostly on how the Queen is handled and
 * what a foul costs. Encoding those as flags rather than branching logic means
 * a new variant is a data entry, not a rewrite of `RuleEngine`.
 *
 * `CLASSIC_CASUAL` is the default: the rules most people actually play at home.
 */

export interface RuleSet {
  readonly id: string;
  readonly name: string;

  // ── Ownership ───────────────────────────────────────────────────────────
  /**
   * Colours are unassigned until someone pockets a coin, and the first valid
   * pocket claims that colour. Turning this off would mean fixed sides.
   */
  readonly assignColorsOnFirstPocket: boolean;

  // ── Turn continuation ───────────────────────────────────────────────────
  /** Pocketing one of your own coins keeps the turn. */
  readonly continueOnOwnCoin: boolean;
  /** Pocketing an opponent coin ends the turn. */
  readonly opponentCoinEndsTurn: boolean;
  /**
   * A shot where the striker touches nothing at all is a foul. Some casual
   * groups treat it as a plain miss.
   */
  readonly noContactIsFoul: boolean;

  // ── Fouls ───────────────────────────────────────────────────────────────
  /**
   * A foul returns one of the offender's already-pocketed coins to the centre.
   * If they have none pocketed yet the debt is carried and paid on their next
   * pocket, which is how the penalty stays meaningful in the opening.
   */
  readonly foulReturnsOwnCoin: boolean;
  /** Pocketing the striker is a foul. Universal, but explicit for clarity. */
  readonly strikerPocketIsFoul: boolean;

  // ── Queen ───────────────────────────────────────────────────────────────
  /** The Queen must be covered by one of your own coins to be kept. */
  readonly queenMustBeCovered: boolean;
  /**
   * Whether an own coin pocketed in the *same* shot as the Queen covers her,
   * or whether the cover must come on the following shot.
   *
   * Casual play accepts a same-shot cover; tournament play generally does too,
   * so this defaults to true.
   */
  readonly queenCoverableSameShot: boolean;
  /** An uncovered Queen goes back to the centre. */
  readonly queenReturnsIfUncovered: boolean;
  /**
   * The Queen must be taken before your final coin. Pocketing your last coin
   * while she is still on the board is a foul and the coin is returned.
   */
  readonly queenRequiredBeforeLastCoin: boolean;

  // ── Victory ─────────────────────────────────────────────────────────────
  /** Clearing all nine of your coins wins. */
  readonly winOnAllCoinsPocketed: boolean;
}

/** House rules — the default. */
export const CLASSIC_CASUAL: RuleSet = {
  id: 'CLASSIC_CASUAL',
  name: 'Classic (Casual)',

  assignColorsOnFirstPocket: true,

  continueOnOwnCoin: true,
  opponentCoinEndsTurn: true,
  noContactIsFoul: true,

  foulReturnsOwnCoin: true,
  strikerPocketIsFoul: true,

  queenMustBeCovered: true,
  queenCoverableSameShot: true,
  queenReturnsIfUncovered: true,
  queenRequiredBeforeLastCoin: true,

  winOnAllCoinsPocketed: true,
};

/**
 * A stricter variant, kept to prove the ruleset abstraction earns its place:
 * the Queen must be covered on the *following* shot, never the same one.
 */
export const CLASSIC_TOURNAMENT: RuleSet = {
  ...CLASSIC_CASUAL,
  id: 'CLASSIC_TOURNAMENT',
  name: 'Classic (Tournament)',
  queenCoverableSameShot: false,
};

export const RULESETS: Record<string, RuleSet> = {
  [CLASSIC_CASUAL.id]: CLASSIC_CASUAL,
  [CLASSIC_TOURNAMENT.id]: CLASSIC_TOURNAMENT,
};
