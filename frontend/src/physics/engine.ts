/**
 * Pure TypeScript 1-DOF hydrostatic and heave dynamics engine.
 *
 * Mirrors backend/physics.py and backend/validation.py with zero DOM or Canvas
 * dependencies. Coordinate convention: draft d >= 0 is measured downward from
 * the undisturbed water surface (waterline at d = 0).
 */

import {
  ASSUMED_DEFAULTS,
  DRAG_COEFF_DEFAULT,
  DRAG_COEFF_SMALL_TEST,
  FLUID_PRESETS,
  GRAVITY_PRESETS,
  PARAM_BOUNDS,
  type SimulationMode,
} from './constants';

export interface ShipParams {
  lengthM: number;
  beamM: number;
  heightM: number;
  hullMassT: number;
  containerMassT: number;
  containers: number;
  fluidDensity: number;
  gravity: number;
  dragCoeff: number;
  mode: SimulationMode;
  ballastFraction: number;
}

export interface SimState {
  draftM: number;
  velocityMps: number;
  timeS: number;
}

export type VesselStatus =
  | 'floating'
  | 'overloaded'
  | 'sunk'
  | 'surfaced'
  | 'submerged'
  | 'neutral';

export interface ForcesResult {
  totalMassKg: number;
  maxDisplacementKg: number;
  submergedVolumeM3: number;
  buoyancyN: number;
  weightN: number;
  dragN: number;
  accelDownMps2: number;
  staticNetUpN: number;
}

export interface ValidationError {
  field: keyof ShipParams;
  message: string;
}

export interface TelemetrySnapshot {
  totalMassKg: number;
  totalMassT: number;
  maxDisplacementKg: number;
  maxDisplacementT: number;
  buoyancyN: number;
  weightN: number;
  staticNetUpN: number;
  dragN: number;
  draftM: number;
  freeboardM: number;
  equilibriumDraftM: number;
  loadLineM: number;
  tankDepthM: number;
  theoreticalPeriodS: number;
  neutralBallastFraction: number;
  status: VesselStatus;
}

export interface SelfTestItem {
  id: string;
  name: string;
  equation: string;
  expected: string;
  measured: string;
  expectedNumeric: number;
  measuredNumeric: number;
  passed: boolean;
  detail: string;
}

export interface SelfTestReport {
  all_passed: boolean;
  passed_count: number;
  total_count: number;
  tests: SelfTestItem[];
}

