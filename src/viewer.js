import OBR from "@owlbear-rodeo/sdk";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const PREVIEW_MODAL_ID = `${EXTENSION_ID}/gm-preview`;
const canvas = document.querySelector("#vision");
const context = canvas.getContext("2d", { alpha: true });
const previewControl = document.querySelector("#preview-control");
const previewLabel = document.querySelector("#preview-label");
let sceneItems = [];
let sceneState = { assignments: {}, lights: {} };
let gridDpi = 70;
let drawing = false;
let isGmPreview = false;

document.documentElement.style.cssText = "width:100%;height:100%;margin:0;background:transparent;overflow:hidden";
document.body.style.cssText = "width:100%;height:100%;margin:0;background:transparent;overflow:hidden;pointer-events:none";
canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block;pointer-events:none";
previewControl.style.cssText = "display:none;position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);align-items:center;gap:12px;padding:8px 10px 8px 14px;border:1px solid rgba(220,225,215,.35);border-radius:999px;background:rgba(24,28,24,.9);color:#f0f1e8;font:600 12px system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35);pointer-events:auto";
document.querySelector("#close-preview").style.cssText = "border:0;border-radius:999px;padding:6px 10px;background:#526543;color:#fff;font:600 11px system-ui,sans-serif;cursor:pointer";

function activeAssignment() {
  const playerId = window.__visionPlayerId;
  return Object.values(sceneState.assignments || {}).find((entry) => entry.playerId === playerId) || null;
}

async function refreshScene() {
  try {
    const [metadata, items, dpi] = await Promise.all([
      OBR.scene.getMetadata(),
      OBR.scene.items.getItems(),
      OBR.scene.grid.getDpi(),
    ]);
    sceneState = metadata[STATE_KEY] || { ambient: "bright", assignments: {}, lights: {} };
    sceneState.ambient ||= "bright";
    sceneState.assignments ||= {};
    sceneState.lights ||= {};
    sceneItems = items;
    gridDpi = Number(dpi) > 0 ? Number(dpi) : 70;
  } catch (error) {
    console.warn("Не удалось обновить состояние видимости", error);
  }
}

async function getCenter(itemId) {
  try {
    const bounds = await OBR.scene.items.getItemBounds([itemId]);
    return bounds?.center || null;
  } catch { return null; }
}

async function screenPoint(worldPoint) {
  try { return await OBR.viewport.transformPoint(worldPoint); }
  catch { return null; }
}

function eraseCircle(x, y, radius, strength) {
  if (!(radius > 0)) return;
  const edge = Math.max(3, radius * 0.035);
  const gradient = context.createRadialGradient(x, y, Math.max(0, radius - edge), x, y, radius);
  gradient.addColorStop(0, `rgba(0,0,0,${strength})`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function tintCircle(circle) {
  if (!(circle.radius > 0)) return;
  const gradient = context.createRadialGradient(circle.x, circle.y, 0, circle.x, circle.y, circle.radius);
  gradient.addColorStop(0, "rgba(180,185,195,0.28)");
  gradient.addColorStop(0.82, "rgba(180,185,195,0.20)");
  gradient.addColorStop(1, "rgba(180,185,195,0)");
  context.globalCompositeOperation = "source-over";
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
  context.fill();
}

async function draw() {
  if (drawing) return;
  drawing = true;
  try {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = "rgba(0,0,0,0.97)";
    context.fillRect(0, 0, width, height);

    const assignment = activeAssignment();
    if (!assignment || assignment.mode === "blind") return;
    const scale = Number(await OBR.viewport.getScale()) || 1;
    const radiusFor = (cells) => Math.max(0, Number(cells) || 0) * gridDpi * scale;
    const circles = [];
    const tokenId = assignment.tokenId;
    const tokenCenter = await getCenter(tokenId);
    if (tokenCenter) {
      const point = await screenPoint(tokenCenter);
      if (point) {
        if (sceneState.ambient === "dark") circles.push({ ...point, radius: radiusFor(assignment.darkvisionCells), strength: 0.68, tint: true });
        else circles.push({ ...point, radius: radiusFor(assignment.brightCells), strength: 1 });
      }
    }
    for (const [itemId, light] of Object.entries(sceneState.lights || {})) {
      const center = await getCenter(itemId);
      if (!center) continue;
      const point = await screenPoint(center);
      if (!point) continue;
      circles.push({ ...point, radius: radiusFor(light.dimCells), strength: light.tint ? 0.68 : 0.45, tint: Boolean(light.tint) });
      circles.push({ ...point, radius: radiusFor(light.brightCells), strength: 1 });
    }
    // Dim vision cuts away a little of the opaque mask; bright vision clears it completely.
    for (const circle of circles.filter((entry) => entry.strength < 1)) eraseCircle(circle.x, circle.y, circle.radius, circle.strength);
    for (const circle of circles.filter((entry) => entry.strength === 1)) eraseCircle(circle.x, circle.y, circle.radius, circle.strength);
    for (const circle of circles.filter((entry) => entry.tint)) tintCircle(circle);
    context.globalCompositeOperation = "source-over";
  } finally {
    drawing = false;
  }
}

OBR.onReady(async () => {
  const [role, localPlayerId] = await Promise.all([OBR.player.getRole(), OBR.player.getId()]);
  const requestedPreviewId = new URLSearchParams(location.search).get("preview");
  isGmPreview = role === "GM" && Boolean(requestedPreviewId);
  window.__visionPlayerId = isGmPreview ? requestedPreviewId : localPlayerId;
  if (isGmPreview) {
    document.body.style.pointerEvents = "auto";
    previewControl.style.display = "flex";
    document.querySelector("#close-preview").addEventListener("click", () => OBR.modal.close(PREVIEW_MODAL_ID));
  }
  await refreshScene();
  if (isGmPreview) {
    const assignment = activeAssignment();
    previewLabel.textContent = `Проверка: ${assignment?.playerName || "игрок"}`;
  }
  OBR.scene.onMetadataChange((metadata) => {
    sceneState = metadata[STATE_KEY] || { ambient: "bright", assignments: {}, lights: {} };
    sceneState.ambient ||= "bright";
    sceneState.assignments ||= {};
    sceneState.lights ||= {};
    draw();
  });
  OBR.scene.items.onChange(async () => { await refreshScene(); await draw(); });
  OBR.scene.onReadyChange(async (ready) => { if (ready) await refreshScene(); await draw(); });
  window.addEventListener("resize", draw);
  window.setInterval(draw, 160);
  await draw();
});
