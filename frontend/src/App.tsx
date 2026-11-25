import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  ASSUMED_DEFAULTS,
  CHALLENGE_TOLERANCE_M,
  CHART_WINDOW_S,
  FLUID_PRESETS,
  GRAVITY_PRESETS,
  PARAM_BOUNDS,
  PERTURB_STEP_M,
  type FluidPresetKey,
  type GravityPresetKey,
  type SimulationMode,
} from './physics/constants';
import {
  buildTelemetry,
  clamp,
  createDefaultParams,
  createInitialState,
  loadLineM,
  neutralBallastFraction,
  rk4Step,
  runLocalSelfTests,
  tankDepthM,
  validateParams,
  type SelfTestReport,
  type ShipParams,
  type SimState,
} from './physics/engine';
import {
  fetchBackendHealth,
  fetchBackendSelfTest,
  type BackendSelfTestResponse,
} from './api/client';
import { PlimsollMark } from './components/PlimsollMark';
import { TankCanvas, type ThemeMode } from './components/TankCanvas';
import { StripCharts, type HistorySample } from './components/StripCharts';
import { TelemetryStrip } from './components/TelemetryStrip';
import {
  ControlConsole,
  type ChallengeProgress,
  type RawNumericInputs,
} from './components/ControlConsole';
import {
  SelfTestDrawer,
  type SelfTestStatus,
} from './components/SelfTestDrawer';
import { PhysicsFooter } from './components/PhysicsFooter';

type SimLifecycle = 'initial' | 'running' | 'paused';

const MODE_TABS: ReadonlyArray<{ id: SimulationMode; label: string }> = [
  { id: 'lab', label: 'Lab' },
  { id: 'challenge', label: 'Load to the Line' },
  { id: 'submarine', label: 'Submarine Ballast' },
];

function rawInputsFromParams(p: ShipParams): RawNumericInputs {
  return {
    lengthM: String(p.lengthM),
    beamM: String(p.beamM),
    heightM: String(p.heightM),
    hullMassT: String(p.hullMassT),
    fluidDensity: String(p.fluidDensity),
    ballastPercent: (p.ballastFraction * 100).toFixed(1),
  };
}

function detectFluidPreset(density: number): FluidPresetKey {
  if (Math.abs(density - FLUID_PRESETS.fresh.value) < 0.01) return 'fresh';
  if (Math.abs(density - FLUID_PRESETS.seawater.value) < 0.01) return 'seawater';
  if (Math.abs(density - FLUID_PRESETS.brine.value) < 0.01) return 'brine';
  return 'custom';
}

function detectGravityPreset(g: number): GravityPresetKey {
  if (Math.abs(g - GRAVITY_PRESETS.moon.value) < 0.005) return 'moon';
  if (Math.abs(g - GRAVITY_PRESETS.mars.value) < 0.005) return 'mars';
  return 'earth';
}

