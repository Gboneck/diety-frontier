import { useMemo } from "react"
import { useLocalGame } from "../state/useLocalGame"
import { RESOURCE_TYPES } from "../game/simulation"
import type { GamePhase, Player, Settlement, Tile } from "../game/types"
import "./GameRoot.css"

function formatNumber(value: number): string {
  return value.toFixed(2)
}

function PlayerPanel({ player }: { player: Player }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{player.name}</h3>
        <span className="pill">{formatNumber(player.victoryPoints)} VP</span>
      </div>
      <div className="grid">
        {RESOURCE_TYPES.map((resource) => (
          <div key={resource} className="grid-row">
            <span className="label">{resource}</span>
            <span className="value">{formatNumber(player.resources[resource])}</span>
          </div>
        ))}
      </div>
      <div className="grid-row">
        <span className="label">Belief (pool)</span>
        <span className="value">{formatNumber(player.belief)}</span>
      </div>
      <div className="grid-row">
        <span className="label">Max Belief</span>
        <span className="value">{formatNumber(player.maxBeliefEver)}</span>
      </div>
    </div>
  )
}

function SettlementList({ settlements, tiles }: { settlements: Settlement[]; tiles: Tile[] }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Settlements</h3>
      </div>
      <ul className="list">
        {settlements.map((settlement) => {
          const tile = tiles.find((t) => t.id === settlement.tileId)
          return (
            <li key={settlement.id} className="list-item">
              <div>
                <strong>{settlement.id}</strong> on {tile?.terrain ?? "Unknown"} at (
                {tile?.coord.q}, {tile?.coord.r})
              </div>
              <div className="meta">Owner: {settlement.owner}</div>
              <div className="meta">
                Level {settlement.level} • Pop {settlement.population} • Workers {settlement.workers} • Worshippers
                {" "}
                {settlement.worshippers}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PhaseBadge({ phase }: { phase: GamePhase }) {
  return <span className={`pill phase-${phase.toLowerCase()}`}>{phase}</span>
}

export function GameRoot() {
  const { gameState, start, pause, reset, isRunning } = useLocalGame()

  const secondsElapsed = useMemo(
    () => (gameState.currentTimeMs / 1000).toFixed(1),
    [gameState.currentTimeMs],
  )

  return (
    <div className="game-root">
      <header className="header">
        <div>
          <h1>Deity Frontier (Local Prototype)</h1>
          <div className="subheader">
            Phase <PhaseBadge phase={gameState.phase} /> • Time {secondsElapsed}s
          </div>
        </div>
        <div className="controls">
          <button onClick={start} disabled={isRunning || gameState.phase === "GAME_OVER"}>
            Start
          </button>
          <button onClick={pause} disabled={!isRunning}>
            Pause
          </button>
          <button onClick={reset}>Reset</button>
        </div>
      </header>

      {gameState.winnerId && (
        <div className="banner">
          {gameState.winnerId} achieved divine supremacy!
        </div>
      )}

      <div className="panels">
        {gameState.players.map((player) => (
          <PlayerPanel key={player.id} player={player} />
        ))}
      </div>

      <SettlementList settlements={gameState.settlements} tiles={gameState.tiles} />
    </div>
  )
}

export default GameRoot
