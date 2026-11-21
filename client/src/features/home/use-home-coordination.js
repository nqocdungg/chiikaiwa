import { useEffect, useState } from 'react';
import { api } from '../../services/api-client.js';

const VALID_COORDINATION_MODES = [
  'idle',
  'searching',
  'proposed',
  'inviting',
  'requestingInvite',
  'inSession',
];

/** @param {boolean} enabled */
export function useHomeCoordination(enabled) {
  const [coordination, setCoordination] = useState(
    /** @type {{ mode: string, resourceId?: string } | null} */ (null),
  );
  const [coordinationLoading, setCoordinationLoading] = useState(true);
  const [coordinationError, setCoordinationError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [wasEnabled, setWasEnabled] = useState(enabled);

  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    setCoordination(null);
    setCoordinationLoading(true);
    setCoordinationError(false);
  }

  const handleRetryCoordination = () => {
    setCoordinationLoading(true);
    setCoordinationError(false);
    setRetryKey((k) => k + 1);
  };

  useEffect(() => {
    if (!enabled) return;
    let isMounted = true;

    api
      .get('/me/coordination')
      .then((res) => {
        if (!isMounted) return;
        const data = /** @type {{ mode?: string, resourceId?: string }} */ (
          res.data
        );
        const mode = data?.mode;
        const resourceId =
          typeof data?.resourceId === 'string' ? data.resourceId.trim() : '';
        const isValidMode = Boolean(
          mode && VALID_COORDINATION_MODES.includes(mode),
        );
        const isValidSession = mode !== 'inSession' || Boolean(resourceId);

        if (isValidMode && isValidSession && mode) {
          setCoordination({
            mode,
            resourceId,
          });
        } else {
          setCoordinationError(true);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setCoordinationError(true);
      })
      .finally(() => {
        if (isMounted) {
          setCoordinationLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [enabled, retryKey]);

  const isBusy = Boolean(coordination && coordination.mode !== 'idle');
  const isStartDisabled = coordinationLoading || coordinationError || isBusy;

  return {
    coordination,
    coordinationLoading,
    coordinationError,
    handleRetryCoordination,
    isStartDisabled,
  };
}
