/**
 * Authoritative match state.
 *
 * Plain serializable data — no meshes, no bodies, no DOM. That is what lets the
 * whole rule layer be tested headlessly, and what would let a future networked
 * build ship this struct over the wire.
 */

import { PlayerSide } from './PlayerSide';
import { CoinColor, GameMode, PlayerSlot, QueenState, TeamId } from './types';

export interface PlayerState {
  readonly slot: PlayerSlot;
  /** Which edge of the board this seat shoots from. */
  side: PlayerSide;
  /** Null until the first valid pocket assigns colours. */
  color: CoinColor | null;
  /** Own coins pocketed and kept. */
  coinsPocketed: number;
  /**
   * Coins owed back to the board from fouls committed before the player had
   * anything to give. Paid on their next pocket.
   */
  penaltyDebt: number;
  foulCount: number;
  shotsTaken: number;
  /** Free-for-all points. Unused under team scoring, always present. */
  points: number;
  /** Set only in team modes. */
  team: TeamId | null;
  isEliminated: boolean;
}

/**
 * Shared team progress.
 *
 * Colour, coins, and the win condition belong to the *team* in partner play,
 * not to a player — so they live here and `PlayerState` keeps only individual
 * statistics. Individual modes simply leave `teams` unused.
 */
export interface TeamState {
  readonly id: TeamId;
  readonly players: PlayerSlot[];
  color: CoinColor | null;
  coinsPocketed: number;
  fouls: number;
  score: number;
}

export interface MatchState {
  mode: GameMode;
  /** Seats in play, in turn order. Two entries for 2P, four for 4P. */
  seatOrder: PlayerSlot[];
  currentPlayer: PlayerSlot;
  readonly players: Record<PlayerSlot, PlayerState>;

  /** Coins still on the board, by colour. */
  coinsOnBoard: Record<CoinColor, number>;

  queen: QueenState;
  /** Who pocketed the Queen and still owes a cover. */
  queenPocketedBy: PlayerSlot | null;

  /** Present only in team modes; null elsewhere. */
  teams: Record<TeamId, TeamState> | null;
  winningTeam: TeamId | null;

  /** True until the first shot of the match has been played. */
  isBreakShot: boolean;
  turnCount: number;
  winner: PlayerSlot | null;
}

export const COINS_PER_COLOR = 9;

export function createMatchState(
  mode: GameMode = GameMode.LocalMultiplayer,
  starting: PlayerSlot = PlayerSlot.One,
): MatchState {
  return {
    mode,
    // Two seats by default; `configureSeats` widens this for four-player.
    seatOrder: [PlayerSlot.One, PlayerSlot.Two],
    currentPlayer: starting,
    // All four slots always exist. A mode enables the ones it uses via
    // `seatOrder`, so nothing downstream has to branch on a player count.
    players: {
      [PlayerSlot.One]: newPlayer(PlayerSlot.One, PlayerSide.Bottom),
      [PlayerSlot.Two]: newPlayer(PlayerSlot.Two, PlayerSide.Top),
      [PlayerSlot.Three]: newPlayer(PlayerSlot.Three, PlayerSide.Right),
      [PlayerSlot.Four]: newPlayer(PlayerSlot.Four, PlayerSide.Bottom),
    },
    teams: null,
    winningTeam: null,
    coinsOnBoard: {
      [CoinColor.White]: COINS_PER_COLOR,
      [CoinColor.Black]: COINS_PER_COLOR,
    },
    queen: QueenState.OnBoard,
    queenPocketedBy: null,
    isBreakShot: true,
    turnCount: 0,
    winner: null,
  };
}

function newPlayer(slot: PlayerSlot, side: PlayerSide): PlayerState {
  return {
    slot,
    side,
    color: null,
    coinsPocketed: 0,
    penaltyDebt: 0,
    foulCount: 0,
    shotsTaken: 0,
    points: 0,
    team: null,
    isEliminated: false,
  };
}

