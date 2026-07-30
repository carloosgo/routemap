import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateInTimeZone,
  formatTimeInTimeZone,
  isValidTimeZone,
  normalizeLocale,
} from '../src/shared/international.js';

test('normaliza locales de forma defensiva', () => {
  assert.equal(normalizeLocale(' en-us '), 'en-US');
  assert.equal(normalizeLocale('locale-inválido'), 'es-MX');
});

test('valida zonas horarias IANA', () => {
  assert.equal(isValidTimeZone('America/Mexico_City'), true);
  assert.equal(isValidTimeZone('Europe/Berlin'), true);
  assert.equal(isValidTimeZone('Mars/Olympus'), false);
});

test('formatea fecha y hora en una zona horaria explícita', () => {
  const instant = '2026-12-01T01:30:00Z';
  const mexicoDate = formatDateInTimeZone(instant, {
    locale: 'es-MX',
    timeZone: 'America/Mexico_City',
  });
  const berlinDate = formatDateInTimeZone(instant, {
    locale: 'de-DE',
    timeZone: 'Europe/Berlin',
  });

  assert.notEqual(mexicoDate, berlinDate);
  assert.match(
    formatTimeInTimeZone(instant, { locale: 'en-US', timeZone: 'Europe/Berlin' }),
    /02:30|2:30/
  );
});
