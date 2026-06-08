// 主入口：路由切换 + 游戏生命周期

import { showLobby } from "./lobby.js";
import { showOnline } from "./online.js";
import { showRules } from "./rules.js";
import { renderClassicBoard } from "./board-classic.js";
import { renderSurfaceBoard } from "./board-surface.js";
import { renderUltimateBoard } from "./board-ultimate.js";
import { GameController } from "./game-controller.js";
import { connectWebSocket, sendMove, sendPing } from "./api.js";
import { createAI } from "./ai.js";

// 页面元素
const pages = {
  lobby: document.getElementById("page-lobby"),
  online: document.getElementById("page-online"),
  game: document.getElementById("page-game"),
  rules: document.getElementById("page-rules"),
};

const pageIds = Object.keys(pages);

// 当前状态
let currentController = null;
let ws = null;
let pingInterval = null;
let zoomLevel = 1;
let hintMove = null;       // AI 提示推荐的着法
let hintBtnVisible = false;
let quitPressTimer = null;
let quitLongFired = false;

// 退出按钮：单击退出，长按 1.2s 切换提示按钮（只绑定一次）
function setupQuitButton() {
  const btnQuit = document.getElementById("btn-quit");
  const btnHint = document.getElementById("btn-hint");
  if (!btnQuit || !btnHint || btnQuit._hintSetup) return;
  btnQuit._hintSetup = true;

  btnHint.classList.add("hidden");

  function startQuitPress(e) {
    quitLongFired = false;
    quitPressTimer = setTimeout(() => {
      quitLongFired = true;
      quitPressTimer = null;
      hintBtnVisible = !hintBtnVisible;
      if (hintBtnVisible) {
        btnHint.classList.remove("hidden");
      } else {
        btnHint.classList.add("hidden");
        hintMove = null;
        updateGameUI();
      }
    }, 1200);
  }

  function endQuitPress(e) {
    if (quitLongFired) {
      e.preventDefault();
      return;
    }
    if (quitPressTimer) {
      clearTimeout(quitPressTimer);
      quitPressTimer = null;
      e.stopPropagation();
      window.goLobby();
    }
  }

  function cancelQuitPress() {
    if (quitPressTimer) {
      clearTimeout(quitPressTimer);
      quitPressTimer = null;
    }
  }

  btnQuit.addEventListener("mousedown", startQuitPress);
  btnQuit.addEventListener("mouseup", endQuitPress);
  btnQuit.addEventListener("mouseleave", cancelQuitPress);
  btnQuit.addEventListener("touchstart", startQuitPress, { passive: true });
  btnQuit.addEventListener("touchend", endQuitPress);
  btnQuit.addEventListener("touchcancel", cancelQuitPress);

  // 提示按钮：AI 推演最佳着法
  btnHint.onclick = async (e) => {
    e.stopPropagation();
    if (!currentController || currentController.status !== "playing") return;
    const ai = createAI(currentController.mode, 3);
    hintMove = await ai.getMove(currentController);
    updateGameUI();
  };
}

function navigate(page, params = {}) {
  for (const id of pageIds) {
    pages[id].classList.remove("active");
  }
  pages[page].classList.add("active");

  switch (page) {
    case "lobby":
      showLobby(pages.lobby, navigate);
      break;
    case "online":
      showOnline(pages.online, params.mode, startOnlineGame);
      break;
    case "game":
      if (params.mode) startGame(params);
      break;
    case "rules":
      showRules(pages.rules);
      break;
  }
}

function startOnlineGame(params) {
  location.hash = "#game";
  navigate("game", params);
}

