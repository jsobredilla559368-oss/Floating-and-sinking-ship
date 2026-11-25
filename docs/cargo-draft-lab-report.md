# Cargo Draft Lab: Technical Physics Specification and Verification Report

**Document ID:** CDL-SPEC-1.0.0  
**Engine:** `cargo-draft-lab-python` v1.0.0  
**Scope:** 1-DOF Vertical Heave, Archimedes Buoyancy, Load-Line Challenge, and Submarine Ballast Physics Model  
**Verification Status:** 5 / 5 Automated Physics Proofs Passed (`run_self_tests()`, 0.3151 s) | 15 / 15 `pytest` Unit and API Tests Passed

---

## 1. Executive Overview

**Cargo Draft Lab** is an interactive naval-hydrostatics laboratory simulator designed to demonstrate Archimedes' principle, vertical heave dynamics, Plimsoll load-line margins, and submarine neutral buoyancy in a transparent, mathematically verifiable environment.

The simulator models a rectangular box-hull vessel of length $L$, beam $B$, and hull depth $H$ constrained to one-degree-of-freedom (1-DOF) vertical heave motion in a calm fluid column of density $\rho$ and gravitational acceleration $g$. The user explores three distinct operating modes:

1. **Lab Mode (`lab`):** Free experimentation with hull geometry, container loading, fluid density presets (fresh water, seawater, saturated brine), planetary gravity presets (Earth, Moon, Mars), and hydrodynamic drag coefficient $C_d$. Users can perturb draft vertically to observe damped heave oscillation and inspect live force vectors.
2. **Load to the Line Challenge (`challenge`):** Operational cargo-loading scenario anchored to a configurable Plimsoll load line at `0.75 * H` (3.00 m for the default 4.0 m hull). Entering lower-density fresh water increases draft by 2.50%, turning a compliant seawater load into an overloaded vessel.
3. **Submarine Ballast Mode (`submarine`):** Sealed hull mode where internal ballast tanks hold a controllable fraction $f \in [0, 1]$ of the enclosed hull volume filled with ambient fluid. Tuning $f$ around the neutral ballast threshold transitions the vessel across `surfaced`, `submerged`, `neutral`, and seabed `sunk` regimes.

### Hybrid Software Architecture

Cargo Draft Lab uses a dual-layer hybrid architecture separating authoritative backend computation from responsive browser visualization:

- **Authoritative Python Physics Backend (`backend/`):** Built with Python and FastAPI (`cargo-draft-lab-python` v1.0.0). Pure, side-effect-free simulation functions reside in `backend/physics.py`, cited constants and parameter bounds live in `backend/constants.py`, and the automated five-proof self-test harness lives in `backend/validation.py`. The FastAPI service (`backend/app.py`) exposes five JSON endpoints:
  - `GET /api/health`: Engine identity (`cargo-draft-lab-python`), version (`1.0.0`), and service status.
  - `GET /api/constants`: Full machine-readable catalog of cited physical constants, assumed design defaults, parameter bounds, valid modes, and explicit out-of-scope limits.
  - `POST /api/validate`: Strict finite-number and range validation returning structured field errors (`HTTP 422`) or analytical static/heave metrics (`HTTP 200`).
  - `POST /api/simulate`: Runs fixed-step classical 4th-order Runge-Kutta (RK4) integration and returns sampled telemetry frames plus trajectory summary metrics.
  - `GET /api/self-test`: Executes all five physics verification proofs live and returns exact analytical vs simulated results.
- **Interactive Frontend Laboratory (`frontend/`):** Built with React, TypeScript, Vite, HTML5 Canvas, and Framer Motion. A pure TypeScript mirror of `backend/physics.py` drives smooth 60 FPS visual rendering via a fixed-step `dt = 1/120 s` RK4 accumulator inside `requestAnimationFrame`, while `/api/*` calls connect directly to the FastAPI server for authoritative validation, trajectory comparison, and live self-test auditing.

---

## 2. Coordinate Convention, Variables, and Units

### Vertical Coordinate Convention

Draft $d \ge 0$ is measured vertically **downward** from the calm fluid surface (waterline at $d = 0\text{ m}$) to the bottom keel of the rectangular box hull:

- $d = 0\text{ m}$: Hull keel touches the calm water surface (fully out of water).
- $0 < d < H$: Hull floats partially submerged with freeboard $H - d > 0$.
- $d = H$: Main deck is flush with the waterline (maximum submerged hull volume $V_{\text{sub}} = L B H$).
- $H < d \le d_{\text{tank}}$: Vessel is fully submerged beneath the surface, descending toward the test-tank seabed at $d_{\text{tank}} = \max(12.0,\; 3.0 H)$.
- Positive vertical velocity $v = \mathrm{d}d/\mathrm{d}t > 0$ and acceleration $a = \mathrm{d}^2 d/\mathrm{d}t^2 > 0$ point **downward** (increasing draft). Buoyant force $F_b$ points **upward**; vessel weight $W$ points **downward**; quadratic drag $F_{\text{drag}}$ opposes velocity $v$.

