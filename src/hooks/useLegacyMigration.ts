import { useCallback, useEffect, useRef, useState } from 'react';
import { migrateLegacyDreams, type MigrationResult } from '../services/legacyImport';

/**
 * Runs the one-time import of the old dreams into notes once on mount (the service is
 * single-flight and idempotent). `settled` turns true when a run finishes with any status;
 * `result` holds that status. It never throws. `onImported` is called when a run imported at least
 * one note, so the caller can refresh its list. `retry` runs the import again. Nothing updates
 * after unmount, and an older run never overwrites the result of a newer one.
 */
export function useLegacyMigration(onImported?: () => void) {
  const [settled, setSettled] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const mounted = useRef(true);
  const runId = useRef(0);
  const onImportedRef = useRef(onImported);

  useEffect(() => {
    onImportedRef.current = onImported;
  }, [onImported]);

  const run = useCallback(() => {
    const id = ++runId.current;
    let promise: Promise<MigrationResult>;
    try {
      promise = migrateLegacyDreams();
    } catch {
      promise = Promise.resolve<MigrationResult>({ status: 'failed' });
    }
    promise
      .catch((): MigrationResult => ({ status: 'failed' }))
      .then((outcome) => {
        if (!mounted.current || id !== runId.current) return;
        setResult(outcome);
        setSettled(true);
        if (outcome.status === 'imported' && outcome.added > 0) {
          try {
            onImportedRef.current?.();
          } catch {
            // A failing callback must not break the hook.
          }
        }
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    run();
    return () => {
      mounted.current = false;
    };
  }, [run]);

  const retry = useCallback(() => {
    setSettled(false);
    setResult(null);
    run();
  }, [run]);

  return { settled, result, retry };
}
