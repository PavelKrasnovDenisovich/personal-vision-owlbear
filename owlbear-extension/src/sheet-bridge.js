import OBR, { buildImageUpload } from "@owlbear-rodeo/sdk";
import { STATUS_BADGES, syncStatusLabel as updateStatusLabel } from "./status-label.js";

const LEGACY_DATA_KEY = "ru.codex.party-book/character";
const PRESENTATION_CHANNEL = "ru.codex.party-book/presentation";
const ownerId = new URLSearchParams(location.search).get("owner") || "default";
const BINDINGS_KEY = `party-book-owlbear-bindings-v1:${encodeURIComponent(ownerId)}`;
const itemId = new URLSearchParams(location.search).get("item");
const conditions = {
  "Ослеплён": ["blinded", "🚫👁️"], "Очарован": ["charmed", "💗"], "Оглох": ["deafened", "🚫👂"],
  "Истощение": ["exhaustion", "🥱"], "Испуган": ["frightened", "😨"], "Схвачен": ["grappled", "🤼"],
  "Недееспособен": ["incapacitated", "🛑"], "Невидим": ["invisible", "👻"], "Парализован": ["paralyzed", "🧊"],
  "Окаменел": ["petrified", "🪨"], "Отравлен": ["poisoned", "🐍"], "Сбит с ног": ["prone", "🛌"], "Мёртв": ["dead", "💀"],
  "Опутан": ["restrained", "⛓️"], "Ошеломлён": ["stunned", "💫"], "Без сознания": ["unconscious", "💤"],
};

function legacyStatuses(data) {
  if (Array.isArray(data.statusEffects)) return data.statusEffects;
  return (Array.isArray(data.statuses) ? data.statuses : []).map((name) => {
    const [id, icon] = conditions[name] || [String(name).toLowerCase(), "🔸"];
    return { id, icon, name, duration: "Активен" };
  });
}

function readBindings() {
  try { return JSON.parse(localStorage.getItem(BINDINGS_KEY)) || {}; } catch { return {}; }
}

function setNotice(message) {
  document.documentElement.style.visibility = "visible";
  document.body.innerHTML = `<main style="margin:10vh auto;max-width:560px;padding:28px;border:1px solid #394137;border-radius:16px;background:#191c19;color:#f0f1e9;font:16px system-ui"><h2>Книга партии</h2><p>${message}</p></main>`;
}

function requestCharacterJson(characterName) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:18px;background:#080b09d9;font:14px system-ui;color:#f1f2e9";
    const panel = document.createElement("div");
    panel.style.cssText = "width:min(520px,100%);padding:22px;border:1px solid #566449;border-radius:16px;background:#1b211a;box-shadow:0 20px 70px #000a";
    const title = document.createElement("h2");
    title.textContent = `Добавить лист: ${characterName}`;
    title.style.cssText = "margin:0 0 9px;font:600 22px Georgia,serif";
    const help = document.createElement("p");
    help.textContent = "Перетащи сюда JSON-файл персонажа, созданный ChatGPT, или нажми кнопку выбора файла.";
    help.style.cssText = "color:#aab3a3;line-height:1.55";
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json"; input.hidden = true;
    const drop = document.createElement("button");
    drop.type = "button";
    drop.textContent = "Перетащи JSON сюда или выбери файл";
    drop.style.cssText = "width:100%;min-height:110px;padding:18px;border:1px dashed #899b6a;border-radius:12px;background:#242c21;color:#dce9cb;font:600 14px system-ui;cursor:pointer";
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.textContent = "Отмена";
    cancel.style.cssText = "display:block;margin:14px 0 0 auto;padding:8px 13px;border:1px solid #555d50;border-radius:8px;background:#292e28;color:#d8ddd2;cursor:pointer";
    panel.append(title, help, drop, input, cancel); overlay.append(panel); document.body.append(overlay);
    let finished = false;
    const finish = (value) => { if (finished) return; finished = true; overlay.remove(); resolve(value); };
    const read = async (file) => {
      if (!file) return;
      try { finish(await file.text()); }
      catch { finish(null); OBR.notification.show("Не удалось прочитать JSON-файл."); }
    };
    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", () => read(input.files?.[0]));
    cancel.addEventListener("click", () => finish(null));
    overlay.addEventListener("dragover", (event) => { event.preventDefault(); drop.style.background = "#303b2a"; });
    overlay.addEventListener("dragleave", () => { drop.style.background = "#242c21"; });
    overlay.addEventListener("drop", (event) => { event.preventDefault(); read([...event.dataTransfer.files].find((file) => file.name.toLowerCase().endsWith(".json") || file.type === "application/json")); });
  });
}

function chooseGifFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gif,image/gif";
    input.addEventListener("change", () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

async function uploadPresentation(characterId, app) {
  const file = await chooseGifFile();
  if (!file) return;
  const looksLikeGif = file.type === "image/gif" || file.name.toLocaleLowerCase("en").endsWith(".gif");
  if (!looksLikeGif) {
    OBR.notification.show("Выбери GIF-файл.");
    return;
  }
  try {
    const data = await file.arrayBuffer();
    const gif = new File([data], file.name, { type: "image/gif" });
    await OBR.assets.uploadImages([buildImageUpload(gif).name(file.name).build()], "PROP");
    OBR.notification.show("GIF загружен в Owlbear. Выбери его в открывшейся библиотеке, чтобы привязать к персонажу.");
    const selected = await OBR.assets.downloadImages(false, file.name, "PROP");
    const asset = selected?.[0];
    if (!asset?.image?.url) {
      OBR.notification.show("GIF загружен, но не выбран. Нажми «Загрузить GIF» ещё раз и выбери его в библиотеке.");
      return;
    }
    app.setPresentation(characterId, { url: asset.image.url, name: asset.name || file.name });
    OBR.notification.show(`GIF привязан: ${asset.name || file.name}`);
  } catch (error) {
    console.error("Не удалось загрузить GIF для представления", error);
    OBR.notification.show("Не удалось загрузить или выбрать GIF в библиотеке Owlbear.");
  }
}

async function showPresentation(characterId, app) {
  const character = app.characters().find((entry) => entry.id === characterId);
  if (!character?.presentation?.url) {
    OBR.notification.show("Сначала загрузи GIF для этого персонажа.");
    return;
  }
  try {
    await OBR.broadcast.sendMessage(PRESENTATION_CHANNEL, {
      type: "show",
      url: character.presentation.url,
      name: character.name,
      sentAt: Date.now(),
    }, { destination: "ALL" });
  } catch (error) {
    console.error("Не удалось показать представление участникам", error);
    OBR.notification.show("Не удалось отправить представление участникам комнаты.");
  }
}

OBR.onReady(async () => {
  if (!itemId) return;
  const role = await OBR.player.getRole();
  if (role !== "GM") {
    setNotice("Листы персонажей доступны только мастеру.");
    return;
  }
  document.documentElement.style.visibility = "visible";

  const app = window.partyBookApp;
  if (!app) {
    setNotice("Не удалось загрузить лист. Обнови страницу и открой токен ещё раз.");
    return;
  }
  window.partyBookPresentation = {
    upload: (characterId) => uploadPresentation(characterId, app),
    show: (characterId) => showPresentation(characterId, app),
  };

  const selected = await OBR.scene.items.getItems([itemId]);
  const token = selected[0];
  if (!token) {
    setNotice("Токен не найден в текущей сцене.");
    return;
  }

  const bindings = readBindings();
  const legacy = token.metadata?.[LEGACY_DATA_KEY] || {};
  const characters = app.characters();
  let character = characters.find((entry) => entry.id === bindings[itemId])
    || characters.find((entry) => entry.id === legacy.characterId)
    || characters.find((entry) => entry.name.trim().toLocaleLowerCase("ru") === String(legacy.name || token.name || "").trim().toLocaleLowerCase("ru"));

  if (!character) {
    const names = characters.map((entry) => entry.name).join(", ");
    const chosenName = window.prompt(`Токен «${token.name || "без имени"}» ещё не связан с листом. Введи точное имя персонажа из книги.\nДоступны: ${names}`, token.name || "");
    if (!chosenName) { document.documentElement.style.visibility = "visible"; return; }
    character = characters.find((entry) => entry.name.trim().toLocaleLowerCase("ru") === chosenName.trim().toLocaleLowerCase("ru"));
  }
  if (!character) {
    const create = window.confirm(`В книге пока нет листа «${chosenName}». Создать его из JSON-файла персонажа?`);
    if (!create) return;
    const json = await requestCharacterJson(chosenName);
    if (!json) return;
    try { character = app.importCharacterPackage(json, chosenName); }
    catch (error) {
      setNotice(`Не удалось добавить лист: ${error?.message || "проверь JSON-файл"}`);
      return;
    }
    if (!character) { setNotice("Не удалось создать лист персонажа из этого файла."); return; }
  }

  app.selectCharacter(character.id);
  if (legacy.characterId || legacy.hp !== undefined || legacy.statuses || legacy.statusEffects) {
    app.applyOwlbear({
      ...legacy,
      characterId: character.id,
      hp: typeof legacy.hp === "object" ? legacy.hp : { current: legacy.hp, max: legacy.hpMax },
      statusEffects: legacyStatuses(legacy),
    });
  }

  bindings[itemId] = character.id;
  localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
  window.partyBookIntegrationReady = true;

  // Migrate old version data out of shared scene metadata so players cannot inspect NPC HP/resources.
  if (token.metadata?.[LEGACY_DATA_KEY]) {
    await OBR.scene.items.updateItems([itemId], (items) => {
      for (const item of items) delete item.metadata[LEGACY_DATA_KEY];
    });
  }

  let lastStatusSignature = "";
  let labelQueue = Promise.resolve();
  const syncStatusLabel = (ch) => {
    const statuses = ch?.statusEffects || [];
    const signature = JSON.stringify(statuses.map((status) => [status.id, STATUS_BADGES[status.id] || "!!", status.name]));
    if (signature === lastStatusSignature) return;
    lastStatusSignature = signature;
    labelQueue = labelQueue.then(() => updateStatusLabel(itemId, ch));
  };

  window.addEventListener("partybook:changed", (event) => {
    if (event.detail?.id !== character.id) return;
    syncStatusLabel(event.detail);
  });
  syncStatusLabel(app.characters().find((entry) => entry.id === character.id));

  const linkBar = document.createElement("div");
  linkBar.style.cssText = "position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 14px;margin:0 0 10px;background:#222820;border:1px solid #4a5940;border-radius:10px;color:#dce9cc;font:12px system-ui";
  linkBar.innerHTML = `<span>🔒 GM · токен: <strong>${String(token.name || character.name).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}</strong></span><span style="display:flex;gap:6px"><button id="obrRebind" type="button" style="padding:7px 9px;border:1px solid #526249;border-radius:7px;background:#303b2a;color:#e3efd4;cursor:pointer">Перепривязать</button><button id="obrDetach" type="button" style="padding:7px 9px;border:1px solid #86554c;border-radius:7px;background:#422b27;color:#ffd1c4;cursor:pointer">Открепить</button></span>`;
  document.querySelector(".main")?.prepend(linkBar);
  document.querySelector("#obrRebind")?.addEventListener("click", () => {
    const names = app.characters().map((entry) => entry.name).join(", ");
    const chosenName = window.prompt(`Введи точное имя персонажа из книги.\nДоступны: ${names}`, character.name);
    if (!chosenName) return;
    const nextCharacter = app.characters().find((entry) => entry.name.trim().toLocaleLowerCase("ru") === chosenName.trim().toLocaleLowerCase("ru"));
    if (!nextCharacter) { OBR.notification.show("Персонаж с таким именем не найден."); return; }
    character = nextCharacter;
    bindings[itemId] = character.id;
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
    app.selectCharacter(character.id);
    lastStatusSignature = "";
    syncStatusLabel(character);
    linkBar.querySelector("strong").textContent = token.name || character.name;
    OBR.notification.show(`Токен связан с листом «${character.name}»`);
  });
  document.querySelector("#obrDetach")?.addEventListener("click", async () => {
    delete bindings[itemId];
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
    lastStatusSignature = "";
    syncStatusLabel({ name: character.name, statusEffects: [] });
    await labelQueue;
    OBR.notification.show("Лист откреплён от токена");
    await OBR.popover.close("ru.codex.party-book/character-sheet");
  });
  OBR.notification.show(`Лист «${character.name}» открыт для мастера`);
});
