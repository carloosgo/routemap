import { IconDeviceFloppy } from '@tabler/icons-react';

export function AppTopbar({ t, handleSave }) {
  return (
    <div className="topbar topbar--floating-only">
      <button
        type="button"
        className="topbar__save"
        onClick={handleSave}
        aria-label={t('saveTrip')}
        title={t('saveTrip')}
      >
        <IconDeviceFloppy size={22} aria-hidden="true" />
      </button>
    </div>
  );
}