/** Build team state and stamp each player's team. */
export function assignTeams(
  state: MatchState,
  seating: ReadonlyArray<{ slot: PlayerSlot; team: TeamId }>,
): void {
  const teams: Record<TeamId, TeamState> = {
    [TeamId.A]: { id: TeamId.A, players: [], color: null, coinsPocketed: 0, fouls: 0, score: 0 },
    [TeamId.B]: { id: TeamId.B, players: [], color: null, coinsPocketed: 0, fouls: 0, score: 0 },
  };

  for (const entry of seating) {
    teams[entry.team].players.push(entry.slot);
    state.players[entry.slot].team = entry.team;
  }

  state.teams = teams;
}

/** The team a seat belongs to, or null in individual play. */
export const teamOf = (state: MatchState, slot: PlayerSlot): TeamId | null =>
  state.players[slot].team;

/**
 * Colour owned by a seat, resolved through its team when one exists.
 *
 * This single indirection is what makes team ownership work without the rule
 * engine knowing about teams: it asks who owns a colour, and gets the team's
 * answer when partners are playing and the player's own otherwise.
 */
export function effectiveColor(state: MatchState, slot: PlayerSlot): CoinColor | null {
  const team = state.players[slot].team;
  if (team !== null && state.teams) return state.teams[team].color;
  return state.players[slot].color;
}

/**
 * Coins banked by a seat's side — both partners together in team play.
 *
 * Summed from the players rather than read from `TeamState.coinsPocketed`,
 * which is a cache and can only ever be as correct as its last writer. The win
 * condition depends on this number: partners share nine coins, so reading one
 * player's count meant a four-player team could pocket all nine between them
 * and never be declared the winner.
 */
export function effectiveCoinsPocketed(state: MatchState, slot: PlayerSlot): number {
  const team = state.players[slot].team;
  if (team === null || !state.teams) return state.players[slot].coinsPocketed;
  return state.teams[team].players.reduce(
    (total, member) => total + state.players[member].coinsPocketed,
    0,
  );
}

/**
 * A seat on the side that owns the *other* colour.
 *
 * Where coins the shooter pocketed for their opponents are credited. In team
 * play any member of the opposing team will do, since the total is a team one;
 * `opponentOf` alone would have sent a four-player credit to Player One or Two
 * regardless of who was actually playing.
 */
export function opposingSeatOf(state: MatchState, slot: PlayerSlot): PlayerSlot {
  const team = state.players[slot].team;
  if (team === null || !state.teams) return opponentOf(slot);
  const opposing = team === TeamId.A ? TeamId.B : TeamId.A;
  return state.teams[opposing].players[0] ?? opponentOf(slot);
}

export const opponentOf = (slot: PlayerSlot): PlayerSlot =>
  slot === PlayerSlot.One ? PlayerSlot.Two : PlayerSlot.One;

/**
 * The seat that plays after this one.
 *
 * Reads `seatOrder` rather than assuming two players, so the same turn logic
 * carries four-player without a branch.
 */
export function nextSeat(state: MatchState, from: PlayerSlot): PlayerSlot {
  const order = state.seatOrder;
  const index = order.indexOf(from);
  if (index < 0) return order[0] ?? from;
  return order[(index + 1) % order.length] ?? from;
}

/** Which edge a seat shoots from. */
export const sideOf = (state: MatchState, slot: PlayerSlot): PlayerSide =>
  state.players[slot].side;

/** The colour a seat owns, or null while colours are unassigned. */
export const colorOf = (state: MatchState, slot: PlayerSlot): CoinColor | null =>
  effectiveColor(state, slot);

/**
 * Assign colours from one player's claim; the opponent takes the other.
 * Idempotent — a second call with colours already set is a no-op.
 */
export function assignColors(
  state: MatchState,
  slot: PlayerSlot,
  color: CoinColor,
): void {
  const other = color === CoinColor.White ? CoinColor.Black : CoinColor.White;

  // Team play: the claim belongs to the team, and both partners inherit it.
  const team = state.players[slot].team;
  if (team !== null && state.teams) {
    if (state.teams[team].color !== null) return;
    const opposingTeam = team === TeamId.A ? TeamId.B : TeamId.A;
    state.teams[team].color = color;
    state.teams[opposingTeam].color = other;
    for (const s of state.teams[team].players) state.players[s].color = color;
    for (const s of state.teams[opposingTeam].players) state.players[s].color = other;
    return;
  }

  if (state.players[slot].color !== null) return;
  state.players[slot].color = color;
  state.players[opponentOf(slot)].color = other;
}
