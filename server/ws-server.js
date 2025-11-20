// server/ws-server.js
// Simple WebSocket relay server for Deity Frontier
// Run with: node server/ws-server.js

import { randomUUID } from "node:crypto"
import { WebSocketServer, WebSocket } from "ws"

/**
 * In-memory room registry
 * rooms[roomId] = { host: ws | null, clients: Set<ws>, lastState: any | null }
 */
const rooms = {}

const wss = new WebSocketServer({ port: 3001 })

console.log("WebSocket server listening on ws://localhost:3001")

wss.on("connection", (ws) => {
  ws.id = randomUUID()
  ws.currentRoomId = null
  ws.isHost = false

  ws.on("message", (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch (e) {
      console.warn("Invalid JSON from client", e)
      return
    }

    const { type } = msg || {}
    if (!type) return

    switch (type) {
      case "host-init":
        handleHostInit(ws, msg)
        break
      case "join":
        handleJoin(ws, msg)
        break
      case "action":
        handleAction(ws, msg)
        break
      case "state":
        handleStateFromHost(ws, msg)
        break
      default:
        console.warn("Unknown message type", type)
    }
  })

  ws.on("close", () => {
    const roomId = ws.currentRoomId
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId]
      room.clients.delete(ws)
      if (room.host === ws) {
        console.log(`Host disconnected for room ${roomId}, closing room.`)
        room.host = null
        room.clients.forEach((client) => {
          try {
            client.send(
              JSON.stringify({
                type: "error",
                message: "Host disconnected. Room closed.",
              }),
            )
            client.close()
          } catch (e) {
            // ignore
          }
        })
        delete rooms[roomId]
      }
    }
  })
})

function getOrCreateRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      host: null,
      clients: new Set(),
      lastState: null,
    }
  }
  return rooms[roomId]
}

function handleHostInit(ws, msg) {
  const { roomId, state } = msg
  if (!roomId || !state) return
  const room = getOrCreateRoom(roomId)

  room.host = ws
  room.lastState = state
  ws.currentRoomId = roomId
  ws.isHost = true
  room.clients.add(ws)

  console.log(`Host initialized room ${roomId}`)

  try {
    ws.send(
      JSON.stringify({
        type: "state",
        roomId,
        state,
      }),
    )
  } catch (e) {
    console.error("Failed to send initial state to host", e)
  }
}

function handleJoin(ws, msg) {
  const { roomId, playerName } = msg
  if (!roomId) return
  const room = rooms[roomId]
  if (!room || !room.host) {
    try {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Room not found or host missing.",
        }),
      )
    } catch (e) {
      // ignore
    }
    ws.close()
    return
  }

  ws.currentRoomId = roomId
  ws.isHost = false
  room.clients.add(ws)

  console.log(`Client joined room ${roomId}`)

  try {
    room.host.send(
      JSON.stringify({
        type: "join",
        roomId,
        playerName: playerName || "Guest",
        clientId: ws.id,
      }),
    )
  } catch (e) {
    console.error("Failed to notify host of join", e)
  }

  if (room.lastState) {
    try {
      ws.send(
        JSON.stringify({
          type: "state",
          roomId,
          state: room.lastState,
        }),
      )
    } catch (e) {
      console.error("Failed to send last state to joiner", e)
    }
  }
}

function handleAction(ws, msg) {
  const { roomId, action } = msg
  if (!roomId || !action) return
  const room = rooms[roomId]
  if (!room || !room.host) return

  try {
    room.host.send(
      JSON.stringify({
        type: "action",
        roomId,
        action,
      }),
    )
  } catch (e) {
    console.error("Failed to forward action to host", e)
  }
}

function handleStateFromHost(ws, msg) {
  const { roomId, state } = msg
  if (!roomId || !state) return
  const room = rooms[roomId]
  if (!room || room.host !== ws) return

  room.lastState = state

  room.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(
          JSON.stringify({
            type: "state",
            roomId,
            state,
          }),
        )
      } catch (e) {
        console.error("Failed to broadcast state", e)
      }
    }
  })
}
