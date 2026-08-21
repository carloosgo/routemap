import { IconListDetails, IconNotebook, IconRoute } from '@tabler/icons-react';

const NAV_ICON_COLOR = '#7c5ce7';

const NAV_ITEMS = [
  { id: 'segments', labelKey: 'itinerary', Icon: IconListDetails },
  { id: 'places', labelKey: 'myRoutes', Icon: IconRoute },
  { id: 'notes', labelKey: 'notes', Icon: IconNotebook },
];

export function TripHeaderNavigation({
  activeTab,
  setActiveTab,
  routeCount,
  checklistProgress,
  t,
}) {
  return (
    <div
      className="trip-summary__primary-nav"
      role="tablist"
      aria-label={`${t('itinerary')}, ${t('myRoutes')}, ${t('notes')}`}
    >
      {NAV_ITEMS.map(({ id, labelKey, Icon }) => {
        const isActive = activeTab === id;
        const badge = id === 'places' ? routeCount : id === 'notes' ? checklistProgress : '';
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={t(labelKey)}
            className={`trip-summary__primary-nav-item${isActive ? ' is-active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <span
              className="trip-summary__primary-nav-icon"
              style={{ color: NAV_ICON_COLOR }}
              aria-hidden="true"
            >
              <Icon size={18} stroke={1.8} />
            </span>
            <span className="trip-summary__primary-nav-label">{t(labelKey)}</span>
            {badge !== '' && badge !== 0 && (
              <span
                className={`trip-summary__primary-nav-badge trip-summary__primary-nav-badge--${id}`}
                aria-label={String(badge)}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
