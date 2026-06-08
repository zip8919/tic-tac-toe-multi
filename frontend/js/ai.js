// ============================================================
// AI 引擎 v2：支持 3 种模式 x 4 个难度
// 难度: 0=随机 1=启发式 2=浅层Minimax 3=深层Minimax
// 优化: Killer move + 快速排序 + 分叉检测 + 深搜索
// ============================================================

const DIFFICULTY_NAMES = ["简单", "普通", "困难", "地狱"];

// 各模式各难度的搜索深度（v2: 加深 surface3d 和 ultimate）
const DEPTHS = {
  classic:   [0, 0, 4, 9],
  surface3d: [0, 0, 3, 5],
  ultimate:  [0, 0, 2, 3],
};

// Killer moves: 每个深度保存 2 个引发 beta 截断的着法
// alpha-beta 剪枝效率关键
let KILLERS = {};

function resetKillers() {
  KILLERS = {};
}

function pushKiller(depth, move) {
  const d = String(depth);
  if (!KILLERS[d]) KILLERS[d] = [];
  const k = KILLERS[d];
  // 不重复
  if (k.length > 0 && moveEqual(k[0], move)) return;
  k.unshift(cloneMove(move));
  if (k.length > 2) k.length = 2;
}

function isKiller(move, depth) {
  const k = KILLERS[String(depth)] || [];
  return k.some(km => moveEqual(km, move));
}

function cloneMove(m) {
  if (!m) return null;
  return Object.assign({}, m);
}

function moveEqual(a, b) {
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

// ============ 经典模式 ============
const CLASSIC_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function evaluateClassic(board, player) {
  const ai = player === 0 ? "X" : "O";
  const opp = player === 0 ? "O" : "X";

  for (const [a,b,c] of CLASSIC_LINES) {
    if (board[a] === ai && board[b] === ai && board[c] === ai) return 1000;
    if (board[a] === opp && board[b] === opp && board[c] === opp) return -1000;
  }
  if (board.every(c => c !== "")) return 0;

  let score = 0;
  for (const [a,b,c] of CLASSIC_LINES) {
    const vals = [board[a], board[b], board[c]];
    const aiCount = vals.filter(v => v === ai).length;
    const oppCount = vals.filter(v => v === opp).length;
    if (aiCount > 0 && oppCount === 0) score += aiCount * aiCount;
    if (oppCount > 0 && aiCount === 0) score -= oppCount * oppCount;
  }
  if (board[4] === ai) score += 3;
  else if (board[4] === opp) score -= 3;
  for (const i of [0,2,6,8]) {
    if (board[i] === ai) score += 1;
    else if (board[i] === opp) score -= 1;
  }
  return score;
}

// ============ 三维表面模式 ============
const SURFACE_LINES = (() => {
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
        if (x===1 && y===1 && z===1) continue;
        if (!(x===0||x===2||y===0||y===2||z===0||z===2)) continue;
        for (const [dx,dy,dz] of dirs) {
          const x2=x+dx,y2=y+dy,z2=z+dz, x3=x+2*dx,y3=y+2*dy,z3=z+2*dz;
          if ([x2,y2,z2,x3,y3,z3].some(v => v<0||v>2)) continue;
          if (!(x2===0||x2===2||y2===0||y2===2||z2===0||z2===2)) continue;
          if (!(x3===0||x3===2||y3===0||y3===2||z3===0||z3===2)) continue;
          const i1=z*9+y*3+x, i2=z2*9+y2*3+x2, i3=z3*9+y3*3+x3;
          const key = [i1,i2,i3].sort((a,b)=>a-b).join(",");
          if (!seen.has(key)) { seen.add(key); lines.push([i1,i2,i3]); }
        }
      }
    }
  }
  return lines;
})();

const SURFACE_CENTER_WEIGHTS = (() => {
  // 面中心 (每面中心格) 权重 3，边线中点权重 2，角权重 1
  const w = Array(27).fill(0);
  for (let z = 0; z < 3; z++)
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        if (x===1 && y===1 && z===1) continue;
        if (!(x===0||x===2||y===0||y===2||z===0||z===2)) continue;
        const idx = z*9 + y*3 + x;
        const onFace = (x===0)+(x===2)+(y===0)+(y===2)+(z===0)+(z===2);
        if (onFace >= 2) w[idx] = 3; // 棱 (eg x=0,y=0 on z face)
        else if (onFace === 1) w[idx] = 2; // 面内部非中心
        else w[idx] = 4; // 面中心 eg (0,1,1)
      }
  // 调整：在多个面的交点 = 高价值
  w[0]=w[2]=w[6]=w[8]=w[18]=w[20]=w[24]=w[26] = 5; // 8 个角格
  return w;
})();

