"""Pytest verification suite for Cargo Draft Lab physics, validation, and FastAPI."""

from __future__ import annotations

import math

from fastapi.testclient import TestClient
import pytest

from backend import ENGINE_NAME, ENGINE_VERSION
from backend.app import app
from backend.constants import (
    DEFAULT_DT_S,
    DRAG_COEFF_DEFAULT,
    DRAG_COEFF_SMALL_TEST,
    FLUID_PRESETS,
    GRAVITY_PRESETS,
    OUT_OF_SCOPE,
    tank_depth_m,
)
from backend.physics import (
    ShipParams,
    SimState,
    analytical_heave_period_s,
    classify_status,
    compute_forces,
    equilibrium_draft_m,
    max_displacement_kg,
    neutral_ballast_fraction,
    rk4_step,
    simulate_trajectory,
    submerged_volume_m3,
    total_mass_kg,
    validate_params_dict,
)
from backend.validation import measure_heave_period_s, run_self_tests

client = TestClient(app)


# ---------------------------------------------------------------------------
# 1. Core physics unit tests and the five canonical accuracy proofs
# ---------------------------------------------------------------------------


def test_proof1_equilibrium_draft_analytical_and_simulated() -> None:
    """Default hull + 90 containers in seawater settles at d_eq ~= 2.9810 m."""
    params = ShipParams(
        containers=90,
        fluid_density=FLUID_PRESETS["seawater"],
        gravity=GRAVITY_PRESETS["earth"],
        drag_coeff=DRAG_COEFF_DEFAULT,
    )
    assert total_mass_kg(params) == pytest.approx(2_200_000.0, rel=0.0, abs=1e-9)

    d_eq = equilibrium_draft_m(params)
    assert d_eq == pytest.approx(2.98102981, abs=1e-5)

    state = SimState(draft_m=0.0, velocity_mps=0.0, time_s=0.0)
    for _ in range(int(round(900.0 / DEFAULT_DT_S))):
        state = rk4_step(state, DEFAULT_DT_S, params)

    assert abs(state.draft_m - d_eq) < 0.01
    assert classify_status(state.draft_m, params) == "floating"


def test_proof2_oscillation_period_matches_analytical() -> None:
    """Small-drag RK4 heave oscillation period matches analytical 3.464 s."""
    params = ShipParams(
        containers=90,
        fluid_density=FLUID_PRESETS["seawater"],
        gravity=GRAVITY_PRESETS["earth"],
        drag_coeff=DRAG_COEFF_SMALL_TEST,
    )
    t_analytical = analytical_heave_period_s(params)
    assert t_analytical == pytest.approx(3.46418, abs=1e-4)

    t_sim, crossings = measure_heave_period_s(
        params,
        initial_offset_m=0.25,
        duration_s=20.0,
        dt=DEFAULT_DT_S,
    )
    assert crossings >= 4
    assert abs(t_sim - t_analytical) < 0.03


def test_proof3_fresh_to_seawater_draft_ratio() -> None:
    """Draft ratio in fresh water (1000) vs seawater (1025) equals 1.0250."""
    fresh_params = ShipParams(containers=90, fluid_density=FLUID_PRESETS["fresh"])
    sea_params = ShipParams(containers=90, fluid_density=FLUID_PRESETS["seawater"])

    ratio = equilibrium_draft_m(fresh_params) / equilibrium_draft_m(sea_params)
    assert ratio == pytest.approx(1.0250, abs=1e-4)
    # Also verify Plimsoll load line crossing at 3.00 m:
    assert classify_status(equilibrium_draft_m(sea_params), sea_params) == "floating"
    assert classify_status(equilibrium_draft_m(fresh_params), fresh_params) == "overloaded"


def test_proof4_gravity_earth_to_moon_invariance_and_period_scaling() -> None:
    """Earth to Moon keeps equilibrium draft fixed and scales period by sqrt(g_E/g_M)."""
    earth = ShipParams(
        containers=90,
        fluid_density=FLUID_PRESETS["seawater"],
        gravity=GRAVITY_PRESETS["earth"],
        drag_coeff=DRAG_COEFF_SMALL_TEST,
    )
    moon = ShipParams(
        containers=90,
        fluid_density=FLUID_PRESETS["seawater"],
        gravity=GRAVITY_PRESETS["moon"],
        drag_coeff=DRAG_COEFF_SMALL_TEST,
    )

    assert abs(equilibrium_draft_m(earth) - equilibrium_draft_m(moon)) < 1e-9

    t_earth_sim, _ = measure_heave_period_s(earth, initial_offset_m=0.25, duration_s=20.0)
    t_moon_sim, _ = measure_heave_period_s(moon, initial_offset_m=0.25, duration_s=50.0)

    expected_ratio = math.sqrt(GRAVITY_PRESETS["earth"] / GRAVITY_PRESETS["moon"])
    assert t_moon_sim == pytest.approx(8.5232, abs=0.05)
    assert (t_moon_sim / t_earth_sim) == pytest.approx(expected_ratio, abs=0.02)


