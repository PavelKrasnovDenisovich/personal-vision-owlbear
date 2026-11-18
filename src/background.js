import OBR from "@owlbear-rodeo/sdk";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const TOOL_ID = `${EXTENSION_ID}/gm-tool`;
const MODAL_ID = `${EXTENSION_ID}/vision-mask`;
const visionUrl = new URL("./viewer.html", location.href).href;

function selectVision(state, playerId) {
  return Object.values(state?.assignments || {}).find((entry) => entry.playerId === playerId) || null;
}

OBR.onReady(async () => {
  const role = await OBR.player.getRole();
  const playerId = await OBR.player.getId();
  let modalOpen = false;

  if (role === "GM") {
    OBR.tool.create({
      id: TOOL_ID,
      icons: [{
        icon: new URL("./icon.svg", location.href).toString(),
        label: "Личный обзор · настройка",
        filter: { roles: ["GM"] },
      }],
      onClick() {
        OBR.popover.open({ id: `${EXTENSION_ID}/manager`, url: new URL("./", location.href).href, width: 520, height: 760 });
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
