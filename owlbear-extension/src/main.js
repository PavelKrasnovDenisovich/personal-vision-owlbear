import OBR from "@owlbear-rodeo/sdk";
import { syncStatusLabel } from "./status-label.js";
import "./style.css";

let STATE_KEY = "party-book-v1";
let BINDINGS_KEY = "party-book-owlbear-bindings-v1";
let EXCLUDED_KEY = "party-book-owlbear-combat-excluded-v1";
let INITIATIVE_KEY = "party-book-owlbear-initiative-v1";
let TOKEN_HP_KEY = "party-book-owlbear-token-hp-v1";
const STEPS = [1, 3, 5, 10, 20];
const root = document.querySelector("#app");
let mode = "damage";
const selectedSteps = {};
let tokens = [];
let state = null;
let bindings = {};
let excluded = [];
let initiatives = {};
let tokenHp = {};
let role = "PLAYER";
let accountId = "";

const safeParse = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const normalized = (value) => String(value || "").trim().toLocaleLowerCase("ru");

function render(message = "") {
  if (role !== "GM") {
    root.innerHTML = `<main class="dashboard"><header class="tracker-head"><span class="book-mark">📖</span><div><div class="eyebrow">КНИГА ПАРТИИ</div><h1>Боевая панель</h1></div></header><p class="muted">Эта панель доступна только ведущему.</p></main>`;
    return;
  }
  const characters = state?.characters || [];
  const visibleTokens = tokens.filter((token) => !excluded.includes(token.id)).sort((a, b) => {
    const ai = Number.isFinite(Number(initiatives[a.id])) ? Number(initiatives[a.id]) : null;
    const bi = Number.isFinite(Number(initiatives[b.id])) ? Number(initiatives[b.id]) : null;
    if (ai === null && bi !== null) return 1;
    if (bi === null && ai !== null) return -1;
    if (ai !== null && bi !== null && ai !== bi) return bi - ai;
    return normalized(a.name).localeCompare(normalized(b.name), "ru");
  });
  const cards = visibleTokens.map((token, index) => {
    const charId = bindings[token.id];
    const character = characters.find((c) => c.id === charId)
      || characters.find((c) => normalized(c.name) === normalized(token.name));
    const hp = character?.stats?.hp || tokenHp[token.id] || { current: 0, max: 0, temp: 0 };
    const current = Math.max(0, Number(hp?.current) || 0);
    const max = Math.max(0, Number(hp?.max) || 0);
    const pct = max ? Math.min(100, current / max * 100) : 0;
    const temp = Math.max(0, Number(hp?.temp) || 0);
    const tokenStep = selectedSteps[token.id] ?? 2;
    const dead = character
      ? (character.statusEffects || []).some((s) => s.id === "dead")
      : Boolean(tokenHp[token.id]?.dead);
    const initiative = Number.isFinite(Number(initiatives[token.id])) ? Number(initiatives[token.id]) : "";
    const imageUrl = token.type === "IMAGE" && token.image?.url ? token.image.url : "";
    const avatar = imageUrl
      ? `<img src="${esc(imageUrl)}" alt="${esc(token.name || "Токен")}">`
      : `<span>${dead ? "💀" : "🎲"}</span>`;
    return `<article class="token-card ${dead ? "is-dead" : ""}">
      <div class="token-top"><div class="initiative-order">${index + 1}</div><div class="token-avatar">${avatar}${dead ? `<span class="death-mark" title="Мёртв">💀</span>` : ""}</div><div class="token-title"><strong>${esc(token.name || "Без имени")}</strong><small>${character ? esc(character.name) : "Без листа персонажа"}${dead ? " · МЁРТВ" : ""}</small></div><label class="initiative-control"><small>ИНИЦ.</small><span class="initiative-entry"><button class="roll-initiative" type="button" data-roll-initiative="${esc(token.id)}" title="Бросить инициативу" aria-label="Бросить инициативу для ${esc(token.name)}">🎲</button><input type="number" step="1" data-initiative="${esc(token.id)}" value="${initiative}" placeholder="—" aria-label="Текущая инициатива для ${esc(token.name)}"></span></label><div class="hp-number">${current}<small> / ${max}</small></div></div>
      ${character ? `<div class="hp-meter"><span style="width:${pct}%"></span></div>${temp ? `<div class="temp-hp">Временные HP: ${temp}</div>` : `<div class="temp-hp">&nbsp;</div>`}` : `<div class="standalone-hp"><label>ТЕКУЩИЕ HP<input type="number" min="0" step="1" value="${current}" data-token-hp="current" data-token-id="${esc(token.id)}"></label><label>МАКС. HP<input type="number" min="0" step="1" value="${max}" data-token-hp="max" data-token-id="${esc(token.id)}"></label></div><div class="hp-meter"><span style="width:${pct}%"></span></div>`}
      <div class="change-controls"><div class="mode-toggle"><button class="mode-button ${mode === "damage" ? "selected damage" : ""}" data-mode="damage" aria-label="Урон">−</button><button class="mode-button ${mode === "heal" ? "selected heal" : ""}" data-mode="heal" aria-label="Лечение">＋</button></div><div class="slider-wrap"><div class="slider-caption"><span>${mode === "damage" ? "Урон" : "Лечение"}</span><b>${mode === "damage" ? "−" : "+"}${STEPS[tokenStep]} HP</b></div><input type="range" min="0" max="4" step="1" value="${tokenStep}" data-step="${esc(token.id)}" aria-label="Размер изменения HP"></div><button class="apply-change ${mode}" data-apply="${esc(token.id)}">${mode === "damage" ? "Нанести" : "Вылечить"}</button></div>
      <button class="exclude-token" data-exclude-token="${esc(token.id)}">Убрать из боя</button>
    </article>`;
  }).join("");
  root.innerHTML = `<main class="dashboard"><header class="tracker-head"><span class="book-mark">📖</span><div><div class="eyebrow">КНИГА ПАРТИИ</div><h1>Боевая панель</h1></div><button class="refresh" id="refresh" title="Обновить">↻</button></header>
    <div class="summary"><span>${visibleTokens.length} токенов в бою · порядок инициативы ↓</span><span class="global-mode">${mode === "damage" ? "⚔ Урон" : "✚ Лечение"}</span></div>
    <p class="initiative-hint">Впиши результат инициативы в карточку — список перестроится автоматически.</p>
    ${excluded.length ? `<button class="restore-excluded" id="restore-excluded">Вернуть исключённые токены (${excluded.length})</button>` : ""}
    ${message ? `<p class="toast">${esc(message)}</p>` : ""}
    <section class="token-list">${cards || `<div class="empty">Нет токенов в боевом списке. Можно вернуть ранее исключённые.</div>`}</section>
    <footer>Изменения HP сохраняются в листах ведущего и не раскрываются игрокам.</footer></main>`;
  root.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => { mode = button.dataset.mode; render(); }));
  root.querySelectorAll(".token-avatar img").forEach((img) => img.addEventListener("error", () => img.replaceWith(document.createTextNode("🎲")), { once: true }));
  root.querySelectorAll("[data-step]").forEach((input) => input.addEventListener("input", () => {
    selectedSteps[input.dataset.step] = Number(input.value);
    const label = input.closest(".slider-wrap")?.querySelector(".slider-caption b");
    if (label) label.textContent = `${mode === "damage" ? "−" : "+"}${STEPS[selectedSteps[input.dataset.step]]} HP`;
  }));
  root.querySelector("#refresh")?.addEventListener("click", refresh);
  root.querySelectorAll("[data-apply]").forEach((button) => button.addEventListener("click", () => applyChange(button.dataset.apply)));
  root.querySelectorAll("[data-token-hp]").forEach((input) => input.addEventListener("change", () => {
    const tokenId = input.dataset.tokenId;
    const record = tokenHp[tokenId] ||= { current: 0, max: 0, temp: 0, dead: false };
    const previous = Number(record.current) || 0;
    record[input.dataset.tokenHp] = Math.max(0, Number(input.value) || 0);
    if (input.dataset.tokenHp === "max" && record.max > 0) record.current = Math.min(record.current, record.max);
    if (record.max > 0) record.current = Math.min(record.current, record.max);
    if (previous > 0 && record.current <= 0) record.dead = true;
    if (record.current > 0) record.dead = false;
    localStorage.setItem(TOKEN_HP_KEY, JSON.stringify(tokenHp));
    render(`${tokens.find((token) => token.id === tokenId)?.name || "Токен"}: HP обновлены.`);
  }));
  root.querySelectorAll("[data-exclude-token]").forEach((button) => button.addEventListener("click", () => {
    excluded = [...new Set([...excluded, button.dataset.excludeToken])];
    localStorage.setItem(EXCLUDED_KEY, JSON.stringify(excluded));
    render("Токен убран из боевого списка.");
  }));
  root.querySelectorAll("[data-initiative]").forEach((input) => input.addEventListener("change", () => {
    const tokenId = input.dataset.initiative;
    if (input.value.trim() === "") delete initiatives[tokenId];
    else initiatives[tokenId] = Number(input.value);
    localStorage.setItem(INITIATIVE_KEY, JSON.stringify(initiatives));
    const name = tokens.find((token) => token.id === tokenId)?.name || "Токен";
    render(input.value.trim() === "" ? `${name}: инициатива очищена.` : `${name}: инициатива ${input.value}.`);
  }));
  root.querySelectorAll("[data-roll-initiative]").forEach((button) => button.addEventListener("click", () => {
    const tokenId = button.dataset.rollInitiative;
    const token = tokens.find((entry) => entry.id === tokenId);
    const character = characters.find((entry) => entry.id === bindings[tokenId])
      || characters.find((entry) => normalized(entry.name) === normalized(token?.name));
    const dexterity = Number(character?.stats?.abilityScores?.dex?.score);
    const modifier = character && Number.isFinite(dexterity) ? Math.floor((dexterity - 10) / 2) : 0;
    const natural = 1 + Math.floor(Math.random() * 20);
    const total = natural + modifier;
    initiatives[tokenId] = total;
    localStorage.setItem(INITIATIVE_KEY, JSON.stringify(initiatives));
    render(`${token?.name || "Токен"}: инициатива ${total}.`);
    showInitiativeResult(token?.name || "Токен", natural, modifier, total);
  }));
  root.querySelector("#restore-excluded")?.addEventListener("click", () => {
    excluded = [];
    localStorage.setItem(EXCLUDED_KEY, "[]");
    render("Исключённые токены возвращены.");
  });
}

