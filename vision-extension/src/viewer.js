import OBR from "@owlbear-rodeo/sdk";
import { version as extensionVersion } from "../package.json";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const LIGHT_MARKER_KEY = `${EXTENSION_ID}/light-marker`;
const LIGHT_DATA_KEY = `${EXTENSION_ID}/light-data`;
const LIGHT_PROFILE_KEY = `${EXTENSION_ID}/light`;
const PREVIEW_MODAL_ID = `${EXTENSION_ID}/gm-preview`;
const EXIT_POPOVER_ID = `${EXTENSION_ID}/gm-preview-exit`;
const canvas = document.querySelector("#vision");
const extensionUrl = (path) => {
  const url = new URL(path, location.href);
  url.searchParams.set("v", extensionVersion);
  return url;
};
const displayContext = canvas.getContext("2d", { alpha: true });
const frameCanvas = document.createElement("canvas");
const context = frameCanvas.getContext("2d", { alpha: true });
let sceneItems = [];
let sceneState = { assignments: {}, lights: {} };
let gridDpi = 70;
let drawing = false;
let drawPending = false;
let isGmPreview = false;

document.documentElement.style.cssText = "width:100%;height:100%;margin:0;background:transparent;overflow:hidden;pointer-events:none";
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

function revealPlate(x, y, width, height) {
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = "#000";
  context.fillRect(x, y, width, height);
  context.restore();
}

function revealOwlbearControls(width, height) {
  // Solid transparent plates match Owlbear's floating control surfaces. Small
  // circular holes drift off target with browser zoom and different layouts.
  revealPlate(0, 0, Math.min(360, width), Math.min(108, height)); // exit + top-left controls
  revealPlate(Math.max(0, width - 100), 62, Math.min(100, width), Math.min(570, height - 62)); // right rail
  revealPlate(Math.max(0, width / 2 - 275), Math.max(0, height - 62), Math.min(550, width), Math.min(62, height)); // bottom tools
}

function lightFromProfile(value) {
  const profiles = {
    candle: { name: "Свеча", brightCells: 1, dimCells: 2 },
    torch: { name: "Факел", brightCells: 4, dimCells: 8 },
    lantern: { name: "Фонарь", brightCells: 6, dimCells: 12 },
  };
  if (typeof value === "string") {
    const profileId = value.trim().toLowerCase();
    if (profiles[profileId]) return profiles[profileId];
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  const brightCells = Number(value.brightCells);
  const dimCells = Number(value.dimCells);
  if (!Number.isFinite(brightCells) || !Number.isFinite(dimCells)) return null;
  return { name: value.name || "Настраиваемый свет", brightCells: Math.max(0, brightCells), dimCells: Math.max(0, dimCells), tint: Boolean(value.tint) };
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
      const ambient = window.__visionPreviewAmbient ?? sceneState.ambient;
      const blind = assignment?.mode === "blind";
      const circles = [];
      if (assignment && !blind) {
        const scale = Number(await OBR.viewport.getScale()) || 1;
        const radiusFor = (cells) => Math.max(0, Number(cells) || 0) * gridDpi * scale;
        const tokenCenter = await getCenter(assignment.tokenId);
        if (tokenCenter && ambient === "dark") {
          const point = await screenPoint(tokenCenter);
          if (point) {
            const darkvisionCells = Number(assignment.darkvisionCells) || 0;
            circles.push(darkvisionCells > 0
              ? { ...point, radius: radiusFor(darkvisionCells * 1.3), strength: 0.72, tint: true, vision: true }
              : { ...point, radius: radiusFor(0.45), strength: 1, self: true });
          }
        }
        const lightEntries = new Map(Object.entries(sceneState.lights || {}));
        for (const item of sceneItems) {
          const lightData = item.metadata?.[LIGHT_DATA_KEY];
          if (item.metadata?.[LIGHT_MARKER_KEY] && lightData) {
            lightEntries.set(item.id, { ...lightData, position: item.position, marker: true });
          }
          const profile = item.layer === "PROP" ? lightFromProfile(item.metadata?.[LIGHT_PROFILE_KEY]) : null;
          if (profile) lightEntries.set(item.id, { ...profile, position: item.position, marker: true, propLight: true });
        }
        for (const [itemId, light] of lightEntries) {
          const sourceItem = sceneItems.find((item) => item.id === itemId);
          if (light.marker && !sourceItem) continue;
          // Item position is its origin, not necessarily its visual center.
          // Use the bounds center so light circles line up with the placed marker.
          const center = await getCenter(itemId) || sourceItem?.position || light.position || null;
          if (!center) continue;
          const point = await screenPoint(center);
          if (!point) continue;
          circles.push({ ...point, radius: radiusFor(light.dimCells), strength: light.tint ? 0.72 : 0.7, tint: Boolean(light.tint), light: true });
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
      const masked = Boolean(assignment) && (blind || ambient === "dark");
      if (masked) {
        context.fillStyle = "rgba(0,0,0,1)";
        context.fillRect(0, 0, width, height);
        for (const circle of circles.filter((entry) => entry.vision || entry.self)) eraseCircle(circle.x, circle.y, circle.radius, circle.strength);
        for (const circle of circles.filter((entry) => entry.vision && entry.tint)) tintCircle(circle);
        for (const circle of circles.filter((entry) => entry.light && entry.strength < 1)) eraseCircle(circle.x, circle.y, circle.radius, circle.strength);
        for (const circle of circles.filter((entry) => entry.light && entry.strength === 1)) eraseCircle(circle.x, circle.y, circle.radius, circle.strength);
        for (const circle of circles.filter((entry) => entry.tint && entry.light)) tintCircle(circle);
        revealOwlbearControls(width, height);
        drawLightGuides(circles);
      } else if (isGmPreview) {
        drawLightGuides(circles);
      }
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
    const exitPreview = async () => {
      await OBR.tool.setMetadata(`${EXTENSION_ID}/gm-tool`, { [`${EXTENSION_ID}/preview-active`]: false });
      await OBR.popover.close(EXIT_POPOVER_ID).catch(() => {});
      await OBR.modal.close(PREVIEW_MODAL_ID).catch(() => {});
      await OBR.popover.open({ id: `${EXTENSION_ID}/manager`, url: extensionUrl("./").href, width: 520, height: 760 });
    };
    const exitUrl = extensionUrl("./preview-exit.html");
    await OBR.popover.open({
      id: EXIT_POPOVER_ID,
      url: exitUrl.href,
      width: 226,
      height: 54,
      anchorReference: "POSITION",
      anchorPosition: { left: 16, top: 16 },
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      hidePaper: true,
      disableClickAway: true,
    });
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
  window.addEventListener("focus", draw);
  window.setInterval(draw, 160);
  window.addEventListener("resize", draw);
  if (isGmPreview) window.setInterval(async () => { await refreshScene(); await draw(); }, 650);
  await draw();
});