### Complete Variables and Units Reference

| Symbol | Code Identifier | Physical Quantity | SI Unit (Display Unit) | Sign / Domain Convention |
| :--- | :--- | :--- | :--- | :--- |
| $L$ | `length_m` | Hull overall length | $\text{m}$ | $[20.0,\; 120.0]\text{ m}$ |
| $B$ | `beam_m` | Hull overall beam (width) | $\text{m}$ | $[4.0,\; 30.0]\text{ m}$ |
| $H$ | `height_m` | Hull molded depth (height) | $\text{m}$ | $[2.0,\; 10.0]\text{ m}$ |
| $m_{\text{hull}}$ | `hull_mass_t` ($\times 10^3$) | Empty hull structural mass | $\text{kg}$ ($\text{t}$) | $[100.0,\; 1500.0]\text{ t}$ |
| $m_{\text{cargo}}$ | `containers * container_mass_t` ($\times 10^3$) | Total deck cargo mass (barge/challenge) | $\text{kg}$ ($\text{t}$) | $N_c \in [0, 250]$, $m_c \in [1, 100]\text{ t}$ |
| $M$ | `total_mass_kg` / `total_mass_t` | Total vessel mass (hull + cargo or ballast) | $\text{kg}$ ($\text{t}$) | $M > 0$ |
| $M_{\max}$ | `max_displacement_kg` | Maximum displaced fluid mass $\rho L B H$ | $\text{kg}$ ($\text{t}$) | Sinking limit for barge |
| $\rho$ | `fluid_density` | Ambient fluid mass density | $\text{kg/m}^3$ | $[500.0,\; 2000.0]\text{ kg/m}^3$ |
| $g$ | `gravity` | Gravitational acceleration | $\text{m/s}^2$ | $[0.1,\; 30.0]\text{ m/s}^2$ |
| $d$ | `draft_m` | Instantaneous keel draft below waterline | $\text{m}$ | $[0.0,\; d_{\text{tank}}]$, positive downward |
| $d_{\text{eq}}$ | `equilibrium_draft_m` | Static Archimedes equilibrium draft | $\text{m}$ | Floats only if $d_{\text{eq}} \le H$ |
| $\text{freeboard}$ | `freeboard_m` | Vertical margin from waterline to deck ($H - d$) | $\text{m}$ | Negative when deck is submerged |
| $v$ | `velocity_mps` | Vertical heave velocity $\mathrm{d}d/\mathrm{d}t$ | $\text{m/s}$ | Positive downward |
| $a$ | `accel_down_mps2` | Vertical heave acceleration $\mathrm{d}^2 d/\mathrm{d}t^2$ | $\text{m/s}^2$ | Positive downward |
| $F_b$ | `buoyancy_n` | Upward Archimedes buoyant force | $\text{N}$ ($\text{MN}$) | Positive upward ($1\text{ MN} = 10^6\text{ N}$) |
| $W$ | `weight_n` | Downward gravitational weight $M g$ | $\text{N}$ ($\text{MN}$) | Positive downward |
| $F_{\text{drag}}$ | `drag_n` | Quadratic hydrodynamic heave drag | $\text{N}$ ($\text{MN}$) | Opposes velocity $v$ |
| $F_{\text{net}}$ | `static_net_up_n` / $W - F_b - F_{\text{drag}}$ | Net static upward force ($F_b - W$) or dynamic net force | $\text{N}$ ($\text{MN}$) | Static: upward positive; dynamic ODE: downward positive |
| $C_d$ | `drag_coeff` | Dimensionless quadratic heave drag coefficient | dimensionless | $[0.0,\; 5.0]$ |
| $T$ | `analytical_heave_period_s` | Undamped linear natural heave period | $\text{s}$ | Valid for $0 < d < H$ |
| $f$ | `ballast_fraction` | Submarine internal ballast fill fraction | dimensionless | $[0.0,\; 1.0]$ |
| $\Delta t$ | `DEFAULT_DT_S` | Fixed RK4 integration time step | $\text{s}$ | $1/120\text{ s} \approx 0.008333\text{ s}$ |

---

## 3. Governing Equations and Numerical Scheme

All equations below match the live implementation in `backend/physics.py` verbatim.

### 3.1 Total Vessel Mass

In **Lab** and **Challenge** modes, total vessel mass combines the empty steel hull mass $m_{\text{hull}}$ and $N_c$ uniform containers each of mass $m_c$:

$$M = m_{\text{hull}} + m_{\text{cargo}} = m_{\text{hull}} + N_c \, m_c$$

In **Submarine Ballast** mode, internal ballast tanks take on a fraction $f \in [0, 1]$ of the full enclosed hull volume $V_{\text{hull}} = L B H$ filled with ambient fluid of density $\rho$:

$$M = m_{\text{hull}} + f \, \rho \, (L B H)$$

### 3.2 Submerged Volume

For a rectangular box hull with waterplane area $A_w = L B$, the displaced fluid volume $V_{\text{sub}}(d)$ clamps the effective draft into the hull depth interval $[0, H]$:

$$V_{\text{sub}}(d) = L B \cdot \min(\max(d,\; 0),\; H)$$

Clamping at $0$ prevents negative displacement if the hull momentarily clears the surface; clamping at $H$ enforces the physical ceiling on buoyant volume once the entire enclosed hull is submerged.

### 3.3 Buoyant Force and Gravitational Weight

By Archimedes' principle, upward buoyant force equals the weight of the displaced fluid:

$$F_b(d) = \rho \, g \, V_{\text{sub}}(d) = \rho \, g \, L B \cdot \min(\max(d,\; 0),\; H)$$

Downward gravitational weight is:

$$W = M \, g$$

The static net upward force reported in telemetry (`static_net_up_n`) is:

$$F_{\text{net,up}}(d) = F_b(d) - W$$

### 3.4 Static Equilibrium Draft and Freeboard

Setting $F_b(d_{\text{eq}}) = W$ in the partially submerged regime ($0 < d_{\text{eq}} \le H$) yields the static equilibrium draft:

$$\rho \, g \, L B \, d_{\text{eq}} = M \, g \implies d_{\text{eq}} = \frac{M}{\rho L B}$$

Notice that gravitational acceleration $g$ cancels identically. Freeboard at draft $d$ is:

$$\text{freeboard}(d) = H - d$$

### 3.5 Vertical Heave Equation of Motion with Quadratic Drag

With draft $d$ positive downward and velocity $v = \mathrm{d}d/\mathrm{d}t$, quadratic hydrodynamic drag opposing vertical motion over the horizontal hull bottom area $A_w = L B$ is:

$$F_{\text{drag}}(v) = \frac{1}{2} \rho \, C_d \, (L B) \, v \, |v|$$

Newton's second law for 1-DOF vertical heave becomes the second-order nonlinear ODE:

$$M \frac{\mathrm{d}^2 d}{\mathrm{d}t^2} = W - F_b(d) - F_{\text{drag}}(v)$$

written as a first-order system in state $(d, v)$:

$$\frac{\mathrm{d}d}{\mathrm{d}t} = v, \qquad \frac{\mathrm{d}v}{\mathrm{d}t} = a(d, v) = \frac{W - F_b(d) - F_{\text{drag}}(v)}{M}$$

### 3.6 Sinking Criterion and Vessel Status Rules

The maximum mass of fluid the rectangular hull can displace is:

$$M_{\max} = \rho L B H, \qquad F_{b,\max} = \rho g L B H$$

A barge or cargo vessel **sinks** whenever its total mass strictly exceeds maximum displacement:

$$M > \rho L B H \iff d_{\text{eq}} > H \iff W > F_{b,\max}$$

Once $d \ge H$ under this condition, buoyancy saturates at $F_{b,\max} < W$, leaving a constant positive downward net static force $W - F_{b,\max} > 0$ that drives the vessel monotonically to the tank seabed $d_{\text{tank}} = \max(12.0,\; 3.0 H)$.

Operational status classification (`classify_status()` in `backend/physics.py`):

- **Lab / Challenge Modes:**
  - `sunk`: $M > M_{\max}$ and $d \ge H$.
  - `overloaded`: $M > M_{\max}$ or $d_{\text{eq}} > r_{\text{load}} \cdot H$ (where default Plimsoll ratio $r_{\text{load}} = 0.75$).
  - `floating`: Otherwise.
- **Submarine Mode:**
  - `neutral`: $|M - M_{\max}| / M_{\max} < 0.005$ (within 0.5% of neutral buoyancy) and $d \ge H$.
  - `surfaced`: $d < H$ and $M < M_{\max}$.
  - `sunk`: $d \ge d_{\text{tank}} - 0.01\text{ m}$ and $M > M_{\max}$.
  - `submerged`: Otherwise.

### 3.7 Analytical Undamped Heave Period Check

For small displacements $\eta = d - d_{\text{eq}}$ within $0 < d < H$ and negligible drag ($C_d \to 0$), buoyancy provides a linear hydrostatic restoring spring with stiffness $k = \rho g L B$:

$$M \ddot{\eta} + (\rho g L B)\,\eta = 0$$

The exact undamped angular frequency $\omega_n$ and natural heave period $T$ (without hydrodynamic added mass) are:

$$\omega_n = \sqrt{\frac{\rho g L B}{M}}, \qquad T = \frac{2\pi}{\omega_n} = 2\pi \sqrt{\frac{M}{\rho g L B}} = 2\pi \sqrt{\frac{d_{\text{eq}}}{g}}$$

### 3.8 Submarine Neutral Ballast Condition

Neutral buoyancy when fully submerged ($d \ge H$) requires $F_{b,\max} = W$, equivalently $M = M_{\max}$:

$$m_{\text{hull}} + f_{\text{neutral}} \, \rho L B H = \rho L B H \implies f_{\text{neutral}} = \operatorname{clamp}\!\left(1 - \frac{m_{\text{hull}}}{\rho L B H},\; 0,\; 1\right)$$

### 3.9 Fixed-Step RK4 Time Integration Scheme

The solver advances state $(d_n, v_n, t_n)$ using classical 4th-order Runge-Kutta (RK4) at fixed time step $\Delta t = 1/120\text{ s}$ (`DEFAULT_DT_S = 1.0 / 120.0`):

$$
\begin{aligned}
k_{1,d} &= v_n, & k_{1,v} &= a(d_n,\; v_n) \\
k_{2,d} &= v_n + \tfrac{1}{2}\Delta t\, k_{1,v}, & k_{2,v} &= a\!\left(d_n + \tfrac{1}{2}\Delta t\, k_{1,d},\; v_n + \tfrac{1}{2}\Delta t\, k_{1,v}\right) \\
k_{3,d} &= v_n + \tfrac{1}{2}\Delta t\, k_{2,v}, & k_{3,v} &= a\!\left(d_n + \tfrac{1}{2}\Delta t\, k_{2,d},\; v_n + \tfrac{1}{2}\Delta t\, k_{2,v}\right) \\
k_{4,d} &= v_n + \Delta t\, k_{3,v}, & k_{4,v} &= a\!\left(d_n + \Delta t\, k_{3,d},\; v_n + \Delta t\, k_{3,v}\right)
\end{aligned}
$$

$$d_{n+1} = d_n + \frac{\Delta t}{6}\left(k_{1,d} + 2 k_{2,d} + 2 k_{3,d} + k_{4,d}\right), \qquad v_{n+1} = v_n + \frac{\Delta t}{6}\left(k_{1,v} + 2 k_{2,v} + 2 k_{3,v} + k_{4,v}\right)$$

**Boundary Clamping:** After each step, if $d_{n+1} \le 0$ (surface ceiling) then $(d_{n+1}, v_{n+1}) \leftarrow (0.0,\; 0.0)$; if $d_{n+1} \ge d_{\text{tank}}$ (seabed contact) then $(d_{n+1}, v_{n+1}) \leftarrow (d_{\text{tank}},\; 0.0)$. Choosing $\Delta t = 1/120\text{ s}$ resolves the empty-hull heave period ($T = 1.4771\text{ s}$) with approximately 177 steps per cycle and the 90-container period ($T = 3.4642\text{ s}$) with approximately 416 steps per cycle, keeping RK4 phase and amplitude error negligible.

---

## 4. Cited Physical Constants

Every physical constant encoded in `backend/constants.py` is traceable to an authoritative metrology, aerospace, or fluid-mechanics reference:

| Constant / Preset | Code Key | Exact Value | Unit | Bibliographic Source (Verbatim from `backend/constants.py`) |
| :--- | :--- | :--- | :--- | :--- |
| Earth Standard Gravity | `GRAVITY_PRESETS["earth"]` | `9.80665` | $\text{m/s}^2$ | BIPM / NIST SP 330, 9th SI Brochure (exact defined standard gravity) |
| Moon Surface Gravity | `GRAVITY_PRESETS["moon"]` | `1.62` | $\text{m/s}^2$ | NASA Goddard Space Flight Center Moon Fact Sheet |
| Mars Surface Gravity | `GRAVITY_PRESETS["mars"]` | `3.71` | $\text{m/s}^2$ | NASA Goddard Space Flight Center Mars Fact Sheet |
| Fresh Water Density (4 C) | `FLUID_PRESETS["fresh"]` | `1000.0` | $\text{kg/m}^3$ | Pure water at 4 C reference; Frank M. White, *Fluid Mechanics* |
| Seawater Density (Nominal) | `FLUID_PRESETS["seawater"]` | `1025.0` | $\text{kg/m}^3$ | Standard naval architecture / Archimedes seawater reference; ITTC 2011 nominal |
| Saturated Brine Density (20 C) | `FLUID_PRESETS["brine"]` | `1200.0` | $\text{kg/m}^3$ | Saturated NaCl brine at 20 C (~26% w/w); *CRC Handbook of Chemistry and Physics* |
| Box-Hull Heave Drag Coefficient | `DRAG_COEFF_DEFAULT` | `1.05` | dimensionless | Flat rectangular prism / box-hull normal to heave flow; Sighard F. Hoerner, *Fluid-Dynamic Drag*; Frank M. White, *Fluid Mechanics* |
| Small-Drag Validation Coefficient | `DRAG_COEFF_SMALL_TEST` | `0.05` | dimensionless | Small-drag test value used in validation to isolate undamped heave period |

