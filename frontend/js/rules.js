// 规则展示页

const RULES = [
  {
    title: "经典井字棋",
    html: `
      <p>在 3×3 的方格棋盘上进行对弈。</p>
      <ul>
        <li><strong>玩家</strong>：两人轮流落子，先手为 ✕，后手为 ◯。</li>
        <li><strong>落子</strong>：每次在空格中落下一子。</li>
        <li><strong>胜利条件</strong>：先在横、竖、或对角方向上连成三子者获胜。</li>
        <li><strong>平局</strong>：棋盘填满且无人三连。</li>
      </ul>
      <pre style="font-size:0.8rem;line-height:1.4;color:#64748B;">
 0 | 1 | 2
---+---+---
 3 | 4 | 5
---+---+---
 6 | 7 | 8
      </pre>
    `,
  },
  {
    title: "三维表面井字棋",
    html: `
      <p>在 3×3×3 立方体的<strong>表面格子</strong>上进行对弈。</p>
      <ul>
        <li><strong>棋盘</strong>：立方体共 27 个格子，去掉正中心的 (2,2,2)，共使用 <strong>26 个表面格子</strong>。</li>
        <li><strong>落子</strong>：每人轮流在未被占用的表面格子上落子。</li>
        <li><strong>胜利连线（允许）</strong>：
          <ol>
            <li><strong>轴方向</strong>：沿 X 轴、Y 轴、Z 轴的直线（共 18 条）。</li>
            <li><strong>面对角线</strong>：在同一表面平面内的对角线，如 XY 平面、XZ 平面、YZ 平面的面对角线（共 12 条）。</li>
          </ol>
          合计 <strong>30 条</strong> 有效连线。
        </li>
        <li><strong>体对角线（不允许）</strong>：从 (1,1,1) 到 (3,3,3) 之类的跨空间对角线不算，因为会穿过缺失的中心格子 (2,2,2)。</li>
        <li><strong>显示方式</strong>：三个层面上下排列——下层(z=1)、中层(z=2)、上层(z=3)。中层中心格标记为不可用。</li>
      </ul>
    `,
  },
  {
    title: "套娃井字棋（Ultimate Tic-Tac-Toe）",
    html: `
      <p>在 9×9 的大棋盘上进行对弈，棋盘划分为 3×3 个 <strong>大格</strong>，每个大格包含 3×3 个 <strong>小格</strong>。</p>

      <p><strong>落子规则：</strong></p>
      <ul>
        <li><strong>先手</strong>：可在任意空格落子。</li>
        <li><strong>后续</strong>：上一步玩家所落的小格 <strong>坐标 (r, c)</strong> 决定了当前玩家必须在哪个 <strong>大格 (r, c)</strong> 内落子。这被称为"送往"规则。</li>
        <li><strong>例外</strong>：如果目标大格已经被某玩家赢得或已填满，则当前玩家可以<strong>任意选择</strong>其他未完成的大格。</li>
      </ul>

      <p><strong>大格获胜：</strong></p>
      <ul>
        <li>在任何大格内，先在横、竖、或对角线上三连小格即<strong>赢得该大格</strong>。</li>
        <li>大格被填满但无人三连则为<strong>平局大格</strong>。</li>
        <li>已完成的大格不允许再落子。</li>
      </ul>

      <p><strong>全局胜利：</strong></p>
      <ul>
        <li>将 3×3 的大格视为宏观棋盘。当某玩家在宏观棋盘上先达成<strong>横、竖、或对角三连</strong>（即三个大格的胜利标记属于同一玩家），该玩家获得<strong>最终胜利</strong>。</li>
        <li>平局大格不影响宏观三连。</li>
        <li>宏观棋盘也能平局。</li>
      </ul>

      <p><strong>界面提示：</strong></p>
      <ul>
        <li>当前可落子的大格会高亮显示（橙色边框）。</li>
        <li>已被赢得的大格会覆盖半透明色 + 标记。</li>
        <li>状态栏会显示"对方将你送往 (R, C) 大格"。</li>
      </ul>
    `,
  },
];

export function showRules(container) {
  const content = container.querySelector("#rules-content");
  content.innerHTML = RULES.map(r => `
    <div class="rules-section">
      <h3>${r.title}</h3>
      ${r.html}
    </div>
  `).join("");

  container.querySelector("#btn-rules-back").onclick = (e) => {
    e.stopPropagation();
    window.goLobby();
  };
}
