import OBR, { buildLabel } from "@owlbear-rodeo/sdk";

export const STATUS_LABEL_KEY = "ru.codex.party-book/status-label";

export const STATUS_ICONS = {
  blinded: "🚫👁️",
  charmed: "💗",
  deafened: "🚫👂",
  exhaustion: "🥱",
  frightened: "😨",
  grappled: "🤼",
  incapacitated: "🛑",
  invisible: "👻",
  paralyzed: "🧊",
  petrified: "🪨",
  poisoned: "🐍",
  prone: "🛌",
  restrained: "⛓️",
  stunned: "💫",
  unconscious: "💤",
  dead: "💀",
};

const queues = new Map();

async function updateStatusLabel(tokenId, character) {
  const attachments = await OBR.scene.items.getItemAttachments([tokenId]);
  const oldItems = attachments.filter((item) => item.metadata?.[STATUS_LABEL_KEY]?.tokenId === tokenId);
  if (oldItems.length) await OBR.scene.items.deleteItems(oldItems.map((item) => item.id));

  const statuses = character?.statusEffects || [];
  if (!statuses.length) return;

  const bounds = await OBR.scene.items.getItemBounds([tokenId]);
  const metadata = { [STATUS_LABEL_KEY]: { tokenId } };
  const labels = statuses.map((status, index) => {
    const icon = STATUS_ICONS[status.id] || status.icon || "🔸";
    const name = status.name || status.id || "Статус";
    const width = Math.max(180, Math.min(310, 82 + String(name).length * 14));
    const height = 42;
    const label = buildLabel().plainText(`${icon}  ${name}`).width(width).height(height)
      .fontSize(20).fontWeight(750).fontFamily("Arial").textAlign("CENTER").textAlignVertical("MIDDLE")
      .fillColor("#ffffff").fillOpacity(1).backgroundColor("#252a30").backgroundOpacity(0.98)
      .strokeColor("#aeb7c2").strokeOpacity(0.9).strokeWidth(1).cornerRadius(21).padding(5)
      .position({ x: bounds.center.x, y: bounds.min.y - 32 - index * 46 })
      .name(`Статус ${name} · ${character.name}`).layer("ATTACHMENT").attachedTo(tokenId).locked(true)
      .disableHit(true).metadata(metadata).build();
    label.style.maxViewScale = 1.15;
    label.style.minViewScale = 0.9;
    return label;
  });
  await OBR.scene.items.addItems(labels);
}

export function syncStatusLabel(tokenId, character) {
  const previous = queues.get(tokenId) || Promise.resolve();
  const next = previous.then(() => updateStatusLabel(tokenId, character));
  queues.set(tokenId, next.catch(() => {}));
  return next.catch(() => OBR.notification.show("Не удалось обновить метку статусов на токене."));
}
