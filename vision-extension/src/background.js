import OBR from "@owlbear-rodeo/sdk";
import { version as extensionVersion } from "../package.json";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const TOOL_ID = `${EXTENSION_ID}/gm-tool`;
const MODAL_ID = `${EXTENSION_ID}/vision-mask`;
const PREVIEW_MODAL_ID = `${EXTENSION_ID}/gm-preview`;
const EXIT_POPOVER_ID = `${EXTENSION_ID}/gm-preview-exit`;
const LIGHT_MARKER_KEY = `${EXTENSION_ID}/light-marker`;
const LIGHT_DATA_KEY = `${EXTENSION_ID}/light-data`;
const MASK_EFFECT_KEY = `${EXTENSION_ID}/local-mask-effect`;
const LIGHT_GHOST_KEY = `${EXTENSION_ID}/light-ghost`;
const OLD_PLACE_MODE_ID = `${EXTENSION_ID}/place-light`;
const PREVIEW_ACTIVE_KEY = `${EXTENSION_ID}/preview-active`;
const extensionUrl = (path) => {
  const url = new URL(path, location.href);
  url.searchParams.set("v", extensionVersion);
  return url;
};
const visionUrl = extensionUrl("./viewer.html").href;

function selectVision(state, playerId) {
  return Object.values(state?.assignments || {}).find((entry) => entry.playerId === playerId) || null;
}

async function clearLocalMask() {
  const localItems = await OBR.scene.local.getItems().catch(() => []);
  const maskIds = localItems.filter((item) => item.metadata?.[MASK_EFFECT_KEY]).map((item) => item.id);
  if (maskIds.length) await OBR.scene.local.deleteItems(maskIds).catch(() => {});
}

OBR.onReady(async () => {
  const role = await OBR.player.getRole();
  const playerId = await OBR.player.getId();
  let modalOpen = false;

  if (role === "GM") {
    await OBR.tool.removeMode(OLD_PLACE_MODE_ID).catch(() => {});
    const localItems = await OBR.scene.local.getItems().catch(() => []);
    const ghostIds = localItems.filter((item) => item.metadata?.[LIGHT_GHOST_KEY]).map((item) => item.id);
    if (ghostIds.length) await OBR.scene.local.deleteItems(ghostIds).catch(() => {});
    await OBR.tool.create({
      id: TOOL_ID,
      icons: [{
        icon: extensionUrl("./eye-icon-v3.svg").href,
        label: "Личный обзор · настройка",
        filter: { roles: ["GM"] },
      }],
      async onClick(context) {
        const metadata = await OBR.tool.getMetadata(TOOL_ID);
        if (metadata?.[PREVIEW_ACTIVE_KEY] || context.metadata?.[PREVIEW_ACTIVE_KEY]) {
          await OBR.tool.setMetadata(TOOL_ID, { [PREVIEW_ACTIVE_KEY]: false });
          await clearLocalMask();
          await OBR.popover.close(EXIT_POPOVER_ID).catch(() => {});
          await OBR.popover.open({ id: `${EXTENSION_ID}/manager`, url: extensionUrl("./").href, width: 520, height: 760 });
          await OBR.modal.close(PREVIEW_MODAL_ID).catch(() => {});
          return false;
        }
        OBR.popover.open({ id: `${EXTENSION_ID}/manager`, url: extensionUrl("./").href, width: 520, height: 760 });
        return true;
      },
    });
    OBR.scene.items.onChange(async (sceneItems) => {
      try {
        const metadata = await OBR.scene.getMetadata();
        const state = metadata[STATE_KEY];
        if (!state?.lights) return;
        const itemIds = new Set(sceneItems.map((item) => item.id));
        let changed = false;
        for (const [itemId, light] of Object.entries(state.lights)) {
          if (light.marker && !itemIds.has(itemId)) {
            delete state.lights[itemId];
            changed = true;
          }
        }
        if (changed) await OBR.scene.setMetadata({ [STATE_KEY]: state });
      } catch (error) {
        console.warn("Не удалось синхронизировать источники света со сценой", error);
      }
    });
    return;
  }

  const syncMask = async (metadata) => {
    const assignment = selectVision(metadata?.[STATE_KEY], playerId);
    if (assignment && !modalOpen) {
      await OBR.modal.open({ id: MODAL_ID, url: visionUrl, fullScreen: true, hideBackdrop: true, hidePaper: true, disablePointerEvents: true });
      modalOpen = true;
    } else if (!assignment && modalOpen) {
      await clearLocalMask();
      await OBR.modal.close(MODAL_ID).catch(() => {});
      modalOpen = false;
    }
  };

  const readState = async () => {
    if (!(await OBR.scene.isReady())) {
      if (modalOpen) { await clearLocalMask(); await OBR.modal.close(MODAL_ID).catch(() => {}); modalOpen = false; }
      return;
    }
    const metadata = await OBR.scene.getMetadata();
    await syncMask(metadata);
  };

  OBR.scene.onReadyChange(readState);
  OBR.scene.onMetadataChange(syncMask);
  await readState();
});
