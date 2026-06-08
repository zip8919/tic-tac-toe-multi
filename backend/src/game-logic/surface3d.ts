import { Surface3DBoard, Surface3DMove, CellValue, GameResult } from "../types";

const VALID_CELLS: boolean[] = Array(27).fill(true);
VALID_CELLS[13] = false; // 中心 (1,1,1) 不可用

const DIRECTIONS: [number, number, number][] = [];
for (let dx = -1; dx <= 1; dx++) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx !== 0 || dy !== 0 || dz !== 0) {
        DIRECTIONS.push([dx, dy, dz]);
      }
    }
  }
}

// 预计算所有有效连线
const WIN_LINES: number[][] = [];
(function precomputeLines() {
  const seen = new Set<string>();
  for (let z = 0; z < 3; z++) {
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (!isSurface(x, y, z)) continue;
        for (const [dx, dy, dz] of DIRECTIONS) {
          const x2 = x + dx, y2 = y + dy, z2 = z + dz;
          const x3 = x + 2 * dx, y3 = y + 2 * dy, z3 = z + 2 * dz;
          if (!inBounds(x2, y2, z2) || !inBounds(x3, y3, z3)) continue;
          if (!isSurface(x2, y2, z2) || !isSurface(x3, y3, z3)) continue;

          const i1 = toIndex(x, y, z);
          const i2 = toIndex(x2, y2, z2);
          const i3 = toIndex(x3, y3, z3);
          const key = [i1, i2, i3].sort((a, b) => a - b).join(",");
          if (!seen.has(key)) {
            seen.add(key);
            WIN_LINES.push([i1, i2, i3]);
          }
        }
      }
    }
  }
})();

function inBounds(x: number, y: number, z: number): boolean {
  return x >= 0 && x < 3 && y >= 0 && y < 3 && z >= 0 && z < 3;
}

function isSurface(x: number, y: number, z: number): boolean {
  return x === 0 || x === 2 || y === 0 || y === 2 || z === 0 || z === 2;
}

export function toIndex(x: number, y: number, z: number): number {
  return z * 9 + y * 3 + x;
}

export function fromIndex(index: number): { x: number; y: number; z: number } {
  const z = Math.floor(index / 9);
  const y = Math.floor((index % 9) / 3);
  const x = index % 3;
  return { x, y, z };
}

export function createSurface3DBoard(): Surface3DBoard {
  const cells: CellValue[] = Array(27).fill("");
  cells[13] = "invalid" as CellValue; // 标记为不可用（不是空字符串所以不会被落子）
  return { cells };
}

export function isValidMove(board: Surface3DBoard, move: Surface3DMove): boolean {
  const { x, y, z } = move;
  if (!inBounds(x, y, z)) return false;
  if (!isSurface(x, y, z)) return false;
  return board.cells[toIndex(x, y, z)] === "";
}

export function applyMove(board: Surface3DBoard, move: Surface3DMove, player: number): Surface3DBoard {
  const cells = [...board.cells];
  cells[toIndex(move.x, move.y, move.z)] = player === 0 ? "X" : "O";
  return { cells };
}

// 标记为不可用的格子
function isPlayable(board: Surface3DBoard, index: number): boolean {
  return board.cells[index] === "";
}

export function checkResult(board: Surface3DBoard, lastMove: Surface3DMove): { winner: GameResult } {
  const lastIdx = toIndex(lastMove.x, lastMove.y, lastMove.z);
  const symbol = board.cells[lastIdx];

  for (const line of WIN_LINES) {
    if (!line.includes(lastIdx)) continue;
    const [a, b, c] = line;
    if (board.cells[a] === symbol && board.cells[b] === symbol && board.cells[c] === symbol) {
      return { winner: symbol === "X" ? 0 : 1 };
    }
  }

  // 所有可落子位置都满了 → 平局
  const full = VALID_CELLS.every((_, i) => !VALID_CELLS[i] || board.cells[i] !== "");
  if (full) return { winner: "draw" };

  return { winner: null };
}

export function getValidMoves(board: Surface3DBoard): Surface3DMove[] {
  const moves: Surface3DMove[] = [];
  for (let i = 0; i < 27; i++) {
    if (VALID_CELLS[i] && board.cells[i] === "") {
      const { x, y, z } = fromIndex(i);
      moves.push({ x, y, z });
    }
  }
  return moves;
}
