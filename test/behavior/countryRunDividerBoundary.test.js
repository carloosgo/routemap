import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItineraryStopSequence } from '../../src/modules/trips/itineraryStopSequence.js';

function city(name, countryCode) {
  return { name, countryCode };
}

test('country run stops suppress only internal dividers and restore the divider on country exit', () => {
  const madrid = city('Madrid', 'ES');
  const paris = city('Paris', 'FR');
  const lyon = city('Lyon', 'FR');
  const nice = city('Nice', 'FR');
  const kyiv = city('Kyiv', 'UA');
  const bratislava = city('Bratislava', 'SK');

  const sequence = buildItineraryStopSequence([
    { origin: madrid, destination: paris },
    { origin: paris, destination: lyon },
    { origin: lyon, destination: nice },
    { origin: nice, destination: kyiv },
    { origin: kyiv, destination: bratislava },
  ]);

  assert.deepEqual(
    sequence.map(({ countryRunPosition, joinsPreviousCountryRun }) => ({
      countryRunPosition,
      joinsPreviousCountryRun,
    })),
    [
      { countryRunPosition: 'start', joinsPreviousCountryRun: false },
      { countryRunPosition: 'middle', joinsPreviousCountryRun: true },
      { countryRunPosition: 'end', joinsPreviousCountryRun: true },
      { countryRunPosition: null, joinsPreviousCountryRun: false },
      { countryRunPosition: null, joinsPreviousCountryRun: false },
    ]
  );
});
