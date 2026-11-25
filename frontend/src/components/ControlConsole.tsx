import {
  ASSUMED_DEFAULTS,
  CHALLENGE_TOLERANCE_M,
  DRAG_COEFF_DEFAULT,
  DRAG_COEFF_SMALL_TEST,
  FLUID_PRESETS,
  GRAVITY_PRESETS,
  PARAM_BOUNDS,
  type FluidPresetKey,
  type GravityPresetKey,
} from '../physics/constants';
import type { ShipParams, TelemetrySnapshot, ValidationError } from '../physics/engine';

export interface RawNumericInputs {
  lengthM: string;
  beamM: string;
  heightM: string;
  hullMassT: string;
  fluidDensity: string;
  ballastPercent: string;
}

export interface ChallengeProgress {
  stage1Passed: boolean;
  stage1DraftM: number | null;
  stage2Triggered: boolean;
}

interface ControlConsoleProps {
  params: ShipParams;
  rawInputs: RawNumericInputs;
  errors: ValidationError[];
  telemetry: TelemetrySnapshot;
  fluidPreset: FluidPresetKey;
  gravityPreset: GravityPresetKey;
  isPaused: boolean;
  isInitial: boolean;
  challengeProgress: ChallengeProgress;
  onAddContainers: (delta: number) => void;
  onDropAllCargo: () => void;
  onPerturb: () => void;
  onTogglePause: () => void;
  onReset: () => void;
  onNumericInputChange: (field: keyof RawNumericInputs, rawValue: string) => void;
  onSliderChange: (field: 'lengthM' | 'beamM' | 'heightM' | 'hullMassT' | 'fluidDensity' | 'ballastFraction', value: number) => void;
  onFluidPresetChange: (preset: FluidPresetKey) => void;
  onGravityPresetChange: (preset: GravityPresetKey) => void;
  onDragModeChange: (dragCoeff: number) => void;
  onRestoreValidBounds: () => void;
  onStartChallengeSetup: () => void;
  onSubmarineFlood: () => void;
  onSubmarineBlow: () => void;
  onSubmarineNeutralTrim: () => void;
}

