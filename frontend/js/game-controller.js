// 游戏控制器：管理对局状态、回合、胜负判定

export class GameController {
  constructor(mode, playType, options = {}) {
    this.mode = mode;         // "classic" | "surface3d" | "ultimate"
    this.playType = playType; // "local" | "online" | "ai"
    this.playerNames = options.playerNames || ["玩家1 (✕)", "玩家2 (◯)"];
    this.currentTurn = 0; // 0 = X, 1 = O
    this.status = playType === "online" ? "waiting" : "playing";
    this.winner = null;
    this.board = null;
    this.context = null; // ultimate 模式的额外信息

    // 在线模式
    this.ws = options.ws || null;
    this.playerIndex = options.playerIndex ?? 0;

    // 回调
    this.onStateChange = options.onStateChange || (() => {});

    this.initBoard();
  }

  initBoard() {
    switch (this.mode) {
      case "classic":
        this.board = Array(9).fill("");
        break;
      case "surface3d": {
        const cells = Array(27).fill("");
        cells[13] = "invalid";
        this.board = cells;
        break;
      }
      case "ultimate":
        this.board = {
          smallCells: Array(81).fill(""),
          largeStatus: Array(9).fill(""),
        };
        this.context = { nextLargeR: -1, nextLargeC: -1 };
        break;
    }
  }

  getSymbol(playerIdx) {
    return playerIdx === 0 ? "X" : "O";
  }

  getPlayerName(playerIdx) {
    return this.playerNames[playerIdx];
  }

  // 本地/离线模式：尝试落子
  tryLocalMove(move) {
    if (this.status !== "playing") return false;
    if (this.playType === "online") return false;

    if (!this.isValidMoveLocal(move)) return false;

    this.applyMoveLocal(move);
    this.onStateChange();
    return true;
  }

  // 在线模式：服务端驱动
  applyServerState(state) {
    // 服务端 classic/surface3d 的 board 格式为 { cells: [...] }，前端直接使用 cells 数组
    // ultimate 格式 { smallCells, largeStatus } 跟前端一致
    if (this.mode === "ultimate") {
      this.board = state.board;
    } else {
      this.board = state.board.cells;
    }
    this.currentTurn = state.currentTurn;
    this.status = state.status;
    this.winner = state.winner;
    if (state.context) this.context = state.context;
    if (state.players) {
      for (let i = 0; i < state.players.length && i < 2; i++) {
        this.playerNames[i] = state.players[i].name;
      }
    }
    this.onStateChange();
  }

  isValidMoveLocal(move) {
    switch (this.mode) {
      case "classic":
        return move.index >= 0 && move.index < 9 && this.board[move.index] === "";

      case "surface3d": {
        const { x, y, z } = move;
        if (x < 0 || x > 2 || y < 0 || y > 2 || z < 0 || z > 2) return false;
        if (x === 1 && y === 1 && z === 1) return false;
        if (!(x === 0 || x === 2 || y === 0 || y === 2 || z === 0 || z === 2)) return false;
        const idx = z * 9 + y * 3 + x;
        return this.board[idx] === "";
      }

      case "ultimate": {
        const { largeR, largeC, smallR, smallC } = move;
        if (largeR < 0 || largeR > 2 || largeC < 0 || largeC > 2) return false;
        if (smallR < 0 || smallR > 2 || smallC < 0 || smallC > 2) return false;
        if (this.context && this.context.nextLargeR >= 0) {
          if (largeR !== this.context.nextLargeR || largeC !== this.context.nextLargeC) return false;
        }
        const lIdx = largeR * 3 + largeC;
        if (this.board.largeStatus[lIdx] !== "") return false;
        const idx = (largeR * 3 + smallR) * 9 + (largeC * 3 + smallC);
        return this.board.smallCells[idx] === "";
      }
    }
    return false;
  }

