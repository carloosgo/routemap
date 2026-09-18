import {
  IconBuilding,
  IconBuildingBridge,
  IconBuildingCastle,
  IconBuildingChurch,
  IconBuildingMonument,
  IconBuildingSkyscraper,
} from '@tabler/icons-react';

const VISUAL_STYLE = Object.freeze({
  '--city-visual-accent': '#71818a',
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  borderRadius: 'inherit',
  background: 'linear-gradient(145deg, color-mix(in srgb, var(--city-visual-accent) 15%, #f1f6f8) 0%, color-mix(in srgb, var(--city-visual-accent) 7%, #fbfaf7) 54%, color-mix(in srgb, var(--city-visual-accent) 11%, #eef3f4) 100%)',
  color: 'color-mix(in srgb, var(--city-visual-accent) 76%, #3f5159)',
});

const ICON_STYLE = Object.freeze({
  width: '58px',
  height: '58px',
  opacity: 0.88,
  pointerEvents: 'none',
});

function normalizeCityName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function itineraryCityVisualKind(city) {
  const name = normalizeCityName(city?.name || city?.displayName);
  if (!name) return 'generic';
  if (name.includes('mexico city') || name.includes('ciudad de mexico') || name.includes('cdmx')) return 'metropolis';
  if (name.includes('paris')) return 'paris';
  if (name.includes('amsterdam')) return 'amsterdam';
  if (name.includes('bruges') || name.includes('brujas')) return 'bruges';
  if (name.includes('ghent') || name.includes('gante')) return 'ghent';
  if (name.includes('brussels') || name.includes('bruselas')) return 'brussels';
  if (name.includes('cologne') || name.includes('koln') || name.includes('colonia')) return 'cologne';
  if (name.includes('berlin')) return 'berlin';
  if (name.includes('munich') || name.includes('munchen')) return 'munich';
  if (name.includes('nuremberg') || name.includes('nurnberg')) return 'nuremberg';
  if (name.includes('bamberg')) return 'bamberg';
  if (name.includes('rothenburg')) return 'rothenburg';
  if (name.includes('london') || name.includes('londres')) return 'london';
  if (name.includes('madrid')) return 'madrid';
  if (name.includes('barcelona')) return 'barcelona';
  if (name.includes('rome') || name.includes('roma')) return 'rome';
  if (name.includes('venice') || name.includes('venecia') || name.includes('venezia')) return 'venice';
  if (name.includes('prague') || name.includes('praga') || name.includes('praha')) return 'prague';
  if (name.includes('vienna') || name.includes('viena') || name.includes('wien')) return 'vienna';
  if (name.includes('frankfurt')) return 'frankfurt';
  return 'generic';
}

const ICON_BY_KIND = Object.freeze({
  metropolis: IconBuildingSkyscraper,
  paris: IconBuildingMonument,
  amsterdam: IconBuildingBridge,
  bruges: IconBuildingBridge,
  ghent: IconBuildingCastle,
  brussels: IconBuildingMonument,
  cologne: IconBuildingChurch,
  berlin: IconBuildingMonument,
  munich: IconBuildingChurch,
  nuremberg: IconBuildingCastle,
  bamberg: IconBuildingCastle,
  rothenburg: IconBuildingCastle,
  london: IconBuildingBridge,
  madrid: IconBuildingMonument,
  barcelona: IconBuildingChurch,
  rome: IconBuildingMonument,
  venice: IconBuildingBridge,
  prague: IconBuildingCastle,
  vienna: IconBuildingMonument,
  frankfurt: IconBuildingSkyscraper,
  generic: IconBuilding,
});

export function ItineraryCityVisual({ city, accent }) {
  const kind = itineraryCityVisualKind(city);
  const VisualIcon = ICON_BY_KIND[kind] || IconBuilding;
  const visualStyle = accent
    ? { ...VISUAL_STYLE, '--city-visual-accent': accent }
    : VISUAL_STYLE;

  return (
    <span
      className="itinerary-card-city-icon"
      data-city-visual={kind}
      style={visualStyle}
      aria-hidden="true"
    >
      <VisualIcon
        size={58}
        stroke={1.45}
        style={ICON_STYLE}
        aria-hidden="true"
      />
    </span>
  );
}
