import React from "react"
import { useLocalGame } from "../state/useLocalGame"

export const GameRoot: React.FC = () => {
  const { game, localPlayerId, dispatchAction, resetGame } = useLocalGame()

  return (
    <div style={{ padding: "16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Deity Frontier (Local Debug)</h1>
      <p>
        Game ID: <code>{game.id}</code>
      </p>
      <p>
        Local player: <strong>{localPlayerId}</strong>
      </p>
      <p>
        Phase: <strong>{game.phase}</strong> | Time:{" "}
        <strong>{game.currentTimeMs}</strong> ms
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

      <h2>Players</h2>
      <pre style={{ background: "#111", color: "#0f0", padding: "8px" }}>
        {JSON.stringify(game.players, null, 2)}
      </pre>

      <h2>Tiles</h2>
      <pre style={{ background: "#111", color: "#0cf", padding: "8px" }}>
        {JSON.stringify(game.tiles.slice(0, 10), null, 2)}{" "}
        {/* show just a subset */}
      </pre>
    </div>
  )
}
