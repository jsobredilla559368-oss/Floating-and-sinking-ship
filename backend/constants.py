"""Physical constants, assumed design defaults, bounds, and scope limits.

Every physical constant in this module includes an explicit bibliographic
source citation. Vessel geometry and cargo mass defaults are clearly
separated and labeled as ASSUMED DESIGN DEFAULTS for a teaching box-hull
barge, not measurements of any real ship.
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# CITED PHYSICAL CONSTANTS (with bibliographic references)
# ---------------------------------------------------------------------------

# Gravitational acceleration presets in m/s^2:
# - earth: 9.80665 m/s^2 (exact standard gravity; BIPM / NIST SP 330, 9th SI Brochure)
# - moon: 1.62 m/s^2 (NASA Goddard Space Flight Center Moon Fact Sheet)
# - mars: 3.71 m/s^2 (NASA Goddard Space Flight Center Mars Fact Sheet)
GRAVITY_PRESETS: dict[str, float] = {
    "earth": 9.80665,
    "moon": 1.62,
    "mars": 3.71,
}

GRAVITY_METADATA: dict[str, dict[str, Any]] = {
    "earth": {
        "label": "Earth (Standard Gravity)",
        "value": 9.80665,
        "unit": "m/s^2",
        "source": "BIPM / NIST SP 330, 9th SI Brochure (exact defined standard gravity)",
    },
    "moon": {
        "label": "Moon",
        "value": 1.62,
        "unit": "m/s^2",
        "source": "NASA Goddard Space Flight Center Moon Fact Sheet",
    },
    "mars": {
        "label": "Mars",
        "value": 3.71,
        "unit": "m/s^2",
        "source": "NASA Goddard Space Flight Center Mars Fact Sheet",
    },
}

# Fluid mass density presets in kg/m^3:
# - fresh: 1000.0 kg/m^3 (Pure water at 4 C reference; White, Fluid Mechanics)
# - seawater: 1025.0 kg/m^3 (Standard naval architecture / Archimedes seawater reference; ITTC 2011 nominal)
# - brine: 1200.0 kg/m^3 (Saturated NaCl brine at 20 C, ~26% w/w; CRC Handbook of Chemistry and Physics)
FLUID_PRESETS: dict[str, float] = {
    "fresh": 1000.0,
    "seawater": 1025.0,
    "brine": 1200.0,
}

FLUID_METADATA: dict[str, dict[str, Any]] = {
    "fresh": {
        "label": "Fresh Water (4 C)",
        "value": 1000.0,
        "unit": "kg/m^3",
        "source": "Pure water at 4 C reference; Frank M. White, Fluid Mechanics",
    },
    "seawater": {
        "label": "Seawater (ITTC Nominal)",
        "value": 1025.0,
        "unit": "kg/m^3",
        "source": "Standard naval architecture / Archimedes seawater reference; ITTC 2011 nominal",
    },
    "brine": {
        "label": "Saturated Brine (20 C)",
        "value": 1200.0,
        "unit": "kg/m^3",
        "source": "Saturated NaCl brine at 20 C (~26% w/w); CRC Handbook of Chemistry and Physics",
    },
}

# Hydrodynamic heave drag coefficient (dimensionless):
# Flat rectangular prism / box-hull normal to heave flow.
# Source: Sighard F. Hoerner, Fluid-Dynamic Drag; Frank M. White, Fluid Mechanics.
DRAG_COEFF_DEFAULT: float = 1.05

# Small-drag test coefficient (dimensionless) used in validation self-tests
# to isolate the undamped natural heave oscillation period T = 2*pi*sqrt(M / (rho*g*L*B)).
DRAG_COEFF_SMALL_TEST: float = 0.05

DRAG_METADATA: dict[str, dict[str, Any]] = {
    "default": {
        "label": "Box-Hull Heave Drag Coefficient",
        "value": DRAG_COEFF_DEFAULT,
        "unit": "dimensionless",
        "source": "Flat rectangular prism / box-hull normal to heave flow; Hoerner, Fluid-Dynamic Drag; White, Fluid Mechanics",
    },
    "small_test": {
        "label": "Small-Drag Validation Coefficient",
        "value": DRAG_COEFF_SMALL_TEST,
        "unit": "dimensionless",
        "source": "Small-drag test value used in validation to isolate undamped heave period",
    },
}

# ---------------------------------------------------------------------------
# ASSUMED DESIGN DEFAULTS (teaching model parameters, NOT real-ship facts)
# ---------------------------------------------------------------------------

ASSUMED_DEFAULTS: dict[str, Any] = {
    "length_m": 60.0,
    "beam_m": 12.0,
    "height_m": 4.0,
    "hull_mass_t": 400.0,
    "container_mass_t": 20.0,
    "containers": 0,
    "ballast_fraction": 0.0,
    "mode": "lab",
    "fluid_density": FLUID_PRESETS["seawater"],
    "gravity": GRAVITY_PRESETS["earth"],
    "drag_coeff": DRAG_COEFF_DEFAULT,
    "load_line_ratio": 0.75,  # 3.00 m load line at default H = 4.0 m
}

# Fixed RK4 integration step in seconds (120 Hz).
DEFAULT_DT_S: float = 1.0 / 120.0

# Valid operating modes for the simulation.
VALID_MODES: tuple[str, ...] = ("lab", "challenge", "submarine")

# Parameter validation bounds (inclusive).
PARAM_BOUNDS: dict[str, dict[str, Any]] = {
    "length_m": {"min": 20.0, "max": 120.0, "unit": "m", "integer": False},
    "beam_m": {"min": 4.0, "max": 30.0, "unit": "m", "integer": False},
    "height_m": {"min": 2.0, "max": 10.0, "unit": "m", "integer": False},
    "hull_mass_t": {"min": 100.0, "max": 1500.0, "unit": "t", "integer": False},
    "container_mass_t": {"min": 1.0, "max": 100.0, "unit": "t", "integer": False},
    "containers": {"min": 0, "max": 250, "unit": "count", "integer": True},
    "ballast_fraction": {"min": 0.0, "max": 1.0, "unit": "fraction", "integer": False},
    "fluid_density": {"min": 500.0, "max": 2000.0, "unit": "kg/m^3", "integer": False},
    "gravity": {"min": 0.1, "max": 30.0, "unit": "m/s^2", "integer": False},
    "drag_coeff": {"min": 0.0, "max": 5.0, "unit": "dimensionless", "integer": False},
    "load_line_ratio": {"min": 0.1, "max": 0.95, "unit": "ratio", "integer": False},
}

# Explicitly declared physics effects omitted from this 1-DOF vertical heave model.
OUT_OF_SCOPE: list[str] = [
    "rolling",
    "pitching",
    "transverse stability (metacentric height GM)",
    "surface waves",
    "hydrodynamic added mass",
]


def tank_depth_m(height_m: float) -> float:
    """Return the vertical test-tank seabed depth in meters.

    Defined as max(12.0, 3.0 * height_m) so the hull always has at least two
    hull heights of water column below its deck when fully submerged.
    """
    return max(12.0, 3.0 * height_m)


def get_constants_payload() -> dict[str, Any]:
    """Return a JSON-serializable snapshot of all constants, defaults, and limits."""
    return {
        "gravity_presets": GRAVITY_METADATA,
        "fluid_presets": FLUID_METADATA,
        "drag_coefficients": DRAG_METADATA,
        "assumed_defaults": {
            **ASSUMED_DEFAULTS,
            "default_tank_depth_m": tank_depth_m(float(ASSUMED_DEFAULTS["height_m"])),
            "default_dt_s": DEFAULT_DT_S,
            "note": (
                "ASSUMED DESIGN DEFAULTS for a simplified rectangular box-hull "
                "teaching model, not specifications of a real commercial vessel."
            ),
        },
        "bounds": PARAM_BOUNDS,
        "valid_modes": list(VALID_MODES),
        "out_of_scope": OUT_OF_SCOPE,
    }
