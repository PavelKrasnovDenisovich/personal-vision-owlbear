import OBR, { buildEffect } from "@owlbear-rodeo/sdk";
import { version as extensionVersion } from "../package.json";

const EXTENSION_ID = "ru.codex.personal-vision";
const STATE_KEY = `${EXTENSION_ID}/state`;
const LIGHT_MARKER_KEY = `${EXTENSION_ID}/light-marker`;
const LIGHT_DATA_KEY = `${EXTENSION_ID}/light-data`;
const MASK_EFFECT_KEY = `${EXTENSION_ID}/local-mask-effect`;
const PREVIEW_MODAL_ID = `${EXTENSION_ID}/gm-preview`;
const EXIT_POPOVER_ID = `${EXTENSION_ID}/gm-preview-exit`;
const canvas = document.querySelector("#vision");
const extensionUrl = (path) => {
  const url = new URL(path, location.href);
  url.searchParams.set("v", extensionVersion);
  return url;
};
const context = canvas.getContext("2d", { alpha: true });
let sceneItems = [];
let sceneState = { assignments: {}, lights: {} };
let gridDpi = 70;
let drawing = false;
let drawPending = false;
let isGmPreview = false;
let maskEffectId = null;
let maskSignature = "";
let maskLocalStateReady = false;

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

function lightFromName(name) {
  const profiles = {
    candle: { name: "Свеча", brightCells: 1, dimCells: 2 },
    свеча: { name: "Свеча", brightCells: 1, dimCells: 2 },
    torch: { name: "Факел", brightCells: 4, dimCells: 8 },
    факел: { name: "Факел", brightCells: 4, dimCells: 8 },
    lantern: { name: "Фонарь", brightCells: 6, dimCells: 12 },
    фонарь: { name: "Фонарь", brightCells: 6, dimCells: 12 },
  };
  return profiles[String(name || "").trim().toLocaleLowerCase("ru-RU")] || null;
}

function maskShader(circles, blind) {
  const declarations = circles.map((_, index) => `uniform vec3 center${index}; uniform float strength${index}; uniform float tint${index};`).join("\n");
  const samples = circles.map((_, index) => `
    float d${index} = distance(screenPoint, center${index}.xy);
    float edge${index} = max(3.0, center${index}.z * 0.035);
    float fade${index} = 1.0 - smoothstep(center${index}.z - edge${index}, center${index}.z, d${index});
    visibility = max(visibility, fade${index} * strength${index});
    tintAmount = max(tintAmount, fade${index} * tint${index});`).join("\n");
  const result = blind
    ? "return half4(0.0, 0.0, 0.0, 1.0);"
    : `float visibility = 0.0;
  float tintAmount = 0.0;
  ${samples}
  vec3 color = sceneColor.rgb * visibility;
  float gray = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));
  color = mix(color, vec3(gray), tintAmount * 0.25);
  return half4(color, 1.0);`;
  return `uniform shader scene;
${declarations}
half4 main(float2 coord) {
  // Circle centers are already transformed into viewport pixels by OBR.
  // Comparing against a second view transform shifted and scaled the mask.
  vec2 screenPoint = coord;
  half4 sceneColor = scene.eval(coord);
  ${result}
}`;
}

async function syncMapMask(enabled, circles, blind) {
  let localItems = [];
  if (!maskLocalStateReady) {
    localItems = await OBR.scene.local.getItems();
    maskEffectId = localItems.find((item) => item.metadata?.[MASK_EFFECT_KEY])?.id || null;
    maskLocalStateReady = true;
  }
  if (!enabled) {
    if (maskEffectId) await OBR.scene.local.deleteItems([maskEffectId]).catch(() => {});
    maskEffectId = null;
    maskSignature = "";
    return;
  }

  const signature = JSON.stringify({ blind, circles: circles.map(({ x, y, radius, strength, tint }) => [x, y, radius, strength, Boolean(tint)]) });
  if (signature === maskSignature && maskEffectId) return;
  const uniforms = circles.flatMap((circle, index) => [
    { name: `center${index}`, value: { x: circle.x, y: circle.y, z: circle.radius } },
    { name: `strength${index}`, value: circle.strength },
    { name: `tint${index}`, value: circle.tint ? 1 : 0 },
  ]);
  const next = buildEffect()
    .effectType("VIEWPORT")
    .layer("POST_PROCESS")
    .name("Личный обзор · маска игрока")
    .locked(true)
    .disableHit(true)
    .metadata({ [MASK_EFFECT_KEY]: true })
    .sksl(maskShader(circles, blind))
    .uniforms(uniforms)
    .build();

  if (maskEffectId) {
    try {
      await OBR.scene.local.updateItems([maskEffectId], (items) => {
        Object.assign(items[0], { sksl: next.sksl, uniforms: next.uniforms, visible: true });
      });
    } catch {
      maskEffectId = null;
    }
  }
  if (!maskEffectId) {
    await OBR.scene.local.addItems([next]);
    maskEffectId = next.id;
  }
  maskSignature = signature;
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
          const profile = lightFromName(item.name);
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

      // The black mask is a local Owlbear viewport effect, so it only covers the
      // scene canvas. Owlbear toolbars, menus, and future modules remain untouched.
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const masked = Boolean(assignment) && (blind || ambient === "dark");
      await syncMapMask(masked, circles, blind);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, pixelWidth, pixelHeight);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      if (isGmPreview) drawLightGuides(circles);
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
      anchorPosition: { left: 300, top: 16 },
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
