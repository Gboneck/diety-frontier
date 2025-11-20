import React, { useCallback, useState } from "react"
import { HexBoard } from "./HexBoard"
import { useWsGame } from "../state/useWsGame"
import type {
  AllocateRolesPayload,
  DeityPowerType,
  PlaceStartingSettlementPayload,
  RaidSettlementPayload,
  UseDeityPowerPayload,
  UpgradeSettlementPayload,
} from "../game/types"
import { SettlementRolesPanel } from "./SettlementRolesPanel"
import { CombatPanel } from "./CombatPanel"
import { DeityPowersPanel } from "./DeityPowersPanel"

export const GameRoot: React.FC = () => {
  const {
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
  } = useWsGame()

  const [hostName, setHostName] = useState("")
  const [joinName, setJoinName] = useState("")
  const [joinCodeInput, setJoinCodeInput] = useState("")

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (!game || !localPlayerId) return
      if (game.phase !== "LOBBY") return

      const payload: PlaceStartingSettlementPayload = { tileId }
      dispatchActionForLocalPlayer({
        type: "PLACE_STARTING_SETTLEMENT",
        payload,
        clientTimeMs: performance.now(),
      })
    },
    [game, localPlayerId, dispatchActionForLocalPlayer],
  )

  const handleUpdateRoles = useCallback(
    (args: {
      settlementId: string
      workersPercent: number
      worshippersPercent: number
      defendersPercent: number
    }) => {
      if (!game || !localPlayerId) return

      const payload: AllocateRolesPayload = {
        settlementId: args.settlementId,
        workersPercent: args.workersPercent,
        worshippersPercent: args.worshippersPercent,
        defendersPercent: args.defendersPercent,
      }

      dispatchActionForLocalPlayer({
        type: "ALLOCATE_ROLES",
        payload,
        clientTimeMs: performance.now(),
      })
    },
    [game, localPlayerId, dispatchActionForLocalPlayer],
  )

  const handleRaid = useCallback(
    (args: {
      fromSettlementId: string
      targetSettlementId: string
      raiderPercent: number
    }) => {
      if (!game || !localPlayerId) return

      const payload: RaidSettlementPayload = {
        fromSettlementId: args.fromSettlementId,
        targetSettlementId: args.targetSettlementId,
        raiderPercent: args.raiderPercent,
      }

      dispatchActionForLocalPlayer({
        type: "RAID_SETTLEMENT",
        payload,
        clientTimeMs: performance.now(),
      })
    },
    [game, localPlayerId, dispatchActionForLocalPlayer],
  )

  const handleCastPower = useCallback(
    (args: { power: DeityPowerType; settlementId: string }) => {
      if (!game || !localPlayerId) return

      const payload: UseDeityPowerPayload = {
        power: args.power,
        settlementId: args.settlementId,
      }

      dispatchActionForLocalPlayer({
        type: "USE_DEITY_POWER",
        payload,
        clientTimeMs: performance.now(),
      })
    },
    [game, localPlayerId, dispatchActionForLocalPlayer],
  )

  const handleUpgradeSettlement = useCallback(
    (settlementId: string) => {
      if (!game || !localPlayerId) return
      const payload: UpgradeSettlementPayload = { settlementId }

      dispatchActionForLocalPlayer({
        type: "UPGRADE_SETTLEMENT",
        payload,
        clientTimeMs: performance.now(),
      })
    },
    [game, localPlayerId, dispatchActionForLocalPlayer],
  )

  if (!roomId || !game || !localPlayerId) {
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
        <h1>Deity Frontier – WS Lobby</h1>

        {error && (
          <p style={{ color: "tomato" }}>
            <strong>Error:</strong> {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: "32px",
            marginTop: "24px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              border: "1px solid #333",
              padding: "16px",
              borderRadius: "8px",
              minWidth: "260px",
            }}
          >
            <h2>Host Game</h2>
            <label style={{ display: "block", marginBottom: "8px" }}>
              Your name:
              <input
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "6px",
                }}
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                disabled={loading}
              />
            </label>
            <button
              onClick={() => hostNewGame(hostName || "Host")}
              disabled={loading || !hostName}
            >
              {loading ? "Hosting..." : "Host New Game"}
            </button>
          </div>

          <div
            style={{
              border: "1px solid #333",
              padding: "16px",
              borderRadius: "8px",
              minWidth: "260px",
            }}
          >
            <h2>Join Game</h2>
            <label style={{ display: "block", marginBottom: "8px" }}>
              Room code:
              <input
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "6px",
                }}
                type="text"
                value={joinCodeInput}
                onChange={(e) =>
                  setJoinCodeInput(e.target.value.toUpperCase())
                }
                disabled={loading}
              />
            </label>
            <label style={{ display: "block", marginBottom: "8px" }}>
              Your name:
              <input
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "6px",
                }}
                type="text"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                disabled={loading}
              />
            </label>
            <button
              onClick={() => joinGame(joinCodeInput.trim(), joinName || "Guest")}
              disabled={loading || !joinCodeInput || !joinName}
            >
              {loading ? "Joining..." : "Join Game"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const currentPlayer = game.players.find((p) => p.id === localPlayerId)

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
      <h1>Deity Frontier – Real-time WS</h1>

      <p>
        Room code: <strong>{roomId}</strong>
      </p>
      <p>
        You are: {" "}
        <strong>
          {currentPlayer?.name ?? localPlayerId} ({localPlayerId})
        </strong>{" "}
        {isHost && " – Host"}
      </p>
      <p>
        Phase: <strong>{game.phase}</strong>
      </p>

      {error && (
        <p style={{ color: "tomato" }}>
          <strong>Error:</strong> {error}
        </p>
      )}

      <div style={{ marginBottom: "12px" }}>
        {game.phase === "LOBBY" ? (
          <p>
            <strong>Lobby:</strong> Each player clicks a non-water tile once to
            place their starting settlement. When both have placed, the game
            moves to <code>RUNNING</code>.
          </p>
        ) : game.phase === "RUNNING" ? (
          <p>
            <strong>Running:</strong> Settlements now generate resources and
            belief every second. Watch the players' resources update in real
            time as the host simulates the world.
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

      <SettlementRolesPanel
        game={game}
        localPlayerId={localPlayerId}
        onUpdateRoles={handleUpdateRoles}
      />

      <CombatPanel
        game={game}
        localPlayerId={localPlayerId}
        onRaid={handleRaid}
      />

      <DeityPowersPanel
        game={game}
        localPlayerId={localPlayerId}
        onCastPower={handleCastPower}
      />

      <h2>Your Settlements (Upgrades)</h2>
      <div style={{ marginBottom: "16px" }}>
        {game.settlements
          .filter((s) => s.owner === localPlayerId)
          .map((s) => (
            <div key={s.id} style={{ marginBottom: "4px", fontSize: "0.9rem" }}>
              <span>
                {s.id} – Level {s.level}, Pop {s.population}/{s.populationCap}
              </span>
              <button
                style={{ marginLeft: "8px" }}
                onClick={() => handleUpgradeSettlement(s.id)}
              >
                Upgrade (50W / 50S)
              </button>
            </div>
          ))}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button onClick={disconnect}>Disconnect</button>
      </div>

      <h2>Players</h2>
      <pre style={{ background: "#000", color: "#0f0", padding: "8px" }}>
        {JSON.stringify(game.players, null, 2)}
      </pre>

      <h2>Settlements</h2>
      <pre style={{ background: "#000", color: "#0cf", padding: "8px" }}>
        {JSON.stringify(game.settlements, null, 2)}
      </pre>

      <h2>Debug – Buffs & Upkeep</h2>
      <pre style={{ background: "#000", color: "#ff0", padding: "8px" }}>
        {JSON.stringify(
          {
            currentTimeMs: game.currentTimeMs,
            buffs: game.buffs,
          },
          null,
          2,
        )}
      </pre>
    </div>
  )
}
