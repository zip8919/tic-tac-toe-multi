import { DurableObject } from "cloudflare:workers";
import {
  GameMode, GameState, BoardState, Move, PlayerIndex,
  PlayerInfo, ServerMessage, UltimateContext, UltimateMove, CellValue,
} from "./types";
import { createClassicBoard, isValidMove as classicIsValid, applyMove as classicApply, checkResult as classicCheck } from "./game-logic/classic";
import { createSurface3DBoard, isValidMove as surfaceIsValid, applyMove as surfaceApply, checkResult as surfaceCheck, toIndex, fromIndex } from "./game-logic/surface3d";
import { createUltimateBoard, isValidMove as ultimateIsValid, applyMove as ultimateApply, checkGlobalResult, createInitialContext } from "./game-logic/ultimate";
import { ClassicBoard, Surface3DBoard, UltimateBoard, LargeCellStatus } from "./types";
import { Registry } from "./registry";

const HEARTBEAT_INTERVAL = 30_000;   // 心跳检查间隔 30 秒
const CONNECTION_TIMEOUT = 75_000;   // 75 秒无消息视为断线

interface Env {
  REGISTRY: DurableObjectNamespace<Registry>;
}

export class GameRoom extends DurableObject {
  private gameId!: string;
  private mode!: GameMode;
  private players: (PlayerInfo | null)[] = [null, null];
  private board!: BoardState;
  private currentTurn: PlayerIndex = 0;
  private status: "waiting" | "playing" | "finished" = "waiting";
  private winner: import("./types").GameResult = null;
  private context?: UltimateContext;
  private websockets: (WebSocket | null)[] = [null, null];
  private lastActivity: number[] = [0, 0]; // 各玩家最后活跃时间戳

  private get registry() {
    const env = this.env as unknown as Env;
    const doId = env.REGISTRY.idFromName("main");
    return env.REGISTRY.get(doId);
  }

  // === DO fetch（WebSocket 升级） ===
  async fetch(request: Request): Promise<Response> {
    const token = request.headers.get("X-Player-Token") || "";

    let playerIndex = -1;
    if (this.players[0] && this.players[0].id === token) playerIndex = 0;
    else if (this.players[1] && this.players[1].id === token) playerIndex = 1;

    if (playerIndex === -1) {
      return new Response("无效的玩家令牌", { status: 403 });
    }

    const pair = new WebSocketPair();
    this.handleWebSocket(pair[1], playerIndex);

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // === 对局生命周期 ===
  async createGame(gameId: string, mode: GameMode, playerName: string): Promise<string> {
    this.gameId = gameId;
    this.mode = mode;
    const playerToken = crypto.randomUUID();
    this.players[0] = { id: playerToken, name: playerName };

    switch (mode) {
      case "classic":        this.board = createClassicBoard(); break;
      case "surface3d":      this.board = createSurface3DBoard(); break;
      case "ultimate":       this.board = createUltimateBoard(); this.context = createInitialContext(); break;
    }

    await this.registry.register(this.gameId, this.mode);
    return playerToken;
  }

  async joinGame(playerName: string): Promise<string | null> {
    if (this.players[1] !== null) return null;
    const playerToken = crypto.randomUUID();
    this.players[1] = { id: playerToken, name: playerName };
    this.status = "playing";

    await this.registry.update(this.gameId, 2, "playing");
    this.broadcast({ type: "state", state: this.getState() });

    return playerToken;
  }

  getState(): GameState {
    return {
      gameId: this.gameId, mode: this.mode,
      players: this.players.filter(p => p !== null) as PlayerInfo[],
      board: this.board, currentTurn: this.currentTurn,
      status: this.status, winner: this.winner, context: this.context,
    };
  }

  // === WebSocket 处理 ===
  private async handleWebSocket(ws: WebSocket, playerIndex: number) {
    this.websockets[playerIndex] = ws;
    this.lastActivity[playerIndex] = Date.now();
    ws.accept();

    // 首次连接启动心跳定时器
    if (!this.websockets.some((_, i) => i !== playerIndex && this.websockets[i])) {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL);
    }

    ws.send(JSON.stringify({ type: "state", state: this.getState() } satisfies ServerMessage));

    if (playerIndex === 1 && this.players[1]) {
      this.sendTo(0, { type: "joined", opponent: this.players[1] } satisfies ServerMessage);
    }

    ws.addEventListener("message", (event) => {
      try {
        this.lastActivity[playerIndex] = Date.now();
        const msg = JSON.parse(event.data as string);
        this.handleMessage(playerIndex, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", message: "无效消息格式" } satisfies ServerMessage));
      }
    });

    ws.addEventListener("close", () => {
      this.websockets[playerIndex] = null;
      this.lastActivity[playerIndex] = 0;
      const otherIdx = playerIndex === 0 ? 1 : 0;
      this.sendTo(otherIdx, { type: "left" } satisfies ServerMessage);
    });

    ws.addEventListener("error", () => {
      this.websockets[playerIndex] = null;
      this.lastActivity[playerIndex] = 0;
    });
  }

  // === DO Alarm：心跳检查 ===
  async alarm(): Promise<void> {
    if (this.status === "finished") return;

    const now = Date.now();
    let hasActive = false;

    for (let i = 0; i < 2; i++) {
      const ws = this.websockets[i];
      if (!ws) continue;

      if (this.lastActivity[i] > 0 && now - this.lastActivity[i] > CONNECTION_TIMEOUT) {
        // 超时断线
        try { ws.close(4001, "心跳超时"); } catch (_) {}
        this.websockets[i] = null;
        this.lastActivity[i] = 0;
        const otherIdx = i === 0 ? 1 : 0;
        this.sendTo(otherIdx, { type: "left" } satisfies ServerMessage);
      } else {
        hasActive = true;
      }
    }

    // 还有活跃连接则继续检查
    if (hasActive) {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL);
    }
  }

