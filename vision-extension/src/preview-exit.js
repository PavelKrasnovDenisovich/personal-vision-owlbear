import OBR from "@owlbear-rodeo/sdk";

const EXTENSION_ID = "ru.codex.personal-vision";
const PREVIEW_MODAL_ID = `${EXTENSION_ID}/gm-preview`;
const EXIT_POPOVER_ID = `${EXTENSION_ID}/gm-preview-exit`;
const TOOL_ID = `${EXTENSION_ID}/gm-tool`;

document.querySelector("#exit-preview").addEventListener("click", async () => {
  await OBR.tool.setMetadata(TOOL_ID, { [`${EXTENSION_ID}/preview-active`]: false });
  await OBR.popover.close(EXIT_POPOVER_ID).catch(() => {});
  await OBR.modal.close(PREVIEW_MODAL_ID).catch(() => {});
  await OBR.popover.open({ id: `${EXTENSION_ID}/manager`, url: new URL("./", location.href).href, width: 520, height: 760 });
});