  applyMoveLocal(move) {
    const symbol = this.getSymbol(this.currentTurn);

    switch (this.mode) {
      case "classic": {
        this.board[move.index] = symbol;
        const winner = this.checkClassicWin(this.board, move.index);
        this.processResult(winner);
        break;
      }
      case "surface3d": {
        const idx = move.z * 9 + move.y * 3 + move.x;
        this.board[idx] = symbol;
        const winner = this.checkSurfaceWin(this.board, idx);
        this.processResult(winner);
        break;
      }
      case "ultimate": {
        const { largeR, largeC, smallR, smallC } = move;
        const idx = (largeR * 3 + smallR) * 9 + (largeC * 3 + smallC);
        this.board.smallCells[idx] = symbol;

        // 检查大格胜负
        const lIdx = largeR * 3 + largeC;
        const largeResult = this.checkLargeWin(this.board.smallCells, largeR, largeC, symbol);
        if (largeResult === "win") {
          this.board.largeStatus[lIdx] = symbol;
        } else if (largeResult === "draw") {
          this.board.largeStatus[lIdx] = "draw";
        }

        // 全局胜负
        const globalWinner = this.checkUltimateGlobalWin(this.board.largeStatus);
        if (globalWinner !== null) {
          this.processResult(globalWinner);
        } else {
          // 更新目标大格
          const nextLIdx = smallR * 3 + smallC;
          if (this.board.largeStatus[nextLIdx] !== "") {
            this.context = { nextLargeR: -1, nextLargeC: -1 };
          } else {
            this.context = { nextLargeR: smallR, nextLargeC: smallC };
          }
          this.currentTurn = this.currentTurn === 0 ? 1 : 0;
        }
        break;
      }
    }
  }

  processResult(winner) {
    if (winner !== null) {
      this.status = "finished";
      this.winner = winner;
    } else {
      this.currentTurn = this.currentTurn === 0 ? 1 : 0;
    }
  }