function applyChange(tokenId) {
  const token = tokens.find((item) => item.id === tokenId);
  const character = state?.characters?.find((c) => c.id === bindings[tokenId])
    || state?.characters?.find((c) => normalized(c.name) === normalized(token?.name));
  const record = character?.stats?.hp || (tokenHp[tokenId] ||= { current: 0, max: 0, temp: 0, dead: false });
  const hp = record;
  const previousCurrent = Number(hp.current) || 0;
  const amount = STEPS[selectedSteps[tokenId] ?? 2];
  if (mode === "damage") {
    const absorbed = Math.min(Math.max(0, Number(hp.temp) || 0), amount);
    hp.temp = Math.max(0, (Number(hp.temp) || 0) - absorbed);
    hp.current = Math.max(0, (Number(hp.current) || 0) - (amount - absorbed));
  } else {
    hp.current = Math.min(Math.max(0, Number(hp.max) || 0), (Number(hp.current) || 0) + amount);
  }
  if (previousCurrent > 0 && Number(hp.current) <= 0 && character) {
    character.statusEffects ||= [];
    if (!character.statusEffects.some((status) => status.id === "dead")) character.statusEffects.push({ id: "dead", icon: "💀", name: "Мёртв", duration: "HP достигли 0" });
    const linkedTokens = tokens.filter((entry) => bindings[entry.id] === character.id || normalized(entry.name) === normalized(character.name));
    linkedTokens.forEach((token) => syncStatusLabel(token.id, character));
  }
  if (!character) {
    hp.dead = previousCurrent > 0 && Number(hp.current) <= 0 ? true : Number(hp.current) > 0 ? false : Boolean(hp.dead);
    localStorage.setItem(TOKEN_HP_KEY, JSON.stringify(tokenHp));
  }
  if (character) localStorage.setItem(STATE_KEY, JSON.stringify(state));
  render(`${token?.name || character?.name || "Токен"}: ${mode === "damage" ? "−" : "+"}${amount} HP`);
}

