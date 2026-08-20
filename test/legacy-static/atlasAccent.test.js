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
  const accentStyles = `${polish}\n${itinerary}\n${summary}`;
  assert.match(tokens, /--atlas-accent:\s*#19a5d0/);
  for (const selector of [
    '.topbar__save',
    '.editor-module__settings .editor-module__more-button',
    '.geo-search__button',
    '.place-save-prompt button',
    '.toast',
    '.trip-place button:hover',
    '.place-result-marker:hover',
    ".editor-module__tab[data-tab-icon='places-map-pin'] .tabbar__badge",
  ]) {
    assert.ok(accentStyles.includes(selector), `Missing Atlas accent selector: ${selector}`);
  }
  assert.doesNotMatch(polish, /\.topbar__brand-icon/);
  assert.match(accentStyles, /background:\s*var\(--atlas-accent\)/);
  assert.match(accentStyles, /color:\s*#ffffff/);
});

test('itinerary, routes and notes keep the tab structure while trip currency and app language live in the global header', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const selector = await read('src/app/SummarySelectorMetric.jsx');
  const topbar = await read('src/app/AppTopbar.jsx');
  const sidebar = await read('src/app/ItinerarySidebar.css');
  assert.equal((editor.match(/role="tab"/g) || []).length, 3);
  assert.equal((editor.match(/editor-module__tab-icon/g) || []).length, 3);
  assert.equal((editor.match(/editor-module__tab-label/g) || []).length, 3);
  assert.match(editor, /t\('itinerary'\)/);
  assert.match(editor, /t\('myRoutes'\)/);
  assert.match(editor, /t\('notes'\)/);
  assert.match(menu, /openMenu === 'workspace'/);
  assert.doesNotMatch(menu, /setCurrency|t\('currency'\)|setLocale|t\('language'\)/);
  assert.match(header, /const CURRENCIES = \['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'\]/);
  assert.match(header, currencySelectorContract);
  assert.match(header, languageSelectorContract);
  assert.match(selector, /role="listbox"/);
  assert.doesNotMatch(selector, /<select\b|<option\b/);
  assert.doesNotMatch(topbar, /t\('language'\)|setLocale\(availableLocale\)/);
  assert.match(topbar, /className="topbar__save"/);
  assert.match(sidebar, /\.editor-module__tabs > \.editor-module__nav-tab,/);
  assert.match(sidebar, /height:\s*76px;/);
  assert.match(sidebar, /padding:\s*3px 3px\s*!important;/);
  assert.match(sidebar, /background:\s*transparent\s*!important;/);
  assert.match(sidebar, /font-family:\s*var\(--font-body\);/);
  assert.match(sidebar, /font-size:\s*11px;/);
  assert.match(sidebar, /font-weight:\s*600;/);
  assert.match(sidebar, /\.editor-module__tabs \.editor-module__tab-icon\s*\{[\s\S]*width:\s*38px;[\s\S]*height:\s*38px;/);
  assert.match(sidebar, /color:\s*#68707d;/);
});

test('places renders the transparent signpost icon through the existing tab asset', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const polish = await read('src/app/FloatingEditorPolish.css');
  const icon = await read('src/assets/lugares-storefront-v2.svg');
  assert.match(editor, /import lugaresIcon from '\.\.\/assets\/lugares-storefront-v2\.svg'/);
  assert.match(editor, /<img src=\{lugaresIcon\} alt="" \/>/);
  assert.doesNotMatch(editor, /IconMapPin/);
  assert.doesNotMatch(polish, /data-tab-icon='places-map-pin'\]::before/);
  assert.doesNotMatch(polish, /assets\/lugares\.svg/);
  assert.match(icon, /aria-label="Lugares"/);
  assert.match(icon, /viewBox="0 0 40 40"/);
  assert.match(icon, /#14394b/);
  assert.match(icon, /fill="#11c7dc"/);
  assert.equal((icon.match(/fill="#fff3d6"/g) || []).length, 3);
  assert.doesNotMatch(icon, />CAFE<\/text>/);
  assert.doesNotMatch(icon, /data:image\//);
  assert.doesNotMatch(icon, /<image\b/);
});

test('desktop navigation stays itinerary, routes and notes while the global header owns trip currency and app language', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const itineraryIndex = editor.indexOf("setActiveTab('segments')");
  const routesIndex = editor.indexOf("setActiveTab('places')");
  const notesIndex = editor.indexOf("setActiveTab('notes')");
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
  assert.match(expenses, /--expense-row-gap:\s*8px/);
  assert.match(expenses, /--expense-icon-box:\s*18px/);
  assert.match(expenses, /--expense-icon-text-gap:\s*4px/);
  assert.match(expenses, /--expense-field-bg:\s*#f5f6f7/);
  assert.match(expenses, /\.expenses__fixed-list,[\s\S]*\.expenses__lineitems\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[\s\S]*grid-auto-rows:\s*44px[\s\S]*row-gap:\s*var\(--expense-row-gap\)/);
  assert.match(expenses, /\.lineitems-section\s*\{[\s\S]*gap:\s*var\(--expense-row-gap\);[\s\S]*padding-top:\s*var\(--expense-row-gap\);/);
  assert.match(expenses, /\.expenses__add-other\s*\{[\s\S]*height:\s*44px;[\s\S]*gap:\s*var\(--expense-icon-text-gap\)/);
  assert.match(expenses, /\.calendar-date\s*\{[\s\S]*width:\s*140px;[\s\S]*height:\s*38px;/);
  assert.match(expenses, /\.calendar-date__trigger,[\s\S]*background:\s*#f5f6f7;[\s\S]*transition:\s*none;/);
  assert.match(expenses, /\.calendar-date__value,[\s\S]*position:\s*absolute;[\s\S]*transform:\s*translateY\(-50%\)/);
  assert.match(expenses, /\.moneycard__amount\s*\{[\s\S]*background:\s*var\(--expense-field-bg\)/);
  assert.match(fixed, /definition=\{EXPENSE_ICONS\.taxiUber\}[\s\S]*label="Taxi"/);
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
  assert.match(fixed, /definition=\{EXPENSE_ICONS\.attraction\}/);
  assert.match(fixed, /value=\{attractionsTotal\}/);
  assert.match(fixed, /onChange=\{onSetAttractions\}/);
  assert.match(editor, /onSetAttractions=\{\(value\) =>[\s\S]*setExpenseItemsTotal\(expenses, 'attractions', value\)/);
  assert.doesNotMatch(editor, /<CategoryMoneyCard[\s\S]*definition=\{EXPENSE_ICONS\.attraction\}/);
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
