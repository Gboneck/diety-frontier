// Basic enums / unions
export type ResourceType = "Food" | "Wood" | "Stone" | "Gold" | "Belief"

export type TerrainType =
  | "Field"
  | "Forest"
  | "Mountain"
  | "Water"
  | "FertileField"

export type PlayerId = "PLAYER_1" | "PLAYER_2"

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