function showInitiativeResult(name, natural, modifier, total) {
  const overlay = document.createElement("div");
  const isCritical = natural === 20;
  const isFumble = natural === 1;
  const color = isCritical ? "#e5bd77" : isFumble ? "#d87867" : "#9ebc7a";
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:22px;background:#090c0cf5;color:#f1f2e9;text-align:center;font-family:system-ui,sans-serif";
  overlay.innerHTML = `<div style="max-width:340px"><div style="font-size:13px;color:#aab3a4">Инициатива · ${esc(name)}</div><div style="width:min(220px,58vw);aspect-ratio:1;margin:24px auto 14px;border:5px solid ${color};border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#3a4932,#1a2118 68%);box-shadow:0 0 0 11px ${color}22,0 0 65px ${color}55"><span style="font:clamp(72px,16vw,120px) Georgia,serif;color:${color}">${total}</span></div><div style="font-size:18px;font-weight:750;color:${color}">${isCritical ? "НАТУРАЛЬНАЯ 20 · КРИТИЧЕСКИЙ УСПЕХ" : isFumble ? "НАТУРАЛЬНАЯ 1" : "БРОСОК ИНИЦИАТИВЫ"}</div><div style="margin:12px 0 22px;font:14px ui-monospace,monospace;color:#d1d8ca">d20: ${natural}　${modifier >= 0 ? "+" : "−"} ЛОВ ${Math.abs(modifier)}　= ${total}</div><button type="button" style="border:0;border-radius:9px;padding:11px 22px;background:#c9e3a1;color:#1f2819;font-weight:800;cursor:pointer">Продолжить</button></div>`;
  document.body.append(overlay);
  overlay.querySelector("button").addEventListener("click", () => overlay.remove());
}

