// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('note and detail overlays align to the integrated panel top while the filled-note dot stays small', async () => {
  const floating = await read('src/app/FloatingItineraryPanel.css');
  const segmentHeader = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');

  assert.match(
    floating,
    /\.workspace__desktop--column > \.mappane \.segnote\s*\{[^}]*top:\s*var\(--trip-header-height\)\s*!important;/s
  );
  assert.match(
    floating,
    /\.workspace__desktop--column > \.mappane \.segnote,[\s\S]*left:\s*14px;/s
  );

  for (const source of [segmentHeader, origin]) {
    assert.match(source, /const NOTE_DOT_STYLE = Object\.freeze\(\{/);
    assert.match(source, /top:\s*'2px'/);
    assert.match(source, /left:\s*'-2px'/);
    assert.match(source, /width:\s*'4px'/);
    assert.match(source, /height:\s*'4px'/);
    assert.match(source, /border:\s*'1px solid var\(--surface, #fff\)'/);
    assert.doesNotMatch(source, /\? ' has-note' : ''/);
  }
});

test('trip dates use localized three-letter months and remain the first header metric after Notes', async () => {
  const header = await read('src/app/TripSummaryHeader.jsx');
  const polish = await read('src/app/HeaderRequestedPolish.css');
  const es = await read('src/i18n/es.js');
  const en = await read('src/i18n/en.js');

  const datesIndex = header.indexOf("label={t('tripDates')}");
  const totalIndex = header.indexOf("label={t('grandTotal')}");

  assert.ok(datesIndex >= 0, 'Trip dates metric is missing');
  assert.ok(totalIndex >= 0, 'Trip total metric is missing');
  assert.ok(datesIndex < totalIndex, 'Trip dates must appear before total as the first metric after Notes');
  assert.match(header, /Icon=\{IconCalendar\}/);
  assert.match(header, /summary\.startDate && summary\.endDate/);
  assert.match(header, /day:\s*'numeric'/);
  assert.match(header, /month:\s*'short'/);
  assert.match(header, /monthChars\.length > 3 \? monthChars\.slice\(0, 3\)\.join\(''\)/);
  assert.match(header, /formatHeaderDate\(summary\.startDate, intlLocale\)\} - \$\{formatHeaderDate\(summary\.endDate, intlLocale\)/);
  assert.doesNotMatch(header, /day:\s*'2-digit'[\s\S]*month:\s*'2-digit'[\s\S]*year:\s*'numeric'/);
  assert.doesNotMatch(header, /DistanceSpanIcon|summary\.distanceKm|totalDistance|\bkm\b/);
  assert.match(polish, /grid-template-columns:\s*1\.45fr 1\.2fr 1fr 1fr 0\.88fr 0\.88fr;/);
  assert.match(es, /tripDates:\s*'Fechas del viaje'/);
  assert.match(en, /tripDates:\s*'Trip dates'/);
});

test('fixed concepts are centered as one icon-label-amount block inside each date column', async () => {
  const money = await read('src/components/MoneyInput.jsx');
  const fixed = await read('src/modules/expenses/FixedExpenseCards.jsx');

  assert.match(fixed, /<MoneyCard[\s\S]*centered/);
  assert.match(money, /centered = false/);
  assert.match(money, /gridTemplateColumns:\s*'18px minmax\(0, 82px\) 70px'/);
  assert.match(money, /justifyContent:\s*'center'/);
  assert.match(money, /width:\s*'min\(178px, 100%\)'/);
  assert.match(money, /justifySelf:\s*'center'/);
  assert.match(money, /gridColumn:\s*3[\s\S]*width:\s*'70px'[\s\S]*marginLeft:\s*0/s);
});
