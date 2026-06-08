// 主菜单：模式选择 + 对战方式选择

const MODES = [
  {
    id: "classic",
    name: "经典井字棋",
    desc: "3×3 棋盘。横、竖、对角三连即获胜。简单直接，老少皆宜。",
  },
  {
    id: "surface3d",
    name: "三维表面井字棋",
    desc: "3×3×3 立方体表面（26格）。可在轴方向和面对角线上连三子。体对角线不算。",
  },
  {
    id: "ultimate",
    name: "套娃井字棋",
    desc: "9×9 超大棋盘分为 3×3 个大格。每个大格内的胜负决定宏观棋局。上一步落子位置决定你下一步该下哪个大格。策略深度极高！",
  },
];

const PLAY_TYPES = [
  { id: "local", name: "本地双人", desc: "两人在同一设备轮流落子" },
  { id: "online", name: "在线联机", desc: "通过网络与远程对手对战" },
  { id: "ai", name: "AI 对战", desc: "与电脑 AI 对弈（简单模式）" },
];

let selectedMode = null;

export function showLobby(container, onNavigate) {
  selectedMode = null;

  const modeList = container.querySelector("#mode-list");
  const playTypeList = container.querySelector("#play-type-list");

  // 渲染模式卡片
  modeList.innerHTML = '<div class="mode-cards">' +
    MODES.map(m => `
      <div class="mode-card" data-mode="${m.id}">
        <h3>${m.name}</h3>
        <p>${m.desc}</p>
      </div>
    `).join("") +
    '</div>';

  modeList.classList.remove("hidden");
  playTypeList.classList.add("hidden");

  // 模式选择事件
  modeList.querySelectorAll(".mode-card").forEach(card => {
    card.addEventListener("click", () => {
      selectedMode = card.dataset.mode;
      showPlayTypes(playTypeList, onNavigate);
    });
  });

  // 规则按钮
  container.querySelector("#btn-rules").onclick = () => onNavigate("rules");
}

function showPlayTypes(container, onNavigate) {
  container.innerHTML = `
    <p class="subtitle">选择对战方式</p>
    <div class="play-type-cards">
      ${PLAY_TYPES.map(pt => `
        <button class="play-type-btn" data-type="${pt.id}">
          <strong>${pt.name}</strong> — ${pt.desc}
        </button>
      `).join("")}
    </div>
    <button class="btn-link back-btn">重新选择模式</button>
  `;
  container.classList.remove("hidden");

  container.querySelectorAll(".play-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const playType = btn.dataset.type;
      if (playType === "online") {
        onNavigate("online", { mode: selectedMode });
      } else {
        onNavigate("game", { mode: selectedMode, playType });
      }
    });
  });

  container.querySelector(".back-btn").onclick = () => {
    container.classList.add("hidden");
  };
}
