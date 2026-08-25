import { IconListDetails, IconNotebook, IconRoute } from '@tabler/icons-react';
import { HEADER_ACTIVE_ICON_COLOR, HEADER_ICON_COLOR } from './headerVisualTokens.js';

const NAV_ITEMS = [
  { id: 'segments', labelKey: 'itinerary', Icon: IconListDetails },
  { id: 'places', labelKey: 'myRoutes', Icon: IconRoute },
  { id: 'notes', labelKey: 'notes', Icon: IconNotebook },
];

function NavDividerMask({ index }) {
  if (index === 0) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: index === 1 ? '-5px' : '-8px',
        top: '9px',
        bottom: '9px',
        width: '1px',
        background: '#ffffff',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
}

export function TripHeaderNavigation({
  activeTab,
  setActiveTab,
  checklistProgress,
  t,
}) {
  return (
    <div
      className="trip-summary__primary-nav"
      role="tablist"
      aria-label={`${t('itinerary')}, ${t('myRoutes')}, ${t('notes')}`}
    >
      {NAV_ITEMS.map(({ id, labelKey, Icon }, index) => {
        const isActive = activeTab === id;
        const badge = id === 'notes' ? checklistProgress : '';
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
            <NavDividerMask index={index} />
            <span
              className="trip-summary__primary-nav-icon"
              style={{ color: isActive ? HEADER_ACTIVE_ICON_COLOR : HEADER_ICON_COLOR }}
              aria-hidden="true"
            >
              <Icon size={18} stroke={1.8} />
            </span>
            <span className="trip-summary__primary-nav-label">{t(labelKey)}</span>
            {badge !== '' && badge !== 0 && (
              <span
                className="trip-summary__primary-nav-badge trip-summary__primary-nav-badge--notes"
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
