// Basic enums / unions
export type ResourceType = "Food" | "Wood" | "Stone" | "Gold" | "Belief"

export type TerrainType =
  | "Field"
  | "Forest"
  | "Mountain"
  | "Water"
  | "FertileField"

export type PlayerId = "PLAYER_1" | "PLAYER_2"

// Action types for real-time play
export type ActionType =
  | "NOOP"
  | "PLACE_STARTING_SETTLEMENT"
  | "BUILD_SETTLEMENT"
  | "ALLOCATE_ROLES"
  | "TICK"
// TICK will be used by the host to advance simulation time if needed

// Base shape of a player action that gets sent over the network
export interface PlayerAction<TPayload = unknown> {
  id: string // client-generated UUID
  playerId: PlayerId
  type: ActionType
  payload: TPayload
  clientTimeMs: number // when the client created the action
}

// Typed payloads for a few core actions (we’ll wire logic later)
export interface PlaceStartingSettlementPayload {
  tileId: string
}

export interface BuildSettlementPayload {
  tileId: string
}

export interface AllocateRolesPayload {
  settlementId: string
  workers: number
  worshippers: number
  defenders: number
}

// Union of all known payloads for convenience (optional but helpful)
export type AnyActionPayload =
  | PlaceStartingSettlementPayload
  | BuildSettlementPayload
  | AllocateRolesPayload
  | undefined

export type AnyPlayerAction = PlayerAction<AnyActionPayload>

// Axial hex coordinates (for a hex grid)
export interface HexCoord {
  q: number
  r: number
}

// Tiles and settlements
export interface Tile {
  id: string
  coord: HexCoord
  terrain: TerrainType
  settlementId?: string // optional settlement on this tile
}

export interface Settlement {
  id: string
  owner: PlayerId
  tileId: string
  level: number // 1 = village, 2 = town, etc.
  population: number
  workers: number
  worshippers: number
  defenders: number
}

// Player + deity-related fields
export interface Player {
  id: PlayerId
  name: string
  resources: Record<ResourceType, number>
  victoryPoints: number
  belief: number
  maxBeliefEver: number
}

// Overall game phases
export type GamePhase = "LOBBY" | "RUNNING" | "GAME_OVER"

// The full game state that we will sync between clients
export interface GameState {
  id: string // game/room id
  tiles: Tile[]
  settlements: Settlement[]
  players: Player[]
  phase: GamePhase
  currentTimeMs: number // logical time for real-time simulation
  winnerId?: PlayerId
}
