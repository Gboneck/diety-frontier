import { useCallback, useEffect, useState } from "react"
import type { AnyPlayerAction, GameState, PlayerId } from "../game/types"
import {
  computeNpcActions,
  createInitialGameState,
  reduceGameState,
} from "../game/simulation"
import { WsClient } from "../net/wsClient"
import type { WsMessage } from "../net/wsClient"

export interface UseWsGameResult {
  game: GameState | null
  roomId: string | null
  localPlayerId: PlayerId | null
  isHost: boolean
  loading: boolean
  error: string | null
  hostNewGame: (playerName: string) => void
  joinGame: (roomId: string, playerName: string) => void
  dispatchActionForLocalPlayer: (
    partial: Omit<AnyPlayerAction, "id" | "playerId">,
  ) => void
  disconnect: () => void
}

function generateRoomCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function useWsGame(): UseWsGameResult {
  const [game, setGame] = useState<GameState | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [localPlayerId, setLocalPlayerId] = useState<PlayerId | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [wsClient] = useState(() => new WsClient())

  useEffect(() => {
    return () => {
      wsClient.close()
    }
  }, [wsClient])

  // Host-only: run a periodic TICK to advance simulation and generate resources/belief
  useEffect(() => {
    if (!isHost || !roomId || !localPlayerId) return

    let lastTime = performance.now()

    const interval = setInterval(() => {
      const now = performance.now()
      const deltaMs = now - lastTime
      lastTime = now

      // Use functional setGame to always start from the latest state
      setGame((prev) => {
        if (!prev) return prev

        const tickAction: AnyPlayerAction = {
          id: crypto.randomUUID ? crypto.randomUUID() : `tick_${Date.now()}`,
          playerId: localPlayerId,
          type: "TICK",
          payload: { deltaMs },
          clientTimeMs: now,
        }

        let stateAfterTick = reduceGameState(prev, tickAction)

        const npcActions = computeNpcActions(stateAfterTick)
        for (const action of npcActions) {
          stateAfterTick = reduceGameState(stateAfterTick, action)
        }

        // Broadcast authoritative state to all clients
        wsClient.send({
          type: "state",
          roomId,
          state: stateAfterTick,
        })

        return stateAfterTick
      })
    }, 1000) // one tick per second

    return () => {
      clearInterval(interval)
    }
  }, [isHost, roomId, localPlayerId, wsClient, setGame])

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (!msg || typeof msg !== "object") return

      switch (msg.type) {
        case "state": {
          const nextState = msg.state as GameState
          setGame(nextState)
          if (!roomId && msg.roomId) {
            setRoomId(msg.roomId)
          }
          break
        }
        case "action": {
          if (!isHost || !game || !roomId || !localPlayerId) return
          const action = msg.action as AnyPlayerAction
          const nextState = reduceGameState(game, action)
          setGame(nextState)

          wsClient.send({
            type: "state",
            roomId,
            state: nextState,
          })
          break
        }
        case "join": {
          break
        }
        case "error": {
          setError(msg.message || "Unknown WebSocket error")
          break
        }
        default:
          break
      }
    },
    [game, isHost, localPlayerId, roomId, wsClient],
  )

  useEffect(() => {
    if (roomId) {
      wsClient.connect(handleWsMessage)
    }
  }, [handleWsMessage, roomId, wsClient])

  const ensureConnection = useCallback(() => {
    wsClient.connect(handleWsMessage)
  }, [handleWsMessage, wsClient])

  const hostNewGame = useCallback(
    (playerName: string) => {
      setLoading(true)
      setError(null)
      const newRoomId = generateRoomCode()

      const localGameId = `room-${newRoomId}`
      const baseState = createInitialGameState(localGameId)

      const players = baseState.players.map((p) =>
        p.id === "PLAYER_1" ? { ...p, name: playerName } : p,
      )
      const initialState: GameState = {
        ...baseState,
        players,
      }

      setIsHost(true)
      setLocalPlayerId("PLAYER_1")
      setRoomId(newRoomId)
      setGame(initialState)

      ensureConnection()

      setTimeout(() => {
        wsClient.send({
          type: "host-init",
          roomId: newRoomId,
          state: initialState,
        })
        setLoading(false)
      }, 200)
    },
    [ensureConnection, wsClient],
  )

  const joinGame = useCallback(
    (code: string, playerName: string) => {
      const trimmed = code.trim().toUpperCase()
      if (!trimmed) return
      setLoading(true)
      setError(null)

      setIsHost(false)
      setLocalPlayerId("PLAYER_2")
      setRoomId(trimmed)

      ensureConnection()

      setTimeout(() => {
        wsClient.send({
          type: "join",
          roomId: trimmed,
          playerName,
        })
        setLoading(false)
      }, 200)
    },
    [ensureConnection, wsClient],
  )

  const dispatchActionForLocalPlayer = useCallback(
    (partial: Omit<AnyPlayerAction, "id" | "playerId">) => {
      if (!roomId || !localPlayerId) return

      const action: AnyPlayerAction = {
        ...partial,
        id: crypto.randomUUID ? crypto.randomUUID() : `act_${Date.now()}`,
        playerId: localPlayerId,
      }

      if (isHost) {
        if (!game) return
        const nextState = reduceGameState(game, action)
        setGame(nextState)
        wsClient.send({
          type: "state",
          roomId,
          state: nextState,
        })
      } else {
        wsClient.send({
          type: "action",
          roomId,
          action,
        })
      }
    },
    [game, isHost, localPlayerId, roomId, wsClient],
  )

  const disconnect = useCallback(() => {
    wsClient.close()
    setGame(null)
    setRoomId(null)
    setLocalPlayerId(null)
    setIsHost(false)
  }, [wsClient])

  return {
    game,
    roomId,
    localPlayerId,
    isHost,
    loading,
    error,
    hostNewGame,
    joinGame,
    dispatchActionForLocalPlayer,
    disconnect,
  }
}
