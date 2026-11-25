"""Automated physics accuracy self-test suite for Cargo Draft Lab.

Executes the five canonical physical verification proofs against the RK4
integrator and analytical Archimedes / heave equations:
  1. Equilibrium draft (analytical and simulated settled draft)
  2. Simulated free heave oscillation period vs analytical period
  3. Fresh water vs seawater draft ratio (1025 / 1000 = 1.0250)
  4. Gravity scaling from Earth to Moon (draft invariance, period scaling)
  5. Sinking threshold just above maximum hull displacement
"""

from __future__ import annotations

import math
from typing import Any

from backend.constants import (
    DEFAULT_DT_S,
    DRAG_COEFF_DEFAULT,
    DRAG_COEFF_SMALL_TEST,
    FLUID_PRESETS,
    GRAVITY_PRESETS,
    tank_depth_m,
)
from backend.physics import (
    ShipParams,
    SimState,
    analytical_heave_period_s,
    classify_status,
    equilibrium_draft_m,
    max_displacement_kg,
    rk4_step,
    total_mass_kg,
)


def measure_heave_period_s(
    params: ShipParams,
    initial_offset_m: float = 0.25,
    duration_s: float = 20.0,
    dt: float = DEFAULT_DT_S,
) -> tuple[float, int]:
    """Measure heave period from upward zero-crossings of (draft - d_eq).

    Uses linear interpolation between adjacent RK4 steps to locate each
    crossing with sub-step accuracy. Returns (mean_period_s, crossing_count).
    """
    d_eq = equilibrium_draft_m(params)
    state = SimState(draft_m=d_eq + initial_offset_m, velocity_mps=0.0, time_s=0.0)
    prev_y = state.draft_m - d_eq
    prev_t = state.time_s

    crossings: list[float] = []
    total_steps = int(round(duration_s / dt))

    for _ in range(total_steps):
        state = rk4_step(state, dt, params)
        curr_y = state.draft_m - d_eq
        curr_t = state.time_s
        if prev_y < 0.0 and curr_y >= 0.0:
            frac = -prev_y / (curr_y - prev_y)
            crossings.append(prev_t + frac * (curr_t - prev_t))
        prev_y = curr_y
        prev_t = curr_t

    if len(crossings) < 2:
        raise RuntimeError(
            f"Insufficient upward zero-crossings ({len(crossings)}) to measure period."
        )

    periods = [crossings[i + 1] - crossings[i] for i in range(len(crossings) - 1)]
    mean_period = sum(periods) / len(periods)
    return mean_period, len(crossings)


