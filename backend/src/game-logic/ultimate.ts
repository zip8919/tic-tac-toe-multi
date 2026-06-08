import {
  UltimateBoard, UltimateMove, UltimateContext, CellValue, LargeCellStatus, GameResult,
} from "../types";

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // 横
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // 竖
  [0, 4, 8], [2, 4, 6],             // 对角
];

export function createUltimateBoard(): UltimateBoard {
  return {
    smallCells: Array(81).fill(""),
    largeStatus: Array(9).fill(""),
  };
}

export function createInitialContext(): UltimateContext {
  return { nextLargeR: -1, nextLargeC: -1 }; // 先手任意
}

function globalIndex(largeR: number, largeC: number, smallR: number, smallC: number): number {
  return (largeR * 3 + smallR) * 9 + (largeC * 3 + smallC);
}

function largeCellIndex(largeR: number, largeC: number): number {
  return largeR * 3 + largeC;
}

export function isValidMove(
  board: UltimateBoard,
  move: UltimateMove,
  context: UltimateContext,
): boolean {
  const { largeR, largeC, smallR, smallC } = move;

  // 大格必须有效
  if (largeR < 0 || largeR > 2 || largeC < 0 || largeC > 2) return false;
  if (smallR < 0 || smallR > 2 || smallC < 0 || smallC > 2) return false;

  // 如果有限制，必须下在指定大格
  if (context.nextLargeR >= 0 && context.nextLargeC >= 0) {
    if (largeR !== context.nextLargeR || largeC !== context.nextLargeC) return false;
  }

  // 目标大格必须未完成（未被赢且未满）
  const lIdx = largeCellIndex(largeR, largeC);
  if (board.largeStatus[lIdx] !== "") return false;

  // 小格必须为空
  const idx = globalIndex(largeR, largeC, smallR, smallC);
  return board.smallCells[idx] === "";
}

export function applyMove(
  board: UltimateBoard,
  move: UltimateMove,
  player: number,
): { board: UltimateBoard; context: UltimateContext } {
  const { largeR, largeC, smallR, smallC } = move;
  const symbol: CellValue = player === 0 ? "X" : "O";
  const idx = globalIndex(largeR, largeC, smallR, smallC);

  const newSmallCells = [...board.smallCells];
  newSmallCells[idx] = symbol;

  // 检查该大格是否产生胜负
  const newLargeStatus: LargeCellStatus[] = [...board.largeStatus];
  const lIdx = largeCellIndex(largeR, largeC);
  const largeResult = checkLargeCellWin(newSmallCells, largeR, largeC, symbol);
  if (largeResult === "win") {
    newLargeStatus[lIdx] = symbol;
  } else if (largeResult === "draw") {
    newLargeStatus[lIdx] = "draw";
  }

  // 决定下一步目标大格
  const nextLIdx = largeCellIndex(smallR, smallC);
  let nextLargeR = smallR;
  let nextLargeC = smallC;
  if (newLargeStatus[nextLIdx] !== "") {
    // 目标大格已完成，下一步任意
    nextLargeR = -1;
    nextLargeC = -1;
  }

  return {
    board: { smallCells: newSmallCells, largeStatus: newLargeStatus },
    context: { nextLargeR, nextLargeC },
  };
}

// 检查某个大格内的胜负
function checkLargeCellWin(
  smallCells: CellValue[],
  largeR: number,
  largeC: number,
  lastSymbol: CellValue,
): "win" | "draw" | null {
  // 提取该大格内的 3x3
  const cells: CellValue[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const idx = globalIndex(largeR, largeC, r, c);
      cells.push(smallCells[idx]);
    }
  }

  for (const [a, b, c] of WIN_LINES) {
    if (cells[a] === lastSymbol && cells[b] === lastSymbol && cells[c] === lastSymbol) {
      return "win";
    }
  }

  if (cells.every(c => c !== "")) return "draw";
  return null;
}

export function checkGlobalResult(
  board: UltimateBoard,
): { winner: GameResult } {
  const { largeStatus } = board;

  for (const [a, b, c] of WIN_LINES) {
    if (largeStatus[a] !== "" && largeStatus[a] !== "draw" &&
        largeStatus[a] === largeStatus[b] && largeStatus[b] === largeStatus[c]) {
      return { winner: largeStatus[a] === "X" ? 0 : 1 };
    }
  }

  // 所有大格都完成但无人三连 → 平局
  if (largeStatus.every(s => s !== "")) return { winner: "draw" };

  return { winner: null };
}

// 获取当前可选的合法落子
export function getValidMoves(
  board: UltimateBoard,
  context: UltimateContext,
): UltimateMove[] {
  const moves: UltimateMove[] = [];

  const targetLargeCells: [number, number][] = [];
  if (context.nextLargeR >= 0 && context.nextLargeC >= 0) {
    targetLargeCells.push([context.nextLargeR, context.nextLargeC]);
  } else {
    for (let lr = 0; lr < 3; lr++) {
      for (let lc = 0; lc < 3; lc++) {
        if (board.largeStatus[largeCellIndex(lr, lc)] === "") {
          targetLargeCells.push([lr, lc]);
        }
      }
    }
  }

  for (const [lr, lc] of targetLargeCells) {
    for (let sr = 0; sr < 3; sr++) {
      for (let sc = 0; sc < 3; sc++) {
        const idx = globalIndex(lr, lc, sr, sc);
        if (board.smallCells[idx] === "") {
          moves.push({ largeR: lr, largeC: lc, smallR: sr, smallC: sc });
        }
      }
    }
  }

  return moves;
}
