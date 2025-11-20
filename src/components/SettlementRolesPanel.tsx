import React from "react"
import type { GameState, PlayerId, Settlement } from "../game/types"

export interface SettlementRolesPanelProps {
  game: GameState
  localPlayerId: PlayerId
  onUpdateRoles: (args: {
    settlementId: string
    workersPercent: number
    worshippersPercent: number
    defendersPercent: number
  }) => void
}

function computePercents(settlement: Settlement) {
  const { population, workers, worshippers, defenders } = settlement
  if (population <= 0) {
    return { workersPercent: 0, worshippersPercent: 0, defendersPercent: 0 }
  }

  const workersPercent = Math.round((workers / population) * 100)
  const worshippersPercent = Math.round((worshippers / population) * 100)
  const defendersPercent = Math.round((defenders / population) * 100)

  return { workersPercent, worshippersPercent, defendersPercent }
}

export const SettlementRolesPanel: React.FC<SettlementRolesPanelProps> = ({
  game,
  localPlayerId,
  onUpdateRoles,
}) => {
  const mySettlements = game.settlements.filter(
    (s) => s.owner === localPlayerId,
  )

  if (mySettlements.length === 0) {
    return (
      <div
        style={{
          border: "1px solid #333",
          padding: "8px",
          borderRadius: "8px",
          marginTop: "16px",
        }}
      >
        <h3>Your Settlements</h3>
        <p style={{ fontSize: "0.9rem", color: "#aaa" }}>
          You don't control any settlements yet.
        </p>
      </div>
    )
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
      <h3>Your Settlements</h3>
      <p style={{ fontSize: "0.9rem", color: "#aaa" }}>
        Adjust how your followers are allocated. Percentages do not need to sum
        to 100; any remainder is idle.
      </p>

      {mySettlements.map((settlement) => {
        const {
          workersPercent,
          worshippersPercent,
          defendersPercent,
        } = computePercents(settlement)

        const tile = game.tiles.find((t) => t.id === settlement.tileId)

        return (
          <div
            key={settlement.id}
            style={{
              marginTop: "12px",
              paddingTop: "8px",
              borderTop: "1px solid #444",
            }}
          >
            <div style={{ marginBottom: "4px" }}>
              <strong>Settlement {settlement.id}</strong>{" "}
              {tile && (
                <span style={{ fontSize: "0.8rem", color: "#ccc" }}>
                  (Terrain: {tile.terrain})
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.85rem", color: "#ccc" }}>
              Population: {settlement.population} | Workers: {settlement.workers}
              {" "}| Worshippers: {settlement.worshippers} | Defenders:
              {" "}
              {settlement.defenders}
            </div>

            <div style={{ marginTop: "4px" }}>
              <label style={{ display: "block", fontSize: "0.85rem" }}>
                Workers: {workersPercent}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={workersPercent}
                  onChange={(e) => {
                    const newWorkers = Number(e.target.value)
                    onUpdateRoles({
                      settlementId: settlement.id,
                      workersPercent: newWorkers,
                      worshippersPercent,
                      defendersPercent,
                    })
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem" }}>
                Worshippers: {worshippersPercent}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={worshippersPercent}
                  onChange={(e) => {
                    const newWorshippers = Number(e.target.value)
                    onUpdateRoles({
                      settlementId: settlement.id,
                      workersPercent,
                      worshippersPercent: newWorshippers,
                      defendersPercent,
                    })
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem" }}>
                Defenders: {defendersPercent}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={defendersPercent}
                  onChange={(e) => {
                    const newDefenders = Number(e.target.value)
                    onUpdateRoles({
                      settlementId: settlement.id,
                      workersPercent,
                      worshippersPercent,
                      defendersPercent: newDefenders,
                    })
                  }}
                />
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}
