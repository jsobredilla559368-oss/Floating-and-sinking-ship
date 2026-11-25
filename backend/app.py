"""FastAPI web server exposing Cargo Draft Lab physics, validation, and self-tests."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend import ENGINE_NAME, ENGINE_VERSION
from backend.constants import DEFAULT_DT_S, get_constants_payload, tank_depth_m
from backend.physics import (
    SimState,
    classify_status,
    compute_summary_metrics,
    equilibrium_draft_m,
    params_from_dict,
    simulate_trajectory,
    validate_params_dict,
)
from backend.validation import run_self_tests

app = FastAPI(
    title="Cargo Draft Lab Physics API",
    version=ENGINE_VERSION,
    description=(
        "Authoritative Python 1-DOF vertical heave and Archimedes buoyancy "
        "simulation backend for Cargo Draft Lab."
    ),
)

# Allow local Vite dev and preview origins on localhost and 127.0.0.1.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _parse_json_object(request: Request) -> tuple[dict[str, Any] | None, JSONResponse | None]:
    """Read and parse a JSON object body, returning a 422 response if invalid."""
    try:
        payload = await request.json()
    except Exception:
        return None, JSONResponse(
            status_code=422,
            content={
                "valid": False,
                "errors": [
                    {
                        "field": "body",
                        "message": "Request body must be valid JSON.",
                    }
                ],
            },
        )
    if not isinstance(payload, dict):
        return None, JSONResponse(
            status_code=422,
            content={
                "valid": False,
                "errors": [
                    {
                        "field": "body",
                        "message": "Request payload must be a JSON object.",
                    }
                ],
            },
        )
    return payload, None


@app.get("/api/health")
def get_health() -> dict[str, str]:
    """Return engine identity and health status."""
    return {
        "status": "ok",
        "engine": ENGINE_NAME,
        "version": ENGINE_VERSION,
    }


@app.get("/api/constants")
def get_constants() -> dict[str, Any]:
    """Return cited physical constants, assumed defaults, bounds, and scope limits."""
    return get_constants_payload()


@app.post("/api/validate")
async def post_validate(request: Request) -> JSONResponse:
    """Validate ShipParams payload and return summary metrics or structured errors."""
    payload, error_response = await _parse_json_object(request)
    if error_response is not None:
        return error_response
    assert payload is not None

    errors = validate_params_dict(payload)

    draft_override: float | None = None
    if "draft_m" in payload and payload["draft_m"] is not None:
        raw_draft = payload["draft_m"]
        if isinstance(raw_draft, bool) or not isinstance(raw_draft, (int, float)):
            errors.append(
                {
                    "field": "draft_m",
                    "message": "draft_m must be a finite non-negative number.",
                }
            )
        else:
            draft_val = float(raw_draft)
            if not math.isfinite(draft_val) or draft_val < 0.0:
                errors.append(
                    {
                        "field": "draft_m",
                        "message": "draft_m must be a finite non-negative number.",
                    }
                )
            else:
                draft_override = draft_val

    if errors:
        return JSONResponse(
            status_code=422,
            content={"valid": False, "errors": errors},
        )

    params = params_from_dict(payload)
    metrics = compute_summary_metrics(params, draft_m=draft_override)
    return JSONResponse(
        status_code=200,
        content={"valid": True, "metrics": metrics},
    )


@app.post("/api/simulate")
async def post_simulate(request: Request) -> JSONResponse:
    """Integrate an RK4 heave trajectory and return sampled frames plus summary."""
    payload, error_response = await _parse_json_object(request)
    if error_response is not None:
        return error_response
    assert payload is not None

    # Support either nested {"params": {...}, ...} or flat parameter fields.
    raw_params = payload.get("params") if isinstance(payload.get("params"), dict) else payload
    errors = validate_params_dict(raw_params)

    # Validate simulation integration controls.
    duration_raw = payload.get("duration_s", 10.0)
    dt_raw = payload.get("dt", DEFAULT_DT_S)
    sample_every_raw = payload.get("sample_every", 4)
    initial_draft_raw = payload.get("initial_draft_m")
    initial_velocity_raw = payload.get("initial_velocity_mps", 0.0)

    duration_s = 10.0
    if isinstance(duration_raw, bool) or not isinstance(duration_raw, (int, float)) or not math.isfinite(float(duration_raw)):
        errors.append({"field": "duration_s", "message": "duration_s must be a finite number in (0, 600]."})
    else:
        duration_s = float(duration_raw)
        if duration_s <= 0.0 or duration_s > 600.0:
            errors.append({"field": "duration_s", "message": "duration_s must be in (0, 600] seconds."})

    dt = DEFAULT_DT_S
    if isinstance(dt_raw, bool) or not isinstance(dt_raw, (int, float)) or not math.isfinite(float(dt_raw)):
        errors.append({"field": "dt", "message": "dt must be a finite number in [0.001, 0.1] seconds."})
    else:
        dt = float(dt_raw)
        if dt < 0.001 or dt > 0.1:
            errors.append({"field": "dt", "message": "dt must be in [0.001, 0.1] seconds."})

    sample_every = 4
    if (
        isinstance(sample_every_raw, bool)
        or not isinstance(sample_every_raw, (int, float))
        or not math.isfinite(float(sample_every_raw))
        or not float(sample_every_raw).is_integer()
        or int(sample_every_raw) < 1
    ):
        errors.append({"field": "sample_every", "message": "sample_every must be an integer >= 1."})
    else:
        sample_every = int(sample_every_raw)

    initial_velocity_mps = 0.0
    if (
        isinstance(initial_velocity_raw, bool)
        or not isinstance(initial_velocity_raw, (int, float))
        or not math.isfinite(float(initial_velocity_raw))
    ):
        errors.append({"field": "initial_velocity_mps", "message": "initial_velocity_mps must be a finite number."})
    else:
        initial_velocity_mps = float(initial_velocity_raw)

    initial_draft_override: float | None = None
    if initial_draft_raw is not None:
        if (
            isinstance(initial_draft_raw, bool)
            or not isinstance(initial_draft_raw, (int, float))
            or not math.isfinite(float(initial_draft_raw))
            or float(initial_draft_raw) < 0.0
        ):
            errors.append({"field": "initial_draft_m", "message": "initial_draft_m must be a finite non-negative number."})
        else:
            initial_draft_override = float(initial_draft_raw)

    if errors:
        return JSONResponse(
            status_code=422,
            content={"valid": False, "errors": errors},
        )

    params = params_from_dict(raw_params)
    seabed_m = tank_depth_m(params.height_m)
    start_draft = (
        min(initial_draft_override, seabed_m)
        if initial_draft_override is not None
        else min(equilibrium_draft_m(params), seabed_m)
    )
    initial_state = SimState(
        draft_m=start_draft,
        velocity_mps=initial_velocity_mps,
        time_s=0.0,
    )
    frames = simulate_trajectory(
        initial_state=initial_state,
        params=params,
        duration_s=duration_s,
        dt=dt,
        sample_every=sample_every,
    )
    last_frame = frames[-1]
    base_metrics = compute_summary_metrics(params, draft_m=last_frame["draft_m"])
    summary = {
        **base_metrics,
        "initial_draft_m": start_draft,
        "initial_velocity_mps": initial_velocity_mps,
        "duration_s": duration_s,
        "dt_s": dt,
        "sample_every": sample_every,
        "final_draft_m": last_frame["draft_m"],
        "final_velocity_mps": last_frame["velocity_mps"],
        "final_time_s": last_frame["time_s"],
        "final_status": classify_status(last_frame["draft_m"], params),
        "frame_count": len(frames),
    }

    return JSONResponse(
        status_code=200,
        content={
            "valid": True,
            "params": params.to_dict(),
            "summary": summary,
            "frames": frames,
        },
    )


@app.get("/api/self-test")
def get_self_test() -> dict[str, Any]:
    """Run all five physics verification self-tests live and return the JSON report."""
    return run_self_tests()


# Optional static mount for built frontend bundle (only if frontend/dist exists).
FRONTEND_DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST_DIR.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIST_DIR), html=True),
        name="frontend",
    )
