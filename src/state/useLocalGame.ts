import { useCallback, useEffect, useRef, useState } from "react"
import { createInitialGameState, tickGameState } from "../game/simulation"
import type { GamePhase, GameState } from "../game/types"

interface UseLocalGame {
  gameState: GameState
  start: () => void
  pause: () => void
  reset: () => void
  isRunning: boolean
}

export function useLocalGame(): UseLocalGame {
  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState())
  const animationFrameRef = useRef<number | null>(null)
  const lastTickTimeRef = useRef<number | null>(null)
  const gameStateRef = useRef<GameState>(gameState)

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  const stepSimulation = useCallback(
    (timestamp: number) => {
      const latestState = gameStateRef.current
      if (latestState.phase !== "RUNNING") {
        animationFrameRef.current = null
        lastTickTimeRef.current = null
        return
      }

      const last = lastTickTimeRef.current ?? timestamp
      const elapsed = timestamp - last
      lastTickTimeRef.current = timestamp

      setGameState((prev) => tickGameState(prev, elapsed))
      animationFrameRef.current = requestAnimationFrame(stepSimulation)
    },
    [],
  )

  const start = useCallback(() => {
    setGameState((prev) => {
      if (prev.phase === "RUNNING") return prev
      return { ...prev, phase: "RUNNING" as GamePhase }
    })

    if (!animationFrameRef.current) {
      lastTickTimeRef.current = null
      animationFrameRef.current = requestAnimationFrame(stepSimulation)
    }
  }, [stepSimulation])

  const pause = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      phase: prev.phase === "RUNNING" ? "LOBBY" : prev.phase,
    }))
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    lastTickTimeRef.current = null
  }, [])

  const reset = useCallback(() => {
    pause()
    setGameState(createInitialGameState())
  }, [pause])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return {
    gameState,
    start,
    pause,
    reset,
    isRunning: gameState.phase === "RUNNING",
  }
}
