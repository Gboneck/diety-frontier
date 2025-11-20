import type {
  GameState,
  Player,
  PlayerId,
  ResourceType,
  Settlement,
  TerrainType,
  Tile,
} from "./types"

export const RESOURCE_TYPES: ResourceType[] = [
  "Food",
  "Wood",
  "Stone",
  "Gold",
  "Belief",
]

const BASE_TERRAIN_PRODUCTION: Record<
  TerrainType,
  Partial<Record<ResourceType, number>>
> = {
  Field: { Food: 2 },
  FertileField: { Food: 3 },
  Forest: { Wood: 2 },
  Mountain: { Stone: 2, Gold: 0.5 },
  Water: { Food: 1, Gold: 0.25 },
}

const BELIEF_PER_WORSHIPPER_PER_SECOND = 0.25
const DEFENSE_VICTORY_POINT_VALUE = 0.05
const BASE_VICTORY_POINTS_PER_LEVEL = 0.1

export const LOGICAL_TICK_MS = 1000

const DEFAULT_TILE_LAYOUT: Array<{ coord: Tile["coord"]; terrain: TerrainType }> = [
  { coord: { q: 0, r: 0 }, terrain: "FertileField" },
  { coord: { q: 1, r: 0 }, terrain: "Forest" },
  { coord: { q: 0, r: 1 }, terrain: "Mountain" },
  { coord: { q: -1, r: 1 }, terrain: "Field" },
  { coord: { q: -1, r: 0 }, terrain: "Water" },
  { coord: { q: 0, r: -1 }, terrain: "Field" },
  { coord: { q: 1, r: -1 }, terrain: "Forest" },
]

function createResourceLedger(): Record<ResourceType, number> {
  return RESOURCE_TYPES.reduce((acc, type) => {
    acc[type] = 0
    return acc
  }, {} as Record<ResourceType, number>)
}

function createPlayer(id: PlayerId, name: string): Player {
  return {
    id,
    name,
    resources: createResourceLedger(),
    victoryPoints: 0,
    belief: 0,
    maxBeliefEver: 0,
  }
}

export function createDefaultMap(): Tile[] {
  return DEFAULT_TILE_LAYOUT.map((tile, index) => ({
    id: `TILE_${index + 1}`,
    coord: tile.coord,
    terrain: tile.terrain,
  }))
}

export function createDefaultSettlements(): Settlement[] {
  const tiles = createDefaultMap()
  return [
    {
      id: "SETTLEMENT_1",
      owner: "PLAYER_1",
      tileId: tiles[0].id,
      level: 1,
      population: 10,
      workers: 6,
      worshippers: 2,
      defenders: 2,
    },
    {
      id: "SETTLEMENT_2",
      owner: "PLAYER_2",
      tileId: tiles[1].id,
      level: 1,
      population: 10,
      workers: 5,
      worshippers: 3,
      defenders: 2,
    },
  ]
}

export function createInitialGameState(): GameState {
  const tiles = createDefaultMap()
  const settlements = createDefaultSettlements()

  // attach settlement references to tiles
  const settlementsByTile = new Map<string, Settlement>()
  settlements.forEach((settlement) => {
    settlementsByTile.set(settlement.tileId, settlement)
  })

  const tilesWithSettlements: Tile[] = tiles.map((tile) => ({
    ...tile,
    settlementId: settlementsByTile.get(tile.id)?.id,
  }))

  return {
    id: crypto.randomUUID(),
    tiles: tilesWithSettlements,
    settlements,
    players: [createPlayer("PLAYER_1", "Aurora"), createPlayer("PLAYER_2", "Nox")],
    phase: "LOBBY",
    currentTimeMs: 0,
  }
}

function addProduction(
  base: Record<ResourceType, number>,
  addition: Partial<Record<ResourceType, number>>,
  scale = 1,
): Record<ResourceType, number> {
  const next = { ...base }
  RESOURCE_TYPES.forEach((type) => {
    const value = addition[type] ?? 0
    if (value !== 0) {
      next[type] += value * scale
    }
  })
  return next
}

