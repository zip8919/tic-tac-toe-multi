// 经典 3×3 棋盘渲染

export function renderClassicBoard(container, controller, onCellClick) {
  container.innerHTML = "";
  const board = document.createElement("div");
  board.className = "classic-board";

  const winCells = controller.getWinningCells();

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = i;

    const val = controller.board[i];
    if (val === "X") {
      cell.textContent = "✕";
      cell.classList.add("x", "taken");
    } else if (val === "O") {
      cell.textContent = "◯";
      cell.classList.add("o", "taken");
    }

    if (winCells.includes(i)) {
      cell.classList.add("win");
    }

    if (!val && controller.status === "playing") {
      cell.addEventListener("click", () => onCellClick({ index: i }));
    }

    board.appendChild(cell);
  }

  container.appendChild(board);
}
