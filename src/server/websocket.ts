import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

let wss: WebSocketServer;

export function setupWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[x-post-scheduler] WebSocket クライアント接続');
    ws.on('close', () => {
      console.log('[x-post-scheduler] WebSocket クライアント切断');
    });
  });

  return wss;
}

export function getWss(): WebSocketServer {
  return wss;
}

export function broadcast(data: object): void {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}