  // === 消息处理 ===
  private handleMessage(playerIndex: number, msg: any) {
    if (msg.type === "ping") {
      this.sendTo(playerIndex, { type: "pong" } satisfies ServerMessage);
      return;
    }

    if (msg.type !== "move") {
      this.sendTo(playerIndex, { type: "error", message: "未知消息类型" } satisfies ServerMessage);
      return;
    }

    if (this.status !== "playing") {
      this.sendTo(playerIndex, { type: "error", message: "游戏未在进行中" } satisfies ServerMessage);
      return;
    }

    if (playerIndex !== this.currentTurn) {
      this.sendTo(playerIndex, { type: "error", message: "还没轮到你" } satisfies ServerMessage);
      return;
    }

    const move = msg.move as Move;
    if (!move) {
      this.sendTo(playerIndex, { type: "error", message: "缺少落子数据" } satisfies ServerMessage);
      return;
    }

    if (!this.validateMove(move)) {
      this.sendTo(playerIndex, { type: "error", message: "无效落子" } satisfies ServerMessage);
      return;
    }

    this.applyMoveLocal(move, playerIndex as PlayerIndex);
    this.broadcast({ type: "state", state: this.getState() });
  }

  // === 游戏逻辑 ===
  private validateMove(move: Move): boolean {
    switch (this.mode) {
      case "classic":    return classicIsValid(this.board as ClassicBoard, move as any);
      case "surface3d":  return surfaceIsValid(this.board as Surface3DBoard, move as any);
      case "ultimate":   return ultimateIsValid(this.board as UltimateBoard, move as UltimateMove, this.context!);
    }
  }

  private applyMoveLocal(move: Move, player: PlayerIndex) {
    switch (this.mode) {
      case "classic": {
        const nb = classicApply(this.board as ClassicBoard, move as any, player);
        this.board = nb;
        this.processResult(classicCheck(nb, move as any));
        break;
      }
      case "surface3d": {
        const nb = surfaceApply(this.board as Surface3DBoard, move as any, player);
        this.board = nb;
        this.processResult(surfaceCheck(nb, move as any));
        break;
      }
      case "ultimate": {
        const { board: nb, context: nc } = ultimateApply(this.board as UltimateBoard, move as UltimateMove, player);
        this.board = nb; this.context = nc;
        this.processResult(checkGlobalResult(nb));
        break;
      }
    }
  }

  private processResult(result: { winner: import("./types").GameResult }) {
    if (result.winner !== null) {
      this.status = "finished";
      this.winner = result.winner;
      this.registry.deregister(this.gameId).catch(() => {});
    } else {
      this.currentTurn = this.currentTurn === 0 ? 1 : 0;
    }
  }

  // ========================
  // ===  Admin 方法  =======
  // ========================

  adminGetState(): GameState {
    return this.getState();
  }

