import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Diálogo de confirmación propio del sistema (reemplaza window.confirm()).
// Se usa tanto para eliminar un tramo (SegmentForm) como un viaje guardado
// (SavedTrips). Se monta con createPortal directo a <body> para no heredar
// overflow/posicionamiento de donde se invoque.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = true,
  confirmOnly = false,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="confirm__scrim" onMouseDown={onCancel}>
      <div
        className="confirm__card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title || message}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && <h3 className="confirm__title">{title}</h3>}
        <p className="confirm__message">{message}</p>
        <div className="confirm__actions">
          {!confirmOnly && (
            <button type="button" className="btn" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={'btn ' + (danger ? 'btn--danger' : 'btn--primary')}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
