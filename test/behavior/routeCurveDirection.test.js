// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveCurve, buildMapFeatureData } from '../../src/modules/map/routeMapModel.js';

function city(name, lon, lat) {
  return { id: name.toLowerCase().replaceAll(' ', '-'), name, lon, lat };
}

function segment(id, origin, destination) {
  return {
    id,
    origin,
    destination,
    expenses: {
      transport: { plane: 0, train: 0, bus: 0, taxiUber: 0 },
    },
  };
}

function signedCurveSide(path) {
  const start = path[0];
  const end = path.at(-1);
  const middle = path[Math.floor(path.length / 2)];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const mx = middle[0] - ((start[0] + end[0]) / 2);
  const my = middle[1] - ((start[1] + end[1]) / 2);
  return (dx * my) - (dy * mx);
}

function europeanLoop() {
  const points = [
    city('Paris 1', 2.3522, 48.8566),
    city('Gante', 3.7174, 51.0543),
    city('Brujas', 3.2247, 51.2093),
    city('Amsterdam', 4.9041, 52.3676),
    city('Colonia', 6.9603, 50.9375),
    city('Berlin', 13.4050, 52.5200),
    city('Munich', 11.5820, 48.1351),
    city('Nuremberg 8', 11.0767, 49.4521),
    city('Bamberg', 10.9028, 49.8988),
    city('Nuremberg 10', 11.0767, 49.4521),
    city('Rothenburg', 10.1790, 49.3780),
    city('Nuremberg 12', 11.0767, 49.4521),
    city('Frankfurt', 8.6821, 50.1109),
    city('Paris 14', 2.3522, 48.8566),
    city('Barcelona', 2.1734, 41.3851),
    city('Madrid', -3.7038, 40.4168),
  ];
  return points.slice(0, -1).map((origin, index) =>
    segment(`${index + 1}-${index + 2}`, origin, points[index + 1])
  );
}

test('adaptiveCurve mantiene rectos los tramos muy cortos y muy largos', () => {
  const short = adaptiveCurve(city('A', 0, 0), city('B', 1, 0), {
    routeCities: [city('C', 5, 5)],
  });
  const long = adaptiveCurve(city('A', 0, 0), city('B', 25, 0), {
    routeCities: [city('C', 5, 5)],
  });

  assert.deepEqual(short, [[0, 0], [1, 0]]);
  assert.deepEqual(long, [[0, 0], [25, 0]]);
});

test('las curvas del recorrido se abren hacia el exterior en ambos sentidos del viaje', () => {
  const result = buildMapFeatureData({
    segments: europeanLoop(),
    places: [],
    viewMode: 'segments',
    colorForIndex: () => '#123456',
  });
  const byId = new Map(
    result.routeFeatures.map((feature) => [feature.properties.segmentId, feature.geometry.coordinates])
  );

  for (const id of ['1-2', '3-4', '5-6', '6-7', '13-14', '15-16']) {
    const path = byId.get(id);
    assert.ok(path?.length > 2, `${id} debe conservar una curva`);
    assert.ok(signedCurveSide(path) > 0, `${id} debe invertir la curva hacia el exterior`);
  }

  const parisBarcelona = byId.get('14-15');
  assert.ok(parisBarcelona?.length > 2);
  assert.ok(
    signedCurveSide(parisBarcelona) < 0,
    '14-15 debe conservar el lado exterior que ya tenia y no invertir todas las curvas indiscriminadamente'
  );
});