def test_proof5_sinking_threshold_and_seabed_floor_stop() -> None:
    """M = M_max + 1000 kg sinks past d > H and stops cleanly on seabed with v == 0."""
    params = ShipParams(
        hull_mass_t=453.0,
        containers=125,
        container_mass_t=20.0,
        fluid_density=FLUID_PRESETS["seawater"],
        gravity=GRAVITY_PRESETS["earth"],
        drag_coeff=DRAG_COEFF_DEFAULT,
    )
    m_max = max_displacement_kg(60.0, 12.0, 4.0, 1025.0)
    assert m_max == pytest.approx(2_952_000.0, abs=1e-9)
    assert total_mass_kg(params) == pytest.approx(m_max + 1000.0, abs=1e-9)

    frames = simulate_trajectory(
        SimState(draft_m=0.0, velocity_mps=0.0, time_s=0.0),
        params,
        duration_s=120.0,
        dt=DEFAULT_DT_S,
        sample_every=120,
    )
    final = frames[-1]
    seabed = tank_depth_m(params.height_m)
    assert seabed == 12.0
    assert final["draft_m"] == pytest.approx(seabed, abs=1e-6)
    assert final["velocity_mps"] == 0.0
    assert final["status"] == "sunk"

    # Extra step on the seabed must stay clamped with zero velocity.
    next_state = rk4_step(
        SimState(draft_m=seabed, velocity_mps=0.5, time_s=120.0),
        DEFAULT_DT_S,
        params,
    )
    assert next_state.draft_m == seabed
    assert next_state.velocity_mps == 0.0


def test_ceiling_clamp_at_waterline() -> None:
    """Upward overshoot past d = 0 clamps at 0.0 m with zero velocity."""
    params = ShipParams(containers=0, fluid_density=FLUID_PRESETS["seawater"])
    next_state = rk4_step(
        SimState(draft_m=0.01, velocity_mps=-5.0, time_s=0.0),
        DEFAULT_DT_S,
        params,
    )
    assert next_state.draft_m == 0.0
    assert next_state.velocity_mps == 0.0


def test_submerged_volume_clamping() -> None:
    """Submerged volume clamps below 0 and above H."""
    assert submerged_volume_m3(60.0, 12.0, 4.0, -2.0) == 0.0
    assert submerged_volume_m3(60.0, 12.0, 4.0, 2.0) == pytest.approx(1440.0)
    assert submerged_volume_m3(60.0, 12.0, 4.0, 9.0) == pytest.approx(2880.0)


def test_submarine_neutral_buoyancy_and_status_transitions() -> None:
    """At neutral_ballast_fraction, submerged F_b == W and vessel holds depth."""
    base_sub = ShipParams(mode="submarine", fluid_density=FLUID_PRESETS["seawater"])
    f_neutral = neutral_ballast_fraction(base_sub)
    assert 0.0 < f_neutral < 1.0

    neutral_sub = ShipParams(
        mode="submarine",
        ballast_fraction=f_neutral,
        fluid_density=FLUID_PRESETS["seawater"],
    )
    mid_depth = 7.0
    forces = compute_forces(mid_depth, 0.0, neutral_sub)
    assert forces.buoyancy_n == pytest.approx(forces.weight_n, rel=1e-12, abs=1e-6)
    assert forces.static_net_up_n == pytest.approx(0.0, abs=1e-6)
    assert forces.accel_down_mps2 == pytest.approx(0.0, abs=1e-12)
    assert classify_status(mid_depth, neutral_sub) == "neutral"

    # Holding mid-tank depth over 10 seconds with zero drift.
    state = SimState(draft_m=mid_depth, velocity_mps=0.0, time_s=0.0)
    for _ in range(1200):
        state = rk4_step(state, DEFAULT_DT_S, neutral_sub)
    assert state.draft_m == pytest.approx(mid_depth, abs=1e-9)

    # Surfaced, submerged, and sunk submarine states.
    light_sub = ShipParams(mode="submarine", ballast_fraction=0.2)
    assert classify_status(2.0, light_sub) == "surfaced"
    assert classify_status(6.0, light_sub) == "submerged"

    heavy_sub = ShipParams(mode="submarine", ballast_fraction=1.0)
    assert classify_status(12.0, heavy_sub) == "sunk"