function startGame(params) {
  const { mode, playType, gameId, playerToken, playerName, isHost, difficulty } = params;

  // 清理上一局
  cleanupGame();

  // AI 实例（如果需要）
  if (playType === "ai") {
    window._aiPlayer = createAI(mode, difficulty || 1);
  }

  // 初始化控制器
  const aiDiffName = window._aiPlayer ? window._aiPlayer.getDifficultyName() : "";
  const playerNames = playType === "online"
    ? [isHost ? playerName : "等待中...", isHost ? "等待中..." : playerName]
    : playType === "ai"
      ? [playerName || "你 (✕)", "AI-" + aiDiffName + " (◯)"]
      : ["玩家1 (✕)", "玩家2 (◯)"];

  currentController = new GameController(mode, playType, {
    playerNames,
    onStateChange: () => updateGameUI(),
  });
  currentController.gameId = gameId || null;

  // 在线模式：连接 WebSocket
  if (playType === "online") {
    currentController.status = "waiting";
    currentController.playerIndex = isHost ? 0 : 1;

    ws = connectWebSocket(
      gameId,
      playerToken,
      (msg) => handleServerMessage(msg),
      () => {
        document.getElementById("status-text").textContent = "连接断开";
      }
    );

    // 心跳
    pingInterval = setInterval(() => sendPing(ws), 15000);
  }

  // 更新 UI
  updateGameUI();

  // 放大缩小按钮（叠加在棋盘右上角）
  document.getElementById("btn-zoom-in").onclick = (e) => {
    e.stopPropagation();
    zoomLevel = Math.min(2, zoomLevel + 0.1);
    applyZoom();
  };
  document.getElementById("btn-zoom-out").onclick = (e) => {
    e.stopPropagation();
    zoomLevel = Math.max(0.5, zoomLevel - 0.1);
    applyZoom();
  };
  // 长按退出切换提示（只绑定一次）
  setupQuitButton();
  hintBtnVisible = false;
  document.getElementById("btn-hint").classList.add("hidden");
  hintMove = null;

  applyZoom();
  zoomLevel = 1;
  applyZoom();
}

function handleServerMessage(msg) {
  if (msg.type === "state") {
    currentController.applyServerState(msg.state);
    updateGameUI();
  } else if (msg.type === "error") {
    document.getElementById("status-text").textContent = "错误: " + msg.message;
  } else if (msg.type === "joined") {
    // 对手加入，更新名字
    const oppIdx = currentController.playerIndex === 0 ? 1 : 0;
    currentController.playerNames[oppIdx] = msg.opponent.name;
    updateGameUI();
  } else if (msg.type === "left") {
    if (currentController) {
      // 游戏中对手断线 → 我方获胜
      if (currentController.status === "playing") {
        currentController.winner = currentController.playerIndex === 0 ? 0 : 1;
        document.getElementById("status-text").textContent = "对手已断开连接，你获胜！";
      } else {
        document.getElementById("status-text").textContent = "对手已断开连接";
      }
      currentController.status = "finished";
    }
    updateGameUI();
  } else if (msg.type === "pong") {
    // 心跳响应
  }
}

function handleCellClick(move) {
  if (!currentController) return;

  // 清除 AI 提示
  hintMove = null;

  if (currentController.playType === "online") {
    // 在线模式：发送到服务端
    sendMove(ws, move);
  } else if (currentController.playType === "ai") {
    // AI 模式：先落子再触发 AI
    if (currentController.currentTurn !== 0) return; // 只在玩家的回合
    const ok = currentController.tryLocalMove(move);
    if (ok) {
      updateGameUI();
      triggerAI();
    }
  } else {
    // 本地双人
    currentController.tryLocalMove(move);
  }
}

async function triggerAI() {
  if (!currentController || currentController.status !== "playing") return;
  if (currentController.currentTurn !== 1) return; // AI 是后手（◯）
  if (!window._aiPlayer) return;

  const aiMove = await window._aiPlayer.getMove(currentController);

  if (aiMove && currentController && currentController.status === "playing") {
    currentController.tryLocalMove(aiMove);
    updateGameUI();
  }
}

function renderBoard() {
  const container = document.getElementById("board-container");
  if (!currentController) return;

  const onCellClick = (move) => handleCellClick(move);

  switch (currentController.mode) {
    case "classic":
      renderClassicBoard(container, currentController, onCellClick);
      break;
    case "surface3d":
      renderSurfaceBoard(container, currentController, onCellClick);
      break;
    case "ultimate":
      renderUltimateBoard(container, currentController, onCellClick);
      break;
  }
}