function evaluateSurface3D(board, player) {
  const ai = player === 0 ? "X" : "O";
  const opp = player === 0 ? "O" : "X";

  for (const [a,b,c] of SURFACE_LINES) {
    if (board[a] === ai && board[b] === ai && board[c] === ai) return 10000;
    if (board[a] === opp && board[b] === opp && board[c] === opp) return -10000;
  }
  if (board.every((c, i) => c !== "" || i === 13)) return 0;

  let score = 0;
  // 线潜力评估
  for (const [a,b,c] of SURFACE_LINES) {
    const aiCount = (board[a]===ai?1:0)+(board[b]===ai?1:0)+(board[c]===ai?1:0);
    const oppCount = (board[a]===opp?1:0)+(board[b]===opp?1:0)+(board[c]===opp?1:0);
    if (aiCount > 0 && oppCount === 0) score += aiCount * aiCount * 4;
    if (oppCount > 0 && aiCount === 0) score -= oppCount * oppCount * 4;
  }

  // 分叉检测：己方在两条不同线上各有 2 子且有空位
  let forks = 0;
  const aiLines2 = [];
  const oppLines2 = [];
  for (const [a,b,c] of SURFACE_LINES) {
    const aiC = (board[a]===ai?1:0)+(board[b]===ai?1:0)+(board[c]===ai?1:0);
    const oppC = (board[a]===opp?1:0)+(board[b]===opp?1:0)+(board[c]===opp?1:0);
    if (aiC === 2 && oppC === 0) {
      const cells = [a,b,c].filter(i => board[i] !== ai);
      aiLines2.push({ cells, emptyIdx: cells[0] });
    }
    if (oppC === 2 && aiC === 0) {
      const cells = [a,b,c].filter(i => board[i] !== opp);
      oppLines2.push({ cells, emptyIdx: cells[0] });
    }
  }
  // 共享同一空位的两条线 = 分叉（对手无法同时阻挡）
  for (let i = 0; i < aiLines2.length; i++) {
    for (let j = i+1; j < aiLines2.length; j++) {
      if (aiLines2[i].emptyIdx === aiLines2[j].emptyIdx) {
        forks++;
      }
    }
  }
  score += forks * 80;

  forks = 0;
  for (let i = 0; i < oppLines2.length; i++) {
    for (let j = i+1; j < oppLines2.length; j++) {
      if (oppLines2[i].emptyIdx === oppLines2[j].emptyIdx) {
        forks++;
      }
    }
  }
  score -= forks * 80;

  // 位置权重
  for (let i = 0; i < 27; i++) {
    if (i === 13) continue;
    if (board[i] === ai) score += SURFACE_CENTER_WEIGHTS[i] * 2;
    else if (board[i] === opp) score -= SURFACE_CENTER_WEIGHTS[i] * 2;
  }

  return score;
}

// ============ 套娃模式 ============
const ULTIMATE_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function evaluateUltimate(board, player) {
  const ai = player === 0 ? "X" : "O";
  const opp = player === 0 ? "O" : "X";
  const ls = board.largeStatus;

  for (const [a,b,c] of ULTIMATE_LINES) {
    if (ls[a] === ai && ls[b] === ai && ls[c] === ai) return 100000;
    if (ls[a] === opp && ls[b] === opp && ls[c] === opp) return -100000;
  }
  if (ls.every(s => s !== "")) return 0;

  let score = 0;

  // 大格胜负值
  for (let i = 0; i < 9; i++) {
    if (ls[i] === ai) score += 3000;
    else if (ls[i] === opp) score -= 3000;
  }

  // 大格内局势 + 战略评估
  for (let lr = 0; lr < 3; lr++) {
    for (let lc = 0; lc < 3; lc++) {
      const lIdx = lr * 3 + lc;
      if (ls[lIdx] !== "") continue;

      const cells = [];
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          cells.push(board.smallCells[(lr*3+r)*9+(lc*3+c)]);

      // 小格线威胁
      for (const [a,b,c_] of ULTIMATE_LINES) {
        const vals = [cells[a], cells[b], cells[c_]];
        const aiC = vals.filter(v => v === ai).length;
        const oppC = vals.filter(v => v === opp).length;
        if (aiC === 2 && oppC === 0) score += 150;
        if (oppC === 2 && aiC === 0) score -= 150;
        if (aiC === 1 && oppC === 0) score += 15;
        if (oppC === 1 && aiC === 0) score -= 15;
      }

      // 小中心控制
      if (cells[4] === ai) score += 20;
      else if (cells[4] === opp) score -= 20;

      // 评估该大格"谁更可能赢"：我方棋子数 vs 对方棋子数
      const aiTotal = cells.filter(v => v === ai).length;
      const oppTotal = cells.filter(v => v === opp).length;
      score += (aiTotal - oppTotal) * 8;
    }
  }

  // 全局中心大格控制
  if (ls[4] === ai) score += 500;
  else if (ls[4] === opp) score -= 500;

  // 评估正在通往中心的大格
  if (ls[4] === "") {
    const centerCells = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        centerCells.push(board.smallCells[(1*3+r)*9+(1*3+c)]);
    const cAi = centerCells.filter(v => v === ai).length;
    const cOpp = centerCells.filter(v => v === opp).length;
    score += (cAi - cOpp) * 30;
  }

  return score;
}

