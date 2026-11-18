import OBR from "@owlbear-rodeo/sdk";
import "./style.css";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const root = document.querySelector("#app");
let roomState = { assignments: {}, lights: {} };
let players = [];
let items = [];

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const nameOf = (item) => item?.name || "Токен без имени";
const playerLabel = (player) => player.name || player.metadata?.name || `Игрок …${String(player.id).slice(-6)}`;
const characterTokens = () => items.filter((item) => item.layer === "CHARACTER" && item.type === "IMAGE");
const lightObjects = () => items.filter((item) => item.type === "IMAGE" && ["CHARACTER", "PROP", "ATTACHMENT"].includes(item.layer));

async function refresh() {
  const [metadata, party, sceneItems] = await Promise.all([
    OBR.scene.getMetadata(),
    OBR.party.getPlayers(),
    OBR.scene.items.getItems(),
  ]);
  roomState = metadata[STATE_KEY] || { ambient: "bright", assignments: {}, lights: {} };
  roomState.ambient ||= "bright";
  roomState.assignments ||= {};
  roomState.lights ||= {};
  players = party.filter((player) => player.role === "PLAYER");
  items = sceneItems;
  render();
}

async function persist() {
  await OBR.scene.setMetadata({ [STATE_KEY]: roomState });
  render();
  OBR.notification.show("Настройки зрения сохранены для этой сцены.");
}