---

## 5. Assumed Design Defaults and Validation Bounds

> **IMPORTANT DISCLOSURE: ASSUMED DESIGN DEFAULTS, NOT REAL-SHIP SPECIFICATIONS**  
> All vessel dimensions, structural hull mass, container unit mass, Plimsoll load-line ratio, and test-tank depth below are **ASSUMED DESIGN DEFAULTS** selected for a simplified rectangular box-hull teaching model. They do **not** represent engineering drawings or stability booklet specifications of any real commercial cargo barge or submarine.

| Parameter | Code Key | Assumed Default | Inclusive Bounds (`PARAM_BOUNDS`) | Unit | Design Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Hull Length ($L$) | `length_m` | `60.0` | `20.0` to `120.0` | $\text{m}$ | Assumed teaching box-hull length |
| Hull Beam ($B$) | `beam_m` | `12.0` | `4.0` to `30.0` | $\text{m}$ | Assumed teaching waterplane area $L B = 720\text{ m}^2$ |
| Hull Depth ($H$) | `height_m` | `4.0` | `2.0` to `10.0` | $\text{m}$ | Enclosed hull volume $L B H = 2{,}880\text{ m}^3$ |
| Empty Hull Mass ($m_{\text{hull}}$) | `hull_mass_t` | `400.0` | `100.0` to `1500.0` | $\text{t}$ | $400{,}000\text{ kg}$; empty seawater draft $0.5420\text{ m}$ |
| Container Unit Mass ($m_c$) | `container_mass_t` | `20.0` | `1.0` to `100.0` | $\text{t}$ | $20{,}000\text{ kg}$ nominal loaded container |
| Container Count ($N_c$) | `containers` | `0` | `0` to `250` (integer) | count | Default unloaded deck; baseline proof uses `90` |
| Ballast Fill Fraction ($f$) | `ballast_fraction` | `0.0` | `0.0` to `1.0` | fraction | Used in `submarine` mode; neutral seawater $f = 0.8645$ |
| Operating Mode | `mode` | `"lab"` | `"lab"`, `"challenge"`, `"submarine"` | enum | Selects mass equation and status rules |
| Plimsoll Load-Line Ratio ($r_{\text{load}}$) | `load_line_ratio` | `0.75` | `0.1` to `0.95` | ratio | Plimsoll mark at `0.75 * H = 3.00 m` for default `H = 4.0 m` |
| Test-Tank Seabed Depth ($d_{\text{tank}}$) | `tank_depth_m(H)` | `12.0` | `max(12.0, 3.0 * H)` | $\text{m}$ | Ensures at least two hull heights beneath submerged deck |
| Ambient Fluid Density ($\rho$) | `fluid_density` | `1025.0` | `500.0` to `2000.0` | $\text{kg/m}^3$ | Defaults to ITTC nominal seawater |
| Gravitational Acceleration ($g$) | `gravity` | `9.80665` | `0.1` to `30.0` | $\text{m/s}^2$ | Defaults to BIPM standard gravity |
| Heave Drag Coefficient ($C_d$) | `drag_coeff` | `1.05` | `0.0` to `5.0` | dimensionless | Defaults to box-hull normal heave drag |
| RK4 Time Step ($\Delta t$) | `DEFAULT_DT_S` | `1/120` (`0.008333`) | `0.001` to `0.1` (API) | $\text{s}$ | Fixed 120 Hz integration step |

---

## 6. Key Physical Insights Demonstrated

All numerical examples below are computed directly from `backend/physics.py` for the default teaching hull ($60 \times 12 \times 4\text{ m}$, $m_{\text{hull}} = 400\text{ t}$, $m_c = 20\text{ t}$).

### 6.1 Gravity Invariance of Equilibrium Draft vs $1/\sqrt{g}$ Dependence of Heave Period

