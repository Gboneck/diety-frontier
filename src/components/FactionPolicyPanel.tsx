// src/components/FactionPolicyPanel.tsx
import React from "react"
import { FactionPolicy, GameState, PlayerId, Stance } from "../game/types"

export interface FactionPolicyPanelProps {
  game: GameState
  localPlayerId: PlayerId
  onUpdatePolicy: (policy: FactionPolicy) => void
}

export const FactionPolicyPanel: React.FC<FactionPolicyPanelProps> = ({
  game,
  localPlayerId,
  onUpdatePolicy,
}) => {
  const player = game.players.find((p) => p.id === localPlayerId)
  if (!player) return null

  const policy =
    player.policy ?? {
      workersPercent: 60,
      worshippersPercent: 20,
      defendersPercent: 20,
      stance: "DEFENSIVE",
    }

  const updateField = (field: keyof FactionPolicy, value: number | Stance) => {
    const next: FactionPolicy = {
      ...policy,
      [field]: value as any,
    }
    onUpdatePolicy(next)
  }

  const stanceButtonStyle = (stance: Stance): React.CSSProperties => ({
    padding: "4px 8px",
    marginRight: "4px",
    borderRadius: "4px",
    border: "1px solid #444",
    background: policy.stance === stance ? "#3b82f6" : "transparent",
    color: policy.stance === stance ? "#fff" : "#ddd",
    cursor: "pointer",
    fontSize: "0.8rem",
  })

  return (
    <div
      style={{
        border: "1px solid #333",
        padding: "8px",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3>Empire Doctrine</h3>
      <p style={{ fontSize: "0.9rem", color: "#aaa" }}>
        Set global role allocation and war stance. Settlements automatically
        follow these policies each tick, and raids happen based on your stance.
      </p>

      <div style={{ marginTop: "4px" }}>
        <label style={{ display: "block", fontSize: "0.85rem" }}>
          Workers: {policy.workersPercent}%
          <input
            type="range"
            min={0}
            max={100}
            value={policy.workersPercent}
            onChange={(e) =>
              updateField("workersPercent", Number(e.target.value))
            }
          />
        </label>
      </div>

      <div>
        <label style={{ display: "block", fontSize: "0.85rem" }}>
          Worshippers: {policy.worshippersPercent}%
          <input
            type="range"
            min={0}
            max={100}
            value={policy.worshippersPercent}
            onChange={(e) =>
              updateField("worshippersPercent", Number(e.target.value))
            }
          />
        </label>
      </div>

      <div>
        <label style={{ display: "block", fontSize: "0.85rem" }}>
          Defenders: {policy.defendersPercent}%
          <input
            type="range"
            min={0}
            max={100}
            value={policy.defendersPercent}
            onChange={(e) =>
              updateField("defendersPercent", Number(e.target.value))
            }
          />
        </label>
      </div>

      <div style={{ marginTop: "8px", fontSize: "0.85rem" }}>
        Stance:
      </div>
      <div style={{ marginTop: "4px" }}>
        <button
          style={stanceButtonStyle("AGGRESSIVE")}
          onClick={() => updateField("stance", "AGGRESSIVE")}
        >
          Aggressive
        </button>
        <button
          style={stanceButtonStyle("DEFENSIVE")}
          onClick={() => updateField("stance", "DEFENSIVE")}
        >
          Defensive
        </button>
        <button
          style={stanceButtonStyle("PASSIVE")}
          onClick={() => updateField("stance", "PASSIVE")}
        >
          Passive
        </button>
      </div>

      <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "6px" }}>
        Aggressive: frequent raids, commits more defenders. Defensive: rare,
        cautious raids. Passive: never raids.
      </p>
    </div>
  )
}