export function ControlConsole({
  params,
  rawInputs,
  errors,
  telemetry,
  fluidPreset,
  gravityPreset,
  isPaused,
  isInitial,
  challengeProgress,
  onAddContainers,
  onDropAllCargo,
  onPerturb,
  onTogglePause,
  onReset,
  onNumericInputChange,
  onSliderChange,
  onFluidPresetChange,
  onGravityPresetChange,
  onDragModeChange,
  onRestoreValidBounds,
  onStartChallengeSetup,
  onSubmarineFlood,
  onSubmarineBlow,
  onSubmarineNeutralTrim,
}: ControlConsoleProps) {
  const isSubmarine = params.mode === 'submarine';
  const isChallenge = params.mode === 'challenge';
  const hasErrors = errors.length > 0;

  const errorFor = (field: keyof ShipParams): string | undefined =>
    errors.find((e) => e.field === field)?.message;

  const loadLine = telemetry.loadLineM;
  const stage1Min = loadLine - CHALLENGE_TOLERANCE_M;
  const marginM = loadLine - telemetry.equilibriumDraftM;
  const isSeawater = Math.abs(params.fluidDensity - FLUID_PRESETS.seawater.value) < 0.5;
  const isFresh = Math.abs(params.fluidDensity - FLUID_PRESETS.fresh.value) < 0.5;
  const inStage1Band =
    isSeawater &&
    telemetry.equilibriumDraftM >= stage1Min &&
    telemetry.equilibriumDraftM <= loadLine &&
    telemetry.status !== 'sunk';

  const percentIncreaseVsStage1 =
    challengeProgress.stage1DraftM && challengeProgress.stage1DraftM > 0
      ? ((telemetry.equilibriumDraftM - challengeProgress.stage1DraftM) /
          challengeProgress.stage1DraftM) *
        100
      : 0;

  return (
    <aside className="console-column" aria-label="Instrument control console">
      {/* Mode-Specific Panel: Load to the Line Challenge */}
      {isChallenge && (
        <section className="panel" aria-label="Load to the Line challenge">
          <div className="panel-header">
            <h2 className="panel-title">Load to the Line Challenge</h2>
            <button
              type="button"
              className="btn btn-compact btn-steel"
              onClick={onStartChallengeSetup}
            >
              Start Challenge Setup
            </button>
          </div>
          <div className="panel-body">
            <div className="challenge-metrics">
              <div className="mini-readout">
                <span className="mini-readout-label">Target Plimsoll (0.75 H)</span>
                <span className="mini-readout-val">{loadLine.toFixed(2)} m</span>
              </div>
              <div className="mini-readout">
                <span className="mini-readout-label">Equilibrium margin</span>
                <span className="mini-readout-val">
                  {marginM >= 0 ? `+${marginM.toFixed(3)} m` : `${marginM.toFixed(3)} m`}
                </span>
              </div>
            </div>

            <div className="challenge-stage-list">
              <div
                className={`challenge-stage ${
                  challengeProgress.stage1Passed || inStage1Band
                    ? 'is-done'
                    : telemetry.equilibriumDraftM > loadLine && isSeawater
                      ? 'is-alert'
                      : ''
                }`}
              >
                <div className="challenge-stage-head">
                  <span>Stage 1: Load in Seawater (1025 kg/m^3)</span>
                  <span className="mono">
                    {challengeProgress.stage1Passed || inStage1Band ? 'PASS' : 'IN PROGRESS'}
                  </span>
                </div>
                <div>
                  Bring d_eq inside [{stage1Min.toFixed(2)} m, {loadLine.toFixed(2)} m] without
                  exceeding the mark or sinking. Current d_eq:{' '}
                  <span className="mono">{telemetry.equilibriumDraftM.toFixed(3)} m</span> (
                  <span className="mono">{params.containers}</span> containers).
                </div>
              </div>

              <div
                className={`challenge-stage ${
                  challengeProgress.stage2Triggered
                    ? 'is-alert'
                    : challengeProgress.stage1Passed
                      ? 'is-done'
                      : ''
                }`}
              >
                <div className="challenge-stage-head">
                  <span>Stage 2: Enter Fresh Water (1000 kg/m^3)</span>
                  <span className="mono">
                    {challengeProgress.stage2Triggered ? 'OBSERVED' : 'PENDING'}
                  </span>
                </div>
                {challengeProgress.stage2Triggered ? (
                  <div>
                    Draft rose to{' '}
                    <span className="mono">{telemetry.equilibriumDraftM.toFixed(3)} m</span> (
                    <span className="mono">+{percentIncreaseVsStage1.toFixed(2)}%</span> deeper,
                    crossing the {loadLine.toFixed(2)} m mark by{' '}
                    <span className="mono">
                      {(telemetry.equilibriumDraftM - loadLine).toFixed(3)} m
                    </span>
                    ). Lower fluid density requires greater submerged volume to balance the same
                    weight, which is why international Plimsoll marks separate Fresh (F) and Summer
                    Seawater (S) lines.
                  </div>
                ) : (
                  <div>
                    After passing Stage 1, switch fluid density to Fresh water (1000 kg/m^3) and
                    observe the hull settle 2.5% deeper across the Plimsoll line.
                    {challengeProgress.stage1Passed && !isFresh && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn btn-compact btn-primary"
                          onClick={() => onFluidPresetChange('fresh')}
                        >
                          Switch to Fresh Water (1000 kg/m^3)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Mode-Specific Panel: Submarine Ballast */}
      {isSubmarine && (
        <section className="panel" aria-label="Submarine ballast controls">
          <div className="panel-header">
            <h2 className="panel-title">Submarine Ballast Tank</h2>
            <span className="panel-meta mono">
              Neutral: {(telemetry.neutralBallastFraction * 100).toFixed(2)}%
            </span>
          </div>
          <div className="panel-body control-group">
            <div className="param-row">
              <div className="param-row-top">
                <label className="param-label" htmlFor="ballast-num">
                  Ballast fill <span className="param-unit">(0 to 100%)</span>
                </label>
                <div className="param-input-wrap">
                  <input
                    id="ballast-num"
                    type="number"
                    className={`num-input ${errorFor('ballastFraction') ? 'is-invalid' : ''}`}
                    value={rawInputs.ballastPercent}
                    step={0.5}
                    onChange={(e) => onNumericInputChange('ballastPercent', e.target.value)}
                    aria-invalid={Boolean(errorFor('ballastFraction'))}
                  />
                  <span className="param-unit mono">%</span>
                </div>
              </div>
              <input
                aria-label="Ballast fill percentage slider"
                type="range"
                className="range-slider"
                min={0}
                max={100}
                step={0.5}
                value={Math.min(100, Math.max(0, params.ballastFraction * 100))}
                onChange={(e) =>
                  onSliderChange('ballastFraction', Number(e.target.value) / 100)
                }
              />
              {errorFor('ballastFraction') && (
                <p className="field-error-text" role="alert">
                  {errorFor('ballastFraction')}
                </p>
              )}
            </div>

            <div className="action-grid">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSubmarineFlood}
                disabled={hasErrors || params.ballastFraction >= 1}
              >
                Flood +5% <span className="kbd">F</span>
              </button>
              <button
                type="button"
                className="btn"
                onClick={onSubmarineBlow}
                disabled={hasErrors || params.ballastFraction <= 0}
              >
                Blow -5% <span className="kbd">B</span>
              </button>
            </div>
            <button
              type="button"
              className="btn btn-steel"
              onClick={onSubmarineNeutralTrim}
              disabled={hasErrors}
            >
              Set Neutral Trim ({(telemetry.neutralBallastFraction * 100).toFixed(2)}%){' '}
              <span className="kbd">N</span>
            </button>
            <p className="field-hint">
              Neutral trim sets M = rho * L * B * H so F_b equals W mid-tank (depth{' '}
              <span className="mono">{telemetry.draftM.toFixed(2)} m</span>, status:{' '}
              <span className="mono">{telemetry.status}</span>).
            </p>
          </div>
        </section>
      )}

      {/* Cargo & Simulation Actions */}
      <section className="panel" aria-label="Simulation actions">
        <div className="panel-header">
          <h2 className="panel-title">
            {isSubmarine ? 'Heave & Transport Controls' : 'Cargo & Simulation Controls'}
          </h2>
          {!isSubmarine && (
            <span className="panel-meta mono">
              {params.containers} x {params.containerMassT} t
            </span>
          )}
        </div>
        <div className="panel-body">
          {!isSubmarine && (
            <div className="action-grid">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onAddContainers(1)}
                disabled={hasErrors || params.containers >= PARAM_BOUNDS.containers.max}
              >
                Add Container +1 <span className="kbd">A</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onAddContainers(10)}
                disabled={hasErrors || params.containers >= PARAM_BOUNDS.containers.max}
              >
                Add +10 <span className="kbd">Shift+A</span>
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => onAddContainers(-1)}
                disabled={hasErrors || params.containers <= 0}
              >
                Drop Cargo -1 <span className="kbd">D</span>
              </button>
              <button
                type="button"
                className="btn btn-accent"
                onClick={onDropAllCargo}
                disabled={hasErrors || params.containers <= 0}
              >
                Drop All <span className="kbd">Shift+D</span>
              </button>
            </div>
          )}

          <div className="action-grid-3">
            <button
              type="button"
              className="btn btn-compact"
              onClick={onPerturb}
              disabled={hasErrors}
              title="Displace hull downward by 0.25 m to observe free heave oscillation"
            >
              Perturb +0.25 m <span className="kbd">P</span>
            </button>
            <button
              type="button"
              className="btn btn-compact btn-steel"
              onClick={onTogglePause}
              disabled={hasErrors}
            >
              {isPaused || isInitial ? 'Resume' : 'Pause'} <span className="kbd">Space</span>
            </button>
            <button type="button" className="btn btn-compact" onClick={onReset}>
              Reset <span className="kbd">R</span>
            </button>
          </div>
        </div>
      </section>

      {/* Hull Geometry & Mass Parameters */}
      <section className="panel" aria-label="Hull geometry parameters">
        <div className="panel-header">
          <h2 className="panel-title">Hull Parameters</h2>
          <span className="panel-meta">Assumed defaults: 60x12x4 m, 400 t</span>
        </div>
        <div className="panel-body control-group">
          {hasErrors && (
            <div className="state-banner state-banner-error" role="alert">
              <div className="banner-text">
                <span className="banner-heading">Invalid parameter value</span>
                <span className="banner-detail">{errors[0].message}</span>
              </div>
              <button
                type="button"
                className="btn btn-compact btn-accent"
                onClick={onRestoreValidBounds}
              >
                Restore valid bounds
              </button>
            </div>
          )}

          <div className="param-row">
            <div className="param-row-top">
              <label className="param-label" htmlFor="input-length">
                Hull Length L <span className="param-unit">(20 to 120 m)</span>
              </label>
              <div className="param-input-wrap">
                <input
                  id="input-length"
                  type="number"
                  className={`num-input ${errorFor('lengthM') ? 'is-invalid' : ''}`}
                  value={rawInputs.lengthM}
                  step={PARAM_BOUNDS.lengthM.step}
                  onChange={(e) => onNumericInputChange('lengthM', e.target.value)}
                  aria-invalid={Boolean(errorFor('lengthM'))}
                />
                <span className="param-unit mono">m</span>
              </div>
            </div>
            <input
              aria-label="Hull length L slider"
              type="range"
              className="range-slider"
              min={PARAM_BOUNDS.lengthM.min}
              max={PARAM_BOUNDS.lengthM.max}
              step={PARAM_BOUNDS.lengthM.step}
              value={Math.min(PARAM_BOUNDS.lengthM.max, Math.max(PARAM_BOUNDS.lengthM.min, params.lengthM))}
              onChange={(e) => onSliderChange('lengthM', Number(e.target.value))}
            />
            {errorFor('lengthM') && (
              <p className="field-error-text" role="alert">
                {errorFor('lengthM')}
              </p>
            )}
          </div>

          <div className="param-row">
            <div className="param-row-top">
              <label className="param-label" htmlFor="input-beam">
                Beam B <span className="param-unit">(4 to 30 m)</span>
              </label>
              <div className="param-input-wrap">
                <input
                  id="input-beam"
                  type="number"
                  className={`num-input ${errorFor('beamM') ? 'is-invalid' : ''}`}
                  value={rawInputs.beamM}
                  step={PARAM_BOUNDS.beamM.step}
                  onChange={(e) => onNumericInputChange('beamM', e.target.value)}
                  aria-invalid={Boolean(errorFor('beamM'))}
                />
                <span className="param-unit mono">m</span>
              </div>
            </div>
            <input
              aria-label="Beam B slider"
              type="range"
              className="range-slider"
              min={PARAM_BOUNDS.beamM.min}
              max={PARAM_BOUNDS.beamM.max}
              step={PARAM_BOUNDS.beamM.step}
              value={Math.min(PARAM_BOUNDS.beamM.max, Math.max(PARAM_BOUNDS.beamM.min, params.beamM))}
              onChange={(e) => onSliderChange('beamM', Number(e.target.value))}
            />
            {errorFor('beamM') && (
              <p className="field-error-text" role="alert">
                {errorFor('beamM')}
              </p>
            )}
          </div>

          <div className="param-row">
            <div className="param-row-top">
              <label className="param-label" htmlFor="input-height">
                Hull Height H <span className="param-unit">(2 to 10 m)</span>
              </label>
              <div className="param-input-wrap">
                <input
                  id="input-height"
                  type="number"
                  className={`num-input ${errorFor('heightM') ? 'is-invalid' : ''}`}
                  value={rawInputs.heightM}
                  step={PARAM_BOUNDS.heightM.step}
                  onChange={(e) => onNumericInputChange('heightM', e.target.value)}
                  aria-invalid={Boolean(errorFor('heightM'))}
                />
                <span className="param-unit mono">m</span>
              </div>
            </div>
            <input
              aria-label="Hull height H slider"
              type="range"
              className="range-slider"
              min={PARAM_BOUNDS.heightM.min}
              max={PARAM_BOUNDS.heightM.max}
              step={PARAM_BOUNDS.heightM.step}
              value={Math.min(PARAM_BOUNDS.heightM.max, Math.max(PARAM_BOUNDS.heightM.min, params.heightM))}
              onChange={(e) => onSliderChange('heightM', Number(e.target.value))}
            />
            {errorFor('heightM') && (
              <p className="field-error-text" role="alert">
                {errorFor('heightM')}
              </p>
            )}
          </div>

          <div className="param-row">
            <div className="param-row-top">
              <label className="param-label" htmlFor="input-hull-mass">
                Hull Mass <span className="param-unit">(100 to 1500 t)</span>
              </label>
              <div className="param-input-wrap">
                <input
                  id="input-hull-mass"
                  type="number"
                  className={`num-input ${errorFor('hullMassT') ? 'is-invalid' : ''}`}
                  value={rawInputs.hullMassT}
                  step={PARAM_BOUNDS.hullMassT.step}
                  onChange={(e) => onNumericInputChange('hullMassT', e.target.value)}
                  aria-invalid={Boolean(errorFor('hullMassT'))}
                />
                <span className="param-unit mono">t</span>
              </div>
            </div>
            <input
              aria-label="Hull mass slider"
              type="range"
              className="range-slider"
              min={PARAM_BOUNDS.hullMassT.min}
              max={PARAM_BOUNDS.hullMassT.max}
              step={PARAM_BOUNDS.hullMassT.step}
              value={Math.min(
                PARAM_BOUNDS.hullMassT.max,
                Math.max(PARAM_BOUNDS.hullMassT.min, params.hullMassT),
              )}
              onChange={(e) => onSliderChange('hullMassT', Number(e.target.value))}
            />
            {errorFor('hullMassT') && (
              <p className="field-error-text" role="alert">
                {errorFor('hullMassT')}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Fluid & Gravity Environment */}
      <section className="panel" aria-label="Fluid and gravity environment">
        <div className="panel-header">
          <h2 className="panel-title">Fluid & Gravity</h2>
          <span className="panel-meta mono">
            rho = {params.fluidDensity.toFixed(0)} | g = {params.gravity}
          </span>
        </div>
        <div className="panel-body control-group">
          <div className="param-row">
            <label className="param-label" htmlFor="fluid-select">
              Fluid density preset
            </label>
            <select
              id="fluid-select"
              className="select-input"
              value={fluidPreset}
              onChange={(e) => onFluidPresetChange(e.target.value as FluidPresetKey)}
            >
              <option value="fresh">
                Fresh water ({FLUID_PRESETS.fresh.value} kg/m^3)
              </option>
              <option value="seawater">
                Seawater ({FLUID_PRESETS.seawater.value} kg/m^3)
              </option>
              <option value="brine">
                Brine ({FLUID_PRESETS.brine.value} kg/m^3)
              </option>
              <option value="custom">Custom density (500 to 2000 kg/m^3)</option>
            </select>
          </div>

          <div className="param-row">
            <div className="param-row-top">
              <label className="param-label" htmlFor="input-density">
                Fluid density rho <span className="param-unit">(500 to 2000 kg/m^3)</span>
              </label>
              <div className="param-input-wrap">
                <input
                  id="input-density"
                  type="number"
                  className={`num-input ${errorFor('fluidDensity') ? 'is-invalid' : ''}`}
                  value={rawInputs.fluidDensity}
                  step={PARAM_BOUNDS.fluidDensity.step}
                  onChange={(e) => onNumericInputChange('fluidDensity', e.target.value)}
                  aria-invalid={Boolean(errorFor('fluidDensity'))}
                />
                <span className="param-unit mono">kg/m^3</span>
              </div>
            </div>
            <input
              aria-label="Custom fluid density slider"
              type="range"
              className="range-slider"
              min={PARAM_BOUNDS.fluidDensity.min}
              max={PARAM_BOUNDS.fluidDensity.max}
              step={PARAM_BOUNDS.fluidDensity.step}
              value={Math.min(
                PARAM_BOUNDS.fluidDensity.max,
                Math.max(PARAM_BOUNDS.fluidDensity.min, params.fluidDensity),
              )}
              onChange={(e) => onSliderChange('fluidDensity', Number(e.target.value))}
            />
            {errorFor('fluidDensity') && (
              <p className="field-error-text" role="alert">
                {errorFor('fluidDensity')}
              </p>
            )}
          </div>

          <div className="param-row">
            <label className="param-label" htmlFor="gravity-select">
              Gravity preset
            </label>
            <select
              id="gravity-select"
              className="select-input"
              value={gravityPreset}
              onChange={(e) => onGravityPresetChange(e.target.value as GravityPresetKey)}
            >
              <option value="earth">
                Earth ({GRAVITY_PRESETS.earth.value} m/s^2, BIPM/NIST)
              </option>
              <option value="moon">
                Moon ({GRAVITY_PRESETS.moon.value} m/s^2, NASA)
              </option>
              <option value="mars">
                Mars ({GRAVITY_PRESETS.mars.value} m/s^2, NASA)
              </option>
            </select>
            <p className="field-hint">
              Changing g leaves static draft d_eq unchanged, while scaling heave period T as
              1 / sqrt(g).
            </p>
          </div>

          <div className="param-row">
            <label className="param-label" htmlFor="drag-select">
              Heave drag damping (C_d)
            </label>
            <select
              id="drag-select"
              className="select-input"
              value={
                Math.abs(params.dragCoeff - DRAG_COEFF_SMALL_TEST) < 0.01 ? 'low' : 'standard'
              }
              onChange={(e) =>
                onDragModeChange(
                  e.target.value === 'low' ? DRAG_COEFF_SMALL_TEST : DRAG_COEFF_DEFAULT,
                )
              }
            >
              <option value="standard">
                Box hull standard (C_d = {ASSUMED_DEFAULTS.dragCoeff}, Hoerner/White)
              </option>
              <option value="low">
                Low-drag period test (C_d = {DRAG_COEFF_SMALL_TEST}, isolates free period T)
              </option>
            </select>
          </div>
        </div>
      </section>
    </aside>
  );
}