  async adminForce(action: string, params: any): Promise<{ ok: boolean; message: string }> {
    switch (action) {

      // --- 逐格修改棋子 ---
      case "set_cell": {
        const value = params.value as CellValue;
        if (value !== "" && value !== "X" && value !== "O") {
          return { ok: false, message: "value 必须是 ''、'X' 或 'O'" };
        }

        switch (this.mode) {
          case "classic": {
            const idx = params.index as number;
            if (idx < 0 || idx > 8) return { ok: false, message: "index 必须 0-8" };
            (this.board as ClassicBoard).cells[idx] = value;
            break;
          }
          case "surface3d": {
            let idx: number;
            if (params.index != null) {
              idx = params.index;
            } else if (params.x != null && params.y != null && params.z != null) {
              idx = toIndex(params.x, params.y, params.z);
            } else {
              return { ok: false, message: "需要 index 或 x,y,z" };
            }
            if (idx === 13) return { ok: false, message: "中心格不可修改" };
            (this.board as Surface3DBoard).cells[idx] = value;
            break;
          }
          case "ultimate": {
            const { largeR, largeC, smallR, smallC } = params;
            if (largeR == null || largeC == null || smallR == null || smallC == null) {
              return { ok: false, message: "需要 largeR, largeC, smallR, smallC" };
            }
            const idx = (largeR * 3 + smallR) * 9 + (largeC * 3 + smallC);
            (this.board as UltimateBoard).smallCells[idx] = value;

            // 重新评估该大格状态
            const ub = this.board as UltimateBoard;
            const lIdx = largeR * 3 + largeC;
            const result = this.evaluateLargeCell(ub, largeR, largeC);
            ub.largeStatus[lIdx] = result;
            // 也重新评估全局
            const global = checkGlobalResult(ub);
            if (global.winner !== null) {
              this.status = "finished";
              this.winner = global.winner;
              this.registry.deregister(this.gameId).catch(() => {});
            }
            break;
          }
        }

        this.broadcast({ type: "state", state: this.getState() });
        return { ok: true, message: `已设置格子值为 ${value || '(空)'}` };
      }

      // --- 整盘覆写 ---
      case "set_board": {
        if (this.mode === "ultimate") {
          this.board = params as UltimateBoard;
        } else {
          this.board = { cells: params.cells || params } as ClassicBoard | Surface3DBoard;
        }
        this.broadcast({ type: "state", state: this.getState() });
        return { ok: true, message: "棋盘已更新" };
      }

      // --- 切换回合 ---
      case "set_turn": {
        const turn = params.turn as number;
        if (turn !== 0 && turn !== 1) return { ok: false, message: "turn 必须为 0 或 1" };
        this.currentTurn = turn;
        this.broadcast({ type: "state", state: this.getState() });
        return { ok: true, message: `回合已切换至玩家 ${turn}` };
      }

      // --- 强制结束 ---
      case "force_winner": {
        const w = params.winner;
        if (w !== 0 && w !== 1 && w !== "draw") return { ok: false, message: "winner 必须为 0、1 或 'draw'" };
        this.status = "finished"; this.winner = w;
        this.registry.deregister(this.gameId).catch(() => {});
        this.broadcast({ type: "state", state: this.getState() });
        return { ok: true, message: `已强制结束，胜者: ${w}` };
      }

      // --- 踢出玩家 ---
      case "kick_player": {
        const idx = params.playerIndex as number;
        if (idx !== 0 && idx !== 1) return { ok: false, message: "playerIndex 必须为 0 或 1" };
        if (this.players[idx]) this.players[idx] = null;
        if (this.websockets[idx]) {
          try { this.websockets[idx]!.close(); } catch (_) {}
          this.websockets[idx] = null;
        }
        this.status = "finished"; this.winner = idx === 0 ? 1 : 0;
        this.registry.deregister(this.gameId).catch(() => {});
        this.broadcast({ type: "state", state: this.getState() });
        return { ok: true, message: `玩家 ${idx} 已被踢出` };
      }

      // --- 重置 ---
      case "reset": {
        switch (this.mode) {
          case "classic":   this.board = createClassicBoard(); break;
          case "surface3d": this.board = createSurface3DBoard(); break;
          case "ultimate":  this.board = createUltimateBoard(); this.context = createInitialContext(); break;
        }
        this.currentTurn = 0; this.status = "playing"; this.winner = null;
        this.broadcast({ type: "state", state: this.getState() });
        return { ok: true, message: "对局已重置" };
      }

      default:
        return { ok: false, message: `未知操作: ${action}。可用: set_cell, set_board, set_turn, force_winner, kick_player, reset` };
    }
  }

  // 重新评估一个大格的胜负/平局
  private evaluateLargeCell(board: UltimateBoard, lr: number, lc: number): LargeCellStatus {
    const cells: CellValue[] = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        cells.push(board.smallCells[(lr * 3 + r) * 9 + (lc * 3 + c)]);

    const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a, b, c] of LINES) {
      const s = cells[a];
      if (s !== "" && s === cells[b] && s === cells[c]) return s;
    }
    if (cells.every(c => c !== "")) return "draw";
    return "";
  }

  // === 消息广播 ===
  private broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg);
    for (const ws of this.websockets) {
      if (ws) { try { ws.send(data); } catch (_) {} }
    }
  }

  private sendTo(playerIndex: number, msg: ServerMessage) {
    const ws = this.websockets[playerIndex];
    if (ws) { try { ws.send(JSON.stringify(msg)); } catch (_) {} }
  }
}