Because weight $W = M g$ and buoyancy $F_b = \rho g L B d$ both scale linearly with $g$, equilibrium draft $d_{\text{eq}} = M / (\rho L B)$ is **strictly independent of gravity**. However, the hydrostatic restoring stiffness $k = \rho g L B$ scales proportionally with $g$, so the natural heave period $T = 2\pi\sqrt{M / (\rho g L B)}$ scales as $g^{-1/2}$. Moving the same 90-container barge ($M = 2{,}200\text{ t}$) in seawater from Earth to Mars or the Moon keeps the waterline fixed at $2.9810\text{ m}$ while dramatically slowing heave oscillation:

| Gravity Environment | $g$ ($\text{m/s}^2$) | Weight $W$ ($\text{MN}$) | Equilibrium Draft $d_{\text{eq}}$ ($\text{m}$) | Analytical Heave Period $T$ ($\text{s}$) | Period Ratio $T / T_{\text{Earth}}$ |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Earth (Standard Gravity) | `9.80665` | `21.5746` | `2.981030` | `3.4642` | `1.0000` |
| Mars (NASA Fact Sheet) | `3.71` | `8.1620` | `2.981030` | `5.6322` | `1.6258` |
| Moon (NASA Fact Sheet) | `1.62` | `3.5640` | `2.981030` | `8.5233` | `2.4604` |

### 6.2 Fresh-Water vs Seawater Draft Ratio (`1.025`) and Plimsoll Load-Line Margin Shift

For fixed vessel mass $M$, equilibrium draft varies inversely with ambient fluid density $\rho$:

$$\frac{d_{\text{fresh}}}{d_{\text{seawater}}} = \frac{\rho_{\text{seawater}}}{\rho_{\text{fresh}}} = \frac{1025.0}{1000.0} = 1.0250 \quad (+2.50\%)$$

This 2.50% shift directly motivates Samuel Plimsoll's freshwater allowance on international load-line marks. With 90 containers ($M = 2{,}200\text{ t}$):

| Ambient Fluid | $\rho$ ($\text{kg/m}^3$) | $d_{\text{eq}}$ at 90 Containers ($\text{m}$) | Margin to 3.00 m Load Line ($\text{m}$) | Vessel Status (90 Containers) | Max Cargo at 3.00 m Line | Max Displacement $M_{\max}$ ($\text{t}$) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Fresh Water (4 C) | `1000.0` | `3.0556` | `-0.0556` (exceeded) | `overloaded` | `88.00` containers (`2,160 t`) | `2,880.0` (`124.00` containers) |
| Seawater (ITTC Nominal) | `1025.0` | `2.9810` | `+0.0190` (safe) | `floating` | `90.70` containers (`2,214 t`) | `2,952.0` (`127.60` containers) |
| Saturated Brine (20 C) | `1200.0` | `2.5463` | `+0.4537` (safe) | `floating` | `109.60` containers (`2,592 t`) | `3,456.0` (`152.80` containers) |

A barge safely loaded just below the 3.00 m Plimsoll line in seawater (90 containers, 1.90 cm margin) sinks 7.45 cm deeper when steaming into a freshwater river mouth, crossing the Plimsoll mark to `3.0556 m` and flipping status from `floating` to `overloaded`.

### 6.3 Sudden Nonlinear Transition from Floating to Sunk Above $M_{\max}$

In seawater, maximum hull displacement is $M_{\max} = 1025 \times 60 \times 12 \times 4 = 2{,}952{,}000\text{ kg}$ (`2,952 t`, corresponding to `127.60` containers and maximum buoyancy $F_{b,\max} = 28.9492\text{ MN}$):

- At **127 containers** ($M = 2{,}940\text{ t}$, $W = 28.8316\text{ MN}$): Equilibrium still exists at $d_{\text{eq}} = 3.9837\text{ m}$ with `0.0163 m` (1.63 cm) of remaining freeboard (`overloaded`, still floating).
- At **128 containers** ($M = 2{,}960\text{ t}$, $W = 29.0277\text{ MN}$): Adding one single 20 t container pushes $M$ 8 t above $M_{\max}$. Once the deck passes $d = 4.00\text{ m}$, submerged volume saturates at $2{,}880\text{ m}^3$, hydrostatic restoring stiffness drops abruptly from $k = \rho g L B = 7.237\text{ MN/m}$ to **zero**, and the constant unbalanced downward force ($W - F_{b,\max} = 78.45\text{ kN}$) accelerates the vessel to terminal drag speed until it comes to rest on the 12.00 m tank seabed (`sunk`).

Similarly, in Submarine Ballast mode, neutral buoyancy requires $f_{\text{neutral}} = 0.8645$ (86.45%) in seawater versus $0.8611$ (86.11%) in fresh water, demonstrating why submarines must trim ballast when transiting salinity boundaries.

---

## 7. Visual Encoding and Force-Arrow Color Rationale

Cargo Draft Lab uses a restrained, laboratory-instrument color architecture limited to three core hues plus neutrals, paired with explicit non-color encodings.