def run_self_tests() -> dict[str, Any]:
    """Run all five physics verification proofs and return a structured report."""
    tests: list[dict[str, Any]] = []

    # Shared baseline: default box hull (60 x 12 x 4 m, 400 t hull) + 90 x 20 t
    # containers (M = 2.2e6 kg) in nominal seawater (1025 kg/m^3) on Earth.
    base_seawater = ShipParams(
        containers=90,
        fluid_density=FLUID_PRESETS["seawater"],
        gravity=GRAVITY_PRESETS["earth"],
        drag_coeff=DRAG_COEFF_DEFAULT,
    )

    # ------------------------------------------------------------------
    # Proof 1: Equilibrium draft (analytical and simulated settled draft)
    # ------------------------------------------------------------------
    d_eq_ana = equilibrium_draft_m(base_seawater)
    expected_d_eq = 2.981029810298103  # 2,200,000 / (1025 * 60 * 12)
    tol_d_eq = 0.01

    # Drop hull from waterline (d = 0 m) with realistic drag C_d = 1.05 and
    # integrate until quadratic damping settles residual heave below 0.01 m.
    settle_duration_s = 900.0
    state = SimState(draft_m=0.0, velocity_mps=0.0, time_s=0.0)
    settle_steps = int(round(settle_duration_s / DEFAULT_DT_S))
    for _ in range(settle_steps):
        state = rk4_step(state, DEFAULT_DT_S, base_seawater)
    d_sim_settled = state.draft_m

    test1_passed = (
        abs(d_eq_ana - expected_d_eq) <= tol_d_eq
        and abs(d_sim_settled - expected_d_eq) <= tol_d_eq
        and abs(d_sim_settled - d_eq_ana) <= tol_d_eq
    )
    tests.append(
        {
            "id": "equilibrium_draft",
            "name": "Equilibrium Draft (Seawater, 90 Containers)",
            "equation": "d_eq = M / (rho * L * B)",
            "expected": f"{expected_d_eq:.4f} m (tol +/-{tol_d_eq:.2f} m)",
            "measured": f"analytical {d_eq_ana:.4f} m; simulated {d_sim_settled:.4f} m",
            "expected_value": round(expected_d_eq, 6),
            "measured_value": round(d_sim_settled, 6),
            "analytical_value": round(d_eq_ana, 6),
            "unit": "m",
            "tolerance": tol_d_eq,
            "passed": test1_passed,
            "detail": (
                f"M = {total_mass_kg(base_seawater):,.0f} kg, rho = 1025 kg/m^3, "
                f"L*B = 720 m^2. Released from d = 0.00 m with C_d = {DRAG_COEFF_DEFAULT} "
                f"at dt = 1/120 s for {settle_duration_s:.0f} s; final error "
                f"|d_sim - d_eq| = {abs(d_sim_settled - d_eq_ana):.5f} m."
            ),
        }
    )

    # ------------------------------------------------------------------
    # Proof 2: Simulated heave oscillation period vs analytical period
    # ------------------------------------------------------------------
    small_drag_earth = ShipParams(
        containers=90,
        fluid_density=FLUID_PRESETS["seawater"],
        gravity=GRAVITY_PRESETS["earth"],
        drag_coeff=DRAG_COEFF_SMALL_TEST,
    )
    t_earth_ana = analytical_heave_period_s(small_drag_earth)
    t_earth_sim, earth_crossings = measure_heave_period_s(
        small_drag_earth,
        initial_offset_m=0.25,
        duration_s=20.0,
        dt=DEFAULT_DT_S,
    )
    tol_period = 0.03
    test2_passed = abs(t_earth_sim - t_earth_ana) <= tol_period
    tests.append(
        {
            "id": "heave_period",
            "name": "Free Heave Oscillation Period (Small Drag)",
            "equation": "T = 2 * pi * sqrt(M / (rho * g * L * B))",
            "expected": f"{t_earth_ana:.4f} s (tol +/-{tol_period:.2f} s)",
            "measured": f"{t_earth_sim:.4f} s",
            "expected_value": round(t_earth_ana, 6),
            "measured_value": round(t_earth_sim, 6),
            "unit": "s",
            "tolerance": tol_period,
            "passed": test2_passed,
            "detail": (
                f"Initial draft d_eq + 0.25 m, C_d = {DRAG_COEFF_SMALL_TEST}, "
                f"RK4 dt = 1/120 s for 20 s ({earth_crossings} upward zero-crossings). "
                f"Error |T_sim - T_ana| = {abs(t_earth_sim - t_earth_ana):.5f} s."
            ),
        }
    )

    # ------------------------------------------------------------------
    # Proof 3: Draft ratio in fresh water (1000) vs seawater (1025)
    # ------------------------------------------------------------------
    base_fresh = ShipParams(
        containers=90,
        fluid_density=FLUID_PRESETS["fresh"],
        gravity=GRAVITY_PRESETS["earth"],
        drag_coeff=DRAG_COEFF_DEFAULT,
    )
    d_fresh = equilibrium_draft_m(base_fresh)
    d_sea = equilibrium_draft_m(base_seawater)
    measured_ratio = d_fresh / d_sea
    expected_ratio = FLUID_PRESETS["seawater"] / FLUID_PRESETS["fresh"]  # 1.0250
    tol_ratio = 1e-4
    test3_passed = abs(measured_ratio - expected_ratio) <= tol_ratio
    tests.append(
        {
            "id": "fresh_seawater_ratio",
            "name": "Fresh Water vs Seawater Draft Ratio",
            "equation": "d_fresh / d_seawater = rho_seawater / rho_fresh",
            "expected": f"{expected_ratio:.4f} (tol +/-{tol_ratio:.4f})",
            "measured": f"{measured_ratio:.6f}",
            "expected_value": round(expected_ratio, 6),
            "measured_value": round(measured_ratio, 6),
            "unit": "ratio",
            "tolerance": tol_ratio,
            "passed": test3_passed,
            "detail": (
                f"d_fresh = {d_fresh:.4f} m (rho = 1000 kg/m^3), "
                f"d_seawater = {d_sea:.4f} m (rho = 1025 kg/m^3). "
                f"Draft increases by +2.50% entering fresh water."
            ),
        }
    )

    # ------------------------------------------------------------------
    # Proof 4: Gravity Earth (9.80665) to Moon (1.62)
    # ------------------------------------------------------------------
    small_drag_moon = ShipParams(
        containers=90,
        fluid_density=FLUID_PRESETS["seawater"],
        gravity=GRAVITY_PRESETS["moon"],
        drag_coeff=DRAG_COEFF_SMALL_TEST,
    )
    d_eq_moon = equilibrium_draft_m(small_drag_moon)
    draft_diff = abs(d_eq_ana - d_eq_moon)

    t_moon_ana = analytical_heave_period_s(small_drag_moon)
    t_moon_sim, moon_crossings = measure_heave_period_s(
        small_drag_moon,
        initial_offset_m=0.25,
        duration_s=50.0,
        dt=DEFAULT_DT_S,
    )
    expected_period_ratio = math.sqrt(GRAVITY_PRESETS["earth"] / GRAVITY_PRESETS["moon"])
    measured_period_ratio = t_moon_sim / t_earth_sim

    tol_draft_diff = 1e-9
    tol_moon_period = 0.05
    tol_period_ratio = 0.02
    test4_passed = (
        draft_diff < tol_draft_diff
        and abs(t_moon_sim - t_moon_ana) <= tol_moon_period
        and abs(measured_period_ratio - expected_period_ratio) <= tol_period_ratio
    )
    tests.append(
        {
            "id": "gravity_earth_to_moon",
            "name": "Gravity Scaling: Earth (9.80665) to Moon (1.62)",
            "equation": "d_eq independent of g; T_moon / T_earth = sqrt(g_earth / g_moon)",
            "expected": (
                f"draft diff < 1e-9 m; T_moon = {t_moon_ana:.4f} s "
                f"(ratio {expected_period_ratio:.4f})"
            ),
            "measured": (
                f"draft diff = {draft_diff:.2e} m; T_moon = {t_moon_sim:.4f} s "
                f"(ratio {measured_period_ratio:.4f})"
            ),
            "expected_value": round(t_moon_ana, 6),
            "measured_value": round(t_moon_sim, 6),
            "expected_ratio": round(expected_period_ratio, 6),
            "measured_ratio": round(measured_period_ratio, 6),
            "draft_diff_m": draft_diff,
            "unit": "s",
            "tolerance": tol_moon_period,
            "passed": test4_passed,
            "detail": (
                f"d_eq(Earth) = {d_eq_ana:.6f} m vs d_eq(Moon) = {d_eq_moon:.6f} m. "
                f"Simulated T_moon = {t_moon_sim:.4f} s ({moon_crossings} upward crossings "
                f"over 50 s) vs T_earth = {t_earth_sim:.4f} s."
            ),
        }
    )

    # ------------------------------------------------------------------
    # Proof 5: Sinking threshold (M = M_max + 1000 kg -> sinks to seabed)
    # ------------------------------------------------------------------
    # M_max = 1025 * 60 * 12 * 4 = 2,952,000 kg (2952 t).
    # hull_mass_t = 453.0 t + 125 * 20.0 t = 2953.0 t = 2,953,000 kg = M_max + 1000 kg.
    sinking_params = ShipParams(
        hull_mass_t=453.0,
        containers=125,
        container_mass_t=20.0,
        fluid_density=FLUID_PRESETS["seawater"],
        gravity=GRAVITY_PRESETS["earth"],
        drag_coeff=DRAG_COEFF_DEFAULT,
    )
    m_max_kg = max_displacement_kg(
        sinking_params.length_m,
        sinking_params.beam_m,
        sinking_params.height_m,
        sinking_params.fluid_density,
    )
    m_sink_kg = total_mass_kg(sinking_params)
    seabed_m = tank_depth_m(sinking_params.height_m)

    sink_state = SimState(draft_m=0.0, velocity_mps=0.0, time_s=0.0)
    sink_duration_s = 120.0
    sink_steps = int(round(sink_duration_s / DEFAULT_DT_S))
    for _ in range(sink_steps):
        sink_state = rk4_step(sink_state, DEFAULT_DT_S, sinking_params)

    sink_status = classify_status(sink_state.draft_m, sinking_params)
    test5_passed = (
        abs((m_sink_kg - m_max_kg) - 1000.0) < 1e-6
        and sink_state.draft_m > sinking_params.height_m
        and abs(sink_state.draft_m - seabed_m) <= 1e-6
        and sink_state.velocity_mps == 0.0
        and sink_status == "sunk"
    )
    tests.append(
        {
            "id": "sinking_threshold",
            "name": "Sinking Threshold (M = M_max + 1000 kg)",
            "equation": "M > rho * L * B * H => d -> tank_depth_m (sunk)",
            "expected": f"status = sunk; d = {seabed_m:.2f} m (> H = {sinking_params.height_m:.2f} m)",
            "measured": (
                f"status = {sink_status}; d = {sink_state.draft_m:.2f} m "
                f"(v = {sink_state.velocity_mps:.2f} m/s)"
            ),
            "expected_value": round(seabed_m, 6),
            "measured_value": round(sink_state.draft_m, 6),
            "unit": "m",
            "tolerance": 1e-6,
            "passed": test5_passed,
            "detail": (
                f"M_max = {m_max_kg:,.0f} kg, M = {m_sink_kg:,.0f} kg (+1,000 kg overload). "
                f"Integrated {sink_duration_s:.0f} s from d = 0.00 m; vessel sank past "
                f"H = {sinking_params.height_m:.2f} m and came to rest on seabed at "
                f"{sink_state.draft_m:.2f} m."
            ),
        }
    )

    passed_count = sum(1 for t in tests if t["passed"])
    total_count = len(tests)
    return {
        "all_passed": passed_count == total_count,
        "passed_count": passed_count,
        "total_count": total_count,
        "tests": tests,
    }