function updateGameUI() {
  if (!currentController) return;

  const statusText = document.getElementById("status-text");
  const turnIndicator = document.getElementById("turn-indicator");
  const playerXInfo = document.getElementById("player-x-info");
  const playerOInfo = document.getElementById("player-o-info");

  // 玩家信息
  const xName = playerXInfo.querySelector(".player-name");
  const oName = playerOInfo.querySelector(".player-name");
  xName.textContent = currentController.playerNames[0];
  oName.textContent = currentController.playerNames[1];

  // 回合高亮
  playerXInfo.classList.remove("active-turn");
  playerOInfo.classList.remove("active-turn");
  if (currentController.status === "playing") {
    if (currentController.currentTurn === 0) playerXInfo.classList.add("active-turn");
    else playerOInfo.classList.add("active-turn");
  }

  // 状态文字
  const modeName = {
    classic: "经典井字棋",
    surface3d: "三维表面井字棋",
    ultimate: "套娃井字棋",
  }[currentController.mode] || "";

  if (currentController.status === "waiting") {
    const roomHint = currentController.gameId ? ` 房间号: ${currentController.gameId}` : "";
    statusText.textContent = `[${modeName}] 等待对手加入...${roomHint}`;
    turnIndicator.textContent = "";
  } else if (currentController.status === "finished") {
    if (currentController.winner === "draw") {
      statusText.textContent = `[${modeName}] 平局！`;
    } else {
      const name = currentController.playerNames[currentController.winner];
      statusText.textContent = `[${modeName}] ${name} 获胜！`;
    }
    turnIndicator.textContent = "";
  } else {
    const name = currentController.playerNames[currentController.currentTurn];
    statusText.textContent = `[${modeName}] 轮到 ${name}`;
    // 套娃模式：提示送往哪个大格
    if (currentController.mode === "ultimate" && currentController.context) {
      const ctx = currentController.context;
      if (ctx.nextLargeR >= 0) {
        turnIndicator.textContent = `对手将你送往大格 (${ctx.nextLargeR + 1}, ${ctx.nextLargeC + 1})`;
      } else {
        turnIndicator.textContent = "任意选择可用大格落子";
      }
    } else {
      turnIndicator.textContent = "";
    }
  }

  renderBoard();
  applyHintHighlight();
}

// 高亮 AI 提示的推荐格子
function applyHintHighlight() {
  // 清除旧高亮
  document.querySelectorAll("#board-container .hint-cell").forEach(el => el.classList.remove("hint-cell"));

  if (!hintMove || !currentController || currentController.status !== "playing") return;

  let selector = "";
  const mode = currentController.mode;

  if (mode === "classic") {
    selector = `[data-index="${hintMove.index}"]`;
  } else if (mode === "surface3d") {
    selector = `[data-x="${hintMove.x}"][data-y="${hintMove.y}"][data-z="${hintMove.z}"]`;
  } else if (mode === "ultimate") {
    selector = `[data-large-r="${hintMove.largeR}"][data-large-c="${hintMove.largeC}"][data-small-r="${hintMove.smallR}"][data-small-c="${hintMove.smallC}"]`;
  }

  if (selector) {
    const cell = document.querySelector("#board-container " + selector);
    if (cell) cell.classList.add("hint-cell");
  }
}

function applyZoom() {
  const board = document.getElementById("board-container");
  board.style.transform = `scale(${zoomLevel})`;
  board.style.transformOrigin = "top center";
}

function cleanupGame() {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  currentController = null;
  window._aiPlayer = null;
  hintMove = null;
  hintBtnVisible = false;
}

// 全局返回主菜单（供其他模块调用）
window.goLobby = function() {
  cleanupGame();
  navigate("lobby");
  window.location.hash = "#lobby";
};

// 路由监听
function handleRoute() {
  const hash = location.hash.replace("#", "") || "lobby";
  if (pageIds.includes(hash)) {
    navigate(hash);
  } else {
    location.hash = "#lobby";
  }
}

window.addEventListener("hashchange", handleRoute);
window.addEventListener("load", handleRoute);
