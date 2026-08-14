import { useEffect, useState } from 'react';
import { config } from '../../config.js';
import { failClosedRolloutConfig } from '../../modules/storage-v4/gateGRuntimeConfigModel.js';
import { getFirebaseServices } from './firebaseClient.js';
import { createGateGRemoteConfigController } from './gateGRemoteConfig.js';

function resolvedConfig(value, remoteConfigReady) {
  return { ...value, remoteConfigReady };
}

export function useGateGRolloutConfig() {
  const baseConfig = config.storageV4Rollout;
  const [rolloutConfig, setRolloutConfig] = useState(() => (
    baseConfig.remoteConfigEnabled
      ? resolvedConfig(failClosedRolloutConfig(baseConfig), false)
      : resolvedConfig(baseConfig, true)
  ));

  useEffect(() => {
    if (!baseConfig.remoteConfigEnabled) {
      setRolloutConfig(resolvedConfig(baseConfig, true));
      return undefined;
    }

    let mounted = true;
    let stop = () => {};
    const fallback = resolvedConfig(failClosedRolloutConfig(baseConfig), false);
    setRolloutConfig(fallback);

    try {
      const { app } = getFirebaseServices();
      createGateGRemoteConfigController({
        app,
        baseConfig,
        enabled: true,
        onChange: (next) => {
          if (mounted) setRolloutConfig(next);
        },
      }).then((controller) => {
        if (!mounted) {
          controller.stop();
          return;
        }
        stop = controller.stop;
        setRolloutConfig(controller.config);
      }).catch(() => {
        if (mounted) setRolloutConfig(fallback);
      });
    } catch {
      setRolloutConfig(fallback);
    }

    return () => {
      mounted = false;
      stop();
    };
  }, [baseConfig]);

  return rolloutConfig;
}
