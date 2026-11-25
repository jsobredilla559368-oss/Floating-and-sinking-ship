import { AnimatePresence, motion } from 'framer-motion';
import type { BackendSelfTestItem, BackendSelfTestResponse } from '../api/client';
import type { SelfTestReport } from '../physics/engine';

export type SelfTestStatus = 'idle' | 'loading' | 'success' | 'error';

interface SelfTestDrawerProps {
  open: boolean;
  status: SelfTestStatus;
  backendReport: BackendSelfTestResponse | null;
  localReport: SelfTestReport | null;
  errorMessage: string | null;
  onRerun: () => void;
  onClose: () => void;
}

function extractFirstNumber(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const match = value.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatBackendValue(value: string | number): string {
  return typeof value === 'number' ? value.toFixed(4) : String(value);
}

function computeParityNote(
  backendItem: BackendSelfTestItem,
  localItem: SelfTestReport['tests'][number] | undefined,
): { matched: boolean; text: string } {
  if (!localItem) {
    return { matched: false, text: 'No local counterpart' };
  }
  if (backendItem.passed !== localItem.passed) {
    return { matched: false, text: 'Verdict mismatch' };
  }
  const backendNum =
    typeof backendItem.measured_value === 'number' && Number.isFinite(backendItem.measured_value)
      ? backendItem.measured_value
      : extractFirstNumber(backendItem.measured);
  if (backendNum === null) {
    return {
      matched: true,
      text: `TS ${localItem.measured} (verdict match)`,
    };
  }
  const delta = Math.abs(backendNum - localItem.measuredNumeric);
  const tol = Math.max(0.01, Math.abs(localItem.measuredNumeric) * 0.002);
  return {
    matched: delta <= tol,
    text: `TS ${localItem.measuredNumeric.toFixed(4)} (delta ${delta.toExponential(1)})`,
  };
}

export function SelfTestDrawer({
  open,
  status,
  backendReport,
  localReport,
  errorMessage,
  onRerun,
  onClose,
}: SelfTestDrawerProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="selftest-drawer"
          className="selftest-drawer-wrap"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          role="region"
          aria-label="Physics verification self-test drawer"
        >
          <div className="selftest-drawer">
            <div className="selftest-header">
              <div>
                <h2 className="selftest-title">
                  Physics Accuracy Self-Test (GET /api/self-test + TS Parity)
                </h2>
                <p className="selftest-sub">
                  Verifies all 5 hydrostatic and RK4 heave proofs (default hull + 90 containers, M =
                  2,200,000 kg) against the FastAPI Python engine and local TypeScript mirror.
                </p>
              </div>
              <div className="selftest-controls">
                <button
                  type="button"
                  className="btn btn-compact btn-primary"
                  onClick={onRerun}
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? 'Running tests...' : 'Re-run Self-Test'}
                </button>
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={onClose}
                  aria-label="Close self-test drawer"
                >
                  Close <span className="kbd">Esc</span>
                </button>
              </div>
            </div>

            {status === 'loading' && (
              <div className="selftest-status-banner" role="status" aria-live="polite">
                <span>
                  Querying Python backend at <code className="mono">/api/self-test</code> and
                  running TypeScript parity suite...
                </span>
              </div>
            )}

            {status === 'error' && (
              <div className="selftest-status-banner is-error" role="alert" aria-live="assertive">
                <div>
                  <strong>Backend offline or unreachable:</strong> {errorMessage}{' '}
                  Showing local TypeScript fallback proof results below (Python server check not
                  completed).
                </div>
                <button type="button" className="btn btn-compact" onClick={onRerun}>
                  Retry Python API
                </button>
              </div>
            )}

            {status === 'success' && backendReport && (
              <div
                className={`selftest-status-banner ${
                  backendReport.all_passed ? 'is-ok' : 'is-error'
                }`}
                role="status"
                aria-live="polite"
              >
                <div>
                  <strong>Python Backend Verification:</strong> {backendReport.passed_count} /{' '}
                  {backendReport.total_count} proofs passed.
                  {localReport && (
                    <>
                      {' '}
                      Local TypeScript mirror: {localReport.passed_count} /{' '}
                      {localReport.total_count} passed.
                    </>
                  )}
                </div>
                <span
                  className={`verdict-tag ${
                    backendReport.all_passed ? 'verdict-pass' : 'verdict-fail'
                  }`}
                >
                  {backendReport.all_passed ? 'ALL PROOFS PASS' : 'CHECK FAILURES'}
                </span>
              </div>
            )}

            {status === 'success' && backendReport && (
              <div className="selftest-table-scroll">
                <table className="selftest-table">
                  <thead>
                    <tr>
                      <th>Proof</th>
                      <th>Expected</th>
                      <th>Python Measured</th>
                      <th>TS Client Parity</th>
                      <th>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backendReport.tests.map((test, idx) => {
                      const localCounterpart =
                        localReport?.tests.find((lt) => lt.id === test.id) ??
                        localReport?.tests[idx];
                      const parity = computeParityNote(test, localCounterpart);
                      return (
                        <tr key={test.id || idx}>
                          <td>
                            <strong>{test.name}</strong>
                            <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                              {test.equation}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
                              {test.detail}
                            </div>
                          </td>
                          <td className="mono">{formatBackendValue(test.expected)}</td>
                          <td className="mono">{formatBackendValue(test.measured)}</td>
                          <td className="mono">
                            {parity.text}
                            <div
                              style={{
                                fontSize: '0.74rem',
                                color: parity.matched ? 'var(--core1)' : 'var(--accent)',
                              }}
                            >
                              {parity.matched ? 'PARITY OK' : 'CHECK DELTA'}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`verdict-tag ${
                                test.passed ? 'verdict-pass' : 'verdict-fail'
                              }`}
                            >
                              {test.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {status === 'error' && localReport && (
              <div className="selftest-table-scroll">
                <table className="selftest-table">
                  <thead>
                    <tr>
                      <th>Proof (Local TypeScript Fallback)</th>
                      <th>Expected</th>
                      <th>TS Measured</th>
                      <th>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localReport.tests.map((test) => (
                      <tr key={test.id}>
                        <td>
                          <strong>{test.name}</strong>
                          <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                            {test.equation}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
                            {test.detail}
                          </div>
                        </td>
                        <td className="mono">{test.expected}</td>
                        <td className="mono">{test.measured}</td>
                        <td>
                          <span
                            className={`verdict-tag ${
                              test.passed ? 'verdict-pass' : 'verdict-fail'
                            }`}
                          >
                            {test.passed ? 'PASS (TS)' : 'FAIL (TS)'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