// ============ 通用终局/合法着法/模拟落子 ============

function getTerminalScore(mode, board) {
  switch (mode) {
    case "classic": {
      for (const [a,b,c] of CLASSIC_LINES) {
        if (board[a] !== "" && board[a] === board[b] && board[b] === board[c])
          return board[a] === "X" ? 1000 : -1000;
      }
      if (board.every(c => c !== "")) return 0;
      return null;
    }
    case "surface3d": {
      for (const [a,b,c] of SURFACE_LINES) {
        if (board[a] !== "" && board[a] === board[b] && board[b] === board[c])
          return board[a] === "X" ? 10000 : -10000;
      }
      if (board.every((c, i) => c !== "" || i === 13)) return 0;
      return null;
    }
    case "ultimate": {
      const ls = board.largeStatus;
      for (const [a,b,c] of ULTIMATE_LINES) {
        if (ls[a] !== "" && ls[a] !== "draw" && ls[a] === ls[b] && ls[b] === ls[c])
          return ls[a] === "X" ? 100000 : -100000;
      }
      if (ls.every(s => s !== "")) return 0;
      return null;
    }
    default: return null;
  }
}

function getValidMovesAI(mode, board, context) {
  switch (mode) {
    case "classic": {
      const moves = [];
      for (let i = 0; i < 9; i++) if (board[i] === "") moves.push({ index: i });
      return moves;
    }
    case "surface3d": {
      const moves = [];
      for (let z = 0; z < 3; z++)
        for (let y = 0; y < 3; y++)
          for (let x = 0; x < 3; x++) {
            if (x===1 && y===1 && z===1) continue;
            if (!(x===0||x===2||y===0||y===2||z===0||z===2)) continue;
            if (board[z*9+y*3+x] === "") moves.push({ x, y, z });
          }
      return moves;
    }
    case "ultimate": {
      const ctx = context || { nextLargeR: -1, nextLargeC: -1 };
      const targets = ctx.nextLargeR >= 0
        ? [[ctx.nextLargeR, ctx.nextLargeC]]
        : (() => {
            const t = [];
            for (let lr=0; lr<3; lr++)
              for (let lc=0; lc<3; lc++)
                if (board.largeStatus[lr*3+lc]==="") t.push([lr,lc]);
            return t;
          })();
      const moves = [];
      for (const [lr, lc] of targets) {
        for (let sr = 0; sr < 3; sr++)
          for (let sc = 0; sc < 3; sc++)
            if (board.smallCells[(lr*3+sr)*9+(lc*3+sc)] === "")
              moves.push({ largeR: lr, largeC: lc, smallR: sr, smallC: sc });
      }
      return moves;
    }
    default: return [];
  }
}

