import { describe, expect, it } from 'vitest';
import {
  DRAG_COEFF_SMALL_TEST,
  FLUID_PRESETS,
  GRAVITY_PRESETS,
} from './constants';
import {
  analyticalHeavePeriodS,
  classifyStatus,
  computeForces,
  createDefaultParams,
  equilibriumDraftM,
  maxDisplacementKg,
  measureUpwardZeroCrossingPeriod,
  neutralBallastFraction,
  runLocalSelfTests,
  simulateTrajectory,
  tankDepthM,
  totalMassKg,
  validateParams,
} from './engine';

describe('Cargo Draft Lab TypeScript Physics Engine', () => {
  it('Proof 1: computes equilibrium draft ~2.9810 m for 90 containers in seawater and settles under RK4', () => {
    const params = createDefaultParams({
      containers: 90,
      fluidDensity: FLUID_PRESETS.seawater.value,
      gravity: GRAVITY_PRESETS.earth.value,
    });

    expect(totalMassKg(params)).toBe(2_200_000);
    const dEq = equilibriumDraftM(params);
    expect(dEq).toBeCloseTo(2.9810298, 5);

    const trajectory = simulateTrajectory(
      { draftM: 0.0, velocityMps: 0.0, timeS: 0.0 },
      params,
      900.0,
      1 / 120,
      120,
    );
    const settled = trajectory[trajectory.length - 1];
    expect(Math.abs(settled.draftM - dEq)).toBeLessThan(0.01);
    expect(settled.draftM).toBeCloseTo(2.986488, 5);
    expect(classifyStatus(settled.draftM, params)).toBe('floating');
  });

  it('Proof 2: simulated heave period with C_d = 0.05 matches analytical 3.464 s within 0.03 s', () => {
    const params = createDefaultParams({
      containers: 90,
      fluidDensity: FLUID_PRESETS.seawater.value,
      gravity: GRAVITY_PRESETS.earth.value,
      dragCoeff: DRAG_COEFF_SMALL_TEST,
    });

    const dEq = equilibriumDraftM(params);
    const analyticalT = analyticalHeavePeriodS(params);
    expect(analyticalT).toBeCloseTo(3.4642, 3);

    const trajectory = simulateTrajectory(
      { draftM: dEq + 0.25, velocityMps: 0.0, timeS: 0.0 },
      params,
      20.0,
      1 / 120,
      1,
    );
    const measuredT = measureUpwardZeroCrossingPeriod(trajectory, dEq);
    expect(Number.isFinite(measuredT)).toBe(true);
    expect(Math.abs(measuredT - analyticalT)).toBeLessThan(0.03);
  });

  it('Proof 3: fresh water vs seawater draft ratio equals 1.0250 and crosses 3.00 m Plimsoll line', () => {
    const seawaterParams = createDefaultParams({
      containers: 90,
      fluidDensity: FLUID_PRESETS.seawater.value,
    });
    const freshParams = createDefaultParams({
      containers: 90,
      fluidDensity: FLUID_PRESETS.fresh.value,
    });

    const dSea = equilibriumDraftM(seawaterParams);
    const dFresh = equilibriumDraftM(freshParams);

    expect(dFresh / dSea).toBeCloseTo(1.025, 6);
    expect(dSea).toBeLessThanOrEqual(3.0);
    expect(dFresh).toBeGreaterThan(3.0);
    expect(dFresh).toBeCloseTo(3.0556, 4);
    expect(classifyStatus(dFresh, freshParams)).toBe('overloaded');
  });

  it('Proof 4: gravity change Earth -> Moon preserves d_eq and scales heave period by sqrt(g_earth / g_moon)', () => {
    const earthParams = createDefaultParams({
      containers: 90,
      fluidDensity: FLUID_PRESETS.seawater.value,
      gravity: GRAVITY_PRESETS.earth.value,
      dragCoeff: DRAG_COEFF_SMALL_TEST,
    });
    const moonParams = createDefaultParams({
      containers: 90,
      fluidDensity: FLUID_PRESETS.seawater.value,
      gravity: GRAVITY_PRESETS.moon.value,
      dragCoeff: DRAG_COEFF_SMALL_TEST,
    });

    const dEarth = equilibriumDraftM(earthParams);
    const dMoon = equilibriumDraftM(moonParams);
    expect(Math.abs(dMoon - dEarth)).toBeLessThan(1e-9);

    const tEarthAnalytic = analyticalHeavePeriodS(earthParams);
    const tMoonAnalytic = analyticalHeavePeriodS(moonParams);
    expect(tMoonAnalytic / tEarthAnalytic).toBeCloseTo(
      Math.sqrt(GRAVITY_PRESETS.earth.value / GRAVITY_PRESETS.moon.value),
      6,
    );
    expect(tMoonAnalytic).toBeCloseTo(8.523, 2);

    const moonTrajectory = simulateTrajectory(
      { draftM: dMoon + 0.25, velocityMps: 0.0, timeS: 0.0 },
      moonParams,
      35.0,
      1 / 120,
      1,
    );
    const tMoonSim = measureUpwardZeroCrossingPeriod(moonTrajectory, dMoon);
    expect(Math.abs(tMoonSim - tMoonAnalytic)).toBeLessThan(0.08);
  });

  it('Proof 5: mass 1000 kg above max displacement sinks past H and stops cleanly on the seabed', () => {
    const base = createDefaultParams({
      fluidDensity: FLUID_PRESETS.seawater.value,
      gravity: GRAVITY_PRESETS.earth.value,
    });
    const maxDisp = maxDisplacementKg(base.lengthM, base.beamM, base.heightM, base.fluidDensity);
    expect(maxDisp).toBe(2_952_000);

    const sinkParams = createDefaultParams({
      containers: 0,
      hullMassT: maxDisp / 1000 + 1.0,
      fluidDensity: FLUID_PRESETS.seawater.value,
      gravity: GRAVITY_PRESETS.earth.value,
    });

    const trajectory = simulateTrajectory(
      { draftM: sinkParams.heightM - 0.1, velocityMps: 0.0, timeS: 0.0 },
      sinkParams,
      120.0,
      1 / 120,
      10,
    );
    const finalState = trajectory[trajectory.length - 1];
    expect(finalState.draftM).toBeGreaterThan(sinkParams.heightM);
    expect(finalState.draftM).toBeCloseTo(tankDepthM(sinkParams.heightM), 2);
    expect(finalState.velocityMps).toBe(0);
    expect(classifyStatus(finalState.draftM, sinkParams)).toBe('sunk');
  });

  it('passes all 5 proofs in runLocalSelfTests()', () => {
    const report = runLocalSelfTests();
    expect(report.all_passed).toBe(true);
    expect(report.passed_count).toBe(5);
    expect(report.total_count).toBe(5);
  });

  it('achieves exact neutral buoyancy F_b == W in Submarine Ballast mode', () => {
    const subParams = createDefaultParams({
      mode: 'submarine',
      fluidDensity: FLUID_PRESETS.seawater.value,
    });
    const neutralFrac = neutralBallastFraction(subParams);
    const trimmedParams = { ...subParams, ballastFraction: neutralFrac };
    const midTankDraft = (trimmedParams.heightM + tankDepthM(trimmedParams.heightM)) * 0.5;
    const forces = computeForces(midTankDraft, 0.0, trimmedParams);

    expect(Math.abs(forces.buoyancyN - forces.weightN)).toBeLessThan(1e-6);
    expect(Math.abs(forces.accelDownMps2)).toBeLessThan(1e-12);
    expect(classifyStatus(midTankDraft, trimmedParams)).toBe('neutral');
  });

  it('rejects out-of-bounds and non-finite inputs cleanly in validateParams()', () => {
    const bad = createDefaultParams({
      lengthM: -5,
      hullMassT: 9999,
      fluidDensity: Number.NaN,
    });
    const errors = validateParams(bad);
    expect(errors.length).toBe(3);
    expect(errors.map((e) => e.field)).toEqual(['lengthM', 'hullMassT', 'fluidDensity']);
  });
});
