import type {
  GameState,
  Player,
  PlayerId,
  ResourceType,
  TerrainType,
  Tile,
  AnyPlayerAction,
  ActionType,
  PlaceStartingSettlementPayload,
  TickPayload,
  AllocateRolesPayload,
  RaidSettlementPayload,
  UseDeityPowerPayload,
  DeityPowerType,
  SettlementBuff,
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

function findSettlementById(state: GameState, settlementId: string) {
  return state.settlements.find((s) => s.id === settlementId)
}

function createBuff(
  settlementId: string,
  owner: PlayerId,
  type: DeityPowerType,
  currentTimeMs: number,
  durationMs: number,
): SettlementBuff {
  return {
    id: nextId(),
    settlementId,
    owner,
    type,
    expiresAtMs: currentTimeMs + durationMs,
  }
}

function computeRoleCountsFromPercents(
  population: number,
  workersPercent: number,
  worshippersPercent: number,
  defendersPercent: number,
): { workers: number; worshippers: number; defenders: number } {
  if (population <= 0) {
    return { workers: 0, worshippers: 0, defenders: 0 }
  }

  // Clamp percentages to [0, 100]
  const wP = Math.max(0, Math.min(100, workersPercent))
  const wpP = Math.max(0, Math.min(100, worshippersPercent))
  const dP = Math.max(0, Math.min(100, defendersPercent))

  const totalPercent = wP + wpP + dP

  if (totalPercent <= 0) {
    // Default: everyone works
    return { workers: population, worshippers: 0, defenders: 0 }
  }

  // Compute raw counts based on relative percentages
  const workersRaw = (population * wP) / totalPercent
  const worshippersRaw = (population * wpP) / totalPercent
  const defendersRaw = (population * dP) / totalPercent

  let workers = Math.floor(workersRaw)
  let worshippers = Math.floor(worshippersRaw)
  let defenders = Math.floor(defendersRaw)

  // Distribute any remaining population due to rounding
  let assigned = workers + worshippers + defenders
  let remaining = population - assigned

  while (remaining > 0) {
    // Assign extra people in order: workers -> worshippers -> defenders
    if (workers < Math.ceil(workersRaw)) {
      workers++
    } else if (worshippers < Math.ceil(worshippersRaw)) {
      worshippers++
    } else {
      defenders++
    }
    remaining--
  }

  return { workers, worshippers, defenders }
}

function emptyResourceRecord(): Record<ResourceType, number> {
  return {
    Food: 0,
    Wood: 0,
    Stone: 0,
    Gold: 0,
    Belief: 0,
  }
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
    buffs: [],
  }
}