function applyMoveAI(mode, board, move, player, context) {
  const symbol = player === 0 ? "X" : "O";
  switch (mode) {
    case "classic": {
      const cells = [...board];
      cells[move.index] = symbol;
      return { board: cells, context: null };
    }
    case "surface3d": {
      const cells = [...board];
      cells[move.z*9+move.y*3+move.x] = symbol;
      return { board: cells, context: null };
    }
    case "ultimate": {
      const { largeR, largeC, smallR, smallC } = move;
      const smallCells = [...board.smallCells];
      smallCells[(largeR*3+smallR)*9+(largeC*3+smallC)] = symbol;

      const largeStatus = [...board.largeStatus];
      const lIdx = largeR*3+largeC;
      const cellVals = [];
      for (let r=0;r<3;r++) for(let c=0;c<3;c++)
        cellVals.push(smallCells[(largeR*3+r)*9+(largeC*3+c)]);

      let largeWon = false;
      for (const [a,b,c_] of ULTIMATE_LINES) {
        if (cellVals[a] !== "" && cellVals[a] === cellVals[b] && cellVals[b] === cellVals[c_]) {
          largeStatus[lIdx] = cellVals[a]; largeWon = true; break;
        }
      }
      if (!largeWon && cellVals.every(v => v !== "")) largeStatus[lIdx] = "draw";

      let nextLR = smallR, nextLC = smallC;
      if (largeStatus[smallR*3+smallC] !== "") { nextLR = -1; nextLC = -1; }

      return {
        board: { smallCells, largeStatus },
        context: { nextLargeR: nextLR, nextLargeC: nextLC }
      };
    }
    default: return { board, context };
  }
}

// ============ 快速着法排序（v2: 替换昂贵的 heuristic eval） ============

function quickMoveScore(mode, board, move, player) {
  const opp = 1 - player;
  let s = 0;

  // 将 X=正/O=负 的终局分数转为当前玩家视角
  function termForPlayer(ts) {
    if (ts === null) return null;
    return player === 0 ? ts : -ts;
  }

  // 1. 检查自己落子后是否直接赢（终局）
  const myResult = applyMoveAI(mode, board, move, player, null);
  const myTerm = termForPlayer(getTerminalScore(mode, myResult.board));
  if (myTerm !== null && myTerm > 500) s += 10000;
  else if (myTerm === 0) s += 0; // 落子后平局，非最优

  // 2. 检查阻挡对手（模拟对手在此落子是否能赢）
  // 对手赢 = 对我方极不利 → 如果 oppTerm > 500（对手有利），必须阻挡
  const oppResult = applyMoveAI(mode, board, move, opp, null);
  const oppTerm = termForPlayer(getTerminalScore(mode, oppResult.board));
  if (oppTerm !== null && oppTerm < -500) s += 9000; // 对手将赢，必须阻挡

  // 3. 中心/战略位置权重（轻量）
  if (mode === "classic") {
    if (move.index === 4) s += 30;
    else if ([0,2,6,8].includes(move.index)) s += 20;
    else s += 10;
  } else if (mode === "surface3d") {
    const idx = move.z*9 + move.y*3 + move.x;
    s += SURFACE_CENTER_WEIGHTS[idx] * 5;
  } else if (mode === "ultimate") {
    // 优先控制大格中心
    if (move.smallR === 1 && move.smallC === 1) s += 25;
    // 优先角
    else if ((move.smallR === 0 || move.smallR === 2) && (move.smallC === 0 || move.smallC === 2)) s += 15;
    // 优先送对手去"不好"的大格（对方已输/已满的大格 = 送对手自由选择 → 不利）
    const nxLR = move.smallR, nxLC = move.smallC;
    const ls = board.largeStatus;
    const nxtIdx = nxLR * 3 + nxLC;
    if (ls[nxtIdx] !== "") s += 20; // 送对手去满格 → 对手自由选 → 对我不利 → 但至少不给对手好位置
  }

  return s;
}

function orderMovesFast(mode, moves, board, player, depth) {
  const scored = moves.map(m => ({
    move: m,
    score: quickMoveScore(mode, board, m, player) +
      (isKiller(m, depth) ? 5000 : 0) // killer 着法排在赢/阻挡之后
  }));
  scored.sort((a, b) => b.score - a.score);
  for (let i = 0; i < moves.length; i++) moves[i] = scored[i].move;
}

// ============ Minimax + Alpha-Beta (v2: killer + fast order) ============

function evaluatePosition(mode, board, player) {
  switch (mode) {
    case "classic":   return evaluateClassic(board, player);
    case "surface3d": return evaluateSurface3D(board, player);
    case "ultimate":  return evaluateUltimate(board, player);
    default: return 0;
  }
}

