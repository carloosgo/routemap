import { useEffect, useState } from 'react';
import { config } from '../../config.js';
import { failClosedRolloutConfig } from '../../modules/storage-v4/gateGRuntimeConfigModel.js';
import { getFirebaseServices } from './firebaseClient.js';
import { createGateGRemoteConfigController } from './gateGRemoteConfig.js';

export function useGateGRolloutConfig() {
  const baseConfig = config.storageV4Rollout;
  const [rolloutConfig, setRolloutConfig] = useState(() => (
    baseConfig.remoteConfigEnabled
      ? failClosedRolloutConfig(baseConfig)
      : baseConfig
  ));

  useEffect(() => {
    if (!baseConfig.remoteConfigEnabled) {
      setRolloutConfig(baseConfig);
      return undefined;
    }

    let mounted = true;
    let stop = () => {};
    const fallback = failClosedRolloutConfig(baseConfig);
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
