// 三维表面棋盘渲染

export function renderSurfaceBoard(container, controller, onCellClick) {
  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "surface3d-container";

  const winCells = controller.getWinningCells();
  const layerNames = ["下层 (z=1)", "中层 (z=2)", "上层 (z=3)"];

  for (let z = 0; z < 3; z++) {
    const layer = document.createElement("div");
    layer.className = "surface3d-layer";

    const title = document.createElement("h4");
    title.textContent = layerNames[z];
    layer.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "layer-grid";

    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.dataset.z = z;

        const idx = z * 9 + y * 3 + x;

        if (x === 1 && y === 1 && z === 1) {
          cell.classList.add("center-invalid");
          cell.textContent = "×";
        } else if (!(x === 0 || x === 2 || y === 0 || y === 2 || z === 0 || z === 2)) {
          // 内部不可用格子（不应该出现，但做防御）
          cell.classList.add("center-invalid");
          cell.textContent = "";
        } else {
          const val = controller.board[idx];
          if (val === "X") {
            cell.textContent = "✕";
            cell.classList.add("x", "taken");
          } else if (val === "O") {
            cell.textContent = "◯";
            cell.classList.add("o", "taken");
          }

          if (winCells.includes(idx)) {
            cell.classList.add("win");
          }

          if (!val && controller.status === "playing") {
            cell.addEventListener("click", () => onCellClick({ x, y, z }));
          }
        }

        grid.appendChild(cell);
      }
    }

    layer.appendChild(grid);
    wrapper.appendChild(layer);
  }

  container.appendChild(wrapper);
}