// For now, just create a tiny axial grid (radius 3) with some basic terrain
function createSmallHexMap(): Tile[] {
  const tiles: Tile[] = []
  const radius = 3 // expanded map

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
  if (hash < 25) return "Field"
  if (hash < 40) return "FertileField"
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

  const actionType: ActionType = action.type

  switch (actionType) {
    case "NOOP": {
      // Debug action – do nothing except advance logical time slightly
      state.currentTimeMs = Math.max(
        state.currentTimeMs,
        action.clientTimeMs,
      )
      return state
    }

    case "TICK": {
      const payload = action.payload as TickPayload | undefined
      const deltaMs = payload?.deltaMs ?? 1000

      const nextTime = state.currentTimeMs + deltaMs
      state.currentTimeMs = nextTime

      // Remove expired buffs
      const activeBuffs = (state.buffs ?? []).filter(
        (buff) => buff.expiresAtMs > nextTime,
      )
      state.buffs = activeBuffs

      // Only run economy if the game is actually running
      if (state.phase !== "RUNNING") {
        return state
      }

      // Initialize income per player
      const incomes: Record<PlayerId, Record<ResourceType, number>> = {
        PLAYER_1: emptyResourceRecord(),
        PLAYER_2: emptyResourceRecord(),
      }

      // Accumulate income from each settlement
      for (const settlement of state.settlements) {
        const tile = findTileById(state, settlement.tileId)
        if (!tile) continue

        const ownerId = settlement.owner
        const bucket = incomes[ownerId]
        if (!bucket) continue

        const workers = settlement.workers
        const worshippers = settlement.worshippers

        const buffsForSettlement = state.buffs.filter(
          (b) => b.settlementId === settlement.id,
        )

        let workerMultiplier = 1
        let worshipperMultiplier = 1

        for (const buff of buffsForSettlement) {
          if (buff.type === "BLESSED_HARVEST") {
            workerMultiplier *= 2
          } else if (buff.type === "INSPIRED_WORSHIP") {
            worshipperMultiplier *= 2
          }
        }

        // Workers gather from the terrain of their tile
        if (workers > 0) {
          let foodGain = 0
          let woodGain = 0
          let stoneGain = 0

          switch (tile.terrain) {
            case "Field":
              foodGain = workers
              break
            case "FertileField":
              foodGain = workers * 2
              break
            case "Forest":
              woodGain = workers
              break
            case "Mountain":
              stoneGain = workers
              break
            default:
              break
          }

          bucket.Food += foodGain * workerMultiplier
          bucket.Wood += woodGain * workerMultiplier
          bucket.Stone += stoneGain * workerMultiplier
        }

        // Worshippers generate belief
        if (worshippers > 0) {
          const beliefGain = worshippers * worshipperMultiplier
          bucket.Belief += beliefGain
        }
      }

      // Apply incomes to players
      state.players = state.players.map((player) => {
        const delta = incomes[player.id]
        if (!delta) return player

        const newResources: Record<ResourceType, number> = {
          ...player.resources,
        }

        ;(Object.keys(delta) as ResourceType[]).forEach((res) => {
          newResources[res] = (newResources[res] ?? 0) + delta[res]
        })

        const newBelief = newResources.Belief ?? 0

        return {
          ...player,
          resources: newResources,
          belief: newBelief,
          maxBeliefEver: Math.max(player.maxBeliefEver, newBelief),
        }
      })

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
      const payload = action.payload as AllocateRolesPayload | undefined
      if (!payload) return state

      const settlement = findSettlementById(state, payload.settlementId)
      if (!settlement) return state

      // Only the owner of the settlement can change roles
      if (settlement.owner !== action.playerId) {
        return state
      }

      const population = settlement.population
      const { workersPercent, worshippersPercent, defendersPercent } = payload

      const { workers, worshippers, defenders } =
        computeRoleCountsFromPercents(
          population,
          workersPercent,
          worshippersPercent,
          defendersPercent,
        )

      const updatedSettlements = state.settlements.map((s) =>
        s.id === settlement.id
          ? {
              ...s,
              workers,
              worshippers,
              defenders,
            }
          : s,
      )

      state = {
        ...state,
        settlements: updatedSettlements,
      }

      // Advance time a bit (optional)
      state.currentTimeMs = Math.max(state.currentTimeMs, action.clientTimeMs)

      return state
    }

    case "USE_DEITY_POWER": {
      const payload = action.payload as UseDeityPowerPayload | undefined
      if (!payload) return state

      const settlement = findSettlementById(state, payload.settlementId)
      if (!settlement) return state

      // Must own the settlement
      if (settlement.owner !== action.playerId) {
        return state
      }

      const player = getPlayer(state, action.playerId)
      if (!player) return state

      let cost = 0
      const durationMs = 15000

      if (payload.power === "BLESSED_HARVEST") {
        cost = 10
      } else if (payload.power === "INSPIRED_WORSHIP") {
        cost = 15
      }

      if (player.belief < cost) {
        return state
      }

      const updatedPlayers = state.players.map((p) => {
        if (p.id !== player.id) return p
        const newResources: Record<ResourceType, number> = {
          ...p.resources,
          Belief: (p.resources.Belief ?? 0) - cost,
        }
        const newBelief = newResources.Belief ?? 0
        return {
          ...p,
          resources: newResources,
          belief: newBelief,
          maxBeliefEver: Math.max(p.maxBeliefEver, newBelief),
        }
      })

      const newBuff = createBuff(
        settlement.id,
        settlement.owner,
        payload.power,
        state.currentTimeMs,
        durationMs,
      )

      state = {
        ...state,
        players: updatedPlayers,
        buffs: [...(state.buffs ?? []), newBuff],
      }

      state.currentTimeMs = Math.max(state.currentTimeMs, action.clientTimeMs)

      return state
    }

    case "RAID_SETTLEMENT": {
      const payload = action.payload as RaidSettlementPayload | undefined
      if (!payload) return state

      const from = findSettlementById(state, payload.fromSettlementId)
      const target = findSettlementById(state, payload.targetSettlementId)
      if (!from || !target) return state

      // Must own the attacking settlement
      if (from.owner !== action.playerId) {
        return state
      }

      // Cannot raid your own settlement
      if (from.owner === target.owner) {
        return state
      }

      const baseDefenders = from.defenders
      if (baseDefenders <= 0) {
        return state
      }

      const percent = Math.max(0, Math.min(100, payload.raiderPercent))
      let raiderCount = Math.floor((baseDefenders * percent) / 100)
      if (raiderCount <= 0) {
        raiderCount = 1
      }
      if (raiderCount > baseDefenders) {
        raiderCount = baseDefenders
      }

      const attackPower = raiderCount
      const defensePower = target.defenders

      let attackerLosses = 0
      let defenderLosses = 0
      let populationLoss = 0
      let loot: Record<ResourceType, number> = emptyResourceRecord()

      if (attackPower <= defensePower) {
        attackerLosses = attackPower
        defenderLosses = attackPower
      } else {
        defenderLosses = defensePower
        attackerLosses = defensePower

        const overkill = attackPower - defensePower

        populationLoss = Math.min(target.population, overkill)

        const lootFactor = 0.2

        const attackerPlayer = getPlayer(state, from.owner)
        const defenderPlayer = getPlayer(state, target.owner)
        if (attackerPlayer && defenderPlayer) {
          const updatedPlayers: Player[] = state.players.map((p) => {
            if (p.id === attackerPlayer.id) {
              const newResources: Record<ResourceType, number> = {
                ...p.resources,
              }
              ;(Object.keys(newResources) as ResourceType[]).forEach((res) => {
                const defRes = defenderPlayer.resources[res] ?? 0
                const take = Math.floor(defRes * lootFactor)
                loot[res] = take
                newResources[res] = (newResources[res] ?? 0) + take
              })
              const newBelief = newResources.Belief ?? 0
              return {
                ...p,
                resources: newResources,
                belief: newBelief,
                maxBeliefEver: Math.max(p.maxBeliefEver, newBelief),
              }
            } else if (p.id === defenderPlayer.id) {
              const newResources: Record<ResourceType, number> = {
                ...p.resources,
              }
              ;(Object.keys(newResources) as ResourceType[]).forEach((res) => {
                const give = loot[res] ?? 0
                newResources[res] = Math.max(
                  0,
                  (newResources[res] ?? 0) - give,
                )
              })
              const newBelief = newResources.Belief ?? 0
              return {
                ...p,
                resources: newResources,
                belief: newBelief,
                maxBeliefEver: Math.max(p.maxBeliefEver, newBelief),
              }
            }
            return p
          })

          state.players = updatedPlayers
        }
      }

      const survivorsAttacker = Math.max(0, raiderCount - attackerLosses)
      const newFromDefenders = baseDefenders - raiderCount + survivorsAttacker
      const newTargetDefenders = Math.max(0, target.defenders - defenderLosses)
      const newTargetPopulation = Math.max(0, target.population - populationLoss)

      const updatedSettlements = state.settlements.map((s) => {
        if (s.id === from.id) {
          return {
            ...s,
            defenders: newFromDefenders,
          }
        }
        if (s.id === target.id) {
          return {
            ...s,
            defenders: newTargetDefenders,
            population: newTargetPopulation,
          }
        }
        return s
      })

      state = {
        ...state,
        settlements: updatedSettlements,
      }

      state.currentTimeMs = Math.max(state.currentTimeMs, action.clientTimeMs)

      return state
    }

    default: {
      const neverAction: never = actionType
      console.warn("Unhandled action type", neverAction)
      return state
    }
  }
}
