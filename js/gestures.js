// js/gestures.js — PointerEvents свайпы карточек + кроссплатформенный Haptic (Android + iOS 18+ Safari)

let iosSwitchLabel = null;

export function triggerHaptic() {
  if (navigator.vibrate) {
    navigator.vibrate(12);
    return;
  }
  // Трюк для вызова Taptic Engine в iOS 18+ Safari через нативный switch
  try {
    if (!iosSwitchLabel) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.id = "ss-haptic-switch";
      input.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;left:-9999px;";
      const label = document.createElement("label");
      label.htmlFor = "ss-haptic-switch";
      label.style.display = "none";
      document.body.append(input, label);
      iosSwitchLabel = label;
    }
    iosSwitchLabel.click();
  } catch {}
}

export function attachCardSwipe(cardEl, { onLeft, onRight, onTap, threshold = 90 }) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dragging = false;
  let moved = false;

  cardEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    dragging = true;
    moved = false;
    cardEl.setPointerCapture(e.pointerId);
    cardEl.style.transition = "none";
  });

  cardEl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const curDx = e.clientX - startX;
    const curDy = e.clientY - startY;

    if (!moved && Math.abs(curDy) > Math.abs(curDx) && Math.abs(curDy) > 12) {
      dragging = false;
      cardEl.style.transition = "";
      return;
    }

    if (Math.abs(curDx) > 8) moved = true;
    if (!moved) return;

    dx = curDx;
    const flipped = cardEl.classList.contains("flipped");
    const rotY = flipped ? " rotateY(180deg)" : "";
    cardEl.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)${rotY}`;
    cardEl.dataset.swipeDir = dx > 35 ? "right" : dx < -35 ? "left" : "";
  });

  function finishDrag() {
    if (!dragging) return;
    dragging = false;

    if (!moved) {
      cardEl.style.transition = "";
      cardEl.style.transform = "";
      onTap?.();
      return;
    }

    cardEl.style.transition = "transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)";
    const flipped = cardEl.classList.contains("flipped");
    const rotY = flipped ? " rotateY(180deg)" : "";

    if (Math.abs(dx) >= threshold) {
      triggerHaptic();
      const dir = dx > 0 ? 1 : -1;
      cardEl.style.transform = `translateX(${dir * 420}px) rotate(${dir * 16}deg)${rotY}`;
      setTimeout(() => {
        cardEl.style.transition = "none";
        cardEl.style.transform = "";
        cardEl.dataset.swipeDir = "";
        requestAnimationFrame(() => {
          cardEl.style.transition = "";
        });
        if (dir > 0) onRight?.();
        else onLeft?.();
      }, 210);
    } else {
      cardEl.style.transform = "";
      cardEl.dataset.swipeDir = "";
    }
  }

  cardEl.addEventListener("pointerup", finishDrag);
  cardEl.addEventListener("pointercancel", finishDrag);
}