### Semantic Force-Vector Encoding

| Visual Channel | Light Mode Hex | Dark Mode Hex | Assigned Physical Meaning | Engineering Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Hydrodynamic Teal-Blue** | `#0A6C86` | `#38B2CE` | Upward Buoyancy Vector ($F_b$), submerged water column, displacement readout | Semantically links the upward force arrow to the fluid medium displacing the hull; cool chromatic anchor against light and dark instrument panels. |
| **Signal Crimson** | `#B83227` | `#F06458` | Downward Weight Vector ($W$), Plimsoll load-line limit, `overloaded` / `sunk` warnings | High-salience maritime safety cue linking gravitational load directly to overload risk and Plimsoll freeboard limits. |
| **Steel Slate Navy** | `#1F364D` | `#94B4D1` | Hull structure, draft ruler graduations, section headers | Evokes marine hull steel and graduated technical scales without competing with the active $F_b$ and $W$ vectors. |
| **Charcoal / Ice Ink** | `#14202B` | `#EAF0F6` | Primary text, tabular numeric readouts, equations | Maximum legibility on `#FFFFFF` / `#F3F5F7` light surfaces and `#16222E` / `#0F1720` dark surfaces. |

### Verified WCAG 2.1 AA Contrast Compliance

Every foreground/background pair in both light and dark themes was mathematically audited against the WCAG 2.1 relative-luminance formula and exceeds the 4.5:1 AA normal-text threshold:

| Foreground Token | Light Surface (`#FFFFFF`) | Light Canvas (`#F3F5F7`) | Dark Panel (`#16222E`) | Dark Surface (`#0F1720`) | WCAG AA (>= 4.5:1) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Buoyancy Teal (`#0A6C86` / `#38B2CE`) | **6.00:1** | **5.49:1** | **6.47:1** | **7.24:1** | PASS |
| Weight Crimson (`#B83227` / `#F06458`) | **5.96:1** | **5.45:1** | **5.12:1** | **5.73:1** | PASS |
| Primary Ink (`#14202B` / `#EAF0F6`) | **16.52:1** | **15.12:1** | **14.05:1** | **15.72:1** | PASS |
| Steel Slate (`#1F364D` / `#94B4D1`) | **12.40:1** | **11.35:1** | **7.45:1** | **8.34:1** | PASS |
| Muted Label (`#4A5C6D` / `#9FB1C3`) | **6.90:1** | **6.31:1** | **7.33:1** | **8.21:1** | PASS |

### Color-Vision Deficiency (CVD) Accessibility and Redundant Cueing

Pairing **Hydrodynamic Teal-Blue** against **Signal Crimson** avoids the red-green axis affected by deuteranopia and protanopia (the most common forms of color-vision deficiency), preserving strong blue-vs-red perceptual separation. In addition, the interface never relies on color alone:

1. **Directional Geometry:** $F_b$ always points upward from the center of buoyancy while $W$ always points downward from the center of gravity, with arrow shaft lengths scaled directly to force magnitude.
2. **Explicit Symbol and Unit Labels:** Each arrow carries inline text annotations (`F_b` and `W`) accompanied by tabular numeric readouts in Newtons (`N`) or Meganewtons (`MN`).
3. **Rule-Based Textual Status:** Operating state (`floating`, `overloaded`, `sunk`, `surfaced`, `submerged`, `neutral`) is always printed as plain text alongside draft and freeboard numbers.

---

## 8. Explicit Out-of-Scope Limitations

As declared programmatically in `backend/constants.py` (`OUT_OF_SCOPE`), this 1-DOF vertical heave teaching simulator intentionally omits five physical phenomena that belong to multi-degree-of-freedom naval architecture solvers:

1. **Rolling:** Angular motion about the longitudinal $x$-axis is locked to zero; deck cargo is assumed symmetrically distributed port-to-starboard.
2. **Pitching:** Angular motion about the transverse $y$-axis (trim fore and aft) is locked to zero; longitudinal weight distribution is not modeled.
3. **Transverse Stability (Metacentric Height $GM$):** Righting-arm curves ($GZ$), center-of-gravity rise from stacked deck containers, free-surface effects in partially filled ballast tanks, and capsizing stability criteria are omitted. Real high-stacked container barges can capsize before exceeding vertical buoyancy $M_{\max}$.
4. **Surface Waves:** The ambient fluid surface is a calm horizontal plane at $d = 0\text{ m}$ with zero incident wave excitation, radiation damping, or green-water deck shipping.
5. **Hydrodynamic Added Mass:** Accelerating a submerged hull accelerates surrounding water, adding an inertial term $m_a \ddot{d}$ that increases real-ship heave period ($T_{\text{real}} = 2\pi\sqrt{(M + m_a)/(\rho g L B)}$). Omitting $m_a$ keeps the analytical comparison $T = 2\pi\sqrt{M/(\rho g L B)}$ closed-form and transparent for introductory physics verification.

