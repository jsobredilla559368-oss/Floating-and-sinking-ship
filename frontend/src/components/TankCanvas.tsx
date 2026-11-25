import { useEffect, useRef } from 'react';
import type { ShipParams, SimState, TelemetrySnapshot } from '../physics/engine';

export type ThemeMode = 'light' | 'dark';

interface TankCanvasProps {
  params: ShipParams;
  simState: SimState;
  telemetry: TelemetrySnapshot;
  theme: ThemeMode;
  reducedMotion: boolean;
}

interface CanvasPalette {
  panelBg: string;
  airBg: string;
  waterTop: string;
  waterBottom: string;
  waterLine: string;
  rulerBg: string;
  rulerInk: string;
  rulerMuted: string;
  border: string;
  hullFill: string;
  hullStroke: string;
  hullRib: string;
  deckFill: string;
  containerA: string;
  containerB: string;
  containerStroke: string;
  ballastFill: string;
  ballastBg: string;
  accent: string;
  core1: string;
  seabedBg: string;
  seabedHatch: string;
  labelBg: string;
  labelInk: string;
}

function getCanvasPalette(theme: ThemeMode): CanvasPalette {
  if (theme === 'dark') {
    return {
      panelBg: '#16222E',
      airBg: '#131E29',
      waterTop: 'rgba(56, 178, 206, 0.17)',
      waterBottom: 'rgba(56, 178, 206, 0.30)',
      waterLine: '#38B2CE',
      rulerBg: '#0C131B',
      rulerInk: '#EAF0F6',
      rulerMuted: '#9FB1C3',
      border: '#2A3B4C',
      hullFill: '#223548',
      hullStroke: '#94B4D1',
      hullRib: 'rgba(148, 180, 209, 0.25)',
      deckFill: '#2E455C',
      containerA: '#35506B',
      containerB: '#283F56',
      containerStroke: '#94B4D1',
      ballastFill: 'rgba(56, 178, 206, 0.58)',
      ballastBg: '#0F1720',
      accent: '#F06458',
      core1: '#38B2CE',
      seabedBg: '#111A23',
      seabedHatch: '#2A3B4C',
      labelBg: 'rgba(15, 23, 32, 0.92)',
      labelInk: '#EAF0F6',
    };
  }
  return {
    panelBg: '#FFFFFF',
    airBg: '#F7F9FB',
    waterTop: 'rgba(10, 108, 134, 0.13)',
    waterBottom: 'rgba(10, 108, 134, 0.26)',
    waterLine: '#0A6C86',
    rulerBg: '#EDF2F6',
    rulerInk: '#14202B',
    rulerMuted: '#4A5C6D',
    border: '#D0D9E2',
    hullFill: '#2B4661',
    hullStroke: '#1F364D',
    hullRib: 'rgba(255, 255, 255, 0.22)',
    deckFill: '#1F364D',
    containerA: '#44627D',
    containerB: '#334D66',
    containerStroke: '#14202B',
    ballastFill: 'rgba(10, 108, 134, 0.52)',
    ballastBg: '#F3F5F7',
    accent: '#B83227',
    core1: '#0A6C86',
    seabedBg: '#E4EAF0',
    seabedHatch: '#B8C5D2',
    labelBg: 'rgba(255, 255, 255, 0.94)',
    labelInk: '#14202B',
  };
}

function formatForceShort(newtons: number): string {
  const abs = Math.abs(newtons);
  if (abs >= 1e6) {
    return `${(newtons / 1e6).toFixed(2)} MN`;
  }
  if (abs >= 1e3) {
    return `${(newtons / 1e3).toFixed(1)} kN`;
  }
  return `${newtons.toFixed(0)} N`;
}

function drawForceArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  yStart: number,
  yEnd: number,
  color: string,
  label: string,
  align: 'left' | 'right',
  palette: CanvasPalette,
  minX: number,
  maxX: number,
) {
  const dy = yEnd - yStart;
  const minLen = 24;
  const clampedEnd =
    Math.abs(dy) < minLen ? yStart + (dy >= 0 ? minLen : -minLen) : yEnd;
  const dir = clampedEnd > yStart ? 1 : -1;

  ctx.save();
  ctx.lineCap = 'butt';

  // Crisp neutral backing behind shaft & arrowhead so vectors read cleanly over dark hull steel
  ctx.strokeStyle = palette.labelBg;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, yStart);
  ctx.lineTo(x, clampedEnd - dir * 5);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;

  // Anchor dot
  ctx.beginPath();
  ctx.arc(x, yStart, 3.4, 0, Math.PI * 2);
  ctx.fill();

  // Shaft
  ctx.beginPath();
  ctx.moveTo(x, yStart);
  ctx.lineTo(x, clampedEnd - dir * 7);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x, clampedEnd);
  ctx.lineTo(x - 6, clampedEnd - dir * 11);
  ctx.lineTo(x + 6, clampedEnd - dir * 11);
  ctx.closePath();
  ctx.fill();

  // Label plate clamped inside tank bounds
  ctx.font = '600 11px "IBM Plex Mono", monospace';
  const metrics = ctx.measureText(label);
  const padX = 6;
  const boxW = metrics.width + padX * 2;
  const boxH = 20;
  const rawBoxX = align === 'left' ? x - boxW - 10 : x + 10;
  const boxX = Math.max(minX, Math.min(maxX - boxW, rawBoxX));
  const boxY = clampedEnd - boxH / 2;

  ctx.fillStyle = palette.labelBg;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, boxX + padX, boxY + boxH / 2 + 0.5);
  ctx.restore();
}

