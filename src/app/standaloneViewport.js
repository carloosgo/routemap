// iPhone en pantalla de inicio con barra de estado translúcida: el viewport
// que iOS reporta (100vh / 100dvh / inset: 0) queda corto por la altura de la
// zona segura superior y deja un hueco abajo. En modo standalone la app ocupa
// siempre la pantalla completa, así que su altura real es la de la pantalla.
export function standaloneAppHeight(win = globalThis) {
  const standalone = win?.navigator?.standalone === true
    || (typeof win?.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches);
  if (!standalone || !win.screen) return null;
  const landscape = win.innerWidth > win.innerHeight;
  const screenHeight = landscape
    ? Math.min(win.screen.width, win.screen.height)
    : Math.max(win.screen.width, win.screen.height);
  return Math.max(screenHeight, win.innerHeight || 0);
}

export function installStandaloneViewport(win = globalThis) {
  const root = win?.document?.documentElement;
  if (!root) return () => {};
  const apply = () => {
    const height = standaloneAppHeight(win);
    if (height) root.style.setProperty('--app-height', `${height}px`);
    else root.style.removeProperty('--app-height');
  };
  apply();
  win.addEventListener?.('resize', apply);
  win.addEventListener?.('orientationchange', apply);
  return () => {
    win.removeEventListener?.('resize', apply);
    win.removeEventListener?.('orientationchange', apply);
  };
}
