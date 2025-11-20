export type WsMessage =
  | { type: "state"; roomId: string; state: any }
  | { type: "action"; roomId: string; action: any }
  | { type: "join"; roomId: string; playerName: string; clientId?: string }
  | { type: "host-init"; roomId: string; state: any }
  | { type: "error"; message: string }
  | { type: string; [key: string]: any }

export type WsMessageHandler = (msg: WsMessage) => void

export interface WsConnectionOptions {
  url?: string // default ws://localhost:3001
}

export class WsClient {
  private ws: WebSocket | null = null
  private handler: WsMessageHandler | null = null
  private url: string

  constructor(options?: WsConnectionOptions) {
    this.url = options?.url ?? "ws://localhost:3001"
  }

  connect(handler: WsMessageHandler): void {
    this.handler = handler
    if (this.ws) {
      return
    }

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      // connection established
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.handler && this.handler(data)
      } catch (e) {
        console.error("Invalid WS message", e)
      }
    }

    this.ws.onclose = () => {
      this.ws = null
    }

    this.ws.onerror = (err) => {
      console.error("WS error", err)
    }
  }

  send(msg: WsMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not open, cannot send message")
      return
    }
    this.ws.send(JSON.stringify(msg))
  }

  close(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}
