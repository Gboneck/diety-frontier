import type {
  GameState,
  Player,
  PlayerId,
  Settlement,
  ResourceType,
  TerrainType,
  Tile,
  HexCoord,
  AnyPlayerAction,
  ActionType,
  PlaceStartingSettlementPayload,
  TickPayload,
  AllocateRolesPayload,
  RaidSettlementPayload,
  UseDeityPowerPayload,
  SettlementBuff,
  UpgradeSettlementPayload,
  DeityPowerType,
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

function hexDistance(a: HexCoord, b: HexCoord): number {
  const ax = a.q
  const az = a.r
  const ay = -ax - az

  const bx = b.q
  const bz = b.r
  const by = -bx - bz

  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz))
}

// Influence radius grows with settlement level
function getSettlementInfluenceRadius(settlement: Settlement): number {
  return 1 + settlement.level
}

// Recompute tile.controller based on nearest settlement and influence radius
function assignTileControllers(state: GameState): GameState {
  const settlementsWithCoords = state.settlements
    .map((s) => {
      const tile = findTileById(state, s.tileId)
      return tile ? { settlement: s, coord: tile.coord } : null
    })
    .filter(Boolean) as { settlement: Settlement; coord: HexCoord }[]

  const newTiles = state.tiles.map((tile) => {
    if (settlementsWithCoords.length === 0) {
      return { ...tile, controller: null }
    }

    let bestOwner: PlayerId | null = null
    let bestDist = Infinity
    let contested = false

    for (const { settlement, coord } of settlementsWithCoords) {
      const radius = getSettlementInfluenceRadius(settlement)
      const dist = hexDistance(tile.coord, coord)
      if (dist > radius) continue

      if (dist < bestDist) {
        bestDist = dist
        bestOwner = settlement.owner
        contested = false
      } else if (dist === bestDist && settlement.owner !== bestOwner) {
        contested = true
      }
    }

    const controller = contested ? null : bestOwner
    return { ...tile, controller }
  })

  return {
    ...state,
    tiles: newTiles,
  }
}

export function computeNpcActions(state: GameState): AnyPlayerAction[] {
  const actions: AnyPlayerAction[] = []

  for (const player of state.players) {
    if (!player.isNpc) continue

    // --- 4.1: Ensure NPC has a starting settlement ---
    const mySettlements = state.settlements.filter((s) => s.owner === player.id)

    if (mySettlements.length === 0) {
      const availableTiles = state.tiles.filter(
        (t) => t.terrain !== "Water" && !t.settlementId,
      )
      if (availableTiles.length === 0) {
        continue
      }

      const tile =
        availableTiles[Math.floor(Math.random() * availableTiles.length)]

      actions.push({
        id: nextId(),
        playerId: player.id,
        type: "PLACE_STARTING_SETTLEMENT",
        payload: { tileId: tile.id },
        clientTimeMs: state.currentTimeMs,
      })

      // Don’t plan more for this NPC until next tick
      continue
    }

    if (state.phase !== "RUNNING") {
      continue
    }

    // Refresh mySettlements in RUNNING
    const settlements = state.settlements.filter((s) => s.owner === player.id)

    // --- 4.2: Maybe upgrade a settlement ---
    const wood = player.resources.Wood ?? 0
    const stone = player.resources.Stone ?? 0
    const canUpgrade = wood >= 50 && stone >= 50

    if (canUpgrade && settlements.length > 0) {
      const target = [...settlements].sort((a, b) => a.level - b.level)[0]

      actions.push({
        id: nextId(),
        playerId: player.id,
        type: "UPGRADE_SETTLEMENT",
        payload: { settlementId: target.id },
        clientTimeMs: state.currentTimeMs,
      })
    }

    // --- 4.3: Maybe cast a deity power ---
    const belief = player.belief ?? 0
    if (belief >= 20 && settlements.length > 0) {
      const target = [...settlements].sort((a, b) => b.population - a.population)[0]

      const power: DeityPowerType =
        Math.random() < 0.5 ? "BLESSED_HARVEST" : "INSPIRED_WORSHIP"

      actions.push({
        id: nextId(),
        playerId: player.id,
        type: "USE_DEITY_POWER",
        payload: {
          power,
          settlementId: target.id,
        },
        clientTimeMs: state.currentTimeMs,
      })
    }

    // --- 4.4: Maybe launch a raid ---
    const enemySettlements = state.settlements.filter(
      (s) => s.owner !== player.id,
    )
    if (enemySettlements.length > 0 && settlements.length > 0) {
      const raidChance = 0.15 // 15% per tick

      const totalDefenders = settlements.reduce(
        (sum, s) => sum + s.defenders,
        0,
      )

      if (totalDefenders >= 5 && Math.random() < raidChance) {
        const from = settlements.find((s) => s.defenders >= 3)
        const target =
          enemySettlements[Math.floor(Math.random() * enemySettlements.length)]

        if (from && target) {
          actions.push({
            id: nextId(),
            playerId: player.id,
            type: "RAID_SETTLEMENT",
            payload: {
              fromSettlementId: from.id,
              targetSettlementId: target.id,
              raiderPercent: 50,
            },
            clientTimeMs: state.currentTimeMs,
          })
        }
      }
    }
  }

  return actions
}