function minimax(mode, board, depth, alpha, beta, isMax, player, context) {
  // 终局检测 (getTerminalScore 总是 X=正/O=负，AI 视角需要取反)
  const rawTerm = getTerminalScore(mode, board);
  if (rawTerm !== null) {
    const termScore = player === 0 ? rawTerm : -rawTerm;
    return { score: termScore, move: null };
  }

  if (depth === 0) {
    return { score: evaluatePosition(mode, board, player), move: null };
  }

  const moves = getValidMovesAI(mode, board, context);
  if (moves.length === 0) {
    return { score: evaluatePosition(mode, board, player), move: null };
  }

  // 快速排序
  orderMovesFast(mode, moves, board, isMax ? player : 1-player, depth);

  let bestMove = moves[0];
  let bestScore = isMax ? -Infinity : Infinity;

  for (const move of moves) {
    const result = applyMoveAI(mode, board, move, isMax ? player : 1-player, context);
    const newBoard = result.board;

    const evalResult = minimax(
      mode, newBoard, depth - 1, alpha, beta, !isMax, player, result.context
    );

    if (isMax) {
      if (evalResult.score > bestScore) { bestScore = evalResult.score; bestMove = move; }
      alpha = Math.max(alpha, bestScore);
    } else {
      if (evalResult.score < bestScore) { bestScore = evalResult.score; bestMove = move; }
      beta = Math.min(beta, bestScore);
    }
    if (beta <= alpha) {
      // 非赢棋着法触发截断 → 记录 killer
      // 使用当前回合玩家（非 AI 固定视角）
      const curPlayer = isMax ? player : 1-player;
      const r = applyMoveAI(mode, board, move, curPlayer, context);
      // 只要不是导致终局的着法就记录
      if (getTerminalScore(mode, r.board) === null) {
        pushKiller(depth, move);
      }
      break;
    }
  }

  return { score: bestScore, move: bestMove };
}

// ============ 启发式 AI（普通难度） ============

function heuristicMove(mode, board, player, context) {
  const moves = getValidMovesAI(mode, board, context);
  if (moves.length === 0) return null;

  // 终局分数从当前玩家视角转换
  const termForMe = (ts) => {
    if (ts === null) return null;
    return player === 0 ? ts : -ts;
  };

  // 先检查直接赢
  for (const move of moves) {
    const r = applyMoveAI(mode, board, move, player, context);
    const ts = termForMe(getTerminalScore(mode, r.board));
    if (ts !== null && ts > 500) return move;
  }

  // 再检查阻挡
  const opp = 1 - player;
  for (const move of moves) {
    const r = applyMoveAI(mode, board, move, opp, context);
    const ts = termForMe(getTerminalScore(mode, r.board));
    if (ts !== null && ts < -500) return move;
  }

  // 否则选评估最高的
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const result = applyMoveAI(mode, board, move, player, context);
    const score = evaluatePosition(mode, result.board, player);
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }

  return bestMove;
}

// ============ 公开 API ============

export function createAI(mode, difficulty) {
  return new AIPlayer(mode, difficulty);
}

export function getDifficultyNames() {
  return DIFFICULTY_NAMES;
}

class AIPlayer {
  constructor(mode, difficulty) {
    this.mode = mode;
    this.difficulty = Math.max(0, Math.min(3, difficulty));
  }

  getDifficultyName() {
    return DIFFICULTY_NAMES[this.difficulty];
  }

  getDifficultyLevel() {
    return this.difficulty;
  }

  async delay() {
    const ms = this.difficulty === 0 ? 200 : (300 + Math.random() * 400 + this.difficulty * 200);
    return new Promise(r => setTimeout(r, ms));
  }

  async getMove(controller) {
    await this.delay();

    // 重置 killer table
    resetKillers();

    const board = controller.board;
    const player = controller.currentTurn;
    const context = controller.context;
    const depth = DEPTHS[this.mode][this.difficulty];

    if (this.mode === "ultimate") {
      return this.getMoveUltimate(board, player, context, depth);
    }
    return this.getMoveFlat(board, player, context, depth);
  }

  getMoveFlat(board, player, context, depth) {
    const moves = getValidMovesAI(this.mode, board, context);
    if (moves.length === 0) return null;

    if (depth === 0) {
      if (this.difficulty === 0) return moves[Math.floor(Math.random() * moves.length)];
      return heuristicMove(this.mode, board, player, context);
    }

    const result = minimax(
      this.mode, board, depth, -Infinity, Infinity, true, player, context
    );
    return result.move || moves[0];
  }

  getMoveUltimate(board, player, context, depth) {
    const moves = getValidMovesAI(this.mode, board, context);
    if (moves.length === 0) return null;

    if (depth === 0) {
      if (this.difficulty === 0) return moves[Math.floor(Math.random() * moves.length)];
      return heuristicMove(this.mode, board, player, context);
    }

    const result = minimax(
      this.mode, board, depth, -Infinity, Infinity, true, player, context
    );
    return result.move || moves[0];
  }
}
