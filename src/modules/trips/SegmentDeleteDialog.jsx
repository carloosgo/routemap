import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { useTranslation } from '../../i18n/index.jsx';

export function SegmentDeleteDialog({ open, onConfirm, onCancel }) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      open={open}
      message={t('confirmDeleteSegment')}
      confirmLabel={t('delete')}
      cancelLabel={t('cancel')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
