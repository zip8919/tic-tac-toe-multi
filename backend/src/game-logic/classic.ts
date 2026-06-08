import { ClassicBoard, ClassicMove, CellValue, GameResult, PlayerIndex } from "../types";

const WIN_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // 横
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // 竖
  [0, 4, 8], [2, 4, 6],             // 对角
];

export function createClassicBoard(): ClassicBoard {
  return { cells: Array(9).fill("") };
}

export function isValidMove(board: ClassicBoard, move: ClassicMove): boolean {
  return move.index >= 0 && move.index < 9 && board.cells[move.index] === "";
}

export function applyMove(board: ClassicBoard, move: ClassicMove, player: number): ClassicBoard {
  const cells = [...board.cells];
  cells[move.index] = player === 0 ? "X" : "O";
  return { cells };
}

export function checkResult(board: ClassicBoard, lastMove: ClassicMove): { winner: GameResult } {
  const { cells } = board;
  const symbol = cells[lastMove.index];

  for (const line of WIN_LINES) {
    if (line.includes(lastMove.index)) {
      if (cells[line[0]] === symbol && cells[line[1]] === symbol && cells[line[2]] === symbol) {
        return { winner: symbol === "X" ? 0 : 1 };
      }
    }
  }

  if (cells.every(c => c !== "")) {
    return { winner: "draw" };
  }

  return { winner: null };
}

export function getValidMoves(board: ClassicBoard): ClassicMove[] {
  const moves: ClassicMove[] = [];
  for (let i = 0; i < 9; i++) {
    if (board.cells[i] === "") {
      moves.push({ index: i });
    }
  }
  return moves;
}
