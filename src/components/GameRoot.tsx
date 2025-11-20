import React, { useCallback } from "react"
import { useLocalGame } from "../state/useLocalGame"
import { HexBoard } from "./HexBoard"
import type { PlaceStartingSettlementPayload } from "../game/types"

export const GameRoot: React.FC = () => {
  const { game, localPlayerId, dispatchAction, resetGame } = useLocalGame()

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (game.phase !== "LOBBY") return

      // Dispatch a PLACE_STARTING_SETTLEMENT action for the local player
      const payload: PlaceStartingSettlementPayload = { tileId }

      dispatchAction({
        type: "PLACE_STARTING_SETTLEMENT",
        playerId: localPlayerId,
        payload,
        clientTimeMs: performance.now(),
      })
    },
    [game.phase, localPlayerId, dispatchAction],
  )

  return (
    <div
      style={{
        padding: "16px",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#111",
        color: "#eee",
        minHeight: "100vh",
      }}
    >
      <h1>Deity Frontier (Local Debug)</h1>

      <p>
        Game ID: <code>{game.id}</code>
      </p>
      <p>
        Local player: <strong>{localPlayerId}</strong>
      </p>
      <p>
        Phase: <strong>{game.phase}</strong> | Time:{" "}
        <strong>{game.currentTimeMs.toFixed(0)}</strong> ms
      </p>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={() =>
            dispatchAction({
              type: "NOOP",
              playerId: localPlayerId,
              payload: undefined,
              clientTimeMs: performance.now(),
            })
          }
        >
          Dispatch NOOP
        </button>
        <button onClick={resetGame}>Reset Game</button>
      </div>

      <div style={{ marginBottom: "12px" }}>
        {game.phase === "LOBBY" ? (
          <p>
            <strong>Lobby:</strong> Click any non-water tile to place your
            starting settlement. Each player may place exactly one.
          </p>
        ) : game.phase === "RUNNING" ? (
          <p>
            <strong>Running:</strong> Both starting settlements placed. Next
            steps will add growth, belief, and more actions.
          </p>
        ) : (
          <p>
            <strong>Game Over</strong>
          </p>
        )}
      </div>

      <HexBoard
        tiles={game.tiles}
        settlements={game.settlements}
        onTileClick={handleTileClick}
      />

      <h2>Players</h2>
      <pre style={{ background: "#000", color: "#0f0", padding: "8px" }}>
        {JSON.stringify(game.players, null, 2)}
      </pre>

      <h2>Settlements</h2>
      <pre style={{ background: "#000", color: "#0cf", padding: "8px" }}>
        {JSON.stringify(game.settlements, null, 2)}
      </pre>
    </div>
  )
}
