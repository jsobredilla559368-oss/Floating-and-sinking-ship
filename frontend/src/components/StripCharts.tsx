import { useEffect, useRef } from 'react';
import { CHART_WINDOW_S } from '../physics/constants';
import type { ThemeMode } from './TankCanvas';

export interface HistorySample {
  timeS: number;
  draftM: number;
  buoyancyN: number;
  weightN: number;
}

interface StripChartsProps {
  history: HistorySample[];
  equilibriumDraftM: number;
  loadLineM: number;
  hullHeightM: number;
  tankDepthM: number;
  isSubmarine: boolean;
  theme: ThemeMode;
}

interface ChartColors {
  bg: string;
  axis: string;
  grid: string;
  ink: string;
  muted: string;
  core1: string;
  core2: string;
  accent: string;
}

function getChartColors(theme: ThemeMode): ChartColors {
  if (theme === 'dark') {
    return {
      bg: '#16222E',
      axis: '#496077',
      grid: 'rgba(159, 177, 195, 0.14)',
      ink: '#EAF0F6',
      muted: '#9FB1C3',
      core1: '#38B2CE',
      core2: '#94B4D1',
      accent: '#F06458',
    };
  }
  return {
    bg: '#FFFFFF',
    axis: '#9FB1C3',
    grid: 'rgba(74, 92, 109, 0.12)',
    ink: '#14202B',
    muted: '#4A5C6D',
    core1: '#0A6C86',
    core2: '#1F364D',
    accent: '#B83227',
  };
}

