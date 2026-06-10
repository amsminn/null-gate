import * as THREE from 'three';

/**
 * All surface detail in Null Gate is generated on 2D canvases at boot.
 * No external images are loaded anywhere in the project.
 * Each tiling texture covers PANEL_TEX_METERS x PANEL_TEX_METERS of world space.
 */
export const PANEL_TEX_METERS = 2;

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finalize(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  // high anisotropy tames the glancing-angle shimmer on floor grids and
  // hazard stripes (three.js clamps to the GPU maximum)
  tex.anisotropy = 16;
  return tex;
}

/** Sprinkle subtle per-pixel speckle noise. */
function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${(Math.random() * alpha).toFixed(3)})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random(), 1 + Math.random());
  }
}

/** Faint directional scuff streaks for a worn-facility feel. */
function scuffs(ctx: CanvasRenderingContext2D, size: number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 20 + Math.random() * 90;
    const ang = Math.random() * Math.PI;
    ctx.strokeStyle = `rgba(20,22,24,${(Math.random() * alpha).toFixed(3)})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
}

/** Bright modular panels — the portal-compatible surface language. 2x2 panels per tile. */
export function panelTexture(): THREE.CanvasTexture {
  const S = 512;
  const [canvas, ctx] = makeCanvas(S);
  const P = S / 2; // one panel = 1m

  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const x = px * P, y = py * P;
      const j = Math.floor((Math.random() - 0.5) * 12);
      ctx.fillStyle = `rgb(${226 + j},${229 + j},${232 + j})`;
      ctx.fillRect(x, y, P, P);
      // bevel highlight (top/left) and shade (bottom/right)
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x + 3, y + 3, P - 6, 3);
      ctx.fillRect(x + 3, y + 3, 3, P - 6);
      ctx.fillStyle = 'rgba(40,46,52,0.22)';
      ctx.fillRect(x + 3, y + P - 6, P - 6, 3);
      ctx.fillRect(x + P - 6, y + 3, 3, P - 6);
      // corner fixings
      ctx.fillStyle = 'rgba(70,78,86,0.8)';
      for (const [ox, oy] of [[16, 16], [P - 16, 16], [16, P - 16], [P - 16, P - 16]]) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // seams between panels
  ctx.strokeStyle = '#54585d';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, S, S);
  ctx.beginPath();
  ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S);
  ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
  ctx.stroke();

  speckle(ctx, S, 1400, 0.05);
  scuffs(ctx, S, 7, 0.05);
  return finalize(canvas);
}

/** Dark mechanical plating — the non-portalable surface language. */
export function darkPanelTexture(): THREE.CanvasTexture {
  const S = 512;
  const [canvas, ctx] = makeCanvas(S);
  const P = S / 2;

  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const x = px * P, y = py * P;
      const j = Math.floor((Math.random() - 0.5) * 8);
      ctx.fillStyle = `rgb(${37 + j},${40 + j},${45 + j})`;
      ctx.fillRect(x, y, P, P);
      // brushed vertical streaks
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.035).toFixed(3)})`;
        ctx.fillRect(x + Math.random() * P, y + 4, 1, P - 8);
      }
      // rivets
      ctx.fillStyle = 'rgba(95,102,112,0.9)';
      for (const [ox, oy] of [[14, 14], [P - 14, 14], [14, P - 14], [P - 14, P - 14], [P / 2, 14], [P / 2, P - 14]]) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // recessed center detail
      ctx.strokeStyle = 'rgba(10,12,14,0.65)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 28, y + 28, P - 56, P - 56);
    }
  }
  ctx.strokeStyle = '#0c0e10';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, S, S);
  ctx.beginPath();
  ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S);
  ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
  ctx.stroke();

  speckle(ctx, S, 900, 0.05);
  return finalize(canvas);
}

/** Mid-gray utility floor with panel grid and grime blotches. */
export function floorTexture(): THREE.CanvasTexture {
  const S = 512;
  const [canvas, ctx] = makeCanvas(S);
  ctx.fillStyle = '#9aa0a6';
  ctx.fillRect(0, 0, S, S);

  // sub-grid of 1m plates
  ctx.strokeStyle = 'rgba(90,95,100,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, S, S);
  ctx.beginPath();
  ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S);
  ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
  ctx.stroke();

  // grime blotches
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 20 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(48,52,56,0.10)');
    g.addColorStop(1, 'rgba(48,52,56,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  speckle(ctx, S, 2200, 0.06);
  scuffs(ctx, S, 14, 0.08);
  return finalize(canvas);
}

/** Diagonal black/amber hazard stripes for pit edges and door aprons. */
export function stripeTexture(): THREE.CanvasTexture {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S);
  ctx.fillStyle = '#1a1c1e';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#d8a02c';
  const w = 32;
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(-Math.PI / 4);
  for (let x = -S * 1.5; x < S * 1.5; x += w * 2) {
    ctx.fillRect(x, -S, w, S * 2);
  }
  ctx.restore();
  speckle(ctx, S, 500, 0.08);
  return finalize(canvas);
}

/** Wall signage rendered with original typography — chamber number + designation. */
export function signTexture(lines: string[], accent = '#3ce0ff'): THREE.CanvasTexture {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#101316';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(160,190,205,0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  // accent bar
  ctx.fillStyle = accent;
  ctx.fillRect(24, 24, 10, H - 48);

  ctx.fillStyle = '#e8f4f9';
  ctx.textBaseline = 'middle';
  if (lines.length > 0) {
    ctx.font = '300 92px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(lines[0], 56, H * 0.36);
  }
  if (lines.length > 1) {
    ctx.fillStyle = '#8fa9b5';
    ctx.font = '500 30px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(lines[1].split('').join('  '), 58, H * 0.74);
  }
  // small ticks bottom-right
  ctx.fillStyle = accent;
  for (let i = 0; i < 4; i++) ctx.fillRect(W - 40 - i * 18, H - 40, 8, 14);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Slatted vent grille. */
export function ventTexture(): THREE.CanvasTexture {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S);
  ctx.fillStyle = '#16181b';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#2c3036';
  for (let y = 16; y < S - 8; y += 28) {
    ctx.fillRect(12, y, S - 24, 14);
    ctx.fillStyle = '#2c3036';
  }
  ctx.strokeStyle = '#3c4148';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, S - 8, S - 8);
  return finalize(canvas);
}