export function TankCanvas({
  params,
  simState,
  telemetry,
  theme,
  reducedMotion,
}: TankCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef<{ width: number; height: number }>({ width: 720, height: 410 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      sizeRef.current = {
        width: Math.max(280, Math.floor(rect.width)),
        height: Math.max(260, Math.floor(rect.height)),
      };
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const palette = getCanvasPalette(theme);
    const rulerW = width < 480 ? 54 : 66;
    const seabedH = 24;
    const topPad = 14;
    const tankLeft = rulerW;
    const tankW = width - rulerW;

    const depthM = telemetry.tankDepthM;
    const airM = Math.max(4.6, params.heightM * 1.45);
    const totalVerticalM = airM + depthM;
    const usableH = height - topPad - seabedH;
    const pxPerM = usableH / totalVerticalM;
    const waterY = topPad + airM * pxPerM;
    const seabedY = topPad + totalVerticalM * pxPerM;
    const depthToY = (dMeters: number) => waterY + dMeters * pxPerM;

    // 1. Air region background
    ctx.fillStyle = palette.airBg;
    ctx.fillRect(0, 0, width, height);

    // 2. Water column with gentle hydrostatic depth tint
    const waterGrad = ctx.createLinearGradient(0, waterY, 0, seabedY);
    waterGrad.addColorStop(0, palette.waterTop);
    waterGrad.addColorStop(1, palette.waterBottom);
    ctx.fillStyle = waterGrad;
    ctx.fillRect(tankLeft, waterY, tankW, seabedY - waterY);

    // 3. Seabed floor with architectural diagonal sediment hatching
    ctx.fillStyle = palette.seabedBg;
    ctx.fillRect(tankLeft, seabedY, tankW, seabedH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(tankLeft, seabedY, tankW, seabedH);
    ctx.clip();
    ctx.strokeStyle = palette.seabedHatch;
    ctx.lineWidth = 1;
    for (let sx = tankLeft - seabedH; sx < width + seabedH; sx += 12) {
      ctx.beginPath();
      ctx.moveTo(sx, seabedY + seabedH);
      ctx.lineTo(sx + seabedH, seabedY);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = palette.rulerMuted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tankLeft, seabedY);
    ctx.lineTo(width, seabedY);
    ctx.stroke();

    // Seabed datum text
    ctx.fillStyle = palette.rulerInk;
    ctx.font = '600 10.5px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`SEABED ${depthM.toFixed(1)} m`, width - 10, seabedY + seabedH / 2 + 0.5);

    // 4. Calibrated vertical depth ruler on left
    ctx.fillStyle = palette.rulerBg;
    ctx.fillRect(0, 0, rulerW, height);
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rulerW, 0);
    ctx.lineTo(rulerW, height);
    ctx.stroke();

    const stepMajor = depthM > 18 ? 4 : 2;
    const minTickM = -Math.floor(airM);
    const maxTickM = Math.ceil(depthM);

    ctx.font = '500 10.5px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let m = minTickM; m <= maxTickM; m += 1) {
      const y = depthToY(m);
      if (y < 6 || y > seabedY + 2) continue;
      const isMajor = m % stepMajor === 0;
      const tickLen = isMajor ? 10 : 5;

      ctx.strokeStyle = m === 0 ? palette.waterLine : palette.rulerMuted;
      ctx.lineWidth = m === 0 ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(rulerW - tickLen, y);
      ctx.lineTo(rulerW, y);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = m === 0 ? palette.waterLine : palette.rulerMuted;
        const label = m === 0 ? '0 m' : `${m} m`;
        ctx.fillText(label, rulerW - 13, y);
      }
    }

    // Equilibrium draft marker on left side below dashed line (collision-free with right W vector)
    if (params.mode !== 'submarine' && telemetry.equilibriumDraftM <= depthM) {
      const eqY = depthToY(telemetry.equilibriumDraftM);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = palette.core1;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tankLeft, eqY);
      ctx.lineTo(width, eqY);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = palette.core1;
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`d_eq ${telemetry.equilibriumDraftM.toFixed(2)} m`, tankLeft + 8, eqY + 4);
    }

    // 5. Ship hull geometry
    const lengthNorm = (params.lengthM - 20) / (120 - 20);
    const minHullW = Math.min(130, tankW * 0.34);
    const maxHullW = Math.min(390, tankW * 0.62);
    const hullW = minHullW + lengthNorm * (maxHullW - minHullW);
    const hullH = params.heightM * pxPerM;
    const hullX = tankLeft + (tankW - hullW) * 0.5;
    const keelY = depthToY(simState.draftM);
    const deckY = keelY - hullH;

    // 6. Waterline surface (physically coupled slight surface displacement during heave)
    ctx.save();
    ctx.strokeStyle = palette.waterLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const waveAmp = reducedMotion
      ? 0
      : Math.min(3.5, Math.abs(simState.velocityMps) * 2.4);
    const samples = 48;
    for (let i = 0; i <= samples; i += 1) {
      const sx = tankLeft + (tankW * i) / samples;
      const distFromHull = Math.max(0, Math.abs(sx - (hullX + hullW / 2)) - hullW * 0.5);
      const decay = Math.exp(-distFromHull / 90);
      const offset =
        waveAmp > 0.05
          ? Math.sin(distFromHull * 0.09 - simState.timeS * 6.5) * waveAmp * decay
          : 0;
      const sy = waterY + offset;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();

    // 7. Deck cargo containers (Lab & Challenge modes)
    if (params.mode !== 'submarine' && params.containers > 0) {
      const cols = Math.max(6, Math.min(15, Math.floor((hullW - 14) / 14)));
      const containerW = (hullW - 14) / cols;
      const rows = Math.ceil(params.containers / cols);
      const maxStackPx = Math.max(24, deckY - topPad - 12);
      const containerH = Math.min(11, Math.max(4, maxStackPx / Math.max(rows, 1)));

      for (let i = 0; i < params.containers; i += 1) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cx = hullX + 7 + col * containerW;
        const cy = deckY - (row + 1) * containerH;
        if (cy < 4) break;
        ctx.fillStyle = (row + col) % 2 === 0 ? palette.containerA : palette.containerB;
        ctx.fillRect(cx + 0.5, cy + 0.5, containerW - 1, containerH - 1);
        ctx.strokeStyle = palette.containerStroke;
        ctx.lineWidth = 0.6;
        ctx.strokeRect(cx + 0.5, cy + 0.5, containerW - 1, containerH - 1);
      }
    }

    // 8. Box hull body
    ctx.fillStyle = palette.hullFill;
    ctx.fillRect(hullX, deckY, hullW, hullH);

    // Subtle structural steel bulkhead ribs
    ctx.strokeStyle = palette.hullRib;
    ctx.lineWidth = 1;
    const ribCount = Math.max(3, Math.round(hullW / 44));
    for (let r = 1; r < ribCount; r += 1) {
      const rx = hullX + (hullW * r) / ribCount;
      ctx.beginPath();
      ctx.moveTo(rx, deckY + 4);
      ctx.lineTo(rx, keelY - 2);
      ctx.stroke();
    }

    // Deck top plate
    ctx.fillStyle = palette.deckFill;
    ctx.fillRect(hullX - 2, deckY, hullW + 4, 4);

    // Submarine cutaway internal ballast tank & conning hatch
    if (params.mode === 'submarine') {
      const hatchW = Math.min(44, hullW * 0.22);
      const hatchH = Math.min(16, Math.max(10, hullH * 0.28));
      ctx.fillStyle = palette.deckFill;
      ctx.fillRect(hullX + hullW * 0.5 - hatchW * 0.5, deckY - hatchH, hatchW, hatchH);
      ctx.strokeStyle = palette.hullStroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hullX + hullW * 0.5 - hatchW * 0.5, deckY - hatchH, hatchW, hatchH);

      const padX = Math.max(20, hullW * 0.14);
      const padY = Math.max(6, hullH * 0.18);
      const chamberX = hullX + padX;
      const chamberY = deckY + padY;
      const chamberW = Math.max(48, hullW - padX * 2);
      const chamberH = Math.max(12, hullH - padY * 2);

      ctx.fillStyle = palette.ballastBg;
      ctx.fillRect(chamberX, chamberY, chamberW, chamberH);

      const fillH = chamberH * Math.max(0, Math.min(1, params.ballastFraction));
      ctx.fillStyle = palette.ballastFill;
      ctx.fillRect(chamberX, chamberY + chamberH - fillH, chamberW, fillH);

      ctx.strokeStyle = palette.hullStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(chamberX, chamberY, chamberW, chamberH);

      const ballastText = `BALLAST ${(params.ballastFraction * 100).toFixed(1)}%`;
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      const textW = ctx.measureText(ballastText).width;
      const tagW = Math.min(chamberW - 4, textW + 10);
      const tagH = 16;
      const tagX = chamberX + (chamberW - tagW) * 0.5;
      const tagY = chamberY + (chamberH - tagH) * 0.5;
      ctx.fillStyle = palette.labelBg;
      ctx.fillRect(tagX, tagY, tagW, tagH);

      ctx.fillStyle = palette.labelInk;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        ballastText,
        chamberX + chamberW * 0.5,
        chamberY + chamberH * 0.5 + 0.5,
      );
    }

    // Hull outer steel outline
    ctx.strokeStyle = palette.hullStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(hullX, deckY, hullW, hullH);

    // 9. Plimsoll load-line mark amidships on hull side (at loadLineM above keel)
    if (params.mode !== 'submarine') {
      const plimsollY = keelY - telemetry.loadLineM * pxPerM;
      const markX = hullX + hullW * 0.5;
      ctx.save();
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(markX, plimsollY, 5.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(markX - 11, plimsollY);
      ctx.lineTo(markX + 11, plimsollY);
      ctx.stroke();

      // Side calibration ticks on bow and stern hull edges
      ctx.beginPath();
      ctx.moveTo(hullX - 7, plimsollY);
      ctx.lineTo(hullX + 4, plimsollY);
      ctx.moveTo(hullX + hullW - 4, plimsollY);
      ctx.lineTo(hullX + hullW + 7, plimsollY);
      ctx.stroke();
      ctx.restore();
    }

    // Hull dimensions / cargo caption inside or below waterline cleanly
    ctx.fillStyle = palette.rulerMuted;
    ctx.font = '500 10.5px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const caption =
      params.mode === 'submarine'
        ? `HULL ${params.lengthM.toFixed(0)}m x ${params.beamM.toFixed(1)}m x ${params.heightM.toFixed(1)}m | M = ${telemetry.totalMassT.toFixed(0)} t`
        : `HULL ${params.lengthM.toFixed(0)}m x ${params.beamM.toFixed(1)}m x ${params.heightM.toFixed(1)}m | CARGO ${params.containers} x ${params.containerMassT} t`;
    ctx.fillText(caption, tankLeft + 10, 8);

    // 10. Scaled & labeled Force Vectors (F_b upward in Core 1, W downward in Accent)
    const refForce = Math.max(
      telemetry.maxDisplacementKg * params.gravity,
      telemetry.weightN,
      1,
    );
    const maxArrowPx = Math.min(115, usableH * 0.32);
    const fbLen = Math.min(maxArrowPx, (telemetry.buoyancyN / refForce) * maxArrowPx);
    const wLen = Math.min(maxArrowPx, (telemetry.weightN / refForce) * maxArrowPx);

    const hullCenterX = hullX + hullW * 0.5;
    const hullCenterY = deckY + hullH * 0.5;
    const fbAnchorX =
      params.mode === 'submarine'
        ? hullX + 8
        : hullCenterX - Math.max(24, Math.min(44, hullW * 0.25));
    const wAnchorX =
      params.mode === 'submarine'
        ? hullX + hullW - 8
        : hullCenterX + Math.max(24, Math.min(44, hullW * 0.25));

    // Buoyancy arrow F_b (upward, Core 1 Teal-Blue)
    const fbYStart = Math.min(seabedY - 8, Math.max(waterY, hullCenterY));
    const fbYEnd = Math.max(topPad + 16, fbYStart - fbLen);
    drawForceArrow(
      ctx,
      fbAnchorX,
      fbYStart,
      fbYEnd,
      palette.core1,
      `F_b ${formatForceShort(telemetry.buoyancyN)}`,
      'left',
      palette,
      tankLeft + 6,
      width - 6,
    );

    // Weight arrow W (downward, Accent Signal Crimson)
    const wYStart = Math.max(topPad + 16, hullCenterY);
    const wYEnd = Math.min(seabedY - 14, wYStart + wLen);
    drawForceArrow(
      ctx,
      wAnchorX,
      wYStart,
      wYEnd,
      palette.accent,
      `W ${formatForceShort(telemetry.weightN)}`,
      'right',
      palette,
      tankLeft + 6,
      width - 6,
    );

    ctx.restore();
  }, [params, simState, telemetry, theme, reducedMotion]);

  return (
    <div ref={wrapRef} className="tank-stage-wrap">
      <canvas
        ref={canvasRef}
        className="tank-canvas"
        role="img"
        aria-label={`Side-view hydrodynamic tank showing vessel at draft ${telemetry.draftM.toFixed(2)} meters, buoyancy ${formatForceShort(telemetry.buoyancyN)} upward, weight ${formatForceShort(telemetry.weightN)} downward, status ${telemetry.status}.`}
      />
    </div>
  );
}
