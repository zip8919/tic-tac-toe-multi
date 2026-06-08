// ===== 共享类型定义 =====

export type GameMode = "classic" | "surface3d" | "ultimate";
export type GameStatus = "waiting" | "playing" | "finished";
export type CellValue = "" | "X" | "O";
export type LargeCellStatus = "" | "X" | "O" | "draw";
export type PlayerIndex = 0 | 1;
export type GameResult = PlayerIndex | "draw" | null;

export const PLAYER_SYMBOLS: [CellValue, CellValue] = ["X", "O"];

// 经典模式
export interface ClassicBoard {
  cells: CellValue[]; // length 9
}

export interface ClassicMove {
  index: number; // 0-8
}

// 三维表面模式
export interface Surface3DBoard {
  cells: CellValue[]; // length 27, index 13 (center) always ""
}

export interface Surface3DMove {
  x: number; // 0, 1, 2
  y: number; // 0, 1, 2
  z: number; // 0, 1, 2
}

// 套娃模式
export interface UltimateBoard {
  smallCells: CellValue[];  // length 81 (9x9)
  largeStatus: LargeCellStatus[]; // length 9 (3x3), "" | "X" | "O" | "draw"
}

export interface UltimateMove {
  largeR: number; // 大格行 0-2
  largeC: number; // 大格列 0-2
  smallR: number; // 小格行 0-2
  smallC: number; // 小格列 0-2
}

export interface UltimateContext {
  nextLargeR: number; // 下一步必须下的大格行 (-1 表示任意)
  nextLargeC: number; // 下一步必须下的大格列 (-1 表示任意)
}

// 联合类型
export type BoardState = ClassicBoard | Surface3DBoard | UltimateBoard;
export type Move = ClassicMove | Surface3DMove | UltimateMove;

// 游戏完整状态
export interface GameState {
  gameId: string;
  mode: GameMode;
  players: PlayerInfo[];
  board: BoardState;
  currentTurn: PlayerIndex;
  status: GameStatus;
  winner: GameResult;
  context?: UltimateContext; // 套娃模式额外信息
}

export interface PlayerInfo {
  id: string;
  name: string;
}

// WebSocket 消息
export type ClientMessage =
  | { type: "move"; move: Move }
  | { type: "ping" };

export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "error"; message: string }
  | { type: "joined"; opponent: PlayerInfo }
  | { type: "left" }
  | { type: "pong" };

// API 请求/响应
export interface CreateGameRequest {
  mode: GameMode;
  playerName: string;
}

export interface CreateGameResponse {
  gameId: string;
  playerToken: string;
}

export interface JoinGameRequest {
  playerName: string;
}

export interface JoinGameResponse {
  playerToken: string;
}
