// src/components/CombatPanel.tsx
import React, { useState } from "react"
import type { GameState, PlayerId } from "../game/types"

export interface CombatPanelProps {
  game: GameState
  localPlayerId: PlayerId
  onRaid: (args: {
    fromSettlementId: string
    targetSettlementId: string
    raiderPercent: number
  }) => void
}

export const CombatPanel: React.FC<CombatPanelProps> = ({
  game,
  localPlayerId,
  onRaid,
}) => {
  const mySettlements = game.settlements.filter(
    (s) => s.owner === localPlayerId,
  )
  const enemySettlements = game.settlements.filter(
    (s) => s.owner !== localPlayerId,
  )

  const [fromId, setFromId] = useState(
    mySettlements.length > 0 ? mySettlements[0].id : "",
  )
  const [targetId, setTargetId] = useState(
    enemySettlements.length > 0 ? enemySettlements[0].id : "",
  )
  const [raiderPercent, setRaiderPercent] = useState(50)

  const canRaid =
    mySettlements.length > 0 &&
    enemySettlements.length > 0 &&
    fromId &&
    targetId &&
    fromId !== targetId

  const handleRaidClick = () => {
    if (!canRaid) return
    onRaid({
      fromSettlementId: fromId,
      targetSettlementId: targetId,
      raiderPercent,
    })
  }

  return (
    <div
      style={{
        border: "1px solid #333",
        padding: "8px",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3>Raids</h3>
      {enemySettlements.length === 0 ? (
        <p style={{ fontSize: "0.9rem", color: "#aaa" }}>
          No enemy settlements to raid yet.
        </p>
      ) : (
        <>
          <div style={{ fontSize: "0.85rem", color: "#ccc", marginBottom: "4px" }}>
            Launch a raid by committing a portion of defenders from one of your
            settlements.
          </div>

          <div style={{ marginBottom: "4px" }}>
            <label style={{ fontSize: "0.85rem" }}>
              From:
              <select
                style={{ marginLeft: "4px" }}
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
              >
                {mySettlements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} (Def: {s.defenders})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginBottom: "4px" }}>
            <label style={{ fontSize: "0.85rem" }}>
              Target:
              <select
                style={{ marginLeft: "4px" }}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {enemySettlements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} (Owner: {s.owner})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginBottom: "4px" }}>
            <label style={{ display: "block", fontSize: "0.85rem" }}>
              Raiders: {raiderPercent}% of defenders
              <input
                type="range"
                min={1}
                max={100}
                value={raiderPercent}
                onChange={(e) => setRaiderPercent(Number(e.target.value))}
              />
            </label>
          </div>

          <button onClick={handleRaidClick} disabled={!canRaid}>
            Send Raid
          </button>
        </>
      )}
    </div>
  )
}
