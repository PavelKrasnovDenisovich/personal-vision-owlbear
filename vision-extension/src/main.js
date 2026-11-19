import OBR from "@owlbear-rodeo/sdk";
import "./style.css";
import { version as extensionVersion } from "../package.json";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const PLACE_MODE_ID = `${EXTENSION_ID}/place-light`;
const PLACE_PRESET_KEY = `${EXTENSION_ID}/place-preset`;
const LIGHT_MARKER_KEY = `${EXTENSION_ID}/light-marker`;
const PREVIEW_MODAL_ID = `${EXTENSION_ID}/gm-preview`;
const PREVIEW_ACTIVE_KEY = `${EXTENSION_ID}/preview-active`;
const root = document.querySelector("#app");
const extensionUrl = (path) => {
  const url = new URL(path, location.href);
  url.searchParams.set("v", extensionVersion);
  return url;
};
let roomState = { assignments: {}, lights: {} };
let players = [];
let items = [];

const LIGHT_PRESETS = {
  candle: { name: "Свеча · малый свет", brightCells: 1, dimCells: 2, tint: false },
  torch: { name: "Факел · 20 + 20 футов", brightCells: 4, dimCells: 8, tint: false },
  lantern: { name: "Фонарь · 30 + 30 футов", brightCells: 6, dimCells: 12, tint: false },
  darkvision: { name: "Тёмное зрение · серый тон", brightCells: 0, dimCells: 12, tint: true },
};

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const nameOf = (item) => item?.name || "Токен без имени";
const playerLabel = (player) => player.name || player.metadata?.name || `Игрок …${String(player.id).slice(-6)}`;
const characterTokens = () => items.filter((item) => item.layer === "CHARACTER" && item.type === "IMAGE");
const lightObjects = () => items.filter((item) => item.type === "IMAGE" && ["CHARACTER", "PROP", "ATTACHMENT"].includes(item.layer) && !item.metadata?.[LIGHT_MARKER_KEY]);

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
    return `<article class="saved-row"><div class="row-title"><strong>${esc(token?.name || entry.tokenName || "Удалённый токен")}</strong><span>${esc(player ? playerLabel(player) : entry.playerName || "Игрок не в комнате")}</span></div><div class="row-meta">${entry.mode === "blind" ? "Ослеплён" : `Тёмное зрение: ${Number(entry.darkvisionCells) || 0} кл. · освещённые зоны не ограничены радиусом токена`}</div><div class="row-buttons"><button data-preview-assignment="${esc(tokenId)}">Проверить на себе</button><button data-edit-assignment="${esc(tokenId)}">Изменить</button><button class="danger" data-remove-assignment="${esc(tokenId)}">Отвязать</button></div></article>`;
  }).join("");
  const lights = Object.entries(roomState.lights).map(([itemId, entry]) => {
    const item = objects.find((candidate) => candidate.id === itemId);
    return `<article class="saved-row"><div class="row-title"><strong>💡 ${esc(item?.name || entry.name || "Удалённый источник")}</strong><span>${entry.marker ? "Источник на карте" : "Источник света"}</span></div><div class="row-meta">${entry.presetName ? `${esc(entry.presetName)} · ` : ""}Яркая область: ${Number(entry.brightCells) || 0} кл. · граница тусклого света: ${Number(entry.dimCells) || 0} кл.${entry.tint ? " · серый тон" : ""}</div><div class="row-buttons"><button data-edit-light="${esc(itemId)}">Изменить</button><button class="danger" data-remove-light="${esc(itemId)}">Убрать</button></div></article>`;
  }).join("");

  root.innerHTML = `<main class="panel">
    <header><div class="eyebrow">OWLBEAR RODEO · ОТДЕЛЬНОЕ РАСШИРЕНИЕ</div><h1>Личный обзор <span class="version-tag">v${extensionVersion}</span></h1><p>Каждый игрок видит маску, рассчитанную для его токена.</p></header>
    <section class="notice"><strong>Как работает эта версия</strong><span>Маска действует отдельно для каждого игрока. Текущий токен и радиусы можно проверить на экране мастера без игрока и без сохранения.</span><span>Круги не учитывают стены и линию видимости.</span></section>
    <section class="section ambient-section"><label>Освещение сцены<select id="ambient-select"><option value="bright" ${roomState.ambient === "bright" ? "selected" : ""}>Сцена освещена · обычное зрение</option><option value="dark" ${roomState.ambient === "dark" ? "selected" : ""}>Темнота · без тёмного зрения видны только источники света</option></select></label><button id="save-ambient">Сохранить освещение сцены</button></section>
    <section class="section"><div class="section-head"><div><h2>Токен и игрок</h2><p>Один игрок и один токен могут быть связаны только один раз.</p></div></div>
      <label>Игрок<select id="player-select"><option value="">Выбери игрока</option>${playerOptions}</select></label>
      <label>Токен на карте<select id="token-select"><option value="">Выбери токен персонажа</option>${tokenOptions}</select></label>
      <label>Режим зрения<select id="mode-select"><option value="limited">Ограниченный обзор</option><option value="blind">Ослеплён · экран закрыт</option></select></label>
      <label>Радиус тёмного зрения, клетки<input id="dark-range" type="number" min="0" max="200" value="0"></label>
      <button class="primary" id="save-assignment">Привязать / сохранить</button>
      <button id="preview-current">Посмотреть текущий обзор на себе</button>
      <p class="hint">В освещённой сцене видна вся карта. В темноте видны только световые области; тёмное зрение добавляет приглушённый радиус вокруг токена. Для проверки выберите токен и радиус тёмного зрения. Escape, кнопка выхода или значок расширения вернут панель.</p>
      <div class="saved-list">${assignments || `<div class="empty">Привязок пока нет.</div>`}</div>
    </section>
    <section class="section"><div class="section-head"><div><h2>Источники света</h2><p>Выбери токен или предмет, который несёт свет.</p></div></div>
      <label>Профиль для новой метки<select id="light-preset"><option value="candle">Свеча · яркая 1, внешний радиус 2 кл.</option><option value="torch">Факел · яркий 4, внешний радиус 8 кл.</option><option value="lantern">Фонарь · яркий 6, внешний радиус 12 кл.</option><option value="darkvision">Тёмное зрение · серый тон 12 кл.</option></select></label>
      <button id="place-light-marker">Поставить выбранный источник…</button>
      <p class="hint">Выберите профиль и нажмите кнопку, затем щёлкните по карте. Свет работает независимо от радиуса зрения персонажа. В темноте персонаж без тёмного зрения увидит области фонарей; тёмное зрение добавит серую область вокруг самого персонажа. Во время предпросмотра золотой контур показывает яркий свет, пунктирный — границу тусклого света.</p>
      <label>Уже есть картинка свечи/фонаря? Выберите её<select id="light-select"><option value="">Выбери объект</option>${objectOptions}</select></label>
      <div class="two-fields"><label>Яркая область, клеток радиус<input id="light-bright" type="number" min="0" max="200" value="4"></label><label>Граница тусклого света, клетки<input id="light-dim" type="number" min="0" max="200" value="8"></label></div>
      <button class="primary" id="save-light">Назначить профиль выбранному объекту</button>
      <p class="hint">Автоматическая настройка Prop-токена: в расширении Owlbear «Properties / Свойства» добавьте ключ <code>ru.codex.personal-vision/light</code> и значение <code>lantern</code>, <code>torch</code> или <code>candle</code>. Фонарь: яркий радиус 6 клеток, внешний тусклый — 12; факел: 4/8; свеча: 1/2. Профиль читается с токена автоматически, включая его перемещение. Можно вместо слова передать JSON: <code>{"brightCells":6,"dimCells":12}</code>.</p>
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
      darkvisionCells: clamp(root.querySelector("#dark-range").value),
    };
    await persist();
  };
  root.querySelector("#save-ambient").onclick = async () => { roomState.ambient = root.querySelector("#ambient-select").value; await persist(); };
  root.querySelector("#save-light").onclick = async () => {
    const itemId = root.querySelector("#light-select").value;
    if (!itemId) return OBR.notification.show("Выбери объект карты.");
    const item = objects.find((candidate) => candidate.id === itemId);
    const presetId = root.querySelector("#light-preset").value;
    const preset = LIGHT_PRESETS[presetId];
    roomState.lights[itemId] = { name: nameOf(item), brightCells: clamp(root.querySelector("#light-bright").value), dimCells: clamp(root.querySelector("#light-dim").value), tint: Boolean(preset?.tint), position: item?.position || undefined, presetName: preset?.name || "" };
    await persist();
  };
  root.querySelector("#light-preset").onchange = (event) => {
    const preset = LIGHT_PRESETS[event.target.value];
    root.querySelector("#light-bright").value = preset.brightCells;
    root.querySelector("#light-dim").value = preset.dimCells;
    root.querySelector("#place-light-marker").textContent = `Поставить: ${preset.name}`;
  };
  root.querySelector("#light-preset").dispatchEvent(new Event("change"));
  root.querySelector("#place-light-marker").onclick = async () => {
    const presetId = root.querySelector("#light-preset").value;
    await OBR.tool.setMetadata(`${EXTENSION_ID}/gm-tool`, { [PLACE_PRESET_KEY]: { id: presetId, ...LIGHT_PRESETS[presetId] } });
    // Close the manager before activating the placement mode. Closing a popover
    // after activation can restore the previous (Move) tool and swallow the click.
    await OBR.popover.close(`${EXTENSION_ID}/manager`);
    await OBR.tool.activateTool(`${EXTENSION_ID}/gm-tool`);
    await OBR.tool.activateMode(`${EXTENSION_ID}/gm-tool`, PLACE_MODE_ID);
    let modeIsActive = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const [activeTool, activeMode] = await Promise.all([OBR.tool.getActiveTool(), OBR.tool.getActiveToolMode()]);
      if (activeTool === `${EXTENSION_ID}/gm-tool` && activeMode === PLACE_MODE_ID) {
        modeIsActive = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!modeIsActive) {
      OBR.notification.show("Режим установки не включился. Повторно нажмите «Поставить источник».");
      return;
    }
    OBR.notification.show(`Режим установки активен (${extensionVersion}). Щёлкните по карте, чтобы поставить «${LIGHT_PRESETS[presetId].name}».`);
  };
  root.querySelector("#preview-current").onclick = async () => {
    const tokenId = root.querySelector("#token-select").value;
    if (!tokenId) return OBR.notification.show("Для предпросмотра выберите токен персонажа на карте.");
    const url = extensionUrl("./viewer.html");
    url.searchParams.set("previewToken", tokenId);
    url.searchParams.set("previewMode", root.querySelector("#mode-select").value);
    url.searchParams.set("previewDark", String(clamp(root.querySelector("#dark-range").value)));
    url.searchParams.set("previewAmbient", root.querySelector("#ambient-select").value);
    await OBR.modal.close(PREVIEW_MODAL_ID).catch(() => {});
    await OBR.tool.setMetadata(`${EXTENSION_ID}/gm-tool`, { [PREVIEW_ACTIVE_KEY]: true });
    await OBR.popover.close(`${EXTENSION_ID}/manager`);
    await OBR.modal.open({ id: PREVIEW_MODAL_ID, url: url.href, fullScreen: true, hideBackdrop: true, hidePaper: true, disablePointerEvents: true });
  };
  root.querySelectorAll("[data-preview-assignment]").forEach((button) => button.onclick = async () => {
    const entry = roomState.assignments[button.dataset.previewAssignment];
    const url = extensionUrl("./viewer.html");
    url.searchParams.set("previewPlayer", entry.playerId);
    await OBR.modal.close(PREVIEW_MODAL_ID).catch(() => {});
    await OBR.tool.setMetadata(`${EXTENSION_ID}/gm-tool`, { [PREVIEW_ACTIVE_KEY]: true });
    await OBR.popover.close(`${EXTENSION_ID}/manager`);
    await OBR.modal.open({ id: PREVIEW_MODAL_ID, url: url.href, fullScreen: true, hideBackdrop: true, hidePaper: true, disablePointerEvents: true });
  });
  root.querySelectorAll("[data-remove-assignment]").forEach((button) => button.onclick = async () => { delete roomState.assignments[button.dataset.removeAssignment]; await persist(); });
  root.querySelectorAll("[data-remove-light]").forEach((button) => button.onclick = async () => {
    const itemId = button.dataset.removeLight;
    if (roomState.lights[itemId]?.marker) await OBR.scene.items.deleteItems([itemId]);
    delete roomState.lights[itemId];
    await persist();
  });
  root.querySelectorAll("[data-edit-assignment]").forEach((button) => button.onclick = () => {
    const entry = roomState.assignments[button.dataset.editAssignment];
    root.querySelector("#token-select").value = button.dataset.editAssignment;
    root.querySelector("#player-select").value = entry.playerId;
    root.querySelector("#mode-select").value = entry.mode;
    root.querySelector("#dark-range").value = entry.darkvisionCells;
    root.querySelector("#save-assignment").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  root.querySelectorAll("[data-edit-light]").forEach((button) => button.onclick = () => {
    const entry = roomState.lights[button.dataset.editLight];
    root.querySelector("#light-select").value = button.dataset.editLight;
    root.querySelector("#light-bright").value = entry.brightCells;
    root.querySelector("#light-dim").value = entry.dimCells;
    if (entry.tint) root.querySelector("#light-preset").value = "darkvision";
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
