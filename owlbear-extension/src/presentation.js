import OBR from "@owlbear-rodeo/sdk";

const EXTENSION_ID = "ru.codex.party-book";
const modalId = `${EXTENSION_ID}/presentation-modal`;
const params = new URLSearchParams(location.search);
const imageUrl = params.get("image") || "";
const characterName = params.get("name") || "Персонаж";
const root = document.querySelector("#presentation");

document.documentElement.style.cssText = "width:100%;height:100%;background:transparent;color:#f2f2eb;font:14px system-ui,sans-serif";
document.body.style.cssText = "width:100%;height:100%;margin:0;background:transparent;overflow:hidden";
root.style.cssText = "position:relative;display:grid;width:100%;height:100%;place-items:center;overflow:hidden;border:1px solid #c9e3a1;border-radius:18px;background:radial-gradient(ellipse at center,#252c22f2,#090b09f5 72%);box-shadow:0 14px 70px #0009";

const title = document.createElement("div");
title.textContent = characterName;
title.style.cssText = "position:absolute;top:14px;left:50%;z-index:2;transform:translateX(-50%);max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:7px 14px;border:1px solid #ffffff33;border-radius:999px;background:#10140fd9;color:#e8f2d8;font:600 15px Georgia,serif";
const image = document.createElement("img");
image.alt = characterName;
image.src = imageUrl;
image.style.cssText = "max-width:92%;max-height:84%;object-fit:contain;filter:drop-shadow(0 10px 28px #000b);animation:entrance .65s cubic-bezier(.2,.8,.2,1) both";
const close = document.createElement("button");
close.type = "button";
close.textContent = "×";
close.title = "Закрыть представление";
close.style.cssText = "position:absolute;top:10px;right:12px;z-index:3;width:32px;height:32px;border:1px solid #ffffff55;border-radius:50%;background:#10140fdd;color:#fff;font-size:21px;line-height:1;cursor:pointer";
root.append(image, title, close);

const style = document.createElement("style");
style.textContent = "@keyframes entrance{from{opacity:0;transform:translateY(20px) scale(.92)}to{opacity:1;transform:translateY(0) scale(1)}}";
document.head.append(style);

OBR.onReady(() => {
  const closePresentation = () => OBR.modal.close(modalId).catch(() => {});
  close.addEventListener("click", closePresentation);
  image.addEventListener("error", () => {
    title.textContent = `${characterName} · не удалось загрузить GIF`;
    image.remove();
  }, { once: true });
  window.setTimeout(closePresentation, 10000);
});