def test_run_self_tests_all_pass() -> None:
    """run_self_tests returns all 5 proofs passing with required schema fields."""
    report = run_self_tests()
    assert report["all_passed"] is True
    assert report["passed_count"] == 5
    assert report["total_count"] == 5
    assert len(report["tests"]) == 5
    for item in report["tests"]:
        for key in ("id", "name", "equation", "expected", "measured", "passed", "detail"):
            assert key in item
        assert item["passed"] is True


# ---------------------------------------------------------------------------
# 2. Parameter validation tests
# ---------------------------------------------------------------------------


def test_validate_params_dict_rejects_invalid_inputs() -> None:
    """Validation rejects non-finite, negative, out-of-bounds, bool, and bad mode."""
    assert validate_params_dict({}) == []
    assert validate_params_dict({"length_m": 60.0, "containers": 90, "mode": "lab"}) == []

    bad_payload = {
        "length_m": -5.0,
        "beam_m": 999.0,
        "height_m": float("nan"),
        "fluid_density": float("inf"),
        "containers": 12.5,
        "gravity": True,
        "mode": "hovercraft",
        "drag_coeff": -0.1,
    }
    errors = validate_params_dict(bad_payload)
    error_fields = {err["field"] for err in errors}
    assert error_fields == {
        "length_m",
        "beam_m",
        "height_m",
        "fluid_density",
        "containers",
        "gravity",
        "mode",
        "drag_coeff",
    }

    assert validate_params_dict("not-a-dict")[0]["field"] == "body"


# ---------------------------------------------------------------------------
# 3. FastAPI endpoint tests via TestClient
# ---------------------------------------------------------------------------


def test_api_health() -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {
        "status": "ok",
        "engine": ENGINE_NAME,
        "version": ENGINE_VERSION,
    }


def test_api_constants() -> None:
    resp = client.get("/api/constants")
    assert resp.status_code == 200
    body = resp.json()
    assert body["gravity_presets"]["earth"]["value"] == 9.80665
    assert body["gravity_presets"]["moon"]["value"] == 1.62
    assert body["gravity_presets"]["mars"]["value"] == 3.71
    assert body["fluid_presets"]["fresh"]["value"] == 1000.0
    assert body["fluid_presets"]["seawater"]["value"] == 1025.0
    assert body["fluid_presets"]["brine"]["value"] == 1200.0
    assert body["drag_coefficients"]["default"]["value"] == 1.05
    assert body["assumed_defaults"]["length_m"] == 60.0
    assert body["out_of_scope"] == OUT_OF_SCOPE


def test_api_validate_success_and_error() -> None:
    ok_resp = client.post(
        "/api/validate",
        json={"containers": 90, "fluid_density": 1025.0, "gravity": 9.80665},
    )
    assert ok_resp.status_code == 200
    ok_data = ok_resp.json()
    assert ok_data["valid"] is True
    assert ok_data["metrics"]["equilibrium_draft_m"] == pytest.approx(2.98103, abs=1e-4)
    assert ok_data["metrics"]["status"] == "floating"

    bad_resp = client.post(
        "/api/validate",
        json={"length_m": -10, "containers": 500, "mode": "invalid"},
    )
    assert bad_resp.status_code == 422
    bad_data = bad_resp.json()
    assert bad_data["valid"] is False
    bad_fields = {e["field"] for e in bad_data["errors"]}
    assert {"length_m", "containers", "mode"}.issubset(bad_fields)


def test_api_simulate_endpoint() -> None:
    resp = client.post(
        "/api/simulate",
        json={
            "containers": 90,
            "fluid_density": 1025.0,
            "gravity": 9.80665,
            "drag_coeff": 0.05,
            "initial_draft_m": 3.23103,
            "duration_s": 5.0,
            "dt": 1.0 / 120.0,
            "sample_every": 10,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert len(data["frames"]) == 61
    assert data["summary"]["final_time_s"] == pytest.approx(5.0, abs=1e-6)
    assert data["summary"]["analytical_heave_period_s"] == pytest.approx(3.46418, abs=1e-4)

    bad_sim = client.post("/api/simulate", json={"duration_s": -2.0, "length_m": 5.0})
    assert bad_sim.status_code == 422
    assert bad_sim.json()["valid"] is False


def test_api_self_test_endpoint() -> None:
    resp = client.get("/api/self-test")
    assert resp.status_code == 200
    data = resp.json()
    assert data["all_passed"] is True
    assert data["passed_count"] == 5
    assert data["total_count"] == 5
    assert len(data["tests"]) == 5