function makeInitialHistory(state: SimState, params: ShipParams): HistorySample[] {
  const snap = buildTelemetry(state, params);
  return [
    {
      timeS: state.timeS,
      draftM: state.draftM,
      buoyancyN: snap.buoyancyN,
      weightN: snap.weightN,
    },
  ];
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = window.localStorage.getItem('cargo-draft-lab-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // Storage unavailable
    }
    return 'light';
  });

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const [params, setParams] = useState<ShipParams>(() => createDefaultParams());
  const [rawInputs, setRawInputs] = useState<RawNumericInputs>(() =>
    rawInputsFromParams(createDefaultParams()),
  );
  const [fluidPreset, setFluidPreset] = useState<FluidPresetKey>('seawater');
  const [gravityPreset, setGravityPreset] = useState<GravityPresetKey>('earth');

  const initialSim = useMemo(() => createInitialState(createDefaultParams()), []);
  const [simState, setSimState] = useState<SimState>(initialSim);
  const [lifecycle, setLifecycle] = useState<SimLifecycle>('initial');
  const [history, setHistory] = useState<HistorySample[]>(() =>
    makeInitialHistory(initialSim, createDefaultParams()),
  );
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>(
    'Cargo Draft Lab ready at initial equilibrium.',
  );

  // Challenge progress state
  const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress>({
    stage1Passed: false,
    stage1DraftM: null,
    stage2Triggered: false,
  });

  // Backend health status indicator in header
  const [backendHealth, setBackendHealth] = useState<'checking' | 'ok' | 'offline'>('checking');
  const [backendHealthDetail, setBackendHealthDetail] = useState<string>(
    'Checking Python FastAPI engine at /api/health',
  );

  // Self-test drawer state
  const [selfTestOpen, setSelfTestOpen] = useState<boolean>(false);
  const [selfTestStatus, setSelfTestStatus] = useState<SelfTestStatus>('idle');
  const [backendReport, setBackendReport] = useState<BackendSelfTestResponse | null>(null);
  const [localReport, setLocalReport] = useState<SelfTestReport | null>(null);
  const [selfTestError, setSelfTestError] = useState<string | null>(null);

  // Validation against current params
  const validationErrors = useMemo(() => validateParams(params), [params]);
  const hasInvalidInput = validationErrors.length > 0;

  // Keep a valid safeParams ref so telemetry/canvas never crash with NaN during invalid-input state
  const lastValidParamsRef = useRef<ShipParams>(params);
  if (!hasInvalidInput) {
    lastValidParamsRef.current = params;
  }
  const safeParams = hasInvalidInput ? lastValidParamsRef.current : params;
  const telemetry = useMemo(
    () => buildTelemetry(simState, safeParams),
    [simState, safeParams],
  );

  // Apply theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem('cargo-draft-lab-theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  // Probe Python backend health on mount
  useEffect(() => {
    let active = true;
    void fetchBackendHealth().then((res) => {
      if (!active) return;
      if (res.ok && res.data.status === 'ok') {
        setBackendHealth('ok');
        setBackendHealthDetail(`${res.data.engine} v${res.data.version} connected via /api`);
      } else {
        setBackendHealth('offline');
        setBackendHealthDetail(
          res.ok ? 'Unexpected backend health payload.' : res.error,
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Listen to prefers-reduced-motion media query
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Track Load-to-the-Line two-stage challenge milestones
  useEffect(() => {
    if (safeParams.mode !== 'challenge' || hasInvalidInput) return;
    const targetLL = loadLineM(safeParams.heightM);
    const dEq = telemetry.equilibriumDraftM;
    const isSea = Math.abs(safeParams.fluidDensity - FLUID_PRESETS.seawater.value) < 0.5;
    const isFresh = Math.abs(safeParams.fluidDensity - FLUID_PRESETS.fresh.value) < 0.5;

    setChallengeProgress((prev) => {
      if (
        isSea &&
        dEq >= targetLL - CHALLENGE_TOLERANCE_M &&
        dEq <= targetLL &&
        telemetry.status !== 'sunk'
      ) {
        if (!prev.stage1Passed || Math.abs((prev.stage1DraftM ?? 0) - dEq) > 1e-4) {
          return {
            stage1Passed: true,
            stage1DraftM: dEq,
            stage2Triggered: false,
          };
        }
      }
      if (prev.stage1Passed && isFresh && dEq > targetLL) {
        if (!prev.stage2Triggered) {
          return {
            ...prev,
            stage2Triggered: true,
          };
        }
      }
      return prev;
    });
  }, [safeParams, telemetry.equilibriumDraftM, telemetry.status, hasInvalidInput]);

  // Fixed-step RK4 integrator (dt = 1/120 s) using an accumulator inside requestAnimationFrame
  const simStateRef = useRef<SimState>(simState);
  simStateRef.current = simState;

  const paramsRef = useRef<ShipParams>(safeParams);
  paramsRef.current = safeParams;

  const lastSampleTimeRef = useRef<number>(simState.timeS);

  useEffect(() => {
    if (lifecycle !== 'running' || hasInvalidInput) {
      return;
    }

    const dt = ASSUMED_DEFAULTS.dtS;
    let rafId = 0;
    let lastFrameMs = performance.now();
    let accumulator = 0;

    const frame = (nowMs: number) => {
      const elapsedS = Math.min(0.05, Math.max(0, (nowMs - lastFrameMs) / 1000));
      lastFrameMs = nowMs;
      accumulator += elapsedS;

      let state = simStateRef.current;
      const currentParams = paramsRef.current;
      let stepped = false;

      while (accumulator >= dt) {
        state = rk4Step(state, dt, currentParams);
        accumulator -= dt;
        stepped = true;
      }

      if (stepped) {
        simStateRef.current = state;
        setSimState(state);

        // Record strip-chart sample every ~0.05 s (20 Hz) inside rolling 30 s window
        if (state.timeS - lastSampleTimeRef.current >= 0.05) {
          lastSampleTimeRef.current = state.timeS;
          const snap = buildTelemetry(state, currentParams);
          setHistory((prev) => {
            const cutoff = state.timeS - CHART_WINDOW_S - 0.5;
            const next = prev.filter((pt) => pt.timeS >= cutoff);
            next.push({
              timeS: state.timeS,
              draftM: state.draftM,
              buoyancyN: snap.buoyancyN,
              weightN: snap.weightN,
            });
            return next;
          });
        }
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [lifecycle, hasInvalidInput]);

  // Helper to ensure simulation transitions from initial -> running on interactive physics input
  const wakeSimulation = useCallback(() => {
    setLifecycle((prev) => (prev === 'initial' ? 'running' : prev));
  }, []);

  // Handlers
  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      setLiveAnnouncement(`Switched to ${next} theme.`);
      return next;
    });
  }, []);

  const handleModeChange = useCallback((nextMode: SimulationMode) => {
    const nextParams = createDefaultParams({
      ...lastValidParamsRef.current,
      mode: nextMode,
      containers:
        nextMode === 'challenge'
          ? 0
          : nextMode === 'submarine'
            ? 0
            : lastValidParamsRef.current.containers,
      fluidDensity:
        nextMode === 'challenge'
          ? FLUID_PRESETS.seawater.value
          : lastValidParamsRef.current.fluidDensity,
    });
    const nextState = createInitialState(nextParams);
    setParams(nextParams);
    setRawInputs(rawInputsFromParams(nextParams));
    setFluidPreset(detectFluidPreset(nextParams.fluidDensity));
    setGravityPreset(detectGravityPreset(nextParams.gravity));
    setSimState(nextState);
    simStateRef.current = nextState;
    lastSampleTimeRef.current = nextState.timeS;
    setHistory(makeInitialHistory(nextState, nextParams));
    setLifecycle('initial');
    if (nextMode === 'challenge') {
      setChallengeProgress({ stage1Passed: false, stage1DraftM: null, stage2Triggered: false });
    }
    setLiveAnnouncement(`Switched mode to ${nextMode}.`);
  }, []);

  const handleAddContainers = useCallback(
    (delta: number) => {
      if (hasInvalidInput) return;
      setParams((prev) => {
        if (prev.mode === 'submarine') return prev;
        const nextCount = clamp(
          prev.containers + delta,
          PARAM_BOUNDS.containers.min,
          PARAM_BOUNDS.containers.max,
        );
        setLiveAnnouncement(`Cargo updated to ${nextCount} containers.`);
        return { ...prev, containers: nextCount };
      });
      wakeSimulation();
    },
    [hasInvalidInput, wakeSimulation],
  );

  const handleDropAllCargo = useCallback(() => {
    if (hasInvalidInput) return;
    setParams((prev) => ({ ...prev, containers: 0 }));
    wakeSimulation();
    setLiveAnnouncement('Dropped all cargo containers.');
  }, [hasInvalidInput, wakeSimulation]);

  const handlePerturb = useCallback(() => {
    if (hasInvalidInput) return;
    setSimState((prev) => {
      const depth = tankDepthM(paramsRef.current.heightM);
      const nextDraft = clamp(prev.draftM + PERTURB_STEP_M, 0, depth);
      const next = { ...prev, draftM: nextDraft };
      simStateRef.current = next;
      return next;
    });
    setLifecycle('running');
    setLiveAnnouncement('Perturbed hull downward by 0.25 meters.');
  }, [hasInvalidInput]);

  const handleTogglePause = useCallback(() => {
    if (hasInvalidInput) return;
    setLifecycle((prev) => {
      const next = prev === 'running' ? 'paused' : 'running';
      setLiveAnnouncement(next === 'paused' ? 'Simulation paused.' : 'Simulation running.');
      return next;
    });
  }, [hasInvalidInput]);

  const handleReset = useCallback(() => {
    const resetParams = createDefaultParams({ mode: paramsRef.current.mode });
    const resetState = createInitialState(resetParams);
    setParams(resetParams);
    setRawInputs(rawInputsFromParams(resetParams));
    setFluidPreset('seawater');
    setGravityPreset('earth');
    setSimState(resetState);
    simStateRef.current = resetState;
    lastSampleTimeRef.current = resetState.timeS;
    setHistory(makeInitialHistory(resetState, resetParams));
    setLifecycle('initial');
    setChallengeProgress({ stage1Passed: false, stage1DraftM: null, stage2Triggered: false });
    setLiveAnnouncement('Simulation reset to default equilibrium.');
  }, []);

  const handleStartChallengeSetup = useCallback(() => {
    const setupParams = createDefaultParams({
      mode: 'challenge',
      containers: 0,
      fluidDensity: FLUID_PRESETS.seawater.value,
      gravity: GRAVITY_PRESETS.earth.value,
    });
    const setupState = createInitialState(setupParams);
    setParams(setupParams);
    setRawInputs(rawInputsFromParams(setupParams));
    setFluidPreset('seawater');
    setGravityPreset('earth');
    setSimState(setupState);
    simStateRef.current = setupState;
    lastSampleTimeRef.current = setupState.timeS;
    setHistory(makeInitialHistory(setupState, setupParams));
    setLifecycle('initial');
    setChallengeProgress({ stage1Passed: false, stage1DraftM: null, stage2Triggered: false });
    setLiveAnnouncement('Challenge reset: Seawater, 0 containers, default hull ready.');
  }, []);

  const handleNumericInputChange = useCallback(
    (field: keyof RawNumericInputs, rawValue: string) => {
      setRawInputs((prev) => ({ ...prev, [field]: rawValue }));
      const parsed = rawValue.trim() === '' ? Number.NaN : Number(rawValue);

      if (field === 'ballastPercent') {
        const frac = Number.isFinite(parsed) ? parsed / 100 : Number.NaN;
        setParams((prev) => ({ ...prev, ballastFraction: frac }));
        if (Number.isFinite(frac) && frac >= 0 && frac <= 1) {
          wakeSimulation();
        }
        return;
      }

      if (field === 'fluidDensity') {
        setFluidPreset(Number.isFinite(parsed) ? detectFluidPreset(parsed) : 'custom');
      }

      setParams((prev) => ({ ...prev, [field]: parsed }));
      if (Number.isFinite(parsed)) {
        const bound = PARAM_BOUNDS[field];
        if (parsed >= bound.min && parsed <= bound.max) {
          wakeSimulation();
        }
      }
    },
    [wakeSimulation],
  );

  const handleSliderChange = useCallback(
    (
      field:
        | 'lengthM'
        | 'beamM'
        | 'heightM'
        | 'hullMassT'
        | 'fluidDensity'
        | 'ballastFraction',
      value: number,
    ) => {
      setParams((prev) => ({ ...prev, [field]: value }));
      if (field === 'ballastFraction') {
        setRawInputs((prev) => ({ ...prev, ballastPercent: (value * 100).toFixed(1) }));
      } else {
        setRawInputs((prev) => ({ ...prev, [field]: String(value) }));
      }
      if (field === 'fluidDensity') {
        setFluidPreset(detectFluidPreset(value));
      }
      wakeSimulation();
    },
    [wakeSimulation],
  );

  const handleFluidPresetChange = useCallback(
    (preset: FluidPresetKey) => {
      setFluidPreset(preset);
      if (preset !== 'custom') {
        const value = FLUID_PRESETS[preset].value;
        setParams((prev) => ({ ...prev, fluidDensity: value }));
        setRawInputs((prev) => ({ ...prev, fluidDensity: String(value) }));
        wakeSimulation();
        setLiveAnnouncement(`Fluid changed to ${FLUID_PRESETS[preset].label} (${value} kg/m^3).`);
      }
    },
    [wakeSimulation],
  );

  const handleGravityPresetChange = useCallback(
    (preset: GravityPresetKey) => {
      setGravityPreset(preset);
      const value = GRAVITY_PRESETS[preset].value;
      setParams((prev) => ({ ...prev, gravity: value }));
      wakeSimulation();
      setLiveAnnouncement(`Gravity changed to ${GRAVITY_PRESETS[preset].label} (${value} m/s^2).`);
    },
    [wakeSimulation],
  );

  const handleDragModeChange = useCallback(
    (dragCoeff: number) => {
      setParams((prev) => ({ ...prev, dragCoeff }));
      setLiveAnnouncement(`Drag coefficient set to ${dragCoeff}.`);
    },
    [],
  );

  const handleRestoreValidBounds = useCallback(() => {
    setParams((prev) => {
      const clampOrDefault = (
        val: number,
        bound: { min: number; max: number },
        fallback: number,
      ) => (Number.isFinite(val) ? clamp(val, bound.min, bound.max) : fallback);

      const restored: ShipParams = {
        ...prev,
        lengthM: clampOrDefault(prev.lengthM, PARAM_BOUNDS.lengthM, ASSUMED_DEFAULTS.lengthM),
        beamM: clampOrDefault(prev.beamM, PARAM_BOUNDS.beamM, ASSUMED_DEFAULTS.beamM),
        heightM: clampOrDefault(prev.heightM, PARAM_BOUNDS.heightM, ASSUMED_DEFAULTS.heightM),
        hullMassT: clampOrDefault(
          prev.hullMassT,
          PARAM_BOUNDS.hullMassT,
          ASSUMED_DEFAULTS.hullMassT,
        ),
        fluidDensity: clampOrDefault(
          prev.fluidDensity,
          PARAM_BOUNDS.fluidDensity,
          ASSUMED_DEFAULTS.fluidDensity,
        ),
        ballastFraction: clampOrDefault(
          prev.ballastFraction,
          PARAM_BOUNDS.ballastFraction,
          ASSUMED_DEFAULTS.ballastFraction,
        ),
      };
      setRawInputs(rawInputsFromParams(restored));
      setFluidPreset(detectFluidPreset(restored.fluidDensity));
      return restored;
    });
    setLiveAnnouncement('Restored all parameters within valid physical bounds.');
  }, []);

  // Submarine actions
  const handleSubmarineFlood = useCallback(() => {
    if (hasInvalidInput) return;
    setParams((prev) => {
      const nextFrac = clamp(Number((prev.ballastFraction + 0.05).toFixed(4)), 0, 1);
      setRawInputs((r) => ({ ...r, ballastPercent: (nextFrac * 100).toFixed(1) }));
      setLiveAnnouncement(`Flooded ballast to ${(nextFrac * 100).toFixed(1)}%.`);
      return { ...prev, ballastFraction: nextFrac };
    });
    wakeSimulation();
  }, [hasInvalidInput, wakeSimulation]);

  const handleSubmarineBlow = useCallback(() => {
    if (hasInvalidInput) return;
    setParams((prev) => {
      const nextFrac = clamp(Number((prev.ballastFraction - 0.05).toFixed(4)), 0, 1);
      setRawInputs((r) => ({ ...r, ballastPercent: (nextFrac * 100).toFixed(1) }));
      setLiveAnnouncement(`Blew ballast down to ${(nextFrac * 100).toFixed(1)}%.`);
      return { ...prev, ballastFraction: nextFrac };
    });
    wakeSimulation();
  }, [hasInvalidInput, wakeSimulation]);

  const handleSubmarineNeutralTrim = useCallback(() => {
    if (hasInvalidInput) return;
    const current = paramsRef.current;
    const exactNeutral = neutralBallastFraction(current);
    const depth = tankDepthM(current.heightM);
    const midTank = (current.heightM + depth) * 0.5;

    setParams((prev) => ({ ...prev, ballastFraction: exactNeutral }));
    setRawInputs((r) => ({ ...r, ballastPercent: (exactNeutral * 100).toFixed(2) }));
    setSimState((prev) => {
      const next = { ...prev, draftM: midTank, velocityMps: 0.0 };
      simStateRef.current = next;
      return next;
    });
    setLifecycle('running');
    setLiveAnnouncement(
      `Set exact neutral trim (${(exactNeutral * 100).toFixed(2)}%) mid-tank at ${midTank.toFixed(1)} meters.`,
    );
  }, [hasInvalidInput]);

  // Self-Test API + Local TS Parity Runner
  const handleRunSelfTest = useCallback(async () => {
    setSelfTestOpen(true);
    setSelfTestStatus('loading');
    setSelfTestError(null);
    setLiveAnnouncement('Running physics self-test against Python backend.');

    // Run local TS mirror immediately for parity & fallback
    const local = runLocalSelfTests();
    setLocalReport(local);

    const result = await fetchBackendSelfTest();
    if (result.ok) {
      setBackendReport(result.data);
      setSelfTestStatus('success');
      setBackendHealth('ok');
      setBackendHealthDetail('Python FastAPI self-test endpoint reachable via /api');
      setLiveAnnouncement(
        `Self-test complete: ${result.data.passed_count} of ${result.data.total_count} Python proofs passed.`,
      );
    } else {
      setBackendReport(null);
      setSelfTestError(result.error);
      setSelfTestStatus('error');
      setBackendHealth('offline');
      setBackendHealthDetail(result.error);
      setLiveAnnouncement('Python backend offline. Showing local TypeScript fallback proofs.');
    }
  }, []);

  // Keyboard shortcuts (ignoring keystrokes inside inputs, selects, textareas)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selfTestOpen) {
        setSelfTestOpen(false);
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key;
      if (key === ' ') {
        if (target && target.closest('button, a, [role="tab"], [role="button"], summary')) {
          return;
        }
        event.preventDefault();
        handleTogglePause();
        return;
      }

      const lower = key.toLowerCase();
      if (lower === 'a' && paramsRef.current.mode !== 'submarine') {
        event.preventDefault();
        handleAddContainers(event.shiftKey ? 10 : 1);
      } else if (lower === 'd' && paramsRef.current.mode !== 'submarine') {
        event.preventDefault();
        if (event.shiftKey) handleDropAllCargo();
        else handleAddContainers(-1);
      } else if (lower === 'p') {
        event.preventDefault();
        handlePerturb();
      } else if (lower === 'r') {
        event.preventDefault();
        handleReset();
      } else if (lower === 't') {
        event.preventDefault();
        void handleRunSelfTest();
      } else if (lower === 'm') {
        event.preventDefault();
        handleToggleTheme();
      } else if (lower === 'f' && paramsRef.current.mode === 'submarine') {
        event.preventDefault();
        handleSubmarineFlood();
      } else if (lower === 'b' && paramsRef.current.mode === 'submarine') {
        event.preventDefault();
        handleSubmarineBlow();
      } else if (lower === 'n' && paramsRef.current.mode === 'submarine') {
        event.preventDefault();
        handleSubmarineNeutralTrim();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selfTestOpen,
    handleTogglePause,
    handleAddContainers,
    handleDropAllCargo,
    handlePerturb,
    handleReset,
    handleRunSelfTest,
    handleToggleTheme,
    handleSubmarineFlood,
    handleSubmarineBlow,
    handleSubmarineNeutralTrim,
  ]);

  // Resolve primary simulation banner state (all 5 required states visibly represented)
  const bannerState = hasInvalidInput
    ? 'invalid-input'
    : telemetry.status === 'sunk'
      ? 'sunk'
      : lifecycle === 'paused'
        ? 'paused'
        : lifecycle === 'initial'
          ? 'initial'
          : 'running';

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </div>

        <header className="lab-header">
          <div className="lab-header-inner">
            <div className="brand-lockup">
              <PlimsollMark size={24} />
              <div>
                <h1 className="brand-title">Cargo Draft Lab</h1>
                <span className="brand-sub">1-DOF Hydrostatic & Heave Instrument</span>
              </div>
            </div>

            <nav className="mode-tabs" role="tablist" aria-label="Simulation modes">
              {MODE_TABS.map((tab) => {
                const isSelected = params.mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className="mode-tab"
                    onClick={() => handleModeChange(tab.id)}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="active-mode-indicator"
                        className="mode-tab-indicator"
                        transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                      />
                    )}
                    <span className="mode-tab-label">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="header-actions">
              <span
                className={`api-status-plate ${
                  backendHealth === 'ok'
                    ? 'is-ok'
                    : backendHealth === 'offline'
                      ? 'is-offline'
                      : ''
                }`}
                role="status"
                aria-live="polite"
                title={backendHealthDetail}
              >
                {backendHealth === 'ok'
                  ? 'Python API: OK'
                  : backendHealth === 'offline'
                    ? 'API: Offline'
                    : 'API: Checking'}
              </span>
              <button
                type="button"
                className="btn btn-compact btn-primary"
                onClick={() => void handleRunSelfTest()}
                aria-expanded={selfTestOpen}
              >
                Run Self-Test <span className="kbd">T</span>
              </button>
              <button
                type="button"
                className="btn btn-compact"
                onClick={handleToggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              >
                {theme === 'light' ? 'Dark Mode' : 'Light Mode'} <span className="kbd">M</span>
              </button>
            </div>
          </div>
        </header>

        <SelfTestDrawer
          open={selfTestOpen}
          status={selfTestStatus}
          backendReport={backendReport}
          localReport={localReport}
          errorMessage={selfTestError}
          onRerun={() => void handleRunSelfTest()}
          onClose={() => setSelfTestOpen(false)}
        />

        <div className="workbench">
          <main className="stage-column">
            {/* State Banner (Initial, Paused, Sunk, Invalid-Input) */}
            <AnimatePresence mode="wait">
              {bannerState === 'invalid-input' && (
                <motion.div
                  key="banner-invalid"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="state-banner state-banner-error"
                  role="alert"
                  aria-live="assertive"
                >
                  <div className="banner-text">
                    <span className="banner-heading">
                      Simulation halted: invalid input out of bounds
                    </span>
                    <span className="banner-detail">
                      {validationErrors.map((e) => e.message).join(' ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-compact btn-accent"
                    onClick={handleRestoreValidBounds}
                  >
                    Restore valid bounds
                  </button>
                </motion.div>
              )}

              {bannerState === 'sunk' && (
                <motion.div
                  key="banner-sunk"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="state-banner state-banner-sunk"
                  role="status"
                  aria-live="polite"
                >
                  <div className="banner-text">
                    <span className="banner-heading">
                      Vessel sunk: weight exceeds maximum buoyancy displacement
                    </span>
                    <span className="banner-detail">
                      Total mass ({telemetry.totalMassT.toFixed(1)} t) exceeds maximum hull
                      displacement ({telemetry.maxDisplacementT.toFixed(1)} t). Draft clamped at
                      seabed ({telemetry.tankDepthM.toFixed(1)} m).
                    </span>
                  </div>
                  <div className="header-actions">
                    {safeParams.mode === 'submarine' ? (
                      <button
                        type="button"
                        className="btn btn-compact btn-primary"
                        onClick={handleSubmarineNeutralTrim}
                      >
                        Set Neutral Trim (N)
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-compact btn-accent"
                        onClick={handleDropAllCargo}
                      >
                        Drop All Cargo (Shift+D)
                      </button>
                    )}
                    <button type="button" className="btn btn-compact" onClick={handleReset}>
                      Reset (R)
                    </button>
                  </div>
                </motion.div>
              )}

              {bannerState === 'paused' && (
                <motion.div
                  key="banner-paused"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="state-banner state-banner-paused"
                  role="status"
                >
                  <div className="banner-text">
                    <span className="banner-heading">Simulation paused</span>
                    <span className="banner-detail">
                      RK4 clock frozen at t = {simState.timeS.toFixed(2)} s. Press Space or Resume
                      to continue integration.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-compact btn-steel"
                    onClick={handleTogglePause}
                  >
                    Resume (Space)
                  </button>
                </motion.div>
              )}

              {bannerState === 'initial' && (
                <motion.div
                  key="banner-initial"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="state-banner state-banner-initial"
                  role="status"
                >
                  <div className="banner-text">
                    <span className="banner-heading">
                      Initial equilibrium ready (t = 0.00 s)
                    </span>
                    <span className="banner-detail">
                      {safeParams.mode === 'submarine'
                        ? 'Flood (F), Blow (B), or Set Neutral Trim (N) to start live RK4 heave dynamics.'
                        : 'Add containers (A / Shift+A), Perturb +0.25 m (P), or press Resume (Space) to start live RK4 integration.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-compact btn-primary"
                    onClick={handleTogglePause}
                  >
                    Start Clock (Space)
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Primary Focal Point: Side-View Hydrodynamic Tank */}
            <section className="panel tank-panel" aria-label="Side-view hydrodynamic tank">
              <div className="panel-header">
                <h2 className="panel-title">Hydrodynamic Basin (Side Elevation)</h2>
                <span className="panel-meta mono">
                  RK4 dt = 1/120 s | {bannerState.toUpperCase()}
                </span>
              </div>

              <TankCanvas
                params={safeParams}
                simState={simState}
                telemetry={telemetry}
                theme={theme}
                reducedMotion={reducedMotion}
              />

              <div className="tank-legend-bar">
                <div className="legend-items">
                  <span className="legend-item">
                    <span className="legend-swatch swatch-core1" /> F_b Buoyancy (up)
                  </span>
                  <span className="legend-item">
                    <span className="legend-swatch swatch-accent" /> W Weight (down) & Plimsoll line
                  </span>
                  <span className="legend-item">
                    <span className="legend-swatch swatch-core2" /> Steel hull (scale 1:1 depth)
                  </span>
                </div>
                <span className="mono">
                  v_heave ={' '}
                  {Math.abs(simState.velocityMps) < 5e-4
                    ? '+0.000'
                    : `${simState.velocityMps > 0 ? '+' : ''}${simState.velocityMps.toFixed(3)}`}{' '}
                  m/s
                </span>
              </div>
            </section>

            {/* Live Telemetry Instrument Readout Strip */}
            <TelemetryStrip
              telemetry={telemetry}
              timeS={simState.timeS}
              isSubmarine={safeParams.mode === 'submarine'}
            />

            {/* Dual Rolling 30 s Strip Charts */}
            <StripCharts
              history={history}
              equilibriumDraftM={telemetry.equilibriumDraftM}
              loadLineM={telemetry.loadLineM}
              hullHeightM={safeParams.heightM}
              tankDepthM={telemetry.tankDepthM}
              isSubmarine={safeParams.mode === 'submarine'}
              theme={theme}
            />
          </main>

          <ControlConsole
            params={params}
            rawInputs={rawInputs}
            errors={validationErrors}
            telemetry={telemetry}
            fluidPreset={fluidPreset}
            gravityPreset={gravityPreset}
            isPaused={lifecycle === 'paused'}
            isInitial={lifecycle === 'initial'}
            challengeProgress={challengeProgress}
            onAddContainers={handleAddContainers}
            onDropAllCargo={handleDropAllCargo}
            onPerturb={handlePerturb}
            onTogglePause={handleTogglePause}
            onReset={handleReset}
            onNumericInputChange={handleNumericInputChange}
            onSliderChange={handleSliderChange}
            onFluidPresetChange={handleFluidPresetChange}
            onGravityPresetChange={handleGravityPresetChange}
            onDragModeChange={handleDragModeChange}
            onRestoreValidBounds={handleRestoreValidBounds}
            onStartChallengeSetup={handleStartChallengeSetup}
            onSubmarineFlood={handleSubmarineFlood}
            onSubmarineBlow={handleSubmarineBlow}
            onSubmarineNeutralTrim={handleSubmarineNeutralTrim}
          />
        </div>

        <PhysicsFooter />
      </div>
    </MotionConfig>
  );
}

export default App;
