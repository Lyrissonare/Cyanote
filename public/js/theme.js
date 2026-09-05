/* theme manager (dark / light, persisted) + futuristic "pioneer" mode */

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('cyanote-theme', theme);
  refreshConflictNotes();
}

export function initTheme() {
  const stored = localStorage.getItem('cyanote-theme');
  const theme =
    stored === 'dark' || stored === 'light'
      ? stored
      : window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}

export function isDark() {
  return document.documentElement.dataset.theme === 'dark';
}

/* ---- futuristic "pioneer" mode ---- */
export function isFutureOn() {
  return document.body.classList.contains('future-mode');
}

export function setFutureOn(on) {
  document.body.classList.toggle('future-mode', !!on);
  localStorage.setItem('cyanote-future', on ? '1' : '0');
  document.getElementById('future-toggle')?.classList.toggle('on', !!on);
  document.querySelectorAll('.future-switch').forEach((s) => s.classList.toggle('active', !!on));
  refreshConflictNotes();
  window.dispatchEvent(new CustomEvent('future-change', { detail: !!on }));
}

/* "亮色模式与未来视效冲突" notice — shown next to the future switch */
export function refreshConflictNotes() {
  const warn = isFutureOn() && !isDark();
  document.querySelectorAll('.conflict-note').forEach((n) => {
    n.hidden = !warn;
  });
}

export function initFuture() {
  const on = localStorage.getItem('cyanote-future') === '1';
  setFutureOn(on);
  document.getElementById('future-toggle')?.addEventListener('click', () => setFutureOn(!isFutureOn()));
}
