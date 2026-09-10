const DISMISS_STATE_KEY = '__atlasPlaceSavePopupDismissV1';

if (!window[DISMISS_STATE_KEY]) {
  const handleOutsidePointerDown = (event) => {
    const popup = document.querySelector('.place-save-popup');
    if (!popup || popup.contains(event.target)) return;

    popup.querySelector('.maplibregl-popup-close-button')?.click();
  };

  document.addEventListener('pointerdown', handleOutsidePointerDown);
  window[DISMISS_STATE_KEY] = { handleOutsidePointerDown };
}
