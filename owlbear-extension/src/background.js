import OBR from "@owlbear-rodeo/sdk";

const EXTENSION_ID = "ru.codex.party-book";
const POPOVER_ID = `${EXTENSION_ID}/character-sheet`;
const BATTLE_TOOL_ID = `${EXTENSION_ID}/battle-panel`;
const BATTLE_POPOVER_ID = `${EXTENSION_ID}/battle-panel-popover`;
OBR.onReady(() => {
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
      icon: new URL("./icon.svg", location.href).toString(),
      label: "Боевая панель",
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
      icon: new URL("./icon.svg", location.href).toString(),
      label: "Открыть лист персонажа",
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
