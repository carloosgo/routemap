// test-contract: legacy-static
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const currencySelectorContract = /<SummarySelectorMetric[\s\S]*?Icon=\{IconCurrencyDollar\}[\s\S]*?label=\{t\('currency'\)\}[\s\S]*?value=\{trip\.currency\}[\s\S]*?onChange=\{setCurrency\}/;
const languageSelectorContract = /<SummarySelectorMetric[\s\S]*?Icon=\{IconLanguage\}[\s\S]*?label=\{t\('language'\)\}[\s\S]*?value=\{locale\}[\s\S]*?onChange=\{setLocale\}/;

test('the selected Atlas controls retain the exact #19a5d0 accent token', async () => {
  const tokens = await read('src/index.css');
  const polish = await read('src/app/FloatingEditorPolish.css');
  const itinerary = await read('src/app/ItineraryTripHeader.css');
  const summary = await read('src/app/TripSummaryHeader.css');
  const headerNav = await read('src/app/TripHeaderNavigation.css');
  const accentStyles = `${polish}\n${itinerary}\n${summary}\n${headerNav}`;
  assert.match(tokens, /--atlas-accent:\s*#19a5d0/);
  for (const selector of [
    '.topbar__save',
    '.editor-module__settings .editor-module__more-button',
    '.geo-search__button',
    '.place-save-prompt button',
    '.toast',
    '.trip-place button:hover',
    '.place-result-marker:hover',
    '.trip-summary__primary-nav-icon',
  ]) {
    assert.ok(accentStyles.includes(selector), `Missing Atlas accent selector: ${selector}`);
  }
  assert.doesNotMatch(polish, /\.topbar__brand-icon/);
  assert.match(accentStyles, /var\(--atlas-accent\)/);
  assert.match(accentStyles, /color:\s*#ffffff/);
});

test('itinerary, routes and notes keep one tab structure in the global header', async () => {
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const selector = await read('src/app/SummarySelectorMetric.jsx');
  const topbar = await read('src/app/AppTopbar.jsx');
  const navCss = await read('src/app/TripHeaderNavigation.css');

  assert.match(navigation, /role="tablist"/);
  assert.match(navigation, /id: 'segments'[\s\S]*id: 'places'[\s\S]*id: 'notes'/);
  assert.match(navigation, /labelKey: 'itinerary'/);
  assert.match(navigation, /labelKey: 'myRoutes'/);
  assert.match(navigation, /labelKey: 'notes'/);
  assert.match(navigation, /aria-selected=\{isActive\}/);
  assert.doesNotMatch(navigation, /routeCount|badge--places/);
  assert.match(navigation, /const badge = id === 'notes' \? checklistProgress : '';/);
  assert.doesNotMatch(editor, /editor-module__tabs|editor-module__nav-tab/);
  assert.match(menu, /openMenu === 'workspace'/);
  assert.doesNotMatch(menu, /setCurrency|t\('currency'\)|setLocale|t\('language'\)/);
  assert.match(header, currencySelectorContract);
  assert.match(header, languageSelectorContract);
  assert.match(selector, /role="listbox"/);
  assert.doesNotMatch(selector, /<select\b|<option\b/);
  assert.doesNotMatch(topbar, /t\('language'\)|setLocale\(availableLocale\)/);
  assert.match(topbar, /className="topbar__save"/);
  assert.match(navCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(navCss, /font-family:\s*var\(--font-body\);/);
  assert.match(navCss, /font-size:\s*14px;/);
  assert.match(navCss, /font-weight:\s*600;/);
  assert.match(navCss, /\.trip-summary__primary-nav-icon\s*\{[\s\S]*width:\s*22px;[\s\S]*height:\s*24px;[\s\S]*color:\s*var\(--atlas-accent\);/);
  assert.match(navCss, /\.trip-summary__primary-nav-label\s*\{[\s\S]*color:\s*#000000;[\s\S]*font-size:\s*14px;/);
  assert.doesNotMatch(navCss, /\.trip-summary__primary-nav-badge--places/);
  assert.match(navCss, /\.trip-summary__primary-nav-badge--notes\s*\{[\s\S]*background:\s*#fff0eb;[\s\S]*color:\s*#e2725b;/);
});

test('routes keeps its own icon while the header replaces distance with the trip date range', async () => {
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const editor = await read('src/app/AppEditorModule.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const icon = await read('src/assets/lugares-storefront-v2.svg');

  assert.match(navigation, /IconRoute/);
  assert.doesNotMatch(navigation, /NAV_ICON_COLOR|#7c5ce7/);
  assert.match(header, /IconCalendar/);
  assert.match(header, /label=\{t\('tripDates'\)\}/);
  assert.match(header, /summary\.startDate[\s\S]*summary\.endDate/);
  assert.match(header, /Icon=\{IconMapPin\} iconColor="#e05252"/);
  assert.doesNotMatch(header, /DistanceSpanIcon|distanceKm|totalDistance|≈\s*\$\{distance\}\s*km/);
  assert.doesNotMatch(header, /<Metric Icon=\{IconRoute\}/);
  assert.doesNotMatch(navigation, /lugaresIcon|lugares-storefront-v2/);
  assert.doesNotMatch(editor, /lugaresIcon|lugares-storefront-v2/);
  assert.match(icon, /aria-label="Lugares"/);
  assert.match(icon, /viewBox="0 0 40 40"/);
  assert.match(icon, /#14394b/);
  assert.match(icon, /fill="#11c7dc"/);
  assert.equal((icon.match(/fill="#fff3d6"/g) || []).length, 3);
  assert.doesNotMatch(icon, />CAFE<\/text>/);
  assert.doesNotMatch(icon, /data:image\//);
  assert.doesNotMatch(icon, /<image\b/);
});

test('header navigation order stays itinerary, routes and notes while global header owns currency and language', async () => {
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const itineraryIndex = navigation.indexOf("id: 'segments'");
  const routesIndex = navigation.indexOf("id: 'places'");
  const notesIndex = navigation.indexOf("id: 'notes'");
  assert.ok(itineraryIndex >= 0);
  assert.ok(itineraryIndex < routesIndex);
  assert.ok(routesIndex < notesIndex);
  assert.match(menu, /openMenu === 'workspace'/);
  assert.doesNotMatch(menu, /t\('currency'\)|t\('language'\)|setCurrency|setLocale/);
  assert.match(header, currencySelectorContract);
  assert.match(header, languageSelectorContract);
});

test('expanded expense editor keeps compact fields and one exact vertical rhythm', async () => {
  const expenses = await read('src/modules/expenses/ExpenseEditor.css');
  const fixed = await read('src/modules/expenses/FixedExpenseCards.jsx');
  const editor = await read('src/modules/expenses/ExpenseEditor.jsx');
  const lineItems = await read('src/modules/expenses/ExpenseLineItemsGrid.jsx');
  const catalog = await read('src/modules/expenses/expenseEditorCatalog.jsx');
  const money = await read('src/components/MoneyInput.jsx');
  const headerCss = await read('src/app/TripSummaryHeader.css');

  assert.match(expenses, /--expense-city-guide-inset:\s*0px/);
  assert.match(expenses, /--expense-column-gap:\s*18px/);
  assert.match(expenses, /--expense-row-gap:\s*8px/);
  assert.match(expenses, /--expense-amount-width:\s*82px/);
  assert.match(expenses, /--expense-date-bg:\s*#f8f9fa/);
  assert.match(expenses, /--expense-add-color:\s*#8a929d/);
  assert.match(expenses, /--expense-icon-box:\s*18px/);
  assert.match(expenses, /--expense-icon-text-gap:\s*4px/);
  assert.match(expenses, /\.dates__row\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[\s\S]*column-gap:\s*var\(--expense-column-gap\)/);
  assert.match(expenses, /\.calendar-date\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*38px;/);
  assert.match(expenses, /\.calendar-date__trigger,[\s\S]*background:\s*var\(--expense-date-bg\);[\s\S]*transition:\s*none;/);
  assert.match(expenses, /\.calendar-date__value,[\s\S]*left:\s*50%;[\s\S]*text-align:\s*center;[\s\S]*transform:\s*translate\(-50%, -50%\)/);
  assert.match(expenses, /\.expenses--journey\s*\{[\s\S]*gap:\s*var\(--expense-row-gap\)/);
  assert.match(expenses, /\.expenses__fixed-list,[\s\S]*\.expenses__lineitems\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[\s\S]*grid-auto-rows:\s*44px[\s\S]*row-gap:\s*var\(--expense-row-gap\)/);
  assert.match(expenses, /\.lineitems-section\s*\{[\s\S]*gap:\s*var\(--expense-row-gap\);[\s\S]*padding-top:\s*0;/);
  assert.match(expenses, /\.expenses__add-other\s*\{[\s\S]*height:\s*44px;[\s\S]*color:\s*var\(--expense-add-color\)/);
  assert.match(expenses, /\.expenses__add-other-icon\s*\{[\s\S]*color:\s*var\(--expense-add-color\)/);
  assert.match(expenses, /\.moneycard__amount\s*\{[\s\S]*width:\s*var\(--expense-amount-width\)[\s\S]*background:\s*transparent/);
  assert.match(expenses, /\.moneycard__input\s*\{[\s\S]*width:\s*65px/);
  assert.match(expenses, /\.moneycard:focus-within \.moneycard__amount\s*\{[\s\S]*background:\s*transparent/);
  assert.match(fixed, /definition=\{EXPENSE_ICONS\.taxiUber\}[\s\S]*label=\{t\('taxi'\)\}/);
  assert.doesNotMatch(editor, /expenses__total|segmentTotal|expensesTotal|formatMoney/);
  assert.match(lineItems, /<MoneyAmountInput/);
  assert.match(money, /export function MoneyAmountInput/);
  assert.match(money, /type="text"/);
  assert.match(money, /pattern="\[0-9,\]\*\(\[\.\]\[0-9\]\{0,2\}\)\?"/);
  assert.match(headerCss, /\.trip-summary\s*\{[\s\S]*min-height:\s*63px/);
  assert.match(headerCss, /\.trip-summary__metric\s*\{[\s\S]*height:\s*44px/);

  assert.match(catalog, /plane:[\s\S]*'#7c5ce7'/);
  assert.match(catalog, /train:[\s\S]*'#e05252'/);
  assert.match(catalog, /taxiUber:[\s\S]*'#d94f8a'/);
  assert.equal((fixed.match(/<ExpenseMoneyCard/g) || []).length, 6);
  assert.doesNotMatch(fixed, /EXPENSE_ICONS\.attraction|attractionsTotal|onSetAttractions/);
  assert.doesNotMatch(editor, /setExpenseItemsTotal\(expenses, 'attractions'/);
});

test('desktop itinerary geometry stays contained while detail forms remain in the note-style map modal', async () => {
  const layout = await read('src/app/TripWorkspaceHeaderLayout.css');
  const itinerary = await read('src/app/ItineraryTripHeader.css');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');
  const segmentForm = await read('src/modules/trips/SegmentForm.jsx');
  const originSection = await read('src/modules/trips/SegmentOriginSection.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const modal = await read('src/modules/trips/ItineraryDetailsModal.jsx');
  const main = await read('src/main.jsx');
  const headerPolish = await read('src/app/HeaderRequestedPolish.css');

  assert.match(layout, /--workspace-panel-width:\s*clamp\(458px, calc\(40vw - var\(--atlas-nav-width\)\), 540px\);/);
  assert.match(layout, /--trip-header-height:\s*63px;/);
  assert.match(layout, /grid-template-columns:[\s\S]*var\(--atlas-nav-width\)[\s\S]*calc\(var\(--workspace-panel-width\) - var\(--atlas-nav-width\)\)[\s\S]*minmax\(0, 1fr\);/s);
  assert.match(itinerary, /grid-template-columns:\s*18px 30px 126px minmax\(0, 1fr\);/);
  assert.match(compact, /grid-template-columns:\s*90px repeat\(3, 14px\);/);
  assert.match(compact, /padding-right:\s*4px;[\s\S]*column-gap:\s*8px;/s);
  assert.match(compact, /\.itinerary-stop__amount\s*\{[^}]*width:\s*90px;[^}]*min-width:\s*90px;[^}]*color:\s*#5f5f5f;[^}]*font-size:\s*12px;[^}]*font-weight:\s*700;/s);
  assert.doesNotMatch(compact, /itinerary-stop__dates|itinerary-stop__nights|background:\s*var\(--atlas-accent\)/);
  assert.doesNotMatch(floating, /:has\(\.editor-module--itinerary\)/);
  assert.match(floating, /\.workspace__desktop--column\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--workspace-panel-width\) minmax\(0, 1fr\);/s);
  assert.match(floating, /\.workspace-panel\s*\{[^}]*position:\s*relative;[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
  assert.doesNotMatch(floating, /scale\(|zoom:/);
  assert.doesNotMatch(segmentForm, /formatSegmentDate|formatSegmentNights|CollapsibleRegion|<SegmentBody|expanded=|onToggle=/);
  assert.doesNotMatch(originSection, /formatSegmentDate|formatSegmentNights|CollapsibleRegion|<OriginBody|useState/);
  assert.doesNotMatch(header, /itinerary-stop__dates|itinerary-stop__nights/);
  assert.doesNotMatch(origin, /itinerary-stop__dates|itinerary-stop__nights/);
  assert.match(header, /itinerary-stop__amount[\s\S]*segment__note-btn[\s\S]*segment__toggle segment__details-btn[\s\S]*removeSegment/s);
  assert.match(origin, /itinerary-stop__amount[\s\S]*segment__note-btn[\s\S]*segment__toggle segment__details-btn[\s\S]*itinerary-origin__clear/s);
  assert.match(modal, /className="segnote segment-details-modal"/);
  assert.match(modal, /<SegmentBody/);
  assert.match(modal, /<OriginBody/);
  assert.match(main, /TripWorkspaceHeaderLayout\.css';\s*\nimport '\.\/app\/HeaderRequestedPolish\.css';/);
  assert.match(headerPolish, /\.trip-summary__metric:hover/);
  assert.match(headerPolish, /background:\s*transparent;/);
  assert.match(headerPolish, /\.trip-summary__primary-nav-item\.is-active[\s\S]*color:\s*#5f6875;/);
});

test('place save popup hides its close icon and dismisses through outside clicks', async () => {
  const polish = await read('src/app/FloatingEditorPolish.css');
  const dismiss = await read('src/modules/map/placeSavePopupDismiss.js');
  const main = await read('src/main.jsx');
  assert.match(polish, /\.place-save-popup \.maplibregl-popup-close-button\s*\{\s*display:\s*none;/);
  assert.match(dismiss, /document\.addEventListener\('pointerdown'/);
  assert.match(dismiss, /popup\.contains\(event\.target\)/);
  assert.match(dismiss, /maplibregl-popup-close-button/);
  assert.match(main, /placeSavePopupDismiss\.js/);
});