// 在线大厅：创建/加入房间

import { createGame, joinGame } from "./api.js";

export function showOnline(container, mode, onStartGame) {
  const createNickname = container.querySelector("#create-nickname");
  const btnCreate = container.querySelector("#btn-create");
  const createResult = container.querySelector("#create-result");
  const joinNickname = container.querySelector("#join-nickname");
  const joinRoomId = container.querySelector("#join-room-id");
  const btnJoin = container.querySelector("#btn-join");
  const joinError = container.querySelector("#join-error");
  const btnBack = container.querySelector("#btn-online-back");

  // 重置状态
  createResult.classList.add("hidden");
  joinError.classList.add("hidden");
  createNickname.value = "";
  joinNickname.value = "";
  joinRoomId.value = "";

  const nav = container.closest("#app").dataset;
  const modeName = { classic: "经典", surface3d: "三维表面", ultimate: "套娃" }[mode] || mode;

  btnCreate.onclick = async () => {
    const name = createNickname.value.trim();
    if (!name) return;

    btnCreate.disabled = true;
    btnCreate.textContent = "创建中...";
    createResult.classList.add("hidden");

    try {
      const { gameId, playerToken } = await createGame(mode, name);
      createResult.innerHTML = `
        <p>房间已创建，等待对手加入...</p>
        <p class="room-id">${gameId}</p>
        <p style="font-size:0.85rem;color:#64748B;">将房间号发给好友</p>
      `;
      createResult.classList.remove("hidden");

      // 等待对手加入后自动开始
      onStartGame({ mode, playType: "online", gameId, playerToken, playerName: name, isHost: true });
    } catch (e) {
      createResult.innerHTML = `<p style="color:var(--color-o)">${e.message}</p>`;
      createResult.classList.remove("hidden");
    }

    btnCreate.disabled = false;
    btnCreate.textContent = "创建房间";
  };

  btnJoin.onclick = async () => {
    const name = joinNickname.value.trim();
    const roomId = joinRoomId.value.trim().toUpperCase();
    if (!name || !roomId) return;

    btnJoin.disabled = true;
    btnJoin.textContent = "加入中...";
    joinError.classList.add("hidden");

    try {
      const { playerToken } = await joinGame(roomId, name);
      onStartGame({ mode, playType: "online", gameId: roomId, playerToken, playerName: name, isHost: false });
    } catch (e) {
      joinError.textContent = e.message;
      joinError.classList.remove("hidden");
    }

    btnJoin.disabled = false;
    btnJoin.textContent = "加入房间";
  };

  btnBack.onclick = (e) => {
    e.stopPropagation();
    window.goLobby();
  };
}
