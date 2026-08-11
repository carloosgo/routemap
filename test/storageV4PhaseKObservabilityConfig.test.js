import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const observabilityRoot = new URL('../ops/storage-v4/observability/', import.meta.url);
const metricsRoot = new URL('metrics/', observabilityRoot);
const alertsRoot = new URL('alerts/', observabilityRoot);

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

async function jsonFiles(url) {
  return (await readdir(url)).filter((name) => name.endsWith('.json')).sort();
}

test('Phase K define las metricas operacionales esperadas sin extractores sensibles', async () => {
  const files = await jsonFiles(metricsRoot);
  assert.equal(files.length, 7);

  const metrics = await Promise.all(files.map((name) => readJson(new URL(name, metricsRoot))));
  const names = new Set(metrics.map((metric) => metric.name));
  assert.deepEqual(names, new Set([
    'atlas_storage_v4_rollout_events',
    'atlas_storage_v4_sync_events',
    'atlas_storage_v4_provider_cache_events',
    'atlas_storage_v4_provider_request_events',
    'atlas_storage_v4_rollout_latency_ms',
    'atlas_storage_v4_sync_latency_ms',
    'atlas_storage_v4_provider_latency_ms',
  ]));

  for (const metric of metrics) {
    assert.match(metric.filter, /storage_v4_(rollout|sync|provider_cache|provider_request)_metric/);
    assert.equal(metric.disabled, false);
    assert.ok(metric.metricDescriptor);
    const extractorText = JSON.stringify(metric.labelExtractors || {});
    assert.doesNotMatch(extractorText, /uid|tripId|entityId|entityKey|query|apiKey|body|response|documentId/i);
  }

  const distributions = metrics.filter((metric) => metric.metricDescriptor.valueType === 'DISTRIBUTION');
  assert.equal(distributions.length, 3);
  for (const metric of distributions) {
    assert.equal(metric.metricDescriptor.metricKind, 'DELTA');
    assert.equal(metric.metricDescriptor.unit, 'ms');
    assert.equal(metric.valueExtractor, 'EXTRACT(jsonPayload.durationMs)');
    assert.ok(metric.bucketOptions?.explicitBuckets?.bounds?.length >= 10);
  }
});

test('dashboard Phase K cubre telemetria, Firestore y Cloud Run sin tocar produccion', async () => {
  const dashboard = await readJson(new URL('dashboard.json', observabilityRoot));
  assert.equal(dashboard.displayName, 'Atlas Storage v4 — dev');
  assert.equal(dashboard.labels.environment, 'dev');

  const serialized = JSON.stringify(dashboard);
  for (const metric of [
    'atlas_storage_v4_rollout_events',
    'atlas_storage_v4_sync_events',
    'atlas_storage_v4_provider_cache_events',
    'atlas_storage_v4_provider_request_events',
    'atlas_storage_v4_rollout_latency_ms',
    'atlas_storage_v4_sync_latency_ms',
    'atlas_storage_v4_provider_latency_ms',
    'firestore.googleapis.com/document/read_ops_count',
    'firestore.googleapis.com/document/write_ops_count',
    'firestore.googleapis.com/document/delete_ops_count',
    'firestore.googleapis.com/storage/pitr_storage_bytes',
    'firestore.googleapis.com/storage/backups_storage_bytes',
    'run.googleapis.com/request_count',
    'run.googleapis.com/request_latencies',
  ]) {
    assert.ok(serialized.includes(metric), `Falta ${metric} en dashboard.json`);
  }

  for (const stream of [
    'storage_v4_rollout_metric',
    'storage_v4_sync_metric',
    'storage_v4_provider_cache_metric',
    'storage_v4_provider_request_metric',
  ]) {
    assert.ok(serialized.includes(stream), `Falta ${stream} en dashboard.json`);
  }

  assert.doesNotMatch(serialized, /atlasmap-prod|production-project|prod-project/i);
});

test('dashboard calcula sync success ratio solo sobre eventos flush', async () => {
  const dashboard = await readJson(new URL('dashboard.json', observabilityRoot));
  const widget = dashboard.gridLayout.widgets.find(
    (candidate) => candidate.title === 'Sync flush success ratio'
  );
  assert.ok(widget);

  const ratio = widget.xyChart.dataSets[0].timeSeriesQuery.timeSeriesFilterRatio;
  assert.ok(ratio.numerator.filter.includes('metric.labels.event="flush"'));
  assert.ok(ratio.numerator.filter.includes('metric.labels.outcome="success"'));
  assert.ok(ratio.denominator.filter.includes('metric.labels.event="flush"'));
  assert.equal(ratio.denominator.filter.includes('metric.labels.outcome='), false);
});

test('dashboard expone p50 p95 p99 para latencia de repositorio', async () => {
  const dashboard = await readJson(new URL('dashboard.json', observabilityRoot));
  const widget = dashboard.gridLayout.widgets.find(
    (candidate) => candidate.title === 'Repository latency percentiles'
  );
  assert.ok(widget);

  const aligners = widget.xyChart.dataSets.map(
    (dataSet) => dataSet.timeSeriesQuery.timeSeriesFilter.aggregation.perSeriesAligner
  );
  assert.deepEqual(aligners, [
    'ALIGN_PERCENTILE_50',
    'ALIGN_PERCENTILE_95',
    'ALIGN_PERCENTILE_99',
  ]);
});

test('alert templates Phase K nacen deshabilitados y sin canales', async () => {
  const files = await jsonFiles(alertsRoot);
  assert.equal(files.length, 3);

  const policies = await Promise.all(files.map((name) => readJson(new URL(name, alertsRoot))));
  for (const policy of policies) {
    assert.ok(policy.displayName.startsWith('Atlas Storage v4 — '));
    assert.ok(policy.displayName.endsWith(' — dev'));
    assert.equal(policy.enabled, false);
    assert.deepEqual(policy.notificationChannels, []);
    assert.equal(policy.combiner, 'OR');
    assert.equal(policy.conditions.length, 1);
    assert.ok(policy.conditions[0].conditionThreshold);
    assert.ok(
      policy.conditions[0].conditionThreshold.filter.includes(
        'logging.googleapis.com/user/atlas_storage_v4_'
      )
    );
  }
});
