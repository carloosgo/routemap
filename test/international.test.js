import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateInTimeZone,
  formatDistance,
  formatTimeInTimeZone,
  isValidTimeZone,
  kilometersToMiles,
  milesToKilometers,
  normalizeLocale,
  regionFromLocale,
  unitSystemForLocale,
} from '../src/shared/international.js';

test('normaliza locales y extrae región de forma defensiva', () => {
  assert.equal(normalizeLocale(' en-us '), 'en-US');
  assert.equal(normalizeLocale('locale-inválido'), 'es-MX');
  assert.equal(regionFromLocale('es-MX'), 'MX');
});

test('elige sistema de unidades según región', () => {
  assert.equal(unitSystemForLocale('en-US'), 'imperial');
  assert.equal(unitSystemForLocale('es-MX'), 'metric');
  assert.equal(unitSystemForLocale('en-GB'), 'metric');
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

test('convierte y formatea distancias sin valores inválidos', () => {
  assert.ok(Math.abs(kilometersToMiles(10) - 6.213711922) < 0.000001);
  assert.ok(Math.abs(milesToKilometers(6.213711922) - 10) < 0.000001);
  assert.match(formatDistance(10, 'en-US'), /6\.2\s?mi/);
  assert.match(formatDistance(10, 'es-MX'), /10\s?km/);
  assert.match(formatDistance(-5, 'es-MX'), /0\s?km/);
});
