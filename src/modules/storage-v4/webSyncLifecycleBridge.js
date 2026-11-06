function requireRuntime(runtime) {
  const methods = ['recoverPending', 'setOnline', 'setForeground'];
  for (const method of methods) {
    if (typeof runtime?.[method] !== 'function') {
      throw new TypeError(`El runtime v4 requiere ${method}().`);
    }
  }
  return runtime;
}

function canListen(target) {
  return target
    && typeof target.addEventListener === 'function'
    && typeof target.removeEventListener === 'function';
}

export function attachV4WebSyncLifecycle({
  runtime,
  windowTarget = typeof window === 'undefined' ? null : window,
  documentTarget = typeof document === 'undefined' ? null : document,
  navigatorTarget = typeof navigator === 'undefined' ? null : navigator,
  onError = () => {},
} = {}) {
  const syncRuntime = requireRuntime(runtime);
  if (typeof onError !== 'function') throw new TypeError('onError debe ser función.');
  if (!canListen(windowTarget) || !canListen(documentTarget)) {
    throw new Error('El bridge web v4 requiere window y document con eventos.');
  }

  let detached = false;
  const online = () => navigatorTarget?.onLine !== false;
  const foreground = () => documentTarget.visibilityState !== 'hidden';

  const handleOnline = () => syncRuntime.setOnline(true);
  const handleOffline = () => syncRuntime.setOnline(false);
  const handleVisibility = () => syncRuntime.setForeground(foreground());
  const handlePageHide = () => syncRuntime.setForeground(false);
  const handlePageShow = () => {
    syncRuntime.setOnline(online());
    syncRuntime.setForeground(foreground());
  };

  syncRuntime.setOnline(online());
  syncRuntime.setForeground(foreground());
  Promise.resolve(syncRuntime.recoverPending()).catch(onError);

  windowTarget.addEventListener('online', handleOnline);
  windowTarget.addEventListener('offline', handleOffline);
  windowTarget.addEventListener('pagehide', handlePageHide);
  windowTarget.addEventListener('pageshow', handlePageShow);
  documentTarget.addEventListener('visibilitychange', handleVisibility);

  return {
    detach() {
      if (detached) return;
      detached = true;
      windowTarget.removeEventListener('online', handleOnline);
      windowTarget.removeEventListener('offline', handleOffline);
      windowTarget.removeEventListener('pagehide', handlePageHide);
      windowTarget.removeEventListener('pageshow', handlePageShow);
      documentTarget.removeEventListener('visibilitychange', handleVisibility);
    },
  };
}
