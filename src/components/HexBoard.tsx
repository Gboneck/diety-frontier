import React from "react"
import type { Tile, Settlement, PlayerId } from "../game/types"

export interface HexBoardProps {
  tiles: Tile[]
  settlements: Settlement[]
  onTileClick?: (tileId: string) => void
}

const ownerColor: Record<string, string> = {
  PLAYER_1: "#ffcc00",
  PLAYER_2: "#00ccff",
  NPC_1: "#ff66cc",
}

function getOwnerColor(owner: PlayerId): string {
  if (ownerColor[owner]) return ownerColor[owner]

  const palette = ["#ff9966", "#66ffcc", "#cc99ff", "#99ccff", "#ffcc66"]
  const hash = owner
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

function terrainColor(terrain: Tile["terrain"]): string {
  switch (terrain) {
    case "Field":
      return "#7fbf7f"
    case "Forest":
      return "#2e8b57"
    case "Mountain":
      return "#888888"
    case "Water":
      return "#3b6dd8"
    case "FertileField":
      return "#c4e86b"
    default:
      return "#999999"
  }
}

/**
 * Very simple "axial" layout -> approximate hex grid using CSS transforms.
 * This doesn't need to be perfect; just good enough to see and click.
 */
export const HexBoard: React.FC<HexBoardProps> = ({
  tiles,
  settlements,
  onTileClick,
}) => {
  // Find min/max coords to normalize the layout
  const qs = tiles.map((t) => t.coord.q)
  const rs = tiles.map((t) => t.coord.r)
  const minQ = Math.min(...qs)
  const maxQ = Math.max(...qs)
  const minR = Math.min(...rs)
  const maxR = Math.max(...rs)

  const width = maxQ - minQ + 1
  const height = maxR - minR + 1

  const tileSize = 60
  const tileHeight = tileSize * 0.9

  return (
    <div
      style={{
        position: "relative",
        width: width * tileSize * 0.85 + "px",
        height: height * tileHeight + "px",
        border: "1px solid #333",
        marginBottom: "16px",
      }}
    >
      {tiles.map((tile) => {
        const { q, r } = tile.coord
        const col = q - minQ
        const row = r - minR

        const x = col * tileSize * 0.85
        const y = row * tileHeight + (col % 2 === 0 ? 0 : tileHeight / 2)

        const settlement = tile.settlementId
          ? settlements.find((s) => s.id === tile.settlementId)
          : undefined

        return (
          <div
            key={tile.id}
            onClick={() => onTileClick && onTileClick(tile.id)}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: tileSize,
              height: tileHeight,
              backgroundColor: terrainColor(tile.terrain),
              clipPath:
                "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
              border: "1px solid #222",
              boxSizing: "border-box",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              color: "#fff",
            }}
          >
            {settlement && (
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  backgroundColor: getOwnerColor(settlement.owner),
                  border: "2px solid #000",
                }}
                title={settlement.owner}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
