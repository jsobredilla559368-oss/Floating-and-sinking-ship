/**
 * Cited physical constants, assumed design defaults, parameter bounds,
 * and explicit physical model boundaries for Cargo Draft Lab.
 *
 * Mirrors backend/constants.py identically so client-side real-time RK4
 * integration and Python server-side verification share exact reference values.
 */

export type GravityPresetKey = 'earth' | 'moon' | 'mars';
export type FluidPresetKey = 'fresh' | 'seawater' | 'brine' | 'custom';
export type SimulationMode = 'lab' | 'challenge' | 'submarine';

export interface CitedConstant<T extends number = number> {
  readonly key: string;
  readonly label: string;
  readonly value: T;
  readonly unit: string;
  readonly source: string;
}

/**
 * Gravitational acceleration presets (m/s^2).
 * Sources:
 * - Earth standard gravity: BIPM / NIST SP 330, 9th SI Brochure (exact definition)
 * - Moon surface gravity: NASA Goddard Moon Fact Sheet
 * - Mars surface gravity: NASA Goddard Mars Fact Sheet
 */
export const GRAVITY_PRESETS: Record<GravityPresetKey, CitedConstant> = {
  earth: {
    key: 'earth',
    label: 'Earth',
    value: 9.80665,
    unit: 'm/s^2',
    source: 'BIPM / NIST SP 330 (9th SI Brochure standard gravity)',
  },
  moon: {
    key: 'moon',
    label: 'Moon',
    value: 1.62,
    unit: 'm/s^2',
    source: 'NASA Goddard Moon Fact Sheet',
  },
  mars: {
    key: 'mars',
    label: 'Mars',
    value: 3.71,
    unit: 'm/s^2',
    source: 'NASA Goddard Mars Fact Sheet',
  },
};

/**
 * Fluid density presets (kg/m^3).
 * Sources:
 * - Fresh water: Pure water at 4 C reference (White, Fluid Mechanics)
 * - Seawater: Standard naval architecture / Archimedes seawater reference (ITTC 2011 nominal)
 * - Brine: Saturated NaCl aqueous solution at 20 C (~26% w/w; CRC Handbook of Chemistry and Physics)
 */
export const FLUID_PRESETS: Record<Exclude<FluidPresetKey, 'custom'>, CitedConstant> = {
  fresh: {
    key: 'fresh',
    label: 'Fresh water',
    value: 1000.0,
    unit: 'kg/m^3',
    source: 'Pure water at 4 C reference (White, Fluid Mechanics)',
  },
  seawater: {
    key: 'seawater',
    label: 'Seawater',
    value: 1025.0,
    unit: 'kg/m^3',
    source: 'Standard naval architecture nominal reference (ITTC 2011)',
  },
  brine: {
    key: 'brine',
    label: 'Brine (saturated NaCl)',
    value: 1200.0,
    unit: 'kg/m^3',
    source: 'Saturated NaCl solution at 20 C (~26% w/w; CRC Handbook)',
  },
};

/**
 * Hydrodynamic drag coefficients for heave motion of a rectangular box hull.
 * Source: Hoerner, Fluid-Dynamic Drag; White, Fluid Mechanics.
 */
export const DRAG_COEFF_DEFAULT = 1.05;
export const DRAG_COEFF_SMALL_TEST = 0.05;

export const DRAG_SOURCES = {
  default: 'Flat rectangular prism / box-hull normal to heave flow (Hoerner, Fluid-Dynamic Drag; White, Fluid Mechanics)',
  smallTest: 'Low-drag verification setting (C_d = 0.05) used to isolate nearly undamped natural heave period',
} as const;

/**
 * ASSUMED DESIGN DEFAULTS (idealized laboratory barge, not a specific commercial ship).
 */
export const ASSUMED_DEFAULTS = {
  lengthM: 60.0,
  beamM: 12.0,
  heightM: 4.0,
  hullMassT: 400.0,
  containerMassT: 20.0,
  containers: 0,
  fluidDensity: FLUID_PRESETS.seawater.value,
  gravity: GRAVITY_PRESETS.earth.value,
  dragCoeff: DRAG_COEFF_DEFAULT,
  loadLineRatio: 0.75,
  ballastFraction: 0.45,
  dtS: 1 / 120,
} as const;

export const CHALLENGE_TARGET_CONTAINERS = 90;
export const CHALLENGE_TOLERANCE_M = 0.05;
export const PERTURB_STEP_M = 0.25;
export const CHART_WINDOW_S = 30.0;

export interface ParamBound {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly label: string;
}

export const PARAM_BOUNDS = {
  lengthM: { min: 20, max: 120, step: 1, unit: 'm', label: 'Hull length L' },
  beamM: { min: 4, max: 30, step: 0.5, unit: 'm', label: 'Beam B' },
  heightM: { min: 2, max: 10, step: 0.5, unit: 'm', label: 'Hull height H' },
  hullMassT: { min: 100, max: 1500, step: 10, unit: 't', label: 'Hull mass' },
  containerMassT: { min: 1, max: 100, step: 1, unit: 't', label: 'Container mass' },
  containers: { min: 0, max: 250, step: 1, unit: 'units', label: 'Containers' },
  fluidDensity: { min: 500, max: 2000, step: 5, unit: 'kg/m^3', label: 'Fluid density' },
  gravity: { min: 0.1, max: 30.0, step: 0.01, unit: 'm/s^2', label: 'Gravity g' },
  dragCoeff: { min: 0.0, max: 5.0, step: 0.05, unit: '', label: 'Drag coefficient C_d' },
  ballastFraction: { min: 0.0, max: 1.0, step: 0.01, unit: 'ratio', label: 'Ballast fill' },
} as const satisfies Record<string, ParamBound>;

export const OUT_OF_SCOPE_LIMITS: readonly string[] = [
  'Rolling and pitching (strictly 1-DOF vertical heave motion only).',
  'Transverse stability and metacentric height (GM) / righting arm (GZ) curves.',
  'Surface gravity waves, wave diffraction, and wave radiation damping.',
  'Hydrodynamic added mass (m_a); inertia uses vessel dry + cargo/ballast mass M only.',
  'Hull bending moments, water ingress after deck flooding, and free-surface tank sloshing.',
];
