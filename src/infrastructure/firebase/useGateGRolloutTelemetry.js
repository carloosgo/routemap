import { useEffect, useMemo } from 'react';
import { config } from '../../config.js';
import { createGateGRolloutTelemetryEmitter } from './gateGRolloutTelemetryClient.js';

export function useGateGRolloutTelemetry() {
  const enabled = config.storageV4Rollout.telemetryEnabled;
  const emitter = useMemo(
    () => (enabled ? createGateGRolloutTelemetryEmitter() : null),
    [enabled]
  );

  useEffect(() => () => emitter?.stop(), [emitter]);

  return emitter?.emit || null;
}
