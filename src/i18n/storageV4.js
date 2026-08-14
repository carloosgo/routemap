export const storageV4Messages = Object.freeze({
  es: Object.freeze({
    savePersistenceError: 'No fue posible guardar el viaje.',
    deletePersistenceError: 'No fue posible eliminar el viaje.',
    deletingTrip: 'Eliminando…',
    saveConflict: 'Este viaje cambió en otra pestaña o dispositivo. Vuelve a abrirlo antes de guardar.',
    deleteConflict: 'Este viaje cambió en otra pestaña o dispositivo. Vuelve a abrirlo antes de eliminarlo.',
    saveSyncPending: 'Los cambios quedaron guardados localmente y pendientes de sincronización.',
    saveSyncBusy: 'Otra pestaña está sincronizando este viaje. Intenta guardar de nuevo.',
    saveWriteNotReady: 'La escritura de Storage v4 todavía no está habilitada para este viaje.',
  }),
  en: Object.freeze({
    savePersistenceError: 'The trip could not be saved.',
    deletePersistenceError: 'The trip could not be deleted.',
    deletingTrip: 'Deleting…',
    saveConflict: 'This trip changed in another tab or device. Reopen it before saving.',
    deleteConflict: 'This trip changed in another tab or device. Reopen it before deleting it.',
    saveSyncPending: 'Your changes are saved locally and are waiting to sync.',
    saveSyncBusy: 'Another tab is syncing this trip. Try saving again.',
    saveWriteNotReady: 'Storage v4 writes are not enabled for this trip yet.',
  }),
});
