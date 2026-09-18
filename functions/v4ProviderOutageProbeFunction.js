import { onRequest } from 'firebase-functions/v2/https';
import { limitedFetch } from './geoapifySupport.js';

const PROBE_URL = 'http://127.0.0.1:65534/v1/geocode/search?phase_k_probe=1';

export const storageV4ProviderOutageProbe = onRequest(
  {
    region: 'us-central1',
    invoker: 'private',
    memory: '256MiB',
    timeoutSeconds: 10,
    maxInstances: 1,
    concurrency: 1,
    labels: {
      system: 'atlas-storage-v4',
      environment: 'dev',
      phase: 'k',
      purpose: 'provider-outage-probe',
    },
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ ok: false, reason: 'method-not-allowed' });
      return;
    }

    try {
      await limitedFetch(
        PROBE_URL,
        { method: 'GET' },
        'Geoapify Phase K synthetic outage probe'
      );
    } catch {
      response.status(200).json({
        ok: true,
        synthetic: true,
        provider: 'geoapify',
        operation: 'geocode-search',
        observedOutcome: 'network-error',
        storageV4WriteEnabled: false,
        productionTouched: false,
      });
      return;
    }

    response.status(500).json({
      ok: false,
      synthetic: true,
      reason: 'unexpected-probe-success',
    });
  }
);