async function refresh() {
  state = safeParse(localStorage.getItem(STATE_KEY), { characters: [] });
  bindings = safeParse(localStorage.getItem(BINDINGS_KEY), {});
  excluded = safeParse(localStorage.getItem(EXCLUDED_KEY), []);
  initiatives = safeParse(localStorage.getItem(INITIATIVE_KEY), {});
  tokenHp = safeParse(localStorage.getItem(TOKEN_HP_KEY), {});
  try {
    tokens = await OBR.scene.items.getItems((item) => item.layer === "CHARACTER" && item.visible !== false);
  } catch { tokens = []; }
  render();
}

OBR.onReady(async () => {
  accountId = await OBR.player.getId();
  const ownerId = encodeURIComponent(accountId);
  STATE_KEY = `party-book-v1:${ownerId}`;
  BINDINGS_KEY = `party-book-owlbear-bindings-v1:${ownerId}`;
  EXCLUDED_KEY = `party-book-owlbear-combat-excluded-v1:${ownerId}`;
  INITIATIVE_KEY = `party-book-owlbear-initiative-v1:${ownerId}`;
  TOKEN_HP_KEY = `party-book-owlbear-token-hp-v1:${ownerId}`;
  role = await OBR.player.getRole();
  if (role !== "GM") { render(); return; }
  await refresh();
  OBR.scene.items.onChange(refresh);
  window.addEventListener("storage", (event) => {
    if ([STATE_KEY, BINDINGS_KEY, EXCLUDED_KEY, INITIATIVE_KEY, TOKEN_HP_KEY].includes(event.key)) refresh();
  });
});