  // === 经典模式胜负判定 ===
  static WIN_LINES_9 = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];

  checkClassicWin(board, lastIdx) {
    const symbol = board[lastIdx];
    for (const [a, b, c] of GameController.WIN_LINES_9) {
      if ((a === lastIdx || b === lastIdx || c === lastIdx) &&
          board[a] === symbol && board[b] === symbol && board[c] === symbol) {
        return symbol === "X" ? 0 : 1;
      }
    }
    if (board.every(c => c !== "")) return "draw";
    return null;
  }

  // === 三维表面胜负判定 ===
  // 预计算（与后端一致）
  static SURFACE_WIN_LINES = (() => {
    const dirs = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          if (dx !== 0 || dy !== 0 || dz !== 0) dirs.push([dx, dy, dz]);

    const seen = new Set();
    const lines = [];
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          if (x === 1 && y === 1 && z === 1) continue;
          const onSurface = x === 0 || x === 2 || y === 0 || y === 2 || z === 0 || z === 2;
          if (!onSurface) continue;
          for (const [dx, dy, dz] of dirs) {
            const x2 = x + dx, y2 = y + dy, z2 = z + dz;
            const x3 = x + 2*dx, y3 = y + 2*dy, z3 = z + 2*dz;
            if ([x2,y2,z2,x3,y3,z3].some(v => v < 0 || v > 2)) continue;
            const s2 = x2===0||x2===2||y2===0||y2===2||z2===0||z2===2;
            const s3 = x3===0||x3===2||y3===0||y3===2||z3===0||z3===2;
            if (!s2 || !s3) continue;
            const i1 = z*9+y*3+x, i2 = z2*9+y2*3+x2, i3 = z3*9+y3*3+x3;
            const key = [i1,i2,i3].sort((a,b)=>a-b).join(",");
            if (!seen.has(key)) { seen.add(key); lines.push([i1,i2,i3]); }
          }
        }
      }
    }
    return lines;
  })();

  checkSurfaceWin(board, lastIdx) {
    const symbol = board[lastIdx];
    for (const [a, b, c] of GameController.SURFACE_WIN_LINES) {
      if ((a === lastIdx || b === lastIdx || c === lastIdx) &&
          board[a] === symbol && board[b] === symbol && board[c] === symbol) {
        return symbol === "X" ? 0 : 1;
      }
    }
    if (board.every((c, i) => c !== "" || i === 13)) return "draw";
    return null;
  }

  // === 套娃模式胜负判定 ===
  checkLargeWin(smallCells, largeR, largeC, symbol) {
    const cells = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        cells.push(smallCells[(largeR*3+r)*9 + (largeC*3+c)]);

    for (const [a, b, c] of GameController.WIN_LINES_9) {
      if (cells[a] === symbol && cells[b] === symbol && cells[c] === symbol) return "win";
    }
    if (cells.every(c => c !== "")) return "draw";
    return null;
  }

  checkUltimateGlobalWin(largeStatus) {
    for (const [a, b, c] of GameController.WIN_LINES_9) {
      if (largeStatus[a] !== "" && largeStatus[a] !== "draw" &&
          largeStatus[a] === largeStatus[b] && largeStatus[b] === largeStatus[c]) {
        return largeStatus[a] === "X" ? 0 : 1;
      }
    }
    if (largeStatus.every(s => s !== "")) return "draw";
    return null;
  }

  // 获取合法落子列表（AI用）
  getValidMoves() {
    if (this.status !== "playing") return [];
    const moves = [];

    switch (this.mode) {
      case "classic":
        for (let i = 0; i < 9; i++) if (this.board[i] === "") moves.push({ index: i });
        break;
      case "surface3d":
        for (let z = 0; z < 3; z++)
          for (let y = 0; y < 3; y++)
            for (let x = 0; x < 3; x++) {
              if (x === 1 && y === 1 && z === 1) continue;
              if (!(x === 0 || x === 2 || y === 0 || y === 2 || z === 0 || z === 2)) continue;
              if (this.board[z*9+y*3+x] === "") moves.push({ x, y, z });
            }
        break;
      case "ultimate": {
        const ctx = this.context || { nextLargeR: -1, nextLargeC: -1 };
        const targets = [];
        if (ctx.nextLargeR >= 0) {
          targets.push([ctx.nextLargeR, ctx.nextLargeC]);
        } else {
          for (let lr = 0; lr < 3; lr++)
            for (let lc = 0; lc < 3; lc++)
              if (this.board.largeStatus[lr*3+lc] === "") targets.push([lr, lc]);
        }
        for (const [lr, lc] of targets)
          for (let sr = 0; sr < 3; sr++)
            for (let sc = 0; sc < 3; sc++)
              if (this.board.smallCells[(lr*3+sr)*9 + (lc*3+sc)] === "")
                moves.push({ largeR: lr, largeC: lc, smallR: sr, smallC: sc });
        break;
      }
    }
    return moves;
  }

  // 获取胜利连线（高亮用）
  getWinningCells() {
    if (!this.winner || this.winner === "draw") return [];
    const symbol = this.winner === 0 ? "X" : "O";

    switch (this.mode) {
      case "classic": {
        for (const [a, b, c] of GameController.WIN_LINES_9) {
          if (this.board[a] === symbol && this.board[b] === symbol && this.board[c] === symbol) {
            return [a, b, c];
          }
        }
        break;
      }
      case "surface3d": {
        for (const [a, b, c] of GameController.SURFACE_WIN_LINES) {
          if (this.board[a] === symbol && this.board[b] === symbol && this.board[c] === symbol) {
            return [a, b, c];
          }
        }
        break;
      }
      case "ultimate": {
        // 宏观大格三连
        const ls = this.board.largeStatus;
        for (const [a, b, c] of GameController.WIN_LINES_9) {
          if (ls[a] === symbol && ls[b] === symbol && ls[c] === symbol) {
            return [a, b, c]; // 大格索引
          }
        }
        break;
      }
    }
    return [];
  }
}