function render() {
  const tokens = characterTokens();
  const objects = lightObjects();
  const playerOptions = players.map((player) => `<option value="${esc(player.id)}">${esc(playerLabel(player))}${player.color ? ` · ${esc(player.color)}` : ""}</option>`).join("");
  const tokenOptions = tokens.map((token) => `<option value="${esc(token.id)}">${esc(nameOf(token))}</option>`).join("");
  const objectOptions = objects.map((item) => `<option value="${esc(item.id)}">${esc(nameOf(item))} · ${esc(item.layer)}</option>`).join("");
  const assignments = Object.entries(roomState.assignments).map(([tokenId, entry]) => {
    const token = tokens.find((item) => item.id === tokenId);
    const player = players.find((item) => item.id === entry.playerId);
    return `<article class="saved-row"><div class="row-title"><strong>${esc(token?.name || entry.tokenName || "Удалённый токен")}</strong><span>${esc(player ? playerLabel(player) : entry.playerName || "Игрок не в комнате")}</span></div><div class="row-meta">${entry.mode === "blind" ? "Ослеплён" : `Обычное зрение: ${Number(entry.brightCells) || 0} кл. · Тёмное зрение: ${Number(entry.darkvisionCells) || 0} кл.`}</div><div class="row-buttons"><button data-edit-assignment="${esc(tokenId)}">Изменить</button><button class="danger" data-remove-assignment="${esc(tokenId)}">Отвязать</button></div></article>`;
  }).join("");
  const lights = Object.entries(roomState.lights).map(([itemId, entry]) => {
    const item = objects.find((candidate) => candidate.id === itemId);
    return `<article class="saved-row"><div class="row-title"><strong>💡 ${esc(item?.name || entry.name || "Удалённый источник")}</strong><span>Источник света</span></div><div class="row-meta">Яркий свет: ${Number(entry.brightCells) || 0} кл. · тусклый свет: ${Number(entry.dimCells) || 0} кл.</div><div class="row-buttons"><button data-edit-light="${esc(itemId)}">Изменить</button><button class="danger" data-remove-light="${esc(itemId)}">Убрать</button></div></article>`;
  }).join("");

  root.innerHTML = `<main class="panel">
    <header><div class="eyebrow">OWLBEAR RODEO · ОТДЕЛЬНОЕ РАСШИРЕНИЕ</div><h1>Личный обзор</h1><p>Каждый игрок видит маску, рассчитанную для его токена.</p></header>
    <section class="notice"><strong>Как работает эта версия</strong><span>Маска действует отдельно для каждого игрока. Световые круги доступны всем, но видны только в клиенте того игрока, чья маска активна.</span><span>Круги не учитывают стены и линию видимости.</span></section>
    <section class="section ambient-section"><label>Освещение сцены<select id="ambient-select"><option value="bright" ${roomState.ambient === "bright" ? "selected" : ""}>Сцена освещена · обычное зрение</option><option value="dark" ${roomState.ambient === "dark" ? "selected" : ""}>Темнота · без тёмного зрения видны только источники света</option></select></label><button id="save-ambient">Сохранить освещение сцены</button></section>
    <section class="section"><div class="section-head"><div><h2>Токен и игрок</h2><p>Один игрок и один токен могут быть связаны только один раз.</p></div></div>
      <label>Игрок<select id="player-select"><option value="">Выбери игрока</option>${playerOptions}</select></label>
      <label>Токен на карте<select id="token-select"><option value="">Выбери токен персонажа</option>${tokenOptions}</select></label>
      <label>Режим зрения<select id="mode-select"><option value="limited">Ограниченный обзор</option><option value="blind">Ослеплён · экран закрыт</option></select></label>
      <div class="two-fields"><label>Яркий радиус, клетки<input id="bright-range" type="number" min="0" max="200" value="8"></label><label>Тёмное зрение, клетки<input id="dark-range" type="number" min="0" max="200" value="0"></label></div>
      <button class="primary" id="save-assignment">Привязать / сохранить</button>
      <div class="saved-list">${assignments || `<div class="empty">Привязок пока нет.</div>`}</div>
    </section>
    <section class="section"><div class="section-head"><div><h2>Источники света</h2><p>Выбери токен или предмет, который несёт свет.</p></div></div>
      <label>Объект карты<select id="light-select"><option value="">Выбери объект</option>${objectOptions}</select></label>
      <div class="two-fields"><label>Яркий свет, клетки<input id="light-bright" type="number" min="0" max="200" value="4"></label><label>Тусклый свет, клетки<input id="light-dim" type="number" min="0" max="200" value="8"></label></div>
      <button class="primary" id="save-light">Добавить / сохранить источник</button>
      <div class="saved-list">${lights || `<div class="empty">Источников света пока нет.</div>`}</div>
    </section>
    <footer>Настройки хранятся в метаданных текущей сцены. Участники должны открыть комнату с включённым расширением.</footer>
  </main>`;

  root.querySelector("#save-assignment").onclick = async () => {
    const playerId = root.querySelector("#player-select").value;
    const tokenId = root.querySelector("#token-select").value;
    if (!playerId || !tokenId) return OBR.notification.show("Выбери и игрока, и токен.");
    const conflict = Object.entries(roomState.assignments).find(([otherToken, entry]) => otherToken !== tokenId && entry.playerId === playerId);
    if (conflict) return OBR.notification.show("Этот игрок или токен уже привязан. Сначала отвяжи текущую связь.");
    const token = tokens.find((item) => item.id === tokenId);
    const player = players.find((item) => item.id === playerId);
    roomState.assignments[tokenId] = {
      tokenId,
      tokenName: nameOf(token),
      playerId,
      playerName: player ? playerLabel(player) : "Игрок",
      mode: root.querySelector("#mode-select").value,
      brightCells: clamp(root.querySelector("#bright-range").value),
      darkvisionCells: clamp(root.querySelector("#dark-range").value),
    };
    await persist();
  };
  root.querySelector("#save-ambient").onclick = async () => { roomState.ambient = root.querySelector("#ambient-select").value; await persist(); };
  root.querySelector("#save-light").onclick = async () => {
    const itemId = root.querySelector("#light-select").value;
    if (!itemId) return OBR.notification.show("Выбери объект карты.");
    const item = objects.find((candidate) => candidate.id === itemId);
    roomState.lights[itemId] = { name: nameOf(item), brightCells: clamp(root.querySelector("#light-bright").value), dimCells: clamp(root.querySelector("#light-dim").value) };
    await persist();
  };
  root.querySelectorAll("[data-remove-assignment]").forEach((button) => button.onclick = async () => { delete roomState.assignments[button.dataset.removeAssignment]; await persist(); });
  root.querySelectorAll("[data-remove-light]").forEach((button) => button.onclick = async () => { delete roomState.lights[button.dataset.removeLight]; await persist(); });
  root.querySelectorAll("[data-edit-assignment]").forEach((button) => button.onclick = () => {
    const entry = roomState.assignments[button.dataset.editAssignment];
    root.querySelector("#token-select").value = button.dataset.editAssignment;
    root.querySelector("#player-select").value = entry.playerId;
    root.querySelector("#mode-select").value = entry.mode;
    root.querySelector("#bright-range").value = entry.brightCells;
    root.querySelector("#dark-range").value = entry.darkvisionCells;
    root.querySelector("#save-assignment").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  root.querySelectorAll("[data-edit-light]").forEach((button) => button.onclick = () => {
    const entry = roomState.lights[button.dataset.editLight];
    root.querySelector("#light-select").value = button.dataset.editLight;
    root.querySelector("#light-bright").value = entry.brightCells;
    root.querySelector("#light-dim").value = entry.dimCells;
  });
}

function clamp(value) { return Math.max(0, Math.min(200, Number.parseInt(value, 10) || 0)); }

OBR.onReady(async () => {
  if (await OBR.player.getRole() !== "GM") {
    root.innerHTML = `<main class="panel"><h1>Личный обзор</h1><p>Настройка зрения доступна только мастеру.</p></main>`;
    return;
  }
  await refresh();
  OBR.scene.items.onChange(refresh);
  OBR.party.onChange(refresh);
  OBR.scene.onMetadataChange((metadata) => { roomState = metadata[STATE_KEY] || { assignments: {}, lights: {} }; roomState.assignments ||= {}; roomState.lights ||= {}; render(); });
});