export function createDefaultParams(overrides?: Partial<ShipParams>): ShipParams {
  return {
    lengthM: ASSUMED_DEFAULTS.lengthM,
    beamM: ASSUMED_DEFAULTS.beamM,
    heightM: ASSUMED_DEFAULTS.heightM,
    hullMassT: ASSUMED_DEFAULTS.hullMassT,
    containerMassT: ASSUMED_DEFAULTS.containerMassT,
    containers: ASSUMED_DEFAULTS.containers,
    fluidDensity: ASSUMED_DEFAULTS.fluidDensity,
    gravity: ASSUMED_DEFAULTS.gravity,
    dragCoeff: ASSUMED_DEFAULTS.dragCoeff,
    mode: 'lab',
    ballastFraction: ASSUMED_DEFAULTS.ballastFraction,
    ...overrides,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function tankDepthM(heightM: number): number {
  return Math.max(12.0, 3.0 * heightM);
}

export function loadLineM(heightM: number): number {
  return ASSUMED_DEFAULTS.loadLineRatio * heightM;
}

export function maxDisplacementKg(
  lengthM: number,
  beamM: number,
  heightM: number,
  fluidDensity: number,
): number {
  return fluidDensity * lengthM * beamM * heightM;
}

export function totalMassKg(params: ShipParams): number {
  const hullMassKg = params.hullMassT * 1000.0;
  if (params.mode === 'submarine') {
    const hullVolumeM3 = params.lengthM * params.beamM * params.heightM;
    return hullMassKg + params.ballastFraction * params.fluidDensity * hullVolumeM3;
  }
  return hullMassKg + params.containers * params.containerMassT * 1000.0;
}

export function submergedVolumeM3(
  lengthM: number,
  beamM: number,
  heightM: number,
  draftM: number,
): number {
  const clampedDraft = clamp(draftM, 0.0, heightM);
  return lengthM * beamM * clampedDraft;
}

export function computeForces(
  draftM: number,
  velocityMps: number,
  params: ShipParams,
): ForcesResult {
  const massKg = totalMassKg(params);
  const maxDispKg = maxDisplacementKg(
    params.lengthM,
    params.beamM,
    params.heightM,
    params.fluidDensity,
  );
  const vSub = submergedVolumeM3(params.lengthM, params.beamM, params.heightM, draftM);
  const buoyancyN = params.fluidDensity * params.gravity * vSub;
  const weightN = massKg * params.gravity;
  const waterplaneAreaM2 = params.lengthM * params.beamM;
  const dragN =
    0.5 *
    params.fluidDensity *
    params.dragCoeff *
    waterplaneAreaM2 *
    velocityMps *
    Math.abs(velocityMps);
  const accelDownMps2 = (weightN - buoyancyN - dragN) / massKg;
  const staticNetUpN = buoyancyN - weightN;

  return {
    totalMassKg: massKg,
    maxDisplacementKg: maxDispKg,
    submergedVolumeM3: vSub,
    buoyancyN,
    weightN,
    dragN,
    accelDownMps2,
    staticNetUpN,
  };
}

export function equilibriumDraftM(params: ShipParams): number {
  return totalMassKg(params) / (params.fluidDensity * params.lengthM * params.beamM);
}

export function analyticalHeavePeriodS(params: ShipParams): number {
  const massKg = totalMassKg(params);
  return (
    2.0 *
    Math.PI *
    Math.sqrt(massKg / (params.fluidDensity * params.gravity * params.lengthM * params.beamM))
  );
}

export function neutralBallastFraction(params: ShipParams): number {
  const hullMassKg = params.hullMassT * 1000.0;
  const maxDisp = maxDisplacementKg(
    params.lengthM,
    params.beamM,
    params.heightM,
    params.fluidDensity,
  );
  if (maxDisp <= 0) {
    return 0;
  }
  return clamp(1.0 - hullMassKg / maxDisp, 0.0, 1.0);
}

export function classifyStatus(draftM: number, params: ShipParams): VesselStatus {
  const massKg = totalMassKg(params);
  const maxDispKg = maxDisplacementKg(
    params.lengthM,
    params.beamM,
    params.heightM,
    params.fluidDensity,
  );
  const depth = tankDepthM(params.heightM);

  if (params.mode === 'submarine') {
    if (Math.abs(massKg - maxDispKg) / maxDispKg < 0.005 && draftM >= params.heightM) {
      return 'neutral';
    }
    if (draftM < params.heightM && massKg < maxDispKg) {
      return 'surfaced';
    }
    if (draftM >= depth - 0.01 && massKg > maxDispKg) {
      return 'sunk';
    }
    return 'submerged';
  }

  const dEq = equilibriumDraftM(params);
  if (massKg > maxDispKg && draftM >= params.heightM) {
    return 'sunk';
  }
  if (massKg > maxDispKg || dEq > loadLineM(params.heightM)) {
    return 'overloaded';
  }
  return 'floating';
}

export function createInitialState(params: ShipParams): SimState {
  const depth = tankDepthM(params.heightM);
  const dEq = equilibriumDraftM(params);
  return {
    draftM: clamp(dEq, 0.0, depth),
    velocityMps: 0.0,
    timeS: 0.0,
  };
}

/**
 * Single 4th-order Runge-Kutta (RK4) integration step for vertical heave.
 * Draft is clamped within [0.0, tankDepthM(H)] with velocity zeroed on contact.
 */
export function rk4Step(state: SimState, dt: number, params: ShipParams): SimState {
  const { draftM: d0, velocityMps: v0, timeS: t0 } = state;

  const k1d = v0;
  const k1v = computeForces(d0, v0, params).accelDownMps2;

  const d2 = d0 + 0.5 * dt * k1d;
  const v2 = v0 + 0.5 * dt * k1v;
  const k2d = v2;
  const k2v = computeForces(d2, v2, params).accelDownMps2;

  const d3 = d0 + 0.5 * dt * k2d;
  const v3 = v0 + 0.5 * dt * k2v;
  const k3d = v3;
  const k3v = computeForces(d3, v3, params).accelDownMps2;

  const d4 = d0 + dt * k3d;
  const v4 = v0 + dt * k3v;
  const k4d = v4;
  const k4v = computeForces(d4, v4, params).accelDownMps2;

  let nextDraft = d0 + (dt / 6.0) * (k1d + 2.0 * k2d + 2.0 * k3d + k4d);
  let nextVel = v0 + (dt / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);

  const depth = tankDepthM(params.heightM);
  if (nextDraft <= 0.0) {
    nextDraft = 0.0;
    if (nextVel < 0.0) {
      nextVel = 0.0;
    }
  } else if (nextDraft >= depth) {
    nextDraft = depth;
    if (nextVel > 0.0) {
      nextVel = 0.0;
    }
  }

  return {
    draftM: nextDraft,
    velocityMps: nextVel,
    timeS: t0 + dt,
  };
}

export function simulateTrajectory(
  initialState: SimState,
  params: ShipParams,
  durationS: number,
  dt: number = ASSUMED_DEFAULTS.dtS,
  sampleEvery: number = 4,
): SimState[] {
  const steps = Math.max(1, Math.round(durationS / dt));
  const samples: SimState[] = [initialState];
  let current = initialState;

  for (let i = 1; i <= steps; i += 1) {
    current = rk4Step(current, dt, params);
    if (i % sampleEvery === 0 || i === steps) {
      samples.push(current);
    }
  }
  return samples;
}

export function buildTelemetry(state: SimState, params: ShipParams): TelemetrySnapshot {
  const forces = computeForces(state.draftM, state.velocityMps, params);
  const dEq = equilibriumDraftM(params);
  const depth = tankDepthM(params.heightM);
  return {
    totalMassKg: forces.totalMassKg,
    totalMassT: forces.totalMassKg / 1000.0,
    maxDisplacementKg: forces.maxDisplacementKg,
    maxDisplacementT: forces.maxDisplacementKg / 1000.0,
    buoyancyN: forces.buoyancyN,
    weightN: forces.weightN,
    staticNetUpN: forces.staticNetUpN,
    dragN: forces.dragN,
    draftM: state.draftM,
    freeboardM: params.heightM - state.draftM,
    equilibriumDraftM: dEq,
    loadLineM: loadLineM(params.heightM),
    tankDepthM: depth,
    theoreticalPeriodS: analyticalHeavePeriodS(params),
    neutralBallastFraction: neutralBallastFraction(params),
    status: classifyStatus(state.draftM, params),
  };
}

export function validateParams(params: ShipParams): ValidationError[] {
  const errors: ValidationError[] = [];
  const numericFields: Array<keyof typeof PARAM_BOUNDS> = [
    'lengthM',
    'beamM',
    'heightM',
    'hullMassT',
    'containerMassT',
    'containers',
    'fluidDensity',
    'gravity',
    'dragCoeff',
    'ballastFraction',
  ];

  for (const field of numericFields) {
    const value = params[field];
    const bound = PARAM_BOUNDS[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push({
        field,
        message: `${bound.label} must be a finite number between ${bound.min} and ${bound.max} ${bound.unit}.`.trim(),
      });
    } else if (value < bound.min || value > bound.max) {
      errors.push({
        field,
        message: `${bound.label} (${value}) is outside valid bounds [${bound.min}, ${bound.max}] ${bound.unit}.`.trim(),
      });
    }
  }

  return errors;
}

export function measureUpwardZeroCrossingPeriod(
  samples: SimState[],
  equilibriumDraft: number,
): number {
  const crossings: number[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1].draftM - equilibriumDraft;
    const curr = samples[i].draftM - equilibriumDraft;
    if (prev <= 0 && curr > 0) {
      const frac = Math.abs(prev) / (curr - prev);
      const tCross = samples[i - 1].timeS + frac * (samples[i].timeS - samples[i - 1].timeS);
      crossings.push(tCross);
    }
  }

  if (crossings.length < 2) {
    return NaN;
  }

  let totalPeriod = 0;
  for (let i = 1; i < crossings.length; i += 1) {
    totalPeriod += crossings[i] - crossings[i - 1];
  }
  return totalPeriod / (crossings.length - 1);
}

/**
 * Local TypeScript mirror of backend/validation.py run_self_tests().
 * Used for Vitest verification, backend parity checks, and offline fallback.
 */
export function runLocalSelfTests(): SelfTestReport {
  const dt = ASSUMED_DEFAULTS.dtS;
  const baseSeawater = createDefaultParams({
    containers: 90,
    fluidDensity: FLUID_PRESETS.seawater.value,
    gravity: GRAVITY_PRESETS.earth.value,
    dragCoeff: DRAG_COEFF_DEFAULT,
    mode: 'lab',
  });

  // Proof 1: Equilibrium draft (90 containers in seawater -> M = 2,200,000 kg -> d_eq = 2.9810 m)
  // Mirrors backend/validation.py: released from d = 0.0 m with C_d = 1.05 for 900 s at dt = 1/120 s.
  const expectedDraft = equilibriumDraftM(baseSeawater);
  const settledSamples = simulateTrajectory(
    { draftM: 0.0, velocityMps: 0.0, timeS: 0.0 },
    baseSeawater,
    900.0,
    dt,
    120,
  );
  const measuredDraft = settledSamples[settledSamples.length - 1].draftM;
  const test1Pass =
    Math.abs(expectedDraft - 2.981) < 0.002 && Math.abs(measuredDraft - expectedDraft) < 0.01;

  // Proof 2: Simulated heave oscillation period vs analytical T = 3.4642 s
  const lowDragParams: ShipParams = { ...baseSeawater, dragCoeff: DRAG_COEFF_SMALL_TEST };
  const expectedPeriodEarth = analyticalHeavePeriodS(lowDragParams);
  const oscSamplesEarth = simulateTrajectory(
    { draftM: expectedDraft + 0.25, velocityMps: 0.0, timeS: 0.0 },
    lowDragParams,
    20.0,
    dt,
    1,
  );
  const measuredPeriodEarth = measureUpwardZeroCrossingPeriod(oscSamplesEarth, expectedDraft);
  const test2Pass =
    Number.isFinite(measuredPeriodEarth) &&
    Math.abs(measuredPeriodEarth - expectedPeriodEarth) < 0.03;

  // Proof 3: Fresh water vs Seawater equilibrium draft ratio = 1025 / 1000 = 1.0250
  const freshParams: ShipParams = {
    ...baseSeawater,
    fluidDensity: FLUID_PRESETS.fresh.value,
  };
  const dEqFresh = equilibriumDraftM(freshParams);
  const measuredRatio = dEqFresh / expectedDraft;
  const expectedRatio = 1025.0 / 1000.0;
  const test3Pass = Math.abs(measuredRatio - expectedRatio) < 1e-4;

  // Proof 4: Gravity Earth -> Moon (d_eq unchanged, period scales by sqrt(g_earth / g_moon))
  const moonParams: ShipParams = {
    ...lowDragParams,
    gravity: GRAVITY_PRESETS.moon.value,
  };
  const dEqMoon = equilibriumDraftM(moonParams);
  const draftDiffMoon = Math.abs(dEqMoon - expectedDraft);
  const expectedPeriodMoon = analyticalHeavePeriodS(moonParams);
  const oscSamplesMoon = simulateTrajectory(
    { draftM: dEqMoon + 0.25, velocityMps: 0.0, timeS: 0.0 },
    moonParams,
    50.0,
    dt,
    1,
  );
  const measuredPeriodMoon = measureUpwardZeroCrossingPeriod(oscSamplesMoon, dEqMoon);
  const test4Pass =
    draftDiffMoon < 1e-9 &&
    Number.isFinite(measuredPeriodMoon) &&
    Math.abs(measuredPeriodMoon - expectedPeriodMoon) < 0.05;

  // Proof 5: Sinking threshold (M = rho*L*B*H + 1000 kg sinks past H to seabed)
  const sinkParams: ShipParams = {
    ...baseSeawater,
    containers: 0,
    hullMassT: maxDisplacementKg(
      baseSeawater.lengthM,
      baseSeawater.beamM,
      baseSeawater.heightM,
      baseSeawater.fluidDensity,
    ) /
      1000.0 +
      1.0,
  };
  const sinkSamples = simulateTrajectory(
    { draftM: 0.0, velocityMps: 0.0, timeS: 0.0 },
    sinkParams,
    120.0,
    dt,
    12,
  );
  const finalSinkState = sinkSamples[sinkSamples.length - 1];
  const sinkStatus = classifyStatus(finalSinkState.draftM, sinkParams);
  const test5Pass = finalSinkState.draftM > sinkParams.heightM && sinkStatus === 'sunk';

  const tests: SelfTestItem[] = [
    {
      id: 'equilibrium_draft',
      name: 'Equilibrium draft (90 containers in seawater)',
      equation: 'd_eq = M / (rho * L * B)',
      expected: `${expectedDraft.toFixed(4)} m`,
      measured: `${measuredDraft.toFixed(4)} m`,
      expectedNumeric: expectedDraft,
      measuredNumeric: measuredDraft,
      passed: test1Pass,
      detail: `M = 2,200,000 kg, rho = 1025 kg/m^3; |settled - analytical| = ${Math.abs(measuredDraft - expectedDraft).toFixed(5)} m (tol 0.01 m).`,
    },
    {
      id: 'heave_period',
      name: 'Free heave oscillation period (small drag)',
      equation: 'T = 2 * pi * sqrt(M / (rho * g * L * B))',
      expected: `${expectedPeriodEarth.toFixed(4)} s`,
      measured: `${measuredPeriodEarth.toFixed(4)} s`,
      expectedNumeric: expectedPeriodEarth,
      measuredNumeric: measuredPeriodEarth,
      passed: test2Pass,
      detail: `Initial +0.25 m perturbation, C_d = 0.05, RK4 dt = 1/120 s; error = ${Math.abs(measuredPeriodEarth - expectedPeriodEarth).toFixed(5)} s (tol 0.03 s).`,
    },
    {
      id: 'fresh_seawater_ratio',
      name: 'Fresh water vs seawater draft ratio',
      equation: 'd_fresh / d_sea = rho_sea / rho_fresh',
      expected: `${expectedRatio.toFixed(4)}`,
      measured: `${measuredRatio.toFixed(6)}`,
      expectedNumeric: expectedRatio,
      measuredNumeric: measuredRatio,
      passed: test3Pass,
      detail: `d_fresh = ${dEqFresh.toFixed(4)} m vs d_sea = ${expectedDraft.toFixed(4)} m (+2.50% deeper in fresh water).`,
    },
    {
      id: 'gravity_earth_to_moon',
      name: 'Gravity invariance of draft and Moon heave period',
      equation: 'd_eq independent of g; T_moon / T_earth = sqrt(g_earth / g_moon)',
      expected: `d_diff < 1e-9 m, T = ${expectedPeriodMoon.toFixed(4)} s`,
      measured: `d_diff = ${draftDiffMoon.toExponential(1)} m, T = ${measuredPeriodMoon.toFixed(4)} s`,
      expectedNumeric: expectedPeriodMoon,
      measuredNumeric: measuredPeriodMoon,
      passed: test4Pass,
      detail: `Period ratio measured ${(measuredPeriodMoon / measuredPeriodEarth).toFixed(4)} vs theoretical ${Math.sqrt(GRAVITY_PRESETS.earth.value / GRAVITY_PRESETS.moon.value).toFixed(4)}.`,
    },
    {
      id: 'sinking_threshold',
      name: 'Sinking threshold above maximum displacement',
      equation: 'M > rho * L * B * H => d > H and status = sunk',
      expected: `d = ${tankDepthM(sinkParams.heightM).toFixed(2)} m, status = sunk`,
      measured: `d = ${finalSinkState.draftM.toFixed(2)} m, status = ${sinkStatus}`,
      expectedNumeric: tankDepthM(sinkParams.heightM),
      measuredNumeric: finalSinkState.draftM,
      passed: test5Pass,
      detail: `M = 2,953,000 kg (max displacement 2,952,000 kg + 1,000 kg) descends to seabed at ${tankDepthM(sinkParams.heightM).toFixed(1)} m.`,
    },
  ];

  const passedCount = tests.filter((t) => t.passed).length;
  return {
    all_passed: passedCount === tests.length,
    passed_count: passedCount,
    total_count: tests.length,
    tests,
  };
}