---

## 9. Automated Validation Proof Table

The table below records the exact, unmodified verification output from `backend.validation.run_self_tests()` executed against the live Python backend (runtime: `0.3151 s`, baseline: default `60 x 12 x 4 m` box hull, `400 t` empty hull + `90 x 20 t` containers giving $M = 2{,}200{,}000\text{ kg}$ in nominal seawater $\rho = 1025\text{ kg/m}^3$):

| # | Proof ID & Test Name | Governing Check Equation | Analytical / Expected | Simulated / Measured | Tolerance | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `equilibrium_draft`: Equilibrium Draft (Seawater, 90 Containers) | $d_{\text{eq}} = M / (\rho L B)$ | `2.9810 m` (`2.981030 m`) | Analytical `2.9810 m`; Simulated `2.9865 m` (`2.986488 m`, 900 s RK4 settle from $d=0$, $C_d=1.05$, error `0.00546 m`) | `+/- 0.01 m` | **PASS** |
| 2 | `heave_period`: Free Heave Oscillation Period (Small Drag) | $T = 2\pi\sqrt{M / (\rho g L B)}$ | `3.4642 s` (`3.464198 s`) | `3.4642 s` (`3.464198 s`, $d_0 = d_{\text{eq}} + 0.25\text{ m}$, $C_d=0.05$, 20 s, 6 upward crossings, error `0.00000 s`) | `+/- 0.03 s` | **PASS** |
| 3 | `fresh_seawater_ratio`: Fresh Water vs Seawater Draft Ratio | $d_{\text{fresh}} / d_{\text{seawater}} = \rho_{\text{seawater}} / \rho_{\text{fresh}}$ | `1.0250` (`1.025000`) | `1.025000` ($d_{\text{fresh}} = 3.0556\text{ m}$, $d_{\text{seawater}} = 2.9810\text{ m}$, `+2.50%`) | `+/- 0.0001` | **PASS** |
| 4 | `gravity_earth_to_moon`: Gravity Scaling: Earth (`9.80665`) to Moon (`1.62`) | $d_{\text{eq}}$ independent of $g$; $T_{\text{moon}}/T_{\text{earth}} = \sqrt{g_{\text{earth}}/g_{\text{moon}}}$ | Draft diff `< 1e-9 m`; $T_{\text{moon}} = 8.5233\text{ s}$ (`8.523256 s`, ratio `2.4604`) | Draft diff `0.00e+00 m`; $T_{\text{moon}} = 8.5233\text{ s}$ (`8.523257 s`, 6 crossings over 50 s, ratio `2.4604`) | `< 1e-9 m`; `+/- 0.05 s`; ratio `+/- 0.02` | **PASS** |
| 5 | `sinking_threshold`: Sinking Threshold ($M = M_{\max} + 1000\text{ kg}$) | $M > \rho L B H \Rightarrow d \to d_{\text{tank}}$ (`sunk`) | `status = sunk`; $d = 12.00\text{ m}$ ($> H = 4.00\text{ m}$) | `status = sunk`; $d = 12.00\text{ m}$ ($v = 0.00\text{ m/s}$, $M = 2{,}953{,}000\text{ kg}$ vs $M_{\max} = 2{,}952{,}000\text{ kg}$, 120 s RK4) | `+/- 1e-6 m` | **PASS** |

### Complementary `pytest` Unit and FastAPI Integration Summary

Running `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_physics.py -v` produced **15 passed in 1.66 s** (100% pass rate), verifying all five proofs above alongside ceiling/floor boundary clamps, submerged volume clamping, submarine neutral buoyancy transitions, structured `validate_params_dict` error handling, and all five FastAPI HTTP endpoints (`/api/health`, `/api/constants`, `/api/validate`, `/api/simulate`, `/api/self-test`).

---

## 10. Appendix: Commented Core Physics Source Code (Verbatim)

The three listings below embed the exact live Python source modules from `backend/` verbatim so that every equation, constant, citation, validation tolerance, and integration step documented above can be audited directly against executable code.

### 10.1 `backend/constants.py`

*Cited physical constants, assumed design defaults, bounds, and scope limits (180 lines, verbatim)*

```python
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

```

### 10.2 `backend/physics.py`

*Pure 1-DOF vertical heave and Archimedes buoyancy RK4 physics engine (531 lines, verbatim)*

```python
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

```

### 10.3 `backend/validation.py`

*Automated five-proof physics accuracy self-test suite (331 lines, verbatim)*

```python
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

```
