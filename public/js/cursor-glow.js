/* Cursor-following light effect — a soft glow that trails the mouse.
   Pure visual (pointer-events: none); lerped for a smooth trailing feel. */
export function initCursorGlow() {
  const el = document.getElementById('cursor-glow');
  if (!el || !window.matchMedia?.('(pointer: fine)').matches) return;
  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 3;
  let x = tx;
  let y = ty;
  let raf = null;

  const tick = () => {
    x += (tx - x) * 0.16;
    y += (ty - y) * 0.16;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = null;
    }
  };
  const onMove = (e) => {
    tx = e.clientX;
    ty = e.clientY;
    if (!raf) raf = requestAnimationFrame(tick);
  };
  window.addEventListener('mousemove', onMove, { passive: true });
  // initial placement
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}
