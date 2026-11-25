import {
  ASSUMED_DEFAULTS,
  DRAG_SOURCES,
  FLUID_PRESETS,
  GRAVITY_PRESETS,
  OUT_OF_SCOPE_LIMITS,
} from '../physics/constants';

export function PhysicsFooter() {
  return (
    <footer className="physics-footer" aria-label="Physics reference and model limits">
      <div className="physics-footer-inner">
        <div>
          <h2 className="footer-section-title">Governing Equations (1-DOF Vertical Heave)</h2>
          <ul className="equation-list">
            <li>
              <span className="equation-formula">
                V_sub = L * B * min(max(d, 0), H)
              </span>
              <span className="equation-desc">
                Submerged box-hull volume capped at full hull height H (draft d measured downward
                from undisturbed waterline).
              </span>
            </li>
            <li>
              <span className="equation-formula">
                F_b = rho * g * V_sub , W = M * g
              </span>
              <span className="equation-desc">
                Upward Archimedes buoyancy force and downward gravitational weight.
              </span>
            </li>
            <li>
              <span className="equation-formula">
                F_drag = 0.5 * rho * C_d * (L * B) * v * |v|
              </span>
              <span className="equation-desc">
                Quadratic hydrodynamic heave drag opposing vertical velocity v.
              </span>
            </li>
            <li>
              <span className="equation-formula">
                a_down = (W - F_b - F_drag) / M
              </span>
              <span className="equation-desc">
                Integrated at fixed step dt = 1/120 s using 4th-order Runge-Kutta (RK4).
              </span>
            </li>
            <li>
              <span className="equation-formula">
                d_eq = M / (rho * L * B) , T = 2 * pi * sqrt(M / (rho * g * L * B))
              </span>
              <span className="equation-desc">
                Static equilibrium draft (independent of g) and small-amplitude undamped heave
                period.
              </span>
            </li>
            <li>
              <span className="equation-formula">
                M_sub = m_hull + f_ballast * rho * L * B * H
              </span>
              <span className="equation-desc">
                Submarine ballast mass; exact neutral trim occurs at f_neutral = clamp(1 - m_hull /
                (rho * L * B * H), 0, 1).
              </span>
            </li>
          </ul>

          <h3 className="footer-subhead">Model Scope & Explicit Limits</h3>
          <ul className="limits-list">
            {OUT_OF_SCOPE_LIMITS.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="footer-section-title">Cited Physical Constants vs Assumed Defaults</h2>
          <div className="ref-table-wrap">
            <table className="ref-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                  <th>Classification & Source</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Earth gravity g</td>
                  <td className="mono">{GRAVITY_PRESETS.earth.value} m/s^2</td>
                  <td>Cited constant: {GRAVITY_PRESETS.earth.source}</td>
                </tr>
                <tr>
                  <td>Moon / Mars gravity</td>
                  <td className="mono">
                    {GRAVITY_PRESETS.moon.value} / {GRAVITY_PRESETS.mars.value} m/s^2
                  </td>
                  <td>Cited constants: NASA Goddard Moon and Mars Fact Sheets</td>
                </tr>
                <tr>
                  <td>Fresh water density</td>
                  <td className="mono">{FLUID_PRESETS.fresh.value} kg/m^3</td>
                  <td>Cited constant: {FLUID_PRESETS.fresh.source}</td>
                </tr>
                <tr>
                  <td>Seawater density</td>
                  <td className="mono">{FLUID_PRESETS.seawater.value} kg/m^3</td>
                  <td>Cited constant: {FLUID_PRESETS.seawater.source}</td>
                </tr>
                <tr>
                  <td>Saturated brine density</td>
                  <td className="mono">{FLUID_PRESETS.brine.value} kg/m^3</td>
                  <td>Cited constant: {FLUID_PRESETS.brine.source}</td>
                </tr>
                <tr>
                  <td>Heave drag C_d</td>
                  <td className="mono">{ASSUMED_DEFAULTS.dragCoeff}</td>
                  <td>Cited range: {DRAG_SOURCES.default}</td>
                </tr>
                <tr>
                  <td>Box-hull geometry</td>
                  <td className="mono">
                    L = {ASSUMED_DEFAULTS.lengthM} m, B = {ASSUMED_DEFAULTS.beamM} m, H ={' '}
                    {ASSUMED_DEFAULTS.heightM} m
                  </td>
                  <td>Assumed design default (idealized laboratory barge)</td>
                </tr>
                <tr>
                  <td>Hull & container mass</td>
                  <td className="mono">
                    {ASSUMED_DEFAULTS.hullMassT} t hull, {ASSUMED_DEFAULTS.containerMassT} t/unit
                  </td>
                  <td>Assumed design default (nominal 20 t unit container mass)</td>
                </tr>
                <tr>
                  <td>Plimsoll load line & tank</td>
                  <td className="mono">
                    0.75 * H (3.00 m), depth = max(12, 3H)
                  </td>
                  <td>Assumed laboratory safety threshold and visual basin depth</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rationale-box">
            <h3 className="footer-subhead" style={{ marginTop: 0 }}>
              Force-Vector Color & Accessibility Rationale
            </h3>
            <p>
              Upward buoyancy F_b uses Teal-Blue (#0A6C86 light / #38B2CE dark) while downward
              weight W and the Plimsoll load line use Signal Crimson (#B83227 light / #F06458 dark).
              Both hues exceed WCAG AA 4.5:1 text contrast on panel backgrounds in both themes and
              remain distinct under deuteranopia and protanopia because cool cyan-blue and warm
              crimson separate cleanly in opponent channels, reinforced by opposite arrow directions
              and solid versus dashed strip-chart traces.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
