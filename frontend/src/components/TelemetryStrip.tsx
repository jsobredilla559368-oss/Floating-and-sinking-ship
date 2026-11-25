import type { TelemetrySnapshot } from '../physics/engine';

interface TelemetryStripProps {
  telemetry: TelemetrySnapshot;
  timeS: number;
  isSubmarine: boolean;
}

function cleanZero(value: number, eps = 1e-9): number {
  return Math.abs(value) < eps ? 0 : value;
}

function formatMN(newtons: number): string {
  const mn = cleanZero(newtons / 1e6, 5e-4);
  return `${mn.toFixed(3)} MN`;
}

function formatNewtons(newtons: number): string {
  const rounded = Math.round(cleanZero(newtons, 0.5));
  return `${(rounded === 0 ? 0 : rounded).toLocaleString('en-US')} N`;
}

function formatStatusLabel(status: TelemetrySnapshot['status']): string {
  switch (status) {
    case 'floating':
      return 'Floating';
    case 'overloaded':
      return 'Overloaded';
    case 'sunk':
      return 'Sunk';
    case 'surfaced':
      return 'Surfaced';
    case 'submerged':
      return 'Submerged';
    case 'neutral':
      return 'Neutral trim';
  }
}

export function TelemetryStrip({ telemetry, timeS, isSubmarine }: TelemetryStripProps) {
  const netN = cleanZero(telemetry.staticNetUpN, 0.5);
  const netMnText = netN === 0 ? '+0.000 MN' : `${netN > 0 ? '+' : ''}${formatMN(netN)}`;
  const netNewtonText = netN === 0 ? '0 N' : `${netN > 0 ? '+' : ''}${formatNewtons(netN)}`;
  const cleanFreeboard = cleanZero(telemetry.freeboardM, 5e-4);
  const freeboardLabel = cleanFreeboard >= 0 ? 'Freeboard (H - d)' : 'Submersion above deck';

  return (
    <section className="panel" aria-label="Live telemetry readouts">
      <div className="panel-header">
        <h2 className="panel-title">Live Telemetry</h2>
        <div className="header-actions">
          <span className="panel-meta mono">t = {timeS.toFixed(2)} s</span>
          <span className={`status-plate status-${telemetry.status}`}>
            Status: {formatStatusLabel(telemetry.status)}
          </span>
        </div>
      </div>

      <div className="telemetry-grid">
        <div className="telemetry-cell">
          <span className="telemetry-label">Total Mass M</span>
          <span className="telemetry-value">{telemetry.totalMassT.toFixed(1)} t</span>
          <span className="telemetry-sub">
            {Math.round(telemetry.totalMassKg).toLocaleString('en-US')} kg (max{' '}
            {telemetry.maxDisplacementT.toFixed(0)} t)
          </span>
        </div>

        <div className="telemetry-cell">
          <span className="telemetry-label">Buoyancy F_b (up)</span>
          <span className="telemetry-value is-buoyancy">{formatMN(telemetry.buoyancyN)}</span>
          <span className="telemetry-sub">{formatNewtons(telemetry.buoyancyN)}</span>
        </div>

        <div className="telemetry-cell">
          <span className="telemetry-label">Weight W (down)</span>
          <span className="telemetry-value is-weight">{formatMN(telemetry.weightN)}</span>
          <span className="telemetry-sub">{formatNewtons(telemetry.weightN)}</span>
        </div>

        <div className="telemetry-cell">
          <span className="telemetry-label">Net Static (F_b - W)</span>
          <span className="telemetry-value">{netMnText}</span>
          <span className="telemetry-sub">{netNewtonText}</span>
        </div>

        <div className="telemetry-cell">
          <span className="telemetry-label">Instantaneous Draft d</span>
          <span className="telemetry-value">{telemetry.draftM.toFixed(3)} m</span>
          <span className="telemetry-sub">Seabed at {telemetry.tankDepthM.toFixed(1)} m</span>
        </div>

        <div className="telemetry-cell">
          <span className="telemetry-label">{freeboardLabel}</span>
          <span className="telemetry-value">{cleanFreeboard.toFixed(3)} m</span>
          <span className="telemetry-sub">
            Plimsoll mark: {telemetry.loadLineM.toFixed(2)} m
          </span>
        </div>

        <div className="telemetry-cell">
          <span className="telemetry-label">Equilibrium Draft d_eq</span>
          <span className="telemetry-value">{telemetry.equilibriumDraftM.toFixed(3)} m</span>
          <span className="telemetry-sub">
            {isSubmarine
              ? `Neutral fill: ${(telemetry.neutralBallastFraction * 100).toFixed(2)}%`
              : `Margin to line: ${(telemetry.loadLineM - telemetry.equilibriumDraftM).toFixed(3)} m`}
          </span>
        </div>

        <div className="telemetry-cell">
          <span className="telemetry-label">Theoretical Period T</span>
          <span className="telemetry-value">{telemetry.theoreticalPeriodS.toFixed(3)} s</span>
          <span className="telemetry-sub">Undamped 1-DOF heave</span>
        </div>
      </div>
    </section>
  );
}
