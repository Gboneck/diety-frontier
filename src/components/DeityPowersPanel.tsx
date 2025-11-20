// src/components/DeityPowersPanel.tsx
import React, { useState } from "react"
import type { DeityPowerType, GameState, PlayerId } from "../game/types"

export interface DeityPowersPanelProps {
  game: GameState
  localPlayerId: PlayerId
  onCastPower: (args: { power: DeityPowerType; settlementId: string }) => void
}

export const DeityPowersPanel: React.FC<DeityPowersPanelProps> = ({
  game,
  localPlayerId,
  onCastPower,
}) => {
  const player = game.players.find((p) => p.id === localPlayerId)
  const mySettlements = game.settlements.filter(
    (s) => s.owner === localPlayerId,
  )

  const [selectedSettlementId, setSelectedSettlementId] = useState(
    mySettlements.length > 0 ? mySettlements[0].id : "",
  )

  if (!player) {
    return null
  }

  const canCast = (cost: number) => (player.belief ?? 0) >= cost

  const handleCast = (power: DeityPowerType, cost: number) => {
    if (!selectedSettlementId) return
    if (!canCast(cost)) return
    onCastPower({ power, settlementId: selectedSettlementId })
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
      <h3>Deity Powers</h3>
      <div style={{ fontSize: "0.9rem", color: "#ccc" }}>
        Belief: <strong>{player.belief}</strong>
      </div>

      {mySettlements.length === 0 ? (
        <p style={{ fontSize: "0.9rem", color: "#aaa" }}>
          You need a settlement to target with your powers.
        </p>
      ) : (
        <>
          <div style={{ marginTop: "4px", marginBottom: "4px" }}>
            <label style={{ fontSize: "0.85rem" }}>
              Target settlement:
              <select
                style={{ marginLeft: "4px" }}
                value={selectedSettlementId}
                onChange={(e) => setSelectedSettlementId(e.target.value)}
              >
                {mySettlements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginTop: "4px" }}>
            <button
              style={{ marginRight: "8px", marginBottom: "4px" }}
              disabled={!canCast(10) || !selectedSettlementId}
              onClick={() => handleCast("BLESSED_HARVEST", 10)}
            >
              Blessed Harvest (10 Belief)
            </button>
          </div>

          <div>
            <button
              style={{ marginRight: "8px", marginBottom: "4px" }}
              disabled={!canCast(15) || !selectedSettlementId}
              onClick={() => handleCast("INSPIRED_WORSHIP", 15)}
            >
              Inspired Worship (15 Belief)
            </button>
          </div>

          <p style={{ fontSize: "0.8rem", color: "#aaa", marginTop: "4px" }}>
            Powers are temporary buffs on the chosen settlement that amplify
            worker or worshipper output.
          </p>
        </>
      )}
    </div>
  )
}
