import OBR, { buildShape } from "@owlbear-rodeo/sdk";

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
const PREVIEW_ACTIVE_KEY = `${EXTENSION_ID}/preview-active`;
const visionUrl = new URL("./viewer.html", location.href).href;

function selectVision(state, playerId) {
  return Object.values(state?.assignments || {}).find((entry) => entry.playerId === playerId) || null;
}

OBR.onReady(async () => {
  const role = await OBR.player.getRole();
  const playerId = await OBR.player.getId();
  let modalOpen = false;

  if (role === "GM") {
    await OBR.tool.create({
      id: TOOL_ID,
      icons: [{
        icon: new URL("./eye-icon-v3.svg", location.href).toString(),
        label: "Личный обзор · настройка",
        filter: { roles: ["GM"] },
      }],
      async onClick(context) {
        const metadata = await OBR.tool.getMetadata(TOOL_ID);
        if (metadata?.[PREVIEW_ACTIVE_KEY] || context.metadata?.[PREVIEW_ACTIVE_KEY]) {
          await OBR.tool.setMetadata(TOOL_ID, { [PREVIEW_ACTIVE_KEY]: false });
          await OBR.popover.close(EXIT_POPOVER_ID).catch(() => {});
          await OBR.popover.open({ id: `${EXTENSION_ID}/manager`, url: new URL("./", location.href).href, width: 520, height: 760 });
          await OBR.modal.close(PREVIEW_MODAL_ID).catch(() => {});
          return false;
        }
        OBR.popover.open({ id: `${EXTENSION_ID}/manager`, url: new URL("./", location.href).href, width: 520, height: 760 });
        return true;
      },
    });
    await OBR.tool.createMode({
      id: PLACE_MODE_ID,
      icons: [{
        icon: new URL("./eye-icon-v3.svg", location.href).toString(),
        label: "Личный обзор · поставить источник света",
        filter: { roles: ["GM"] },
      }],
      cursors: [{ cursor: "crosshair", filter: { roles: ["GM"] } }],
      onToolClick: async (context, event) => {
        const toolMetadata = context.metadata?.[PLACE_PRESET_KEY]
          ? context.metadata
          : await OBR.tool.getMetadata(TOOL_ID);
        const preset = toolMetadata?.[PLACE_PRESET_KEY];
        if (!preset) {
          OBR.notification.show("Сначала выберите профиль света в панели «Личный обзор».");
          return false;
        }
        try {
          const dpiValue = Number(await OBR.scene.grid.getDpi());
          const dpi = dpiValue > 0 ? dpiValue : 70;
          const lightData = {
            name: `💡 Источник света · ${preset.name}`,
            presetName: preset.name,
            brightCells: Number(preset.brightCells) || 0,
            dimCells: Number(preset.dimCells) || 0,
            tint: Boolean(preset.tint),
            marker: true,
          };
          const marker = buildShape()
            .shapeType("CIRCLE")
            .width(Math.max(42, dpi * 0.85))
            .height(Math.max(42, dpi * 0.85))
            .fillColor("#ffd04d")
            .fillOpacity(1)
            .strokeColor("#572b00")
            .strokeOpacity(1)
            .strokeWidth(6)
            .name(`💡 Источник света · ${preset.name}`)
            .position(event.pointerPosition)
            .layer("DRAWING")
            .visible(true)
            .locked(false)
            .metadata({ [LIGHT_MARKER_KEY]: true, [LIGHT_DATA_KEY]: lightData })
            .build();

          await OBR.scene.items.addItems([marker]);
          const sceneMetadata = await OBR.scene.getMetadata();
          const state = sceneMetadata[STATE_KEY] || { ambient: "bright", assignments: {}, lights: {} };
          state.assignments ||= {};
          state.lights ||= {};
          state.lights[marker.id] = {
            ...lightData,
            position: { x: event.pointerPosition.x, y: event.pointerPosition.y },
          };
          await OBR.scene.setMetadata({ [STATE_KEY]: state });
          OBR.notification.show(`Источник «${preset.name}» поставлен. На карте должна появиться крупная жёлтая метка; её можно переместить или удалить.`);
        } catch (error) {
          console.error("Не удалось поставить источник света", error);
          OBR.notification.show("Не удалось добавить источник света. Проверь, что сцена загружена и у расширения есть доступ к объектам сцены.");
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
      await OBR.modal.close(MODAL_ID).catch(() => {});
      modalOpen = false;
    }
  };

  const readState = async () => {
    if (!(await OBR.scene.isReady())) {
      if (modalOpen) { await OBR.modal.close(MODAL_ID).catch(() => {}); modalOpen = false; }
      return;
    }
    const metadata = await OBR.scene.getMetadata();
    await syncMask(metadata);
  };

  OBR.scene.onReadyChange(readState);
  OBR.scene.onMetadataChange(syncMask);
  await readState();
});
