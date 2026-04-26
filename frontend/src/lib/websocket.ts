import type { WebSocketMessage, WebSocketResponse } from "../types";

type MessageHandler = (message: WebSocketResponse) => void;
type ConnectionHandler = () => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectHandlers: Set<ConnectionHandler> = new Set();
  private disconnectHandlers: Set<ConnectionHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private currentToken: string | null = null;

  connect(token: string): Promise<void> {
    this.currentToken = token;
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}`;
      const url = `${wsUrl}/ws?token=${encodeURIComponent(token)}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("WebSocket connected");
        this.reconnectAttempts = 0;
        this.reconnectHandlers.forEach((handler) => handler());
        resolve();
      };

      this.ws.onclose = (event) => {
        console.log("WebSocket disconnected", event.code, event.reason);
        this.disconnectHandlers.forEach((handler) => handler());
        this.handleReconnect(token);
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketResponse = JSON.parse(event.data);
          this.messageHandlers.forEach((handler) => handler(message));
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };
    });
  }

  private handleReconnect(token: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay =
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(
        `Attempting to reconnect in ${delay}ms... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );
      setTimeout(() => {
        this.connect(token).catch(() => {
          console.error("Reconnection failed");
        });
      }, delay);
    } else {
      console.error(
        "Max reconnection attempts reached. Please refresh the page.",
      );
    }
  }

  send(message: WebSocketMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error("WebSocket is not connected");
    }
  }

  addMessageHandler(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
    this.reconnectHandlers.clear();
    this.disconnectHandlers.clear();
    this.currentToken = null;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  addReconnectHandler(handler: ConnectionHandler) {
    this.reconnectHandlers.add(handler);
    return () => {
      this.reconnectHandlers.delete(handler);
    };
  }

  addDisconnectHandler(handler: ConnectionHandler) {
    this.disconnectHandlers.add(handler);
    return () => {
      this.disconnectHandlers.delete(handler);
    };
  }

  getCurrentToken(): string | null {
    return this.currentToken;
  }
}

export const wsManager = new WebSocketManager();
