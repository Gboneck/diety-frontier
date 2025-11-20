import { useCallback, useMemo, useState } from "react"
import type { AnyPlayerAction, GameState, PlayerId } from "../game/types"
import { createInitialGameState, reduceGameState } from "../game/simulation"

export interface UseLocalGameOptions {
  gameId?: string // for now we can default to a fixed id
  localPlayerId?: PlayerId
}

export interface UseLocalGameResult {
  game: GameState
  localPlayerId: PlayerId
  dispatchAction: (partial: Omit<AnyPlayerAction, "id">) => void
  resetGame: () => void
}

/**
 * Local-only game state hook for development.
 * Later we will replace this with a realtime-backed hook that:
 * - sends actions over the network
 * - applies them on a host client
 * - receives authoritative state
 */
export function useLocalGame(
  options: UseLocalGameOptions = {},
): UseLocalGameResult {
  const gameId = options.gameId ?? "local-game"
  const initialState = useMemo(() => createInitialGameState(gameId), [gameId])

  const [game, setGame] = useState<GameState>(initialState)

  const localPlayerId: PlayerId = options.localPlayerId ?? "PLAYER_1"

  const dispatchAction = useCallback(
    (partial: Omit<AnyPlayerAction, "id">) => {
      const action: AnyPlayerAction = {
        ...partial,
        id: crypto.randomUUID ? crypto.randomUUID() : `act_${Date.now()}`,
      }

      setGame((prev) => reduceGameState(prev, action))
    },
    [],
  )

  const resetGame = useCallback(() => {
    setGame(createInitialGameState(gameId))
  }, [gameId])

  return {
    game,
    localPlayerId,
    dispatchAction,
    resetGame,
  }
}
