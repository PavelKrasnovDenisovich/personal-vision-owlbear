import OBR from "@owlbear-rodeo/sdk";
import { syncStatusLabel } from "./status-label.js";

const EXTENSION_ID = "ru.codex.party-book";
const POPOVER_ID = `${EXTENSION_ID}/character-sheet`;
const BATTLE_TOOL_ID = `${EXTENSION_ID}/battle-panel`;
const BATTLE_POPOVER_ID = `${EXTENSION_ID}/battle-panel-popover`;
const normalizeName = (name) => String(name || "").trim().toLocaleLowerCase("ru");

async function autoBindNamedTokens(ownerKey) {
  try {
    if (!(await OBR.scene.isReady())) return;
    const stateKey = `party-book-v1:${ownerKey}`;
    const bindingsKey = `party-book-owlbear-bindings-v1:${ownerKey}`;
    const state = JSON.parse(localStorage.getItem(stateKey) || "null");
    const characters = state?.characters || [];
    if (!characters.length) return;
    let bindings = {};
    try { bindings = JSON.parse(localStorage.getItem(bindingsKey) || "{}") || {}; } catch { bindings = {}; }
    const sceneTokens = await OBR.scene.items.getItems((item) => item.layer === "CHARACTER" && item.visible !== false);
    let changed = false;
    for (const token of sceneTokens) {
      if (characters.some((character) => character.id === bindings[token.id])) continue;
      const match = characters.find((character) => normalizeName(character.name) === normalizeName(token.name));
      if (match) {
        bindings[token.id] = match.id;
        changed = true;
      }
    }
    if (changed) localStorage.setItem(bindingsKey, JSON.stringify(bindings));
  } catch (error) {
    console.warn("Не удалось автоматически связать токены с листами персонажей", error);
  }
}

async function refreshOwnerStatusLabels(ownerKey) {
  try {
    if (!(await OBR.scene.isReady())) return;
    const state = JSON.parse(localStorage.getItem(`party-book-v1:${ownerKey}`) || "null");
    const characters = state?.characters || [];
    if (!characters.length) return;
    let bindings = {};
    try { bindings = JSON.parse(localStorage.getItem(`party-book-owlbear-bindings-v1:${ownerKey}`) || "{}") || {}; } catch { bindings = {}; }
    const tokens = await OBR.scene.items.getItems((item) => item.layer === "CHARACTER" && item.visible !== false);
    for (const token of tokens) {
      const character = characters.find((entry) => entry.id === bindings[token.id])
        || characters.find((entry) => normalizeName(entry.name) === normalizeName(token.name));
      if (character?.statusEffects?.length) await syncStatusLabel(token.id, character);
    }
  } catch (error) {
    console.warn("Не удалось обновить метки статусов для новой версии", error);
  }
}

OBR.onReady(async () => {
  if (await OBR.player.getRole() === "GM") {
    const ownerKey = encodeURIComponent(await OBR.player.getId());
    const syncBindings = () => autoBindNamedTokens(ownerKey);
    await syncBindings();
    await refreshOwnerStatusLabels(ownerKey);
    OBR.scene.items.onChange(syncBindings);
    OBR.scene.onReadyChange(async (ready) => {
      if (!ready) return;
      await syncBindings();
      await refreshOwnerStatusLabels(ownerKey);
    });
    window.addEventListener("storage", (event) => {
      if (event.key === `party-book-v1:${ownerKey}` || event.key === `party-book-owlbear-bindings-v1:${ownerKey}`) {
        syncBindings();
        refreshOwnerStatusLabels(ownerKey);
      }
    });
  }
  const presentationModalId = `${EXTENSION_ID}/presentation-modal`;
  OBR.broadcast.onMessage(`${EXTENSION_ID}/presentation`, async (event) => {
    const data = event.data;
    if (data?.type !== "show" || typeof data.url !== "string" || typeof data.name !== "string") return;
    if (!/^https:\/\//i.test(data.url) || Date.now() - Number(data.sentAt || 0) > 30000) return;
    const url = new URL("./presentation.html", location.href);
    url.searchParams.set("image", data.url);
    url.searchParams.set("name", data.name);
    try {
      await OBR.modal.open({
        id: presentationModalId,
        url: url.href,
        width: 680,
        height: 470,
        hideBackdrop: true,
        hidePaper: true,
      });
    } catch (error) {
      console.warn("Не удалось открыть окно представления", error);
    }
  });

  OBR.tool.create({
    id: BATTLE_TOOL_ID,
    icons: [{
      icon: new URL("./book-icon-v3.svg", location.href).toString(),
      label: "Книга партии · боевая панель",
      filter: { roles: ["GM"] },
    }],
    onClick() {
      OBR.popover.open({
        id: BATTLE_POPOVER_ID,
        url: new URL("./", location.href).toString(),
        width: 430,
        height: 700,
      });
    },
  });

  OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu`,
    icons: [{
      icon: new URL("./book-icon-v3.svg", location.href).toString(),
      label: "Книга партии · лист персонажа",
      filter: { every: [{ key: "layer", value: "CHARACTER" }], roles: ["GM"] },
    }],
    async onClick(context, elementId) {
      const tokenId = context.items[0]?.id;
      if (!tokenId) return;
      const sheetUrl = new URL("sheet.html", location.href);
      sheetUrl.searchParams.set("item", tokenId);
      sheetUrl.searchParams.set("owner", await OBR.player.getId());
      OBR.popover.open({
        id: POPOVER_ID,
        url: sheetUrl.href,
        width: 1040,
        height: 760,
        anchorElementId: elementId,
      });
    },
  });
});
