"""Authoritative 1-DOF vertical heave and Archimedes buoyancy physics engine.

Design principles:
- Pure functions with zero I/O, zero side effects, and zero drawing logic.
- Coordinate convention: draft d >= 0 is measured vertically DOWNWARD from the
  calm water surface (waterline at d = 0 m) to the bottom keel of the box hull.
  Downward velocity v = dd/dt is positive; upward velocity is negative.
- Governing 1-DOF equation of motion for a rectangular box hull (L x B x H):
      M * (d^2 d / dt^2) = W - F_b(d) - F_drag(v)
  where:
      W      = M * g                                (downward weight, N)
      F_b(d) = rho * g * L * B * clamp(d, 0, H)     (upward buoyancy, N)
      F_drag = 0.5 * rho * C_d * (L * B) * v * |v|  (quadratic heave drag, N)
- Time integration uses classical 4th-order Runge-Kutta (RK4) with fixed step
  dt = 1/120 s by default and hard floor/ceiling clamping at [0, tank_depth_m].
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import Any, Mapping, Optional

from backend.constants import (
    ASSUMED_DEFAULTS,
    DEFAULT_DT_S,
    DRAG_COEFF_DEFAULT,
    FLUID_PRESETS,
    GRAVITY_PRESETS,
    PARAM_BOUNDS,
    VALID_MODES,
    tank_depth_m,
)


@dataclass(frozen=True)
class ShipParams:
    """Immutable vessel, cargo, ballast, and environment parameters."""

    length_m: float = float(ASSUMED_DEFAULTS["length_m"])
    beam_m: float = float(ASSUMED_DEFAULTS["beam_m"])
    height_m: float = float(ASSUMED_DEFAULTS["height_m"])
    hull_mass_t: float = float(ASSUMED_DEFAULTS["hull_mass_t"])
    container_mass_t: float = float(ASSUMED_DEFAULTS["container_mass_t"])
    containers: int = int(ASSUMED_DEFAULTS["containers"])
    ballast_fraction: float = float(ASSUMED_DEFAULTS["ballast_fraction"])
    mode: str = str(ASSUMED_DEFAULTS["mode"])
    fluid_density: float = float(FLUID_PRESETS["seawater"])
    gravity: float = float(GRAVITY_PRESETS["earth"])
    drag_coeff: float = DRAG_COEFF_DEFAULT
    load_line_ratio: float = float(ASSUMED_DEFAULTS["load_line_ratio"])

    def to_dict(self) -> dict[str, Any]:
        """Serialize parameters to a plain dictionary."""
        return asdict(self)


@dataclass(frozen=True)
class SimState:
    """Instantaneous 1-DOF heave state at simulation time time_s."""

    draft_m: float
    velocity_mps: float = 0.0
    time_s: float = 0.0

    def to_dict(self) -> dict[str, float]:
        """Serialize state to a plain dictionary."""
        return asdict(self)


@dataclass(frozen=True)
class ForceBreakdown:
    """Forces and downward acceleration acting on the vessel at (draft, velocity)."""

    submerged_volume_m3: float
    buoyancy_n: float
    weight_n: float
    drag_n: float
    static_net_up_n: float
    accel_down_mps2: float

    def to_dict(self) -> dict[str, float]:
        """Serialize force breakdown to a plain dictionary."""
        return asdict(self)


def clamp(value: float, low: float, high: float) -> float:
    """Clamp value into the closed interval [low, high]."""
    if value < low:
        return low
    if value > high:
        return high
    return value


def total_mass_kg(params: ShipParams) -> float:
    """Return total vessel mass M in kilograms.

    - In submarine mode, internal ballast tanks hold a fraction of the hull
      internal volume filled with ambient fluid:
          M = m_hull_kg + ballast_fraction * rho * (L * B * H)
    - In lab and challenge modes, mass is empty steel hull plus deck cargo:
          M = m_hull_kg + containers * container_mass_kg
    """
    hull_mass_kg = params.hull_mass_t * 1000.0
    if params.mode == "submarine":
        hull_volume_m3 = params.length_m * params.beam_m * params.height_m
        ballast_mass_kg = params.ballast_fraction * params.fluid_density * hull_volume_m3
        return hull_mass_kg + ballast_mass_kg
    container_mass_kg = params.container_mass_t * 1000.0
    return hull_mass_kg + params.containers * container_mass_kg


def max_displacement_kg(
    length_m: float,
    beam_m: float,
    height_m: float,
    fluid_density: float,
) -> float:
    """Return maximum displaced fluid mass M_max = rho * L * B * H in kg.

    When total mass M exceeds M_max, even complete submergence (draft >= H)
    cannot generate enough upward buoyancy to balance weight.
    """
    return fluid_density * length_m * beam_m * height_m


def submerged_volume_m3(
    length_m: float,
    beam_m: float,
    height_m: float,
    draft_m: float,
) -> float:
    """Return displaced fluid volume V_sub = L * B * clamp(draft, 0, H) in m^3.

    Clamping at 0 represents the hull lifted completely above the water surface;
    clamping at H represents full submergence of the enclosed rectangular hull.
    """
    effective_draft = min(max(draft_m, 0.0), height_m)
    return length_m * beam_m * effective_draft


def compute_forces(
    draft_m: float,
    velocity_mps: float,
    params: ShipParams,
) -> ForceBreakdown:
    """Compute upward buoyancy, downward weight, quadratic drag, and acceleration.

    Sign conventions:
    - buoyancy_n (F_b) is positive upward: F_b = rho * g * V_sub
    - weight_n (W) is positive downward: W = M * g
    - drag_n (F_drag) opposes downward velocity v:
          F_drag = 0.5 * rho * C_d * (L * B) * v * |v|
    - accel_down_mps2 = (W - F_b - F_drag) / M  (positive downward)
    - static_net_up_n = F_b - W                 (positive upward)
    """
    waterplane_area = params.length_m * params.beam_m
    v_sub = submerged_volume_m3(
        params.length_m,
        params.beam_m,
        params.height_m,
        draft_m,
    )
    f_buoyancy = params.fluid_density * params.gravity * v_sub
    mass_kg = total_mass_kg(params)
    weight = mass_kg * params.gravity
    f_drag = (
        0.5
        * params.fluid_density
        * params.drag_coeff
        * waterplane_area
        * velocity_mps
        * abs(velocity_mps)
    )
    accel_down = (weight - f_buoyancy - f_drag) / mass_kg
    static_net_up = f_buoyancy - weight

    return ForceBreakdown(
        submerged_volume_m3=v_sub,
        buoyancy_n=f_buoyancy,
        weight_n=weight,
        drag_n=f_drag,
        static_net_up_n=static_net_up,
        accel_down_mps2=accel_down,
    )


def equilibrium_draft_m(params: ShipParams) -> float:
    """Return static Archimedes equilibrium draft d_eq = M / (rho * L * B) in m.

    Note that gravity g cancels identically between W = M * g and
    F_b = rho * g * L * B * d_eq. If d_eq > height_m, no floating equilibrium
    exists and the vessel sinks.
    """
    mass_kg = total_mass_kg(params)
    return mass_kg / (params.fluid_density * params.length_m * params.beam_m)


def analytical_heave_period_s(params: ShipParams) -> float:
    """Return undamped linear heave period T = 2*pi*sqrt(M / (rho*g*L*B)) in s.

    Derived from the restoring stiffness k = rho * g * L * B for small vertical
    displacements around d_eq when 0 < d < H (without hydrodynamic added mass).
    """
    mass_kg = total_mass_kg(params)
    stiffness = params.fluid_density * params.gravity * params.length_m * params.beam_m
    return 2.0 * math.pi * math.sqrt(mass_kg / stiffness)


def neutral_ballast_fraction(params: ShipParams) -> float:
    """Return ballast tank fill fraction in [0, 1] giving F_b == W when submerged.

    Setting M = m_hull_kg + f * M_max = M_max yields:
        f_neutral = clamp(1.0 - m_hull_kg / (rho * L * B * H), 0.0, 1.0)
    """
    hull_mass_kg = params.hull_mass_t * 1000.0
    m_max = max_displacement_kg(
        params.length_m,
        params.beam_m,
        params.height_m,
        params.fluid_density,
    )
    return clamp(1.0 - hull_mass_kg / m_max, 0.0, 1.0)


def classify_status(draft_m: float, params: ShipParams) -> str:
    """Classify instantaneous vessel state for barge/challenge or submarine mode.

    Barge / Challenge rules:
    - "sunk"       if M > M_max and draft >= H
    - "overloaded" if M > M_max or d_eq > load_line_ratio * H
    - "floating"   otherwise

    Submarine rules:
    - "neutral"    if |M - M_max| / M_max < 0.005 and draft >= H
    - "surfaced"   if draft < H and M < M_max
    - "sunk"       if draft >= tank_depth_m - 0.01 and M > M_max
    - "submerged"  otherwise
    """
    mass_kg = total_mass_kg(params)
    m_max = max_displacement_kg(
        params.length_m,
        params.beam_m,
        params.height_m,
        params.fluid_density,
    )

    if params.mode == "submarine":
        seabed_m = tank_depth_m(params.height_m)
        if abs(mass_kg - m_max) / m_max < 0.005 and draft_m >= params.height_m:
            return "neutral"
        if draft_m < params.height_m and mass_kg < m_max:
            return "surfaced"
        if draft_m >= seabed_m - 0.01 and mass_kg > m_max:
            return "sunk"
        return "submerged"

    d_eq = equilibrium_draft_m(params)
    if mass_kg > m_max and draft_m >= params.height_m:
        return "sunk"
    if mass_kg > m_max or d_eq > params.load_line_ratio * params.height_m:
        return "overloaded"
    return "floating"


def rk4_step(
    state: SimState,
    dt: float = DEFAULT_DT_S,
    params: Optional[ShipParams] = None,
) -> SimState:
    """Advance the 1-DOF vertical heave state by one RK4 time step dt.

    Draft is clamped to [0.0, tank_depth_m(params.height_m)] with zero velocity
    on ceiling (d = 0) or seabed floor (d = tank_depth_m) contact.
    """
    active_params = params if params is not None else ShipParams()

    # Precompute constant coefficients across the four RK4 sub-stages.
    height_m = active_params.height_m
    waterplane_area = active_params.length_m * active_params.beam_m
    mass_kg = total_mass_kg(active_params)
    weight = mass_kg * active_params.gravity
    buoy_per_meter = active_params.fluid_density * active_params.gravity * waterplane_area
    drag_factor = 0.5 * active_params.fluid_density * active_params.drag_coeff * waterplane_area
    inv_mass = 1.0 / mass_kg

    def accel_down(draft: float, vel: float) -> float:
        eff_draft = 0.0 if draft < 0.0 else (height_m if draft > height_m else draft)
        f_buoy = buoy_per_meter * eff_draft
        f_drag = drag_factor * vel * abs(vel)
        return (weight - f_buoy - f_drag) * inv_mass

    d0 = state.draft_m
    v0 = state.velocity_mps

    k1_d = v0
    k1_v = accel_down(d0, v0)

    d1 = d0 + 0.5 * dt * k1_d
    v1 = v0 + 0.5 * dt * k1_v
    k2_d = v1
    k2_v = accel_down(d1, v1)

    d2 = d0 + 0.5 * dt * k2_d
    v2 = v0 + 0.5 * dt * k2_v
    k3_d = v2
    k3_v = accel_down(d2, v2)

    d3 = d0 + dt * k3_d
    v3 = v0 + dt * k3_v
    k4_d = v3
    k4_v = accel_down(d3, v3)

    next_d = d0 + (dt / 6.0) * (k1_d + 2.0 * k2_d + 2.0 * k3_d + k4_d)
    next_v = v0 + (dt / 6.0) * (k1_v + 2.0 * k2_v + 2.0 * k3_v + k4_v)

    seabed_m = tank_depth_m(height_m)
    if next_d <= 0.0:
        next_d = 0.0
        next_v = 0.0
    elif next_d >= seabed_m:
        next_d = seabed_m
        next_v = 0.0

    return SimState(
        draft_m=next_d,
        velocity_mps=next_v,
        time_s=state.time_s + dt,
    )


def _build_frame(state: SimState, params: ShipParams) -> dict[str, Any]:
    """Build a JSON-ready telemetry frame dictionary for a given simulation state."""
    forces = compute_forces(state.draft_m, state.velocity_mps, params)
    return {
        "time_s": state.time_s,
        "draft_m": state.draft_m,
        "velocity_mps": state.velocity_mps,
        "submerged_volume_m3": forces.submerged_volume_m3,
        "buoyancy_n": forces.buoyancy_n,
        "weight_n": forces.weight_n,
        "drag_n": forces.drag_n,
        "static_net_up_n": forces.static_net_up_n,
        "accel_down_mps2": forces.accel_down_mps2,
        "freeboard_m": params.height_m - state.draft_m,
        "status": classify_status(state.draft_m, params),
    }


def simulate_trajectory(
    initial_state: SimState,
    params: ShipParams,
    duration_s: float,
    dt: float = DEFAULT_DT_S,
    sample_every: int = 4,
) -> list[dict[str, Any]]:
    """Integrate a trajectory for duration_s seconds and return sampled frames.

    Always includes the initial frame (step 0), every sample_every-th step, and
    the final step if total_steps is not an exact multiple of sample_every.
    """
    if duration_s < 0.0 or not math.isfinite(duration_s):
        raise ValueError("duration_s must be finite and non-negative")
    if dt <= 0.0 or not math.isfinite(dt):
        raise ValueError("dt must be finite and positive")
    if sample_every < 1:
        raise ValueError("sample_every must be an integer >= 1")

    seabed_m = tank_depth_m(params.height_m)
    clamped_draft = clamp(initial_state.draft_m, 0.0, seabed_m)
    state = SimState(
        draft_m=clamped_draft,
        velocity_mps=initial_state.velocity_mps,
        time_s=initial_state.time_s,
    )

    total_steps = int(round(duration_s / dt))
    frames: list[dict[str, Any]] = [_build_frame(state, params)]

    for step in range(1, total_steps + 1):
        state = rk4_step(state, dt, params)
        if step % sample_every == 0 or step == total_steps:
            frames.append(_build_frame(state, params))

    return frames


def compute_summary_metrics(
    params: ShipParams,
    draft_m: Optional[float] = None,
) -> dict[str, Any]:
    """Compute analytical static and heave metrics for a valid ShipParams instance."""
    mass_kg = total_mass_kg(params)
    m_max = max_displacement_kg(
        params.length_m,
        params.beam_m,
        params.height_m,
        params.fluid_density,
    )
    d_eq = equilibrium_draft_m(params)
    seabed_m = tank_depth_m(params.height_m)
    eval_draft = clamp(draft_m, 0.0, seabed_m) if draft_m is not None else min(d_eq, seabed_m)
    forces = compute_forces(eval_draft, 0.0, params)
    load_line_draft = params.load_line_ratio * params.height_m

    return {
        "total_mass_kg": mass_kg,
        "total_mass_t": mass_kg / 1000.0,
        "max_displacement_kg": m_max,
        "max_displacement_t": m_max / 1000.0,
        "equilibrium_draft_m": d_eq,
        "freeboard_at_eq_m": params.height_m - d_eq,
        "load_line_draft_m": load_line_draft,
        "tank_depth_m": seabed_m,
        "analytical_heave_period_s": analytical_heave_period_s(params),
        "neutral_ballast_fraction": neutral_ballast_fraction(params),
        "weight_n": forces.weight_n,
        "max_buoyancy_n": m_max * params.gravity,
        "buoyancy_at_eval_n": forces.buoyancy_n,
        "static_net_up_at_eval_n": forces.static_net_up_n,
        "status": classify_status(eval_draft, params),
        "params": params.to_dict(),
    }


def validate_params_dict(data: Any) -> list[dict[str, str]]:
    """Validate a raw parameter mapping and return structured field errors.

    Returns an empty list when valid, or a list of {"field": str, "message": str}
    entries for non-mapping payloads, non-finite numbers, negative values,
    type mismatches, invalid modes, or out-of-bounds parameters.
    """
    if not isinstance(data, Mapping):
        return [{"field": "body", "message": "Request payload must be a JSON object."}]

    errors: list[dict[str, str]] = []

    # Validate mode if provided.
    mode_val = data.get("mode", ASSUMED_DEFAULTS["mode"])
    if not isinstance(mode_val, str) or mode_val not in VALID_MODES:
        allowed = ", ".join(VALID_MODES)
        errors.append(
            {
                "field": "mode",
                "message": f"Mode must be one of: {allowed}.",
            }
        )

    # Validate all numeric parameters (using defaults for omitted keys).
    for field_name, spec in PARAM_BOUNDS.items():
        if field_name not in data:
            continue
        raw_val = data[field_name]
        min_v = spec["min"]
        max_v = spec["max"]
        unit = spec["unit"]
        must_be_int = bool(spec["integer"])

        if raw_val is None or isinstance(raw_val, bool) or not isinstance(raw_val, (int, float)):
            errors.append(
                {
                    "field": field_name,
                    "message": f"{field_name} must be a finite number between {min_v} and {max_v} ({unit}).",
                }
            )
            continue

        numeric_val = float(raw_val)
        if not math.isfinite(numeric_val):
            errors.append(
                {
                    "field": field_name,
                    "message": f"{field_name} must be a finite number (NaN and Infinity are not allowed).",
                }
            )
            continue

        if numeric_val < 0.0:
            errors.append(
                {
                    "field": field_name,
                    "message": f"{field_name} cannot be negative (valid range: {min_v} to {max_v} {unit}).",
                }
            )
            continue

        if must_be_int and not numeric_val.is_integer():
            errors.append(
                {
                    "field": field_name,
                    "message": f"{field_name} must be a whole integer between {min_v} and {max_v}.",
                }
            )
            continue

        if numeric_val < min_v or numeric_val > max_v:
            errors.append(
                {
                    "field": field_name,
                    "message": f"{field_name} must be between {min_v} and {max_v} ({unit}); received {raw_val}.",
                }
            )

    return errors


def params_from_dict(data: Mapping[str, Any]) -> ShipParams:
    """Construct a ShipParams instance from a pre-validated mapping.

    Raises ValueError if validation fails.
    """
    errors = validate_params_dict(data)
    if errors:
        joined = "; ".join(f"{e['field']}: {e['message']}" for e in errors)
        raise ValueError(f"Invalid ShipParams: {joined}")

    return ShipParams(
        length_m=float(data.get("length_m", ASSUMED_DEFAULTS["length_m"])),
        beam_m=float(data.get("beam_m", ASSUMED_DEFAULTS["beam_m"])),
        height_m=float(data.get("height_m", ASSUMED_DEFAULTS["height_m"])),
        hull_mass_t=float(data.get("hull_mass_t", ASSUMED_DEFAULTS["hull_mass_t"])),
        container_mass_t=float(data.get("container_mass_t", ASSUMED_DEFAULTS["container_mass_t"])),
        containers=int(round(float(data.get("containers", ASSUMED_DEFAULTS["containers"])))),
        ballast_fraction=float(data.get("ballast_fraction", ASSUMED_DEFAULTS["ballast_fraction"])),
        mode=str(data.get("mode", ASSUMED_DEFAULTS["mode"])),
        fluid_density=float(data.get("fluid_density", ASSUMED_DEFAULTS["fluid_density"])),
        gravity=float(data.get("gravity", ASSUMED_DEFAULTS["gravity"])),
        drag_coeff=float(data.get("drag_coeff", ASSUMED_DEFAULTS["drag_coeff"])),
        load_line_ratio=float(data.get("load_line_ratio", ASSUMED_DEFAULTS["load_line_ratio"])),
    )
