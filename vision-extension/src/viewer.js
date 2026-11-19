import OBR from "@owlbear-rodeo/sdk";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const PREVIEW_MODAL_ID = `${EXTENSION_ID}/gm-preview`;
const canvas = document.querySelector("#vision");
const displayContext = canvas.getContext("2d", { alpha: true });
const frameCanvas = document.createElement("canvas");
const context = frameCanvas.getContext("2d", { alpha: true });
let sceneItems = [];
let sceneState = { assignments: {}, lights: {} };
let gridDpi = 70;
let drawing = false;
let drawPending = false;
let isGmPreview = false;

document.documentElement.style.cssText = "width:100%;height:100%;margin:0;background:transparent;overflow:hidden";
document.body.style.cssText = "width:100%;height:100%;margin:0;background:transparent;overflow:hidden;pointer-events:none";
canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block;pointer-events:none";

function activeAssignment() {
  if (window.__visionPreviewAssignment) return window.__visionPreviewAssignment;
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

function drawLightGuides(circles) {
  if (!isGmPreview) return;
  const lights = circles.filter((circle) => circle.light);
  context.save();
  context.globalCompositeOperation = "source-over";
  for (const circle of lights) {
    if (!(circle.radius > 0)) continue;
    context.beginPath();
    context.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
    context.strokeStyle = circle.bright ? "rgba(255,213,112,0.82)" : "rgba(255,213,112,0.48)";
    context.lineWidth = circle.bright ? 2 : 1.5;
    context.setLineDash(circle.bright ? [] : [7, 6]);
    context.stroke();
  }
  for (const circle of lights.filter((entry) => entry.bright)) {
    context.setLineDash([]);
    context.beginPath();
    context.arc(circle.x, circle.y, 5, 0, Math.PI * 2);
    context.fillStyle = "#ffd570";
    context.shadowColor = "#ffb52e";
    context.shadowBlur = 12;
    context.fill();
  }
  context.restore();
}

async function draw() {
  if (drawing) {
    drawPending = true;
    return;
  }
  drawing = true;
  try {
    do {
      drawPending = false;
      const assignment = activeAssignment();
      const circles = [];
      if (assignment && assignment.mode !== "blind") {
        const scale = Number(await OBR.viewport.getScale()) || 1;
        const radiusFor = (cells) => Math.max(0, Number(cells) || 0) * gridDpi * scale;
        const tokenCenter = await getCenter(assignment.tokenId);
        if (tokenCenter) {
          const point = await screenPoint(tokenCenter);
          if (point) {
            if ((window.__visionPreviewAmbient || sceneState.ambient) === "dark") circles.push({ ...point, radius: radiusFor(assignment.darkvisionCells), strength: 0.68, tint: true });
            else circles.push({ ...point, radius: radiusFor(assignment.brightCells), strength: 1 });
          }
        }
        for (const [itemId, light] of Object.entries(sceneState.lights || {})) {
          const center = await getCenter(itemId);
          if (!center) continue;
          const point = await screenPoint(center);
          if (!point) continue;
          circles.push({ ...point, radius: radiusFor(light.dimCells), strength: light.tint ? 0.68 : 0.45, tint: Boolean(light.tint), light: true });
          circles.push({ ...point, radius: radiusFor(light.brightCells), strength: 1, light: true, bright: true });
        }
      }

      // Render offscreen, then swap one finished frame onto the visible canvas. This avoids
      // exposing the opaque mask while viewport and item geometry are fetched asynchronously.
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      if (frameCanvas.width !== pixelWidth || frameCanvas.height !== pixelHeight) {
        frameCanvas.width = pixelWidth;
        frameCanvas.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.fillStyle = "rgba(0,0,0,0.97)";
      context.fillRect(0, 0, width, height);
      for (const circle of circles.filter((entry) => entry.strength < 1)) eraseCircle(circle.x, circle.y, circle.radius, circle.strength);
      for (const circle of circles.filter((entry) => entry.strength === 1)) eraseCircle(circle.x, circle.y, circle.radius, circle.strength);
      for (const circle of circles.filter((entry) => entry.tint)) tintCircle(circle);
      drawLightGuides(circles);
      context.globalCompositeOperation = "source-over";
      displayContext.setTransform(1, 0, 0, 1, 0, 0);
      displayContext.clearRect(0, 0, pixelWidth, pixelHeight);
      displayContext.drawImage(frameCanvas, 0, 0);
    } while (drawPending);
  } finally {
    drawing = false;
    if (drawPending) draw();
  }
}

OBR.onReady(async () => {
  const [role, localPlayerId] = await Promise.all([OBR.player.getRole(), OBR.player.getId()]);
  const params = new URLSearchParams(location.search);
  const requestedPlayerId = params.get("previewPlayer");
  const requestedTokenId = params.get("previewToken");
  isGmPreview = role === "GM" && Boolean(requestedPlayerId || requestedTokenId);
  window.__visionPlayerId = isGmPreview && requestedPlayerId ? requestedPlayerId : localPlayerId;
  window.__visionPreviewAssignment = isGmPreview && requestedTokenId ? {
    tokenId: requestedTokenId,
    mode: params.get("previewMode") || "limited",
    brightCells: Number(params.get("previewBright")) || 0,
    darkvisionCells: Number(params.get("previewDark")) || 0,
    playerName: "Пробный просмотр",
  } : null;
  window.__visionPreviewAmbient = isGmPreview && requestedTokenId ? params.get("previewAmbient") : null;
  if (isGmPreview) {
    const exitButton = document.createElement("button");
    exitButton.type = "button";
    exitButton.textContent = "×  Выйти из предпросмотра";
    exitButton.setAttribute("aria-label", "Выйти из предпросмотра личного обзора");
    exitButton.style.cssText = "position:fixed;z-index:2147483647;top:16px;right:18px;pointer-events:auto;cursor:pointer;border:2px solid #8be9e2;border-radius:999px;background:#10262a;color:#fff;padding:12px 18px;font:700 15px/1.2 system-ui,sans-serif;box-shadow:0 4px 20px #000a";
    document.body.append(exitButton);
    const exitPreview = async () => {
      await OBR.tool.setMetadata(`${EXTENSION_ID}/gm-tool`, { [`${EXTENSION_ID}/preview-active`]: false });
      await OBR.modal.close(PREVIEW_MODAL_ID).catch(() => {});
      await OBR.popover.open({ id: `${EXTENSION_ID}/manager`, url: new URL("./", location.href).href, width: 520, height: 760 });
    };
    exitButton.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); exitPreview(); });
    document.body.tabIndex = -1;
    document.body.focus({ preventScroll: true });
    window.focus();
    window.addEventListener("keydown", async (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      await exitPreview();
    }, true);
  }
  await refreshScene();
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
  window.addEventListener("focus", draw);
  window.setInterval(draw, 160);
  await draw();
});
