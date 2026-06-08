import { DurableObject } from "cloudflare:workers";
import { GameRoom } from "./game-room";
import { Registry } from "./registry";

export { GameRoom, Registry };

interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  REGISTRY: DurableObjectNamespace<Registry>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ===== Admin API =====

    // GET /api/admin/games — 列出所有活跃房间（30分钟 TTL 自动清理）
    if (path === "/api/admin/games" && request.method === "GET") {
      try {
        const regId = env.REGISTRY.idFromName("main");
        const registry = env.REGISTRY.get(regId);
        const rooms = await registry.list();

        const now = Date.now();
        const TTL = 30 * 60 * 1000; // 30 分钟
        const validRooms: any[] = [];

        for (const room of rooms) {
          if (now - room.createdAt > TTL) {
            registry.deregister(room.gameId).catch(() => {});
          } else {
            validRooms.push(room);
          }
        }

        return json(validRooms, 200, corsHeaders);
      } catch (e: any) {
        return json({ error: e.message }, 500, corsHeaders);
      }
    }

    // POST /api/admin/clean — 清理所有注册表条目
    if (path === "/api/admin/clean" && request.method === "POST") {
      try {
        const regId = env.REGISTRY.idFromName("main");
        const registry = env.REGISTRY.get(regId);
        const rooms = await registry.list();
        for (const room of rooms) {
          await registry.deregister(room.gameId);
        }
        return json({ ok: true, message: `已清理 ${rooms.length} 个条目` }, 200, corsHeaders);
      } catch (e: any) {
        return json({ error: e.message }, 500, corsHeaders);
      }
    }

    // POST /api/admin/games/:id/force — 强制修改对局
    const adminForceMatch = path.match(/^\/api\/admin\/games\/([a-zA-Z0-9]+)\/force$/);
    if (adminForceMatch && request.method === "POST") {
      try {
        const gameId = adminForceMatch[1];
        const body: any = await request.json();
        const action = body.action as string;
        const params = body.params || {};

        const doId = env.GAME_ROOM.idFromName(gameId);
        const stub = env.GAME_ROOM.get(doId);
        const result = await stub.adminForce(action, params);
        return json(result, result.ok ? 200 : 400, corsHeaders);
      } catch (e: any) {
        return json({ error: e.message }, 500, corsHeaders);
      }
    }

    // ===== Game API =====

    // POST /api/games — 创建对局
    if (path === "/api/games" && request.method === "POST") {
      try {
        const body: any = await request.json();
        const mode = body.mode as string;
        const playerName = body.playerName as string;

        if (!mode || !["classic", "surface3d", "ultimate"].includes(mode)) {
          return json({ error: "无效的游戏模式" }, 400, corsHeaders);
        }
        if (!playerName || playerName.trim() === "") {
          return json({ error: "请输入昵称" }, 400, corsHeaders);
        }

        const gameId = generateGameId();
        const doId = env.GAME_ROOM.idFromName(gameId);
        const stub = env.GAME_ROOM.get(doId);

        const playerToken = await stub.createGame(gameId, mode as any, playerName.trim());

        return json({ gameId, playerToken }, 200, corsHeaders);
      } catch (e: any) {
        return json({ error: e.message || "创建失败" }, 500, corsHeaders);
      }
    }

    // POST /api/games/:id/join — 加入对局
    const joinMatch = path.match(/^\/api\/games\/([a-zA-Z0-9]+)\/join$/);
    if (joinMatch && request.method === "POST") {
      try {
        const gameId = joinMatch[1];
        const body: any = await request.json();
        const playerName = body.playerName as string;

        if (!playerName || playerName.trim() === "") {
          return json({ error: "请输入昵称" }, 400, corsHeaders);
        }

        const doId = env.GAME_ROOM.idFromName(gameId);
        const stub = env.GAME_ROOM.get(doId);

        const playerToken = await stub.joinGame(playerName.trim());
        if (playerToken === null) {
          return json({ error: "房间已满或不存在" }, 400, corsHeaders);
        }

        return json({ playerToken }, 200, corsHeaders);
      } catch (e: any) {
        return json({ error: e.message || "加入失败" }, 500, corsHeaders);
      }
    }

    // GET /api/games/:id — 获取对局状态
    const stateMatch = path.match(/^\/api\/games\/([a-zA-Z0-9]+)$/);
    if (stateMatch && request.method === "GET") {
      try {
        const gameId = stateMatch[1];
        const doId = env.GAME_ROOM.idFromName(gameId);
        const stub = env.GAME_ROOM.get(doId);
        const state = await stub.getState();
        return json(state, 200, corsHeaders);
      } catch (e: any) {
        return json({ error: "对局不存在" }, 404, corsHeaders);
      }
    }

    // WebSocket /api/games/:id/ws — 实时对战
    const wsMatch = path.match(/^\/api\/games\/([a-zA-Z0-9]+)\/ws$/);
    if (wsMatch && request.headers.get("Upgrade") === "websocket") {
      const gameId = wsMatch[1];
      const token = url.searchParams.get("token") || "";

      const doId = env.GAME_ROOM.idFromName(gameId);
      const stub = env.GAME_ROOM.get(doId);

      const headers = new Headers(request.headers);
      headers.set("X-Player-Token", token);

      const modifiedRequest = new Request(request, { headers });
      return stub.fetch(modifiedRequest);
    }

    return json({ error: "Not Found" }, 404, corsHeaders);
  },
};

function generateGameId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function json(data: any, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
