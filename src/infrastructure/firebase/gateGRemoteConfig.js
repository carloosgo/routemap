import {
  activate,
  fetchAndActivate,
  getBoolean,
  getNumber,
  getRemoteConfig,
  getString,
  isSupported,
  onConfigUpdate,
} from 'firebase/remote-config';
import {
  failClosedRolloutConfig,
  GATE_G_REMOTE_KEYS,
  normalizeRemoteRolloutConfig,
} from '../../modules/storage-v4/gateGRuntimeConfigModel.js';

const DEFAULT_FETCH_INTERVAL_MS = 5 * 60 * 1000;

function readRemoteValues(remoteConfig) {
  return {
    enabled: getBoolean(remoteConfig, GATE_G_REMOTE_KEYS.enabled),
    killSwitch: getBoolean(remoteConfig, GATE_G_REMOTE_KEYS.killSwitch),
    mode: getString(remoteConfig, GATE_G_REMOTE_KEYS.mode),
    cohortPercent: getNumber(remoteConfig, GATE_G_REMOTE_KEYS.cohortPercent),
    readRulesReady: getBoolean(remoteConfig, GATE_G_REMOTE_KEYS.readRulesReady),
    writeRulesReady: getBoolean(remoteConfig, GATE_G_REMOTE_KEYS.writeRulesReady),
    syncReady: getBoolean(remoteConfig, GATE_G_REMOTE_KEYS.syncReady),
    aggregateReady: getBoolean(remoteConfig, GATE_G_REMOTE_KEYS.aggregateReady),
    touchReady: getBoolean(remoteConfig, GATE_G_REMOTE_KEYS.touchReady),
    lifecycleReady: getBoolean(remoteConfig, GATE_G_REMOTE_KEYS.lifecycleReady),
    purgeReady: getBoolean(remoteConfig, GATE_G_REMOTE_KEYS.purgeReady),
  };
}

function failClosedDefaults() {
  return {
    [GATE_G_REMOTE_KEYS.enabled]: false,
    [GATE_G_REMOTE_KEYS.killSwitch]: true,
    [GATE_G_REMOTE_KEYS.mode]: 'off',
    [GATE_G_REMOTE_KEYS.cohortPercent]: 0,
    [GATE_G_REMOTE_KEYS.readRulesReady]: false,
    [GATE_G_REMOTE_KEYS.writeRulesReady]: false,
    [GATE_G_REMOTE_KEYS.syncReady]: false,
    [GATE_G_REMOTE_KEYS.aggregateReady]: false,
    [GATE_G_REMOTE_KEYS.touchReady]: false,
    [GATE_G_REMOTE_KEYS.lifecycleReady]: false,
    [GATE_G_REMOTE_KEYS.purgeReady]: false,
  };
}

export async function createGateGRemoteConfigController({
  app,
  baseConfig,
  enabled = false,
  minimumFetchIntervalMillis = DEFAULT_FETCH_INTERVAL_MS,
  onChange = null,
} = {}) {
  const fallback = failClosedRolloutConfig(baseConfig);
  if (!enabled || !app || typeof window === 'undefined') {
    return {
      config: fallback,
      stop() {},
      source: 'disabled',
    };
  }

  try {
    const supported = await isSupported();
    if (!supported) {
      return { config: fallback, stop() {}, source: 'unsupported' };
    }

    const remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = minimumFetchIntervalMillis;
    remoteConfig.defaultConfig = failClosedDefaults();

    await fetchAndActivate(remoteConfig);
    let current = normalizeRemoteRolloutConfig({
      base: baseConfig,
      remote: readRemoteValues(remoteConfig),
    });

    const unsubscribe = onConfigUpdate(remoteConfig, {
      next: async () => {
        try {
          await activate(remoteConfig);
          current = normalizeRemoteRolloutConfig({
            base: baseConfig,
            remote: readRemoteValues(remoteConfig),
          });
          if (typeof onChange === 'function') onChange(current);
        } catch {
          current = fallback;
          if (typeof onChange === 'function') onChange(current);
        }
      },
      error: () => {
        current = fallback;
        if (typeof onChange === 'function') onChange(current);
      },
    });

    return {
      config: current,
      stop: typeof unsubscribe === 'function' ? unsubscribe : () => {},
      source: 'remote',
    };
  } catch {
    return {
      config: fallback,
      stop() {},
      source: 'fallback',
    };
  }
}