export function StripCharts({
  history,
  equilibriumDraftM,
  loadLineM,
  hullHeightM,
  tankDepthM,
  isSubmarine,
  theme,
}: StripChartsProps) {
  const draftWrapRef = useRef<HTMLDivElement | null>(null);
  const draftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const forceWrapRef = useRef<HTMLDivElement | null>(null);
  const forceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const colors = getChartColors(theme);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const drawDraftChart = () => {
      const wrap = draftWrapRef.current;
      const canvas = draftCanvasRef.current;
      if (!wrap || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = Math.max(240, Math.floor(wrap.clientWidth));
      const height = Math.max(160, Math.floor(wrap.clientHeight));
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, width, height);

      const pad = { top: 14, right: 14, bottom: 26, left: 46 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;

      const latestT = history.length > 0 ? history[history.length - 1].timeS : 0;
      const tEnd = Math.max(CHART_WINDOW_S, latestT);
      const tStart = tEnd - CHART_WINDOW_S;

      let maxObserved = Math.max(hullHeightM * 1.15, equilibriumDraftM * 1.15);
      for (const pt of history) {
        if (pt.draftM > maxObserved) maxObserved = pt.draftM * 1.08;
      }
      const yMax = Math.min(tankDepthM, Math.max(hullHeightM + 1.0, Math.ceil(maxObserved)));
      const xOf = (t: number) => pad.left + ((t - tStart) / CHART_WINDOW_S) * plotW;
      const yOf = (d: number) => pad.top + plotH - (Math.max(0, Math.min(yMax, d)) / yMax) * plotH;

      // Horizontal measurement grid & labels
      const ticks = 4;
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= ticks; i += 1) {
        const val = (yMax * i) / ticks;
        const y = yOf(val);
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();

        ctx.fillStyle = colors.muted;
        ctx.fillText(`${val.toFixed(1)}`, pad.left - 6, y);
      }

      // Axes frame
      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top);
      ctx.lineTo(pad.left, pad.top + plotH);
      ctx.lineTo(width - pad.right, pad.top + plotH);
      ctx.stroke();

      // Time axis ticks
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let dt = 0; dt <= CHART_WINDOW_S; dt += 10) {
        const tVal = tStart + dt;
        const x = xOf(tVal);
        ctx.fillText(`${tVal.toFixed(0)}s`, x, pad.top + plotH + 6);
      }

      // Reference line: Hull height H (dotted muted)
      const yH = yOf(hullHeightM);
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(pad.left, yH);
      ctx.lineTo(width - pad.right, yH);
      ctx.stroke();
      ctx.restore();

      // Reference line: Plimsoll load line 0.75 H (dotted accent, barge modes)
      if (!isSubmarine) {
        const yLL = yOf(loadLineM);
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(pad.left, yLL);
        ctx.lineTo(width - pad.right, yLL);
        ctx.stroke();
        ctx.restore();
      }

      // Reference line: Equilibrium draft d_eq (dashed Core 1)
      if (!isSubmarine && equilibriumDraftM <= yMax) {
        const yEq = yOf(equilibriumDraftM);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = colors.core1;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(pad.left, yEq);
        ctx.lineTo(width - pad.right, yEq);
        ctx.stroke();
        ctx.restore();
      }

      // Trace: d(t)
      if (history.length > 1) {
        ctx.strokeStyle = colors.core2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (const pt of history) {
          if (pt.timeS < tStart) continue;
          const px = xOf(pt.timeS);
          const py = yOf(pt.draftM);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawForceChart = () => {
      const wrap = forceWrapRef.current;
      const canvas = forceCanvasRef.current;
      if (!wrap || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = Math.max(240, Math.floor(wrap.clientWidth));
      const height = Math.max(160, Math.floor(wrap.clientHeight));
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, width, height);

      const pad = { top: 14, right: 14, bottom: 26, left: 50 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;

      const latestT = history.length > 0 ? history[history.length - 1].timeS : 0;
      const tEnd = Math.max(CHART_WINDOW_S, latestT);
      const tStart = tEnd - CHART_WINDOW_S;

      let peakN = 1e6;
      for (const pt of history) {
        if (pt.buoyancyN > peakN) peakN = pt.buoyancyN;
        if (pt.weightN > peakN) peakN = pt.weightN;
      }
      const yMaxMN = Math.max(2, Math.ceil((peakN * 1.18) / 1e6));
      const xOf = (t: number) => pad.left + ((t - tStart) / CHART_WINDOW_S) * plotW;
      const yOf = (newtons: number) =>
        pad.top + plotH - (Math.max(0, Math.min(yMaxMN, newtons / 1e6)) / yMaxMN) * plotH;

      const ticks = 4;
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= ticks; i += 1) {
        const val = (yMaxMN * i) / ticks;
        const y = pad.top + plotH - (i / ticks) * plotH;
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();

        ctx.fillStyle = colors.muted;
        ctx.fillText(`${val.toFixed(1)}`, pad.left - 6, y);
      }

      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top);
      ctx.lineTo(pad.left, pad.top + plotH);
      ctx.lineTo(width - pad.right, pad.top + plotH);
      ctx.stroke();

      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let dt = 0; dt <= CHART_WINDOW_S; dt += 10) {
        const tVal = tStart + dt;
        const x = xOf(tVal);
        ctx.fillText(`${tVal.toFixed(0)}s`, x, pad.top + plotH + 6);
      }

      if (history.length > 1) {
        // Weight W(t) in Signal Crimson (dashed so distinguishable from F_b without color)
        ctx.save();
        ctx.setLineDash([6, 3]);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let startedW = false;
        for (const pt of history) {
          if (pt.timeS < tStart) continue;
          const px = xOf(pt.timeS);
          const py = yOf(pt.weightN);
          if (!startedW) {
            ctx.moveTo(px, py);
            startedW = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
        ctx.restore();

        // Buoyancy F_b(t) in Core 1 Teal-Blue (solid)
        ctx.strokeStyle = colors.core1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let startedB = false;
        for (const pt of history) {
          if (pt.timeS < tStart) continue;
          const px = xOf(pt.timeS);
          const py = yOf(pt.buoyancyN);
          if (!startedB) {
            ctx.moveTo(px, py);
            startedB = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
      }

      ctx.restore();
    };

    drawDraftChart();
    drawForceChart();
  }, [history, equilibriumDraftM, loadLineM, hullHeightM, tankDepthM, isSubmarine, theme]);

  const isEmpty = history.length <= 1;
  const latest = history[history.length - 1];
  const draftChartAria = latest
    ? `Draft versus time strip chart over a 30 second rolling window. Latest draft is ${latest.draftM.toFixed(2)} meters, equilibrium draft is ${equilibriumDraftM.toFixed(2)} meters, hull height is ${hullHeightM.toFixed(1)} meters.`
    : `Draft versus time strip chart over a 30 second rolling window awaiting simulation start.`;
  const forceChartAria = latest
    ? `Forces versus time strip chart over a 30 second rolling window. Latest buoyancy F_b is ${(latest.buoyancyN / 1e6).toFixed(2)} meganewtons and weight W is ${(latest.weightN / 1e6).toFixed(2)} meganewtons.`
    : `Forces versus time strip chart over a 30 second rolling window awaiting simulation start.`;

  return (
    <div className="charts-grid">
      <section className="panel" aria-label="Draft versus time strip chart">
        <div className="panel-header">
          <h2 className="panel-title">Draft vs Time d(t)</h2>
          <span className="panel-meta mono">m | 30 s window</span>
        </div>
        <div ref={draftWrapRef} className="chart-canvas-wrap">
          <canvas
            ref={draftCanvasRef}
            className="chart-canvas"
            role="img"
            aria-label={draftChartAria}
          />
          {isEmpty && (
            <div className="chart-empty-overlay">
              Add cargo, perturb (+0.25 m), or press Resume (Space) to record draft history.
            </div>
          )}
        </div>
        <div className="tank-legend-bar">
          <div className="legend-items">
            <span className="legend-item">
              <span className="legend-swatch swatch-core2" /> d(t)
            </span>
            {!isSubmarine && (
              <>
                <span className="legend-item">
                  <span className="legend-swatch swatch-core1" /> d_eq ({equilibriumDraftM.toFixed(2)} m)
                </span>
                <span className="legend-item">
                  <span className="legend-swatch swatch-accent" /> Plimsoll ({loadLineM.toFixed(2)} m)
                </span>
              </>
            )}
          </div>
          <span className="mono">H = {hullHeightM.toFixed(1)} m</span>
        </div>
      </section>

      <section className="panel" aria-label="Forces versus time strip chart">
        <div className="panel-header">
          <h2 className="panel-title">Forces vs Time</h2>
          <span className="panel-meta mono">MN | 30 s window</span>
        </div>
        <div ref={forceWrapRef} className="chart-canvas-wrap">
          <canvas
            ref={forceCanvasRef}
            className="chart-canvas"
            role="img"
            aria-label={forceChartAria}
          />
          {isEmpty && (
            <div className="chart-empty-overlay">
              Forces F_b(t) and W(t) trace here once the simulation runs.
            </div>
          )}
        </div>
        <div className="tank-legend-bar">
          <div className="legend-items">
            <span className="legend-item">
              <span className="legend-swatch swatch-core1" /> F_b(t) solid
            </span>
            <span className="legend-item">
              <span className="legend-swatch swatch-accent" /> W(t) dashed
            </span>
          </div>
          <span className="mono">1 MN = 10^6 N</span>
        </div>
      </section>
    </div>
  );
}
