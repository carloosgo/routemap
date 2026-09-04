import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { useTranslation } from '../../i18n/index.jsx';

export function SegmentDeleteDialog({
  open,
  blocked = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();

  if (blocked) {
    return (
      <ConfirmDialog
        open={open}
        message={t('segmentHasPlannedPlaces')}
        confirmLabel={t('understood')}
        onConfirm={onCancel}
        onCancel={onCancel}
        danger={false}
        confirmOnly
      />
    );
  }

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
