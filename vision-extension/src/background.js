import OBR, { buildShape } from "@owlbear-rodeo/sdk";
import { version as extensionVersion } from "../package.json";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const TOOL_ID = `${EXTENSION_ID}/gm-tool`;
const MODAL_ID = `${EXTENSION_ID}/vision-mask`;
const PREVIEW_MODAL_ID = `${EXTENSION_ID}/gm-preview`;
const EXIT_POPOVER_ID = `${EXTENSION_ID}/gm-preview-exit`;
const PLACE_MODE_ID = `${EXTENSION_ID}/place-light`;
const PLACE_PRESET_KEY = `${EXTENSION_ID}/place-preset`;
const LIGHT_MARKER_KEY = `${EXTENSION_ID}/light-marker`;
const LIGHT_DATA_KEY = `${EXTENSION_ID}/light-data`;
const MASK_EFFECT_KEY = `${EXTENSION_ID}/local-mask-effect`;
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
    let activeLightGhostId = null;
    let lastGhostMoveAt = 0;
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
    await OBR.tool.createMode({
      id: PLACE_MODE_ID,
      icons: [{
        icon: extensionUrl("./eye-icon-v3.svg").href,
        label: "Личный обзор · поставить источник света",
        filter: { roles: ["GM"] },
      }],
      cursors: [{ cursor: "crosshair", filter: { roles: ["GM"] } }],
      onActivate: async (context) => {
        const toolMetadata = context.metadata?.[PLACE_PRESET_KEY]
          ? context.metadata
          : await OBR.tool.getMetadata(TOOL_ID);
        const preset = toolMetadata?.[PLACE_PRESET_KEY];
        if (!preset) return;
        const dpiValue = Number(await OBR.scene.grid.getDpi());
        const size = Math.max(60, (dpiValue > 0 ? dpiValue : 70) * 0.95);
        const ghost = buildShape()
          .shapeType("CIRCLE")
          .width(size)
          .height(size)
          .fillColor("#ffd04d")
          .fillOpacity(0.42)
          .strokeColor("#fff1a9")
          .strokeOpacity(1)
          .strokeWidth(4)
          .name("Предпросмотр источника света")
          .position({ x: 0, y: 0 })
          .layer("PROP")
          .locked(true)
          .disableHit(true)
          .metadata({ [`${EXTENSION_ID}/light-ghost`]: true })
          .build();
        await OBR.scene.local.addItems([ghost]);
        activeLightGhostId = ghost.id;
      },
      onToolMove: async (_context, event) => {
        if (!activeLightGhostId || Date.now() - lastGhostMoveAt < 40) return;
        lastGhostMoveAt = Date.now();
        await OBR.scene.local.updateItems([activeLightGhostId], (items) => {
          for (const item of items) item.position = { x: event.pointerPosition.x, y: event.pointerPosition.y };
        }).catch((error) => console.warn("Не удалось передвинуть предпросмотр источника света", error));
      },
      onDeactivate: async () => {
        if (!activeLightGhostId) return;
        const ghostId = activeLightGhostId;
        activeLightGhostId = null;
        await OBR.scene.local.deleteItems([ghostId]).catch(() => {});
      },
      onToolClick: async (context, event) => {
        const toolMetadata = context.metadata?.[PLACE_PRESET_KEY]
          ? context.metadata
          : await OBR.tool.getMetadata(TOOL_ID);
        const preset = toolMetadata?.[PLACE_PRESET_KEY];
        if (!preset) {
          OBR.notification.show("Сначала выберите профиль света в панели «Личный обзор».");
          return false;
        }
        OBR.notification.show(`Щелчок принят. Ставлю источник «${preset.name}»…`);
        try {
          const dpiValue = Number(await OBR.scene.grid.getDpi());
          const dpi = dpiValue > 0 ? dpiValue : 70;
          const lightData = {
            name: `Источник света · ${preset.name}`,
            presetName: preset.name,
            brightCells: Number(preset.brightCells) || 0,
            dimCells: Number(preset.dimCells) || 0,
            tint: Boolean(preset.tint),
            marker: true,
          };
          const markerSize = Math.max(60, dpi * 0.95);
          const marker = buildShape()
            .shapeType("CIRCLE")
            .width(markerSize)
            .height(markerSize)
            .fillColor("#ffd04d")
            .fillOpacity(1)
            .strokeColor("#fff1a9")
            .strokeOpacity(1)
            .strokeWidth(5)
            .name(`Фонарь · ${preset.name}`)
            .position(event.pointerPosition)
            .zIndex(Date.now())
            .layer("PROP")
            .visible(true)
            .locked(false)
            .metadata({ [LIGHT_MARKER_KEY]: true, [LIGHT_DATA_KEY]: lightData })
            .build();

          await OBR.scene.items.addItems([marker]);
          const created = await OBR.scene.items.getItems([marker.id]);
          if (!created.length) throw new Error("Owlbear не вернул созданную метку источника света");
          const sceneMetadata = await OBR.scene.getMetadata();
          const state = sceneMetadata[STATE_KEY] || { ambient: "bright", assignments: {}, lights: {} };
          state.assignments ||= {};
          state.lights ||= {};
          state.lights[marker.id] = {
            ...lightData,
            position: { x: event.pointerPosition.x, y: event.pointerPosition.y },
          };
          await OBR.scene.setMetadata({ [STATE_KEY]: state });
          OBR.notification.show(`Источник «${preset.name}» поставлен: жёлтая метка добавлена на сцену и появится в списке света.`);
        } catch (error) {
          console.error("Не удалось поставить источник света", error);
          OBR.notification.show(`Не удалось поставить свет: ${error?.message || "ошибка Owlbear Rodeo"}`);
        }
        return false;
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
