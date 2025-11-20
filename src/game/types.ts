// Basic enums / unions
export type ResourceType = "Food" | "Wood" | "Stone" | "Gold" | "Belief"

export type TerrainType =
  | "Field"
  | "Forest"
  | "Mountain"
  | "Water"
  | "FertileField"

export type PlayerId = "PLAYER_1" | "PLAYER_2"

export type DeityPowerType = "BLESSED_HARVEST" | "INSPIRED_WORSHIP"

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

  // id of the player that currently controls this tile (zone of influence)
  controller?: PlayerId | null
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

  // Growth + capacity
  populationCap: number
  growthProgress: number
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

export interface SettlementBuff {
  id: string
  settlementId: string
  owner: PlayerId
  type: DeityPowerType
  expiresAtMs: number // game.currentTimeMs when the buff expires
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
  buffs: SettlementBuff[]
}

// Action types for real-time play
export type ActionType =
  | "NOOP"
  | "PLACE_STARTING_SETTLEMENT"
  | "BUILD_SETTLEMENT"
  | "ALLOCATE_ROLES"
  | "TICK"
  | "RAID_SETTLEMENT"
  | "USE_DEITY_POWER"
  | "UPGRADE_SETTLEMENT"

export interface PlayerAction<TPayload = unknown> {
  id: string // client-generated UUID
  playerId: PlayerId
  type: ActionType
  payload: TPayload
  clientTimeMs: number // when the client created the action
}

// Typed payloads for a few core actions
export interface PlaceStartingSettlementPayload {
  tileId: string
}

export interface BuildSettlementPayload {
  tileId: string
}

export interface AllocateRolesPayload {
  settlementId: string
  // Percentages (0–100). They do NOT have to sum to 100; any remainder is "idle".
  workersPercent: number
  worshippersPercent: number
  defendersPercent: number
}

// Tick payload
export interface TickPayload {
  deltaMs: number
}

export interface RaidSettlementPayload {
  fromSettlementId: string
  targetSettlementId: string
  // Percent of defenders from the attacking settlement to commit to the raid (0–100).
  raiderPercent: number
}

export interface UseDeityPowerPayload {
  power: DeityPowerType
  settlementId: string
}

export interface UpgradeSettlementPayload {
  settlementId: string
}

// Union of payloads
export type AnyActionPayload =
  | PlaceStartingSettlementPayload
  | BuildSettlementPayload
  | AllocateRolesPayload
  | TickPayload
  | RaidSettlementPayload
  | UseDeityPowerPayload
  | UpgradeSettlementPayload
  | undefined

export type AnyPlayerAction = PlayerAction<AnyActionPayload>
