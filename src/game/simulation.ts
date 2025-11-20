import type {
  GameState,
  Player,
  PlayerId,
  ResourceType,
  TerrainType,
  Tile,
  AnyPlayerAction,
  PlaceStartingSettlementPayload,
} from "./types"

// Utility to create ids (simple for now; we can swap to uuid later)
let idCounter = 0
export const nextId = () => `id_${idCounter++}`

function getPlayer(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId)
}

function countSettlementsForPlayer(state: GameState, playerId: PlayerId): number {
  return state.settlements.filter((s) => s.owner === playerId).length
}

function findTileById(state: GameState, tileId: string): Tile | undefined {
  return state.tiles.find((t) => t.id === tileId)
}

/**
 * Create a small initial map and players.
 * Later, the "id" will match the room id from the backend.
 */
export function createInitialGameState(gameId: string): GameState {
  const tiles: Tile[] = createSmallHexMap()

  const players: Player[] = [
    createPlayer("PLAYER_1", "Player 1"),
    createPlayer("PLAYER_2", "Player 2"),
  ]

  return {
    id: gameId,
    tiles,
    settlements: [],
    players,
    phase: "LOBBY",
    currentTimeMs: 0,
    winnerId: undefined,
  }
}

// For now, just create a tiny axial grid (radius 2) with some basic terrain
function createSmallHexMap(): Tile[] {
  const tiles: Tile[] = []
  const radius = 2

  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      // Simple constraint to make a roughly hex-shaped area
      if (Math.abs(q + r) > radius) continue

      const terrain = pickTerrainForCoord(q, r)
      tiles.push({
        id: `tile_${q}_${r}`,
        coord: { q, r },
        terrain,
      })
    }
  }

  return tiles
}

function pickTerrainForCoord(q: number, r: number): TerrainType {
  const hash = (q * 31 + r * 17 + 9999) % 100
  if (hash < 40) return "Field"
  if (hash < 65) return "Forest"
  if (hash < 85) return "Mountain"
  return "Water"
}

function createPlayer(id: PlayerId, name: string): Player {
  const resources: Record<ResourceType, number> = {
    Food: 3,
    Wood: 3,
    Stone: 2,
    Gold: 1,
    Belief: 0,
  }

  return {
    id,
    name,
    resources,
    victoryPoints: 0,
    belief: 0,
    maxBeliefEver: 0,
  }
}

/**
 * Core reducer for the game. This is what the host will use to apply
 * incoming real-time actions and derive the next authoritative GameState.
 *
 * For now, we implement NOOP and TICK and leave other actions as TODO.
 */
export function reduceGameState(
  prev: GameState,
  action: AnyPlayerAction,
): GameState {
  // Always work on a shallow copy so we don't mutate previous state.
  let state: GameState = { ...prev }

  switch (action.type) {
    case "NOOP": {
      // Debug action – do nothing except advance logical time slightly
      state.currentTimeMs = Math.max(
        state.currentTimeMs,
        action.clientTimeMs,
      )
      return state
    }

    case "TICK": {
      // Later we can use this to run periodic simulation (growth, belief, etc.)
      state.currentTimeMs = Math.max(
        state.currentTimeMs,
        action.clientTimeMs,
      )
      return state
    }

    case "PLACE_STARTING_SETTLEMENT": {
      if (state.phase !== "LOBBY") {
        // Starting settlements only during lobby
        return state
      }

      const player = getPlayer(state, action.playerId)
      if (!player) return state

      // Each player can only place ONE starting settlement
      const alreadyHasSettlement =
        countSettlementsForPlayer(state, player.id) > 0
      if (alreadyHasSettlement) {
        return state
      }

      const payload = action
        .payload as PlaceStartingSettlementPayload | undefined
      if (!payload) return state

      const tile = findTileById(state, payload.tileId)
      if (!tile) return state

      // Cannot place on water or on an already occupied tile
      if (tile.terrain === "Water" || tile.settlementId) {
        return state
      }

      // Create a basic starting settlement with small population
      const settlementId = nextId()
      const population = 4 // small tribe
      const workers = 2
      const worshippers = 1
      const defenders = 1

      const newSettlement = {
        id: settlementId,
        owner: player.id,
        tileId: tile.id,
        level: 1,
        population,
        workers,
        worshippers,
        defenders,
      }

      const updatedSettlements = [...state.settlements, newSettlement]

      // Update the tile to reference the new settlement
      const updatedTiles = state.tiles.map((t) =>
        t.id === tile.id ? { ...t, settlementId } : t,
      )

      state = {
        ...state,
        tiles: updatedTiles,
        settlements: updatedSettlements,
      }

      // Give the player 1 victory point for their starting settlement
      const updatedPlayers = state.players.map((p) =>
        p.id === player.id ? { ...p, victoryPoints: p.victoryPoints + 1 } : p,
      )

      state.players = updatedPlayers

      // If both players now have a starting settlement, move to RUNNING phase
      const p1Has = countSettlementsForPlayer(state, "PLAYER_1") > 0
      const p2Has = countSettlementsForPlayer(state, "PLAYER_2") > 0

      if (p1Has && p2Has && state.phase === "LOBBY") {
        state.phase = "RUNNING"
      }

      // Advance logical time
      state.currentTimeMs = Math.max(state.currentTimeMs, action.clientTimeMs)

      return state
    }

    case "BUILD_SETTLEMENT": {
      // TODO: implement building rules, resource costs, VP gain
      return state
    }

    case "ALLOCATE_ROLES": {
      // TODO: implement follower allocation logic
      return state
    }

    default: {
      const neverAction: never = action.type
      console.warn("Unhandled action type", neverAction)
      return state
    }
  }
}
