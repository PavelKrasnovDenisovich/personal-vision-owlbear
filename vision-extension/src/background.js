import OBR, { buildImage } from "@owlbear-rodeo/sdk";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const TOOL_ID = `${EXTENSION_ID}/gm-tool`;
const MODAL_ID = `${EXTENSION_ID}/vision-mask`;
const PREVIEW_MODAL_ID = `${EXTENSION_ID}/gm-preview`;
const PLACE_MODE_ID = `${EXTENSION_ID}/place-light`;
const PLACE_PRESET_KEY = `${EXTENSION_ID}/place-preset`;
const LIGHT_MARKER_KEY = `${EXTENSION_ID}/light-marker`;
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
        const preset = context.metadata?.[PLACE_PRESET_KEY];
        if (!preset) {
          OBR.notification.show("Сначала выберите профиль света в панели «Личный обзор».");
          return false;
        }
        const dpiValue = Number(await OBR.scene.grid.getDpi());
        const dpi = dpiValue > 0 ? dpiValue : 70;
        const marker = buildImage(
          { width: 64, height: 64, mime: "image/svg+xml", url: new URL("./light-marker.svg", location.href).href },
          { offset: { x: 0, y: 0 }, dpi },
        )
          .name(`Метка света · ${preset.name}`)
          .position(event.pointerPosition)
          .layer("PROP")
          .visible(true)
          .locked(false)
          .disableHit(false)
          .metadata({ [LIGHT_MARKER_KEY]: true })
          .build();

        await OBR.scene.items.addItems([marker]);
        const metadata = await OBR.scene.getMetadata();
        const state = metadata[STATE_KEY] || { ambient: "bright", assignments: {}, lights: {} };
        state.assignments ||= {};
        state.lights ||= {};
        state.lights[marker.id] = {
          name: `Метка света · ${preset.name}`,
          presetName: preset.name,
          brightCells: Number(preset.brightCells) || 0,
          dimCells: Number(preset.dimCells) || 0,
          tint: Boolean(preset.tint),
          marker: true,
        };
        await OBR.scene.setMetadata({ [STATE_KEY]: state });
        OBR.notification.show(`Источник «${preset.name}» добавлен. Повторный щелчок поставит ещё один; Escape отменит размещение.`);
        return false;
      },
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
