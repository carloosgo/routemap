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
  if (name.includes('paris')) return 'paris';
  if (name.includes('amsterdam')) return 'amsterdam';
  if (name.includes('bruges') || name.includes('brujas')) return 'bruges';
  if (name.includes('ghent') || name.includes('gante')) return 'ghent';
  if (name.includes('brussels') || name.includes('bruselas')) return 'brussels';
  if (name.includes('cologne') || name.includes('koln') || name.includes('colonia')) return 'cologne';
  if (name.includes('berlin')) return 'berlin';
  if (name.includes('munich') || name.includes('munchen') || name.includes('munich')) return 'munich';
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

function Scene({ kind }) {
  switch (kind) {
    case 'paris':
      return (
        <>
          <path d="M112 70h16M116 70l5-17m3 0 5 17M118 53h8l-2-15h-4l-2 15Zm3-15 1-13 1 13M103 70h34" />
          <path d="M40 70V48h19v22M44 53h4m5 0h3M44 59h4m5 0h3M160 70V45h22v25M165 51h4m5 0h3M165 58h4m5 0h3" />
          <path d="M13 72c21-8 41-8 60 0m95 0c17-6 33-6 49 0" />
        </>
      );
    case 'amsterdam':
      return (
        <>
          <path d="M30 70V41h23v29M34 47h5m5 0h5M34 55h5m5 0h5M62 70V36h24v34M67 43h5m5 0h5M95 70V44h22v26M100 51h4m5 0h4M126 70V38h26v32M132 46h5m6 0h5" />
          <path d="M30 41l11-8 12 8M62 36l12-9 12 9M95 44l11-7 11 7M126 38l13-11 13 11" />
          <path d="M10 72h205M15 76c25-7 42 7 66 0s43 7 67 0 43 7 68 0" />
          <path d="M168 69c8-11 20-11 28 0M182 57v13" />
        </>
      );
    case 'bruges':
    case 'ghent':
    case 'brussels':
      return (
        <>
          <path d="M25 70V46h22v24M25 46l5-6 5 6 5-6 7 6M55 70V38h25v32M55 38l5-6 6 6 7-7 7 7M88 70V42h24v28M88 42l6-7 6 7 6-7 6 7M120 70V35h27v35M120 35l7-8 6 8 7-8 7 8" />
          <path d="M32 53h6m0 8h-6M62 48h6m5 0h3M62 57h6m5 0h3M95 51h6m0 9h-6M128 45h5m6 0h4M128 55h5m6 0h4" />
          <path d="M158 70V30h17v40M158 30h17M161 25h11l-2-8h-7l-2 8M166 17V11" />
          <path d="M11 72h205M17 76c29-7 50 7 78 0s51 7 80 0 27 4 42 1" />
        </>
      );
    case 'cologne':
      return (
        <>
          <path d="M79 71h70M92 71V38l7-18 7 18v33M122 71V38l7-18 7 18v33" />
          <path d="M98 20l2-9 2 9m25 0 2-9 2 9M103 47h5m-5 8h5m16-8h5m-5 8h5M108 71V50h13v21" />
          <path d="M22 71h48m93 0h47M27 60h29v11M169 55h28v16" />
          <path d="M10 76c22-7 43 7 65 0s43 7 65 0 43 7 66 0" />
        </>
      );
    case 'berlin':
      return (
        <>
          <path d="M58 70V46h78v24M64 46v-8h66v8M72 38l25-12 25 12M74 51v19M88 51v19M103 51v19M118 51v19" />
          <path d="M97 26V17m-5 0h10" />
          <path d="M158 70V33m0 0-5 9h10l-5-9Zm0-5v-9M151 70h14" />
          <path d="M17 72h201" />
        </>
      );
    case 'munich':
      return (
        <>
          <path d="M72 70V39h25v31M121 70V39h25v31M72 39c0-8 6-14 12-14s13 6 13 14M121 39c0-8 6-14 12-14s13 6 13 14" />
          <path d="M78 51h6m7 0h3M127 51h6m7 0h3M103 70V46h12v24M109 46V31m-5 0h10" />
          <path d="M25 70h34V49h-24v21M159 70h35V46h-26v24M14 72h204" />
        </>
      );
    case 'nuremberg':
    case 'rothenburg':
      return (
        <>
          <path d="M29 70V49h26v21M29 49l13-10 13 10M62 70V39h23v31M62 39l11-9 12 9M94 70V45h31v25M94 45l16-11 15 11" />
          <path d="M135 70V31h27v39M135 31h27M140 31v-8h17v8M148 23V14" />
          <path d="M31 56h8m7 0h6M67 49h5m6 0h4M101 53h6m8 0h5M142 42h5m7 0h5" />
          <path d="M15 72h198" />
        </>
      );
    case 'bamberg':
      return (
        <>
          <path d="M73 68V39h51v29M80 45h8m9 0h8m9 0h5M80 54h8m9 0h8m9 0h5M96 39V26h10v13M91 26h20l-10-9-10 9Z" />
          <path d="M21 70h54M124 70h79M18 74c28-8 49 8 76 0s49 8 77 0 30 5 44 2" />
          <path d="M45 70V48h19v22M140 70V46h22v24M168 70V51h19v19" />
        </>
      );
    case 'london':
      return (
        <>
          <path d="M117 70V31h18v39M120 31l6-10 6 10M126 21v-8M121 43h10M121 52h10" />
          <circle cx="126" cy="38" r="4" />
          <path d="M34 70V46h30v24M39 52h6m8 0h6M163 70V43h28v27M168 50h6m8 0h5" />
          <path d="M10 74h205M17 78c20-6 37 6 56 0s37 6 56 0 37 6 56 0 23 3 31 1" />
          <path d="M72 69c13-13 28-13 41 0m33 0c11-11 24-11 35 0" />
        </>
      );
    case 'madrid':
      return (
        <>
          <path d="M53 70V43h42v27M62 43v-9h24v9M67 34l7-8 7 8M105 70V36h36v34M113 43h7m9 0h7M113 52h7m9 0h7" />
          <path d="M158 70V48h28v22M163 48l9-12 10 12M22 70h22V51h-15v19" />
          <path d="M16 72h202M87 70c11-9 22-9 33 0" />
        </>
      );
    case 'barcelona':
      return (
        <>
          <path d="M78 70V38h17v32M108 70V31h17v39M138 70V40h17v30M85 38l2-15 2 15m26-7 2-18 2 18m26 9 2-14 2 14" />
          <path d="M92 70c5-16 11-16 16 0m17 0c5-18 9-18 14 0M35 70h31V48H42v22M166 70h32V50h-25v20" />
          <path d="M13 72h203" />
        </>
      );
    case 'rome':
      return (
        <>
          <path d="M58 70V45h105v25M58 45c13-12 92-12 105 0M68 70V54h17v16M94 70V52h17v18M120 70V52h17v18M146 70V54h9v16" />
          <path d="M72 45V34m76 11V34M65 34h92" />
          <path d="M18 72h198" />
        </>
      );
    case 'venice':
      return (
        <>
          <path d="M48 70V43h33v27M55 49h7m8 0h6M95 70V28h17v42M95 28h17M100 22h7v6M129 70V47h42v23M136 53h7m9 0h7" />
          <path d="M17 74c22-7 42 7 64 0s42 7 64 0 42 7 64 0" />
          <path d="M145 66c7-7 14-7 21 0M151 64h18" />
        </>
      );
    case 'prague':
    case 'vienna':
      return (
        <>
          <path d="M37 70V46h29v24M43 46l9-12 9 12M78 70V38h24v32M84 38l6-14 6 14M117 70V34h28v36M125 34l6-17 6 17M159 70V48h28v22M165 48l8-10 9 10" />
          <path d="M18 72h198M103 70c12-12 25-12 38 0" />
        </>
      );
    case 'frankfurt':
      return (
        <>
          <path d="M38 70V45h25v25M72 70V31h22v39M104 70V40h19v30M132 70V24h23v46M164 70V37h28v33" />
          <path d="M78 38h9m0 8h-9m31 2h9m20-16h10m-10 8h10m22 5h15m-15 8h15" />
          <path d="M15 72h203" />
        </>
      );
    default:
      return (
        <>
          <path d="M28 70V49h27v21M35 49l7-9 7 9M66 70V39h31v31M74 47h6m8 0h5M108 70V45h29v25M116 52h6m8 0h4M149 70V35h32v35M157 43h6m9 0h5" />
          <path d="M15 72h200M21 76c27-7 49 7 75 0s50 7 77 0 28 4 43 1" />
        </>
      );
  }
}

export function ItineraryCityVisual({ city, accent }) {
  const kind = itineraryCityVisualKind(city);
  return (
    <span
      className="itinerary-city-visual"
      data-city-visual={kind}
      style={accent ? { '--city-visual-accent': accent } : undefined}
      aria-hidden="true"
    >
      <svg viewBox="0 0 230 90" fill="none" focusable="false">
        <Scene kind={kind} />
      </svg>
    </span>
  );
}
