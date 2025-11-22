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
  BuildSettlementPayload,
  TickPayload,
  AllocateRolesPayload,
  RaidSettlementPayload,
  UseDeityPowerPayload,
  SettlementBuff,
  UpgradeSettlementPayload,
  DeityPowerType,
  FactionPolicy,
  SetPolicyPayload,
  Stance,
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

function playerHasSettlement(state: GameState, playerId: PlayerId): boolean {
  return state.settlements.some((s) => s.owner === playerId)
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
    const policy = player.policy

    const mySettlements = state.settlements.filter((s) => s.owner === player.id)

    // --- NPC-only behaviors: starting settlement, upgrades, powers, expansion ---
    if (player.isNpc) {
      if (mySettlements.length === 0) {
        const availableTiles = state.tiles.filter(
          (t) => t.terrain !== "Water" && !t.settlementId,
        )
        if (availableTiles.length > 0) {
          const tile =
            availableTiles[Math.floor(Math.random() * availableTiles.length)]
          actions.push({
            id: nextId(),
            playerId: player.id,
            type: "PLACE_STARTING_SETTLEMENT",
            payload: { tileId: tile.id },
            clientTimeMs: state.currentTimeMs,
          })
          continue
        }
      }

      if (state.phase === "RUNNING" && mySettlements.length > 0) {
        const settlements = state.settlements.filter((s) => s.owner === player.id)

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

        const belief = player.belief ?? 0
        if (belief >= 20 && settlements.length > 0) {
          const target = [...settlements].sort(
            (a, b) => b.population - a.population,
          )[0]

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

        const settlementsAfter = state.settlements.filter(
          (s) => s.owner === player.id,
        )
        const maxSettlementsForNpc = 4

        const food = player.resources.Food ?? 0
        const woodForBuild = player.resources.Wood ?? 0
        const stoneForBuild = player.resources.Stone ?? 0

        const canAffordNewSettlement =
          food >= 100 && woodForBuild >= 100 && stoneForBuild >= 50
        const wantMoreSettlements =
          settlementsAfter.length < maxSettlementsForNpc

        if (canAffordNewSettlement && wantMoreSettlements) {
          const candidateTiles: Tile[] = []

          for (const s of settlementsAfter) {
            const sTile = findTileById(state, s.tileId)
            if (!sTile) continue

            for (const tile of state.tiles) {
              if (tile.terrain === "Water" || tile.settlementId) continue
              const dist = hexDistance(sTile.coord, tile.coord)
              if (dist <= 3) {
                candidateTiles.push(tile)
              }
            }
          }

          const uniqueCandidates = Array.from(
            new Map(candidateTiles.map((t) => [t.id, t])).values(),
          )

          if (uniqueCandidates.length > 0) {
            const tile =
              uniqueCandidates[Math.floor(Math.random() * uniqueCandidates.length)]

            actions.push({
              id: nextId(),
              playerId: player.id,
              type: "BUILD_SETTLEMENT",
              payload: { tileId: tile.id },
              clientTimeMs: state.currentTimeMs,
            })
          }
        }
      }
    }

    if (state.phase === "RUNNING" && mySettlements.length > 0) {
      const stance: Stance = policy?.stance ?? "DEFENSIVE"

      let raidChance = 0
      let minDefendersForRaid = 5
      let commitPercent = 50

      switch (stance) {
        case "AGGRESSIVE":
          raidChance = 0.3
          minDefendersForRaid = 4
          commitPercent = 70
          break
        case "DEFENSIVE":
          raidChance = 0.1
          minDefendersForRaid = 8
          commitPercent = 40
          break
        case "PASSIVE":
          raidChance = 0
          break
      }

      if (raidChance > 0) {
        const totalDefenders = mySettlements.reduce(
          (sum, s) => sum + s.defenders,
          0,
        )

        const enemySettlements = state.settlements.filter(
          (s) => s.owner !== player.id,
        )

        if (
          enemySettlements.length > 0 &&
          totalDefenders >= minDefendersForRaid &&
          Math.random() < raidChance
        ) {
          const from = mySettlements.find(
            (s) => s.defenders >= minDefendersForRaid / 2,
          )
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
                raiderPercent: commitPercent,
              },
              clientTimeMs: state.currentTimeMs,
            })
          }
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
  const totalPercent = workersPercent + worshippersPercent + defendersPercent
  if (totalPercent <= 0 || population <= 0) {
    return { workers: 0, worshippers: 0, defenders: 0 }
  }

  const norm = totalPercent / 100

  let workers = Math.floor((workersPercent / norm / 100) * population)
  let worshippers = Math.floor((worshippersPercent / norm / 100) * population)
  let defenders = Math.floor((defendersPercent / norm / 100) * population)

  let assigned = workers + worshippers + defenders
  while (assigned < population) {
    workers += 1
    assigned += 1
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

  const defaultPolicy: FactionPolicy = {
    workersPercent: 60,
    worshippersPercent: 20,
    defendersPercent: 20,
    stance: "DEFENSIVE",
  }

  const players: Player[] = [
    createPlayer("PLAYER_1", "Player 1", false, { ...defaultPolicy }),
    createPlayer("PLAYER_2", "Player 2", false, { ...defaultPolicy }),
    createPlayer("NPC_1", "Ashen Covenant", true, {
      workersPercent: 50,
      worshippersPercent: 30,
      defendersPercent: 20,
      stance: "AGGRESSIVE",
    }),
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

function createPlayer(
  id: PlayerId,
  name: string,
  isNpc = false,
  policy?: FactionPolicy,
): Player {
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
    policy:
      policy ?? {
        workersPercent: 60,
        worshippersPercent: 20,
        defendersPercent: 20,
        stance: "DEFENSIVE",
      },
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

      // --- Auto role allocation from faction policy ---

      state.settlements = state.settlements.map((settlement) => {
        const player = getPlayer(state, settlement.owner)
        if (!player) return settlement

        const policy = player.policy
        if (!policy) return settlement

        const pop = settlement.population
        if (pop <= 0) return settlement

        const { workersPercent, worshippersPercent, defendersPercent } = policy

        const { workers, worshippers, defenders } = computeRoleCountsFromPercents(
          pop,
          workersPercent,
          worshippersPercent,
          defendersPercent,
        )

        if (
          workers === settlement.workers &&
          worshippers === settlement.worshippers &&
          defenders === settlement.defenders
        ) {
          return settlement
        }

        return {
          ...settlement,
          workers,
          worshippers,
          defenders,
        }
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

      const humanPlayers = state.players.filter((p) => !p.isNpc)
      const npcPlayers = state.players.filter((p) => p.isNpc)

      const anyHumanReady = humanPlayers.some((p) =>
        playerHasSettlement(state, p.id),
      )

      const allNpcsReady =
        npcPlayers.length === 0 ||
        npcPlayers.every((p) => playerHasSettlement(state, p.id))

      if (anyHumanReady && allNpcsReady && state.phase !== "RUNNING") {
        state.phase = "RUNNING"
      }

      // Advance logical time
      state.currentTimeMs = Math.max(state.currentTimeMs, action.clientTimeMs)

      return state
    }

    case "BUILD_SETTLEMENT": {
      const payload = action.payload as BuildSettlementPayload | undefined
      if (!payload) return state

      if (state.phase !== "RUNNING") {
        return state
      }

      const tile = findTileById(state, payload.tileId)
      if (!tile) return state

      if (tile.terrain === "Water" || tile.settlementId) {
        return state
      }

      const player = getPlayer(state, action.playerId)
      if (!player) return state

      const mySettlements = state.settlements.filter((s) => s.owner === player.id)
      if (mySettlements.length === 0) {
        return state
      }

      const withinRange = mySettlements.some((s) => {
        const sTile = findTileById(state, s.tileId)
        if (!sTile) return false
        const dist = hexDistance(sTile.coord, tile.coord)
        return dist <= 3
      })

      if (!withinRange) {
        return state
      }

      const cost: Partial<Record<ResourceType, number>> = {
        Food: 100,
        Wood: 100,
        Stone: 50,
      }

      const food = player.resources.Food ?? 0
      const wood = player.resources.Wood ?? 0
      const stone = player.resources.Stone ?? 0

      if (food < (cost.Food ?? 0) || wood < (cost.Wood ?? 0) || stone < (cost.Stone ?? 0)) {
        return state
      }

      state.players = state.players.map((p) => {
        if (p.id !== player.id) return p
        const newResources = subtractResources(p.resources, cost)
        return {
          ...p,
          resources: newResources,
        }
      })

      const settlement: Settlement = {
        id: nextId(),
        owner: action.playerId,
        tileId: tile.id,
        population: 5,
        workers: 3,
        worshippers: 1,
        defenders: 1,
        level: 1,
        populationCap: 15,
        growthProgress: 0,
      }

      const updatedSettlements = [...state.settlements, settlement]
      const updatedTiles = state.tiles.map((t) =>
        t.id === tile.id
          ? { ...t, settlementId: settlement.id, controller: action.playerId }
          : t,
      )

      state = {
        ...state,
        settlements: updatedSettlements,
        tiles: updatedTiles,
      }

      state.currentTimeMs = Math.max(state.currentTimeMs, action.clientTimeMs)

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

    case "SET_POLICY": {
      const payload = action.payload as SetPolicyPayload | undefined
      if (!payload) return state

      const clampPercent = (v: number) => Math.max(0, Math.min(100, v))

      const newPolicy: FactionPolicy = {
        workersPercent: clampPercent(payload.workersPercent),
        worshippersPercent: clampPercent(payload.worshippersPercent),
        defendersPercent: clampPercent(payload.defendersPercent),
        stance: payload.stance,
      }

      state.players = state.players.map((p) => {
        if (p.id !== action.playerId) return p
        return {
          ...p,
          policy: newPolicy,
        }
      })

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