function getTileForSettlement(
  settlement: Settlement,
  tiles: Tile[],
): Tile | undefined {
  return tiles.find((tile) => tile.id === settlement.tileId)
}

function computeSettlementProduction(
  settlement: Settlement,
  tile: Tile,
): Record<ResourceType, number> {
  const terrainProduction = BASE_TERRAIN_PRODUCTION[tile.terrain] ?? {}
  const workersPerLevel = Math.max(1, settlement.level)
  const effectiveWorkers = Math.min(settlement.workers, settlement.population)
  const workerScale = (effectiveWorkers / workersPerLevel) * 0.5

  let production: Record<ResourceType, number> = createResourceLedger()
  production = addProduction(production, terrainProduction, workerScale)

  const beliefGain = settlement.worshippers * BELIEF_PER_WORSHIPPER_PER_SECOND
  if (beliefGain > 0) {
    production.Belief += beliefGain
  }

  return production
}

function applyProductionToPlayers(
  players: Player[],
  production: Map<PlayerId, Record<ResourceType, number>>,
  victoryPointsPerSecond: Map<PlayerId, number>,
  elapsedSeconds: number,
): Player[] {
  return players.map((player) => {
    const gains = production.get(player.id)
    if (!gains) return player

    const updatedResources = addProduction(player.resources, gains, elapsedSeconds)
    const belief = player.belief + (gains.Belief ?? 0) * elapsedSeconds
    const maxBeliefEver = Math.max(player.maxBeliefEver, belief)
    const defenderPoints = (gains.Stone ?? 0) * elapsedSeconds * DEFENSE_VICTORY_POINT_VALUE
    const levelPoints = (victoryPointsPerSecond.get(player.id) ?? 0) * elapsedSeconds
    const victoryPoints = player.victoryPoints + levelPoints + defenderPoints

    return {
      ...player,
      resources: updatedResources,
      belief,
      maxBeliefEver,
      victoryPoints,
    }
  })
}

function evaluateWinCondition(state: GameState): PlayerId | undefined {
  const targetPoints = 20
  const winningPlayer = state.players.find((player) => player.victoryPoints >= targetPoints)
  return winningPlayer?.id
}

export function tickGameState(state: GameState, elapsedMs: number): GameState {
  if (state.phase !== "RUNNING") {
    return state
  }

  const elapsedSeconds = elapsedMs / 1000
  const productionByPlayer = new Map<PlayerId, Record<ResourceType, number>>()
  const victoryPointsByPlayer = new Map<PlayerId, number>()

  state.settlements.forEach((settlement) => {
    const tile = getTileForSettlement(settlement, state.tiles)
    if (!tile) return

    const settlementProduction = computeSettlementProduction(settlement, tile)
    const existing =
      productionByPlayer.get(settlement.owner) ?? createResourceLedger()
    productionByPlayer.set(
      settlement.owner,
      addProduction(existing, settlementProduction),
    )

    const existingVictoryPoints = victoryPointsByPlayer.get(settlement.owner) ?? 0
    victoryPointsByPlayer.set(
      settlement.owner,
      existingVictoryPoints + settlement.level * BASE_VICTORY_POINTS_PER_LEVEL,
    )
  })

  const updatedPlayers = applyProductionToPlayers(
    state.players,
    productionByPlayer,
    victoryPointsByPlayer,
    elapsedSeconds,
  )

  const next: GameState = {
    ...state,
    players: updatedPlayers,
    currentTimeMs: state.currentTimeMs + elapsedMs,
  }

  const winner = evaluateWinCondition(next)
  if (winner && state.phase === "RUNNING") {
    return { ...next, winnerId: winner, phase: "GAME_OVER" }
  }

  return next
}
