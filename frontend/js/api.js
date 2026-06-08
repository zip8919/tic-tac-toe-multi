// API 通信层：REST + WebSocket

const API_BASE = "/api";

export async function createGame(mode, playerName) {
  const res = await fetch(`${API_BASE}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, playerName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "创建失败");
  return data; // { gameId, playerToken }
}

export async function joinGame(gameId, playerName) {
  const res = await fetch(`${API_BASE}/games/${gameId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "加入失败");
  return data; // { playerToken }
}

export async function getGameState(gameId) {
  const res = await fetch(`${API_BASE}/games/${gameId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "获取失败");
  return data;
}

export function connectWebSocket(gameId, token, onMessage, onClose) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = location.host;
  const ws = new WebSocket(`${protocol}//${host}${API_BASE}/games/${gameId}/ws?token=${token}`);

  ws.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);
      onMessage(msg);
    } catch (e) {
      console.error("WebSocket 消息解析失败:", e);
    }
  });

  ws.addEventListener("close", () => {
    if (onClose) onClose();
  });

  ws.addEventListener("error", (err) => {
    console.error("WebSocket 错误:", err);
  });

  return ws;
}

// 发送落子
export function sendMove(ws, move) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "move", move }));
  }
}

// 心跳
export function sendPing(ws) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ping" }));
  }
}