// Count controlled tiles per player
function countControlledTiles(state: GameState): Record<PlayerId, number> {
  const result: Record<PlayerId, number> = {}

  for (const player of state.players) {
    result[player.id] = 0
  }

  for (const tile of state.tiles) {
    const owner = tile.controller
    if (!owner) continue
    if (result[owner] == null) {
      result[owner] = 0
    }
    result[owner] += 1
  }

  return result
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

function subtractResources(
  base: Record<ResourceType, number>,
  cost: Partial<Record<ResourceType, number>>,
): Record<ResourceType, number> {
  const next: Record<ResourceType, number> = { ...base }
  ;(Object.keys(cost) as ResourceType[]).forEach((res) => {
    const c = cost[res] ?? 0
    const current = next[res] ?? 0
    next[res] = Math.max(0, current - c)
  })
  return next
}

/**
 * Create a small initial map and players.
 * Later, the "id" will match the room id from the backend.
 */
export function createInitialGameState(gameId: string): GameState {
  const tiles: Tile[] = createSmallHexMap()

  const players: Player[] = [
    createPlayer("PLAYER_1", "Player 1", false),
    createPlayer("PLAYER_2", "Player 2", false),
    createPlayer("NPC_1", "Ashen Covenant", true),
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

function createPlayer(id: PlayerId, name: string, isNpc = false): Player {
  const resources: Record<ResourceType, number> = {
    Food: 0,
    Wood: 0,
    Stone: 0,
    Gold: 0,
    Belief: 0,
  }

  return {
    id,
    name,
    resources,
    victoryPoints: 0,
    belief: 0,
    maxBeliefEver: 0,
    isNpc,
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
      const seconds = deltaMs / 1000

      const nextTime = state.currentTimeMs + deltaMs
      state.currentTimeMs = nextTime

      // Remove expired buffs
      const activeBuffs = (state.buffs ?? []).filter(
        (buff) => buff.expiresAtMs > nextTime,
      )
      state.buffs = activeBuffs

      // Recompute controllers for territory
      state = assignTileControllers(state)
      const controlledCounts = countControlledTiles(state)

      // Only run economy if the game is actually running
      if (state.phase !== "RUNNING") {
        return state
      }

      // Initialize income per player
      const incomes: Record<PlayerId, Record<ResourceType, number>> = {}
      for (const player of state.players) {
        incomes[player.id] = emptyResourceRecord()
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

        // Territory bonus: more controlled tiles => better yields
        const territoryTiles = controlledCounts[ownerId] ?? 0
        const territoryBoost = 1 + Math.min(territoryTiles * 0.02, 2)

        // Workers gather from the terrain of their tile
        if (workers > 0) {
          let foodGain = workers * 1
          let woodGain = workers * 0.5
          let stoneGain = workers * 0.25

          switch (tile.terrain) {
            case "Field":
              foodGain += workers * 1
              break
            case "FertileField":
              foodGain += workers * 2
              break
            case "Forest":
              woodGain += workers * 1
              break
            case "Mountain":
              stoneGain += workers * 1
              break
            case "Water":
              bucket.Gold +=
                workers * 0.25 * workerMultiplier * territoryBoost
              break
            default:
              break
          }

          bucket.Food += foodGain * workerMultiplier * territoryBoost
          bucket.Wood += woodGain * workerMultiplier * territoryBoost
          bucket.Stone += stoneGain * workerMultiplier * territoryBoost
        }

        // Worshippers generate belief
        if (worshippers > 0) {
          const beliefGain = worshippers * worshipperMultiplier * territoryBoost
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

      // --- Food upkeep & starvation gating ---

      const UPKEEP_PER_PERSON_PER_SECOND = 0.05

      const starvingPlayers: Record<PlayerId, boolean> = {}
      const popByPlayer: Record<PlayerId, number> = {}

      for (const player of state.players) {
        starvingPlayers[player.id] = false
        popByPlayer[player.id] = 0
      }

      for (const s of state.settlements) {
        popByPlayer[s.owner] = (popByPlayer[s.owner] ?? 0) + s.population
      }

      state.players = state.players.map((player) => {
        const totalPop = popByPlayer[player.id] ?? 0
        if (totalPop <= 0) return player

        const requiredFood = totalPop * UPKEEP_PER_PERSON_PER_SECOND * seconds
        const currentFood = player.resources.Food ?? 0

        if (requiredFood <= 0) {
          return player
        }

        if (currentFood >= requiredFood) {
          const newResources = subtractResources(player.resources, {
            Food: requiredFood,
          })
          return {
            ...player,
            resources: newResources,
          }
        }

        const newResources = subtractResources(player.resources, {
          Food: currentFood,
        })

        starvingPlayers[player.id] = true

        return {
          ...player,
          resources: newResources,
        }
      })

      // --- Population growth (blocked by starvation) ---

      const GROWTH_RATE_PER_SECOND = 0.05
      const GROWTH_THRESHOLD = 10

      state.settlements = state.settlements.map((settlement) => {
        let s = { ...settlement }

        if (s.population >= s.populationCap) {
          return s
        }

        if (starvingPlayers[s.owner]) {
          return s
        }

        s.growthProgress += s.population * GROWTH_RATE_PER_SECOND * seconds

        while (s.growthProgress >= GROWTH_THRESHOLD && s.population < s.populationCap) {
          s.growthProgress -= GROWTH_THRESHOLD
          s.population += 1
          s.workers += 1
        }

        return s
      })

      return state
    }

    case "PLACE_STARTING_SETTLEMENT": {
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
      const population = 10
      const workers = 6
      const worshippers = 2
      const defenders = 2

      const newSettlement = {
        id: settlementId,
        owner: player.id,
        tileId: tile.id,
        level: 1,
        population,
        workers,
        worshippers,
        defenders,
        populationCap: 20,
        growthProgress: 0,
      }

      const updatedSettlements = [...state.settlements, newSettlement]

      // Update the tile to reference the new settlement
      const updatedTiles = state.tiles.map((t) =>
        t.id === tile.id
          ? { ...t, settlementId, controller: action.playerId }
          : t,
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

      const allPlayersHaveSettlement = state.players.every((p) =>
        state.settlements.some((s) => s.owner === p.id),
      )

      if (allPlayersHaveSettlement && state.phase !== "RUNNING") {
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

      if (settlement.owner !== action.playerId) {
        return state
      }

      const player = getPlayer(state, action.playerId)
      if (!player) return state

      let cost = 0
      let durationMs = 15000

      switch (payload.power) {
        case "BLESSED_HARVEST":
          cost = 10
          break
        case "INSPIRED_WORSHIP":
          cost = 15
          break
        default:
          return state
      }

      const currentBelief = player.resources.Belief ?? 0
      if (currentBelief < cost) {
        return state
      }

      const updatedPlayers = state.players.map((p) => {
        if (p.id !== player.id) return p
        const newResources = subtractResources(p.resources, { Belief: cost })
        const newBelief = newResources.Belief ?? 0
        return {
          ...p,
          resources: newResources,
          belief: newBelief,
          maxBeliefEver: Math.max(p.maxBeliefEver, newBelief),
        }
      })

      const newBuff: SettlementBuff = {
        id: nextId(),
        settlementId: settlement.id,
        owner: settlement.owner,
        type: payload.power,
        expiresAtMs: state.currentTimeMs + durationMs,
      }

      state = {
        ...state,
        players: updatedPlayers,
        buffs: [...(state.buffs ?? []), newBuff],
      }

      state.currentTimeMs = Math.max(state.currentTimeMs, action.clientTimeMs)

      return state
    }

    case "UPGRADE_SETTLEMENT": {
      const payload = action.payload as UpgradeSettlementPayload | undefined
      if (!payload) return state

      const settlement = findSettlementById(state, payload.settlementId)
      if (!settlement) return state

      if (settlement.owner !== action.playerId) {
        return state
      }

      const player = getPlayer(state, action.playerId)
      if (!player) return state

      const costWood = 50
      const costStone = 50

      const currentWood = player.resources.Wood ?? 0
      const currentStone = player.resources.Stone ?? 0

      if (currentWood < costWood || currentStone < costStone) {
        return state
      }

      state.players = state.players.map((p) => {
        if (p.id !== player.id) return p
        const newResources: Record<ResourceType, number> = {
          ...p.resources,
          Wood: currentWood - costWood,
          Stone: currentStone - costStone,
        }
        return {
          ...p,
          resources: newResources,
        }
      })

      const updatedSettlements = state.settlements.map((s) =>
        s.id === settlement.id
          ? {
              ...s,
              level: s.level + 1,
              populationCap: s.populationCap + 10,
            }
          : s,
      )

      state = {
        ...state,
        settlements: updatedSettlements,
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

      if (from.owner !== action.playerId) {
        return state
      }

      if (from.owner === target.owner) {
        return state
      }

      const baseDefenders = from.defenders
      if (baseDefenders <= 0) {
        return state
      }

      const percent = Math.max(0, Math.min(100, payload.raiderPercent))
      let raiderCount = Math.floor((baseDefenders * percent) / 100)
      if (raiderCount <= 0) raiderCount = 1
      if (raiderCount > baseDefenders) raiderCount = baseDefenders

      const attackPower = raiderCount
      const defensePower = target.defenders

      let attackerLosses = 0
      let defenderLosses = 0
      let populationLoss = 0

      const loot: Record<ResourceType, number> = emptyResourceRecord()

      if (attackPower <= defensePower) {
        attackerLosses = attackPower
        defenderLosses = attackPower
      } else {
        defenderLosses = defensePower
        attackerLosses = defensePower

        const overkill = attackPower - defensePower

        populationLoss = Math.min(target.population, overkill)

        const attackerPlayer = getPlayer(state, from.owner)
        const defenderPlayer = getPlayer(state, target.owner)
        const LOOT_FACTOR = 0.2

        if (attackerPlayer && defenderPlayer) {
          ;(Object.keys(attackerPlayer.resources) as ResourceType[]).forEach(
            (res) => {
              const defRes = defenderPlayer.resources[res] ?? 0
              const take = Math.floor(defRes * LOOT_FACTOR)
              loot[res] = take
            },
          )

          const updatedPlayers: Player[] = state.players.map((p) => {
            if (p.id === attackerPlayer.id) {
              const newResources = { ...p.resources }
              ;(Object.keys(loot) as ResourceType[]).forEach((res) => {
                newResources[res] = (newResources[res] ?? 0) + (loot[res] ?? 0)
              })
              const newBelief = newResources.Belief ?? 0
              return {
                ...p,
                resources: newResources,
                belief: newBelief,
                maxBeliefEver: Math.max(p.maxBeliefEver, newBelief),
              }
            } else if (p.id === defenderPlayer.id) {
              const newResources = subtractResources(p.resources, loot)
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
