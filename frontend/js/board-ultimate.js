// 套娃井字棋盘渲染

export function renderUltimateBoard(container, controller, onCellClick) {
  container.innerHTML = "";
  const board = document.createElement("div");
  board.className = "ultimate-board";

  const winLargeCells = controller.getWinningCells(); // 宏观三连的大格索引
  const ctx = controller.context || { nextLargeR: -1, nextLargeC: -1 };
  const largeStatus = controller.board.largeStatus || [];

  // 判断哪些大格可落子
  const activeLargeSet = new Set();
  if (ctx.nextLargeR >= 0 && ctx.nextLargeC >= 0) {
    activeLargeSet.add(`${ctx.nextLargeR},${ctx.nextLargeC}`);
  } else {
    for (let lr = 0; lr < 3; lr++) {
      for (let lc = 0; lc < 3; lc++) {
        if (!largeStatus[lr * 3 + lc]) {
          activeLargeSet.add(`${lr},${lc}`);
        }
      }
    }
  }

  for (let globalR = 0; globalR < 9; globalR++) {
    for (let globalC = 0; globalC < 9; globalC++) {
      const largeR = Math.floor(globalR / 3);
      const largeC = Math.floor(globalC / 3);
      const smallR = globalR % 3;
      const smallC = globalC % 3;
      const lIdx = largeR * 3 + largeC;

      const cell = document.createElement("div");
      cell.className = "cell";

      // 大格分隔线
      if (smallC === 2 && largeC < 2) cell.classList.add("large-border-right");
      if (smallR === 2 && largeR < 2) cell.classList.add("large-border-bottom");

      // 大格状态覆盖
      const ls = largeStatus[lIdx];
      if (ls === "X") {
        cell.classList.add("large-won-x");
      } else if (ls === "O") {
        cell.classList.add("large-won-o");
      } else if (ls === "draw") {
        cell.classList.add("large-draw");
      }

      // 当前可落子大格高亮
      if (activeLargeSet.has(`${largeR},${largeC}`) && controller.status === "playing") {
        cell.classList.add("active-large");
      }

      // 不可落子区域变暗
      if (controller.status === "playing" && !activeLargeSet.has(`${largeR},${largeC}`)) {
        cell.classList.add("disabled-area");
      }

      // 宏观三连高亮
      if (winLargeCells.includes(lIdx) && ls !== "draw") {
        cell.classList.add("win");
      }

      // 小格内容
      const idx = globalR * 9 + globalC;
      const val = controller.board.smallCells[idx];
      if (val === "X") {
        cell.textContent = "✕";
        cell.classList.add("x", "taken");
      } else if (val === "O") {
        cell.textContent = "◯";
        cell.classList.add("o", "taken");
      }

      // 点击事件
      if (!val && controller.status === "playing" &&
          activeLargeSet.has(`${largeR},${largeC}`) && !ls) {
        cell.addEventListener("click", () => {
          onCellClick({ largeR, largeC, smallR, smallC });
        });
      }

      board.appendChild(cell);
    }
  }

  // 已赢大格的覆盖标记
  for (let lr = 0; lr < 3; lr++) {
    for (let lc = 0; lc < 3; lc++) {
      const ls = largeStatus[lr * 3 + lc];
      if (ls === "X" || ls === "O" || ls === "draw") {
        const overlay = document.createElement("div");
        overlay.className = "large-overlay";
        // 定位到对应大格中心
        const top = (lr * 3 + 1) / 9 * 100;
        const left = (lc * 3 + 1) / 9 * 100;
        overlay.style.cssText = `
          position: absolute;
          top: ${(lr * 3) / 9 * 100}%;
          left: ${(lc * 3) / 9 * 100}%;
          width: ${3 / 9 * 100}%;
          height: ${3 / 9 * 100}%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          font-size: clamp(1.2rem, 5vw, 2.5rem);
          font-weight: 900;
          z-index: 2;
        `;

        if (ls === "X") {
          overlay.classList.add("x-overlay");
          overlay.textContent = "✕";
        } else if (ls === "O") {
          overlay.classList.add("o-overlay");
          overlay.textContent = "◯";
        } else {
          overlay.classList.add("draw-overlay");
          overlay.textContent = "平";
        }
        board.appendChild(overlay);
      }
    }
  }

  container.appendChild(board);
}
