import * as THREE from 'three';

export interface BasketballSkinMaps {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  dispose: () => void;
}

const IMAGE_PATH = '/assets/aistudio/IMG_5032_6d617a71.jpeg';

/**
 * BasketballBallSkin
 * Builds a cropped, spherically un-projected, and seamlessly extended 3-layer PBR skin
 * (Albedo sRGB + Pebbled/Channel Bump + Panel Roughness) from the attached
 * AIM "Ascend International Movement · Handcrafted Pro Series 2024" basketball photo.
 */
export function createAIMBasketballSkin(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): BasketballSkinMaps {
  const W = isSoftwareGl ? 1024 : 2048;
  const H = isSoftwareGl ? 512 : 1024;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = W;
  albedoCanvas.height = H;
  const actx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = W;
  bumpCanvas.height = H;
  const bctx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = W;
  roughCanvas.height = H;
  const rctx = roughCanvas.getContext('2d')!;

  // Draw base procedural AIM Pro Series extended architecture immediately (frame-0 ready)
  paintExtendedBaseLayers(actx, bctx, rctx, W, H);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = maxAniso;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.anisotropy = maxAniso;
  bumpMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.anisotropy = maxAniso;
  roughnessMap.needsUpdate = true;

  let disposed = false;

  // Async load the attached AIM Pro Series photograph, crop strictly inside the ball's
  // sphere silhouette, spherically un-project onto front & back hemispheres, and blend cleanly.
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (disposed || img.naturalWidth === 0 || img.naturalHeight === 0) return;
    try {
      compositeCroppedPhotoOntoEquirectangular(actx, bctx, rctx, img, W, H);
      map.needsUpdate = true;
      bumpMap.needsUpdate = true;
      roughnessMap.needsUpdate = true;
    } catch {
      // Retain crisp procedural AIM Pro Series fallback if canvas readback is blocked
    }
  };
  img.src = IMAGE_PATH;

  return {
    map,
    bumpMap,
    roughnessMap,
    dispose: () => {
      disposed = true;
      map.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Paints the seamlessly extended AIM Pro Series 2024 charcoal pebbled leather,
 * burnt-orange beveled ribs, white geometric chevrons, and crest panels across full 360° UV space.
 */
function paintExtendedBaseLayers(
  actx: CanvasRenderingContext2D,
  bctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  W: number,
  H: number
) {
  // 1. Matte Charcoal Composite Leather Base
  actx.fillStyle = '#1b1d22';
  actx.fillRect(0, 0, W, H);

  bctx.fillStyle = '#868686';
  bctx.fillRect(0, 0, W, H);

  rctx.fillStyle = '#a8a8a8'; // ~0.66 leather roughness
  rctx.fillRect(0, 0, W, H);

  // Subtle tonal panel variation + pebbled micro-grain (deterministic hash for speed & crispness)
  const pebbleCount = Math.round((W * H) / 72);
  for (let i = 0; i < pebbleCount; i++) {
    const h1 = ((i * 73856093) ^ (i * 19349663)) >>> 0;
    const h2 = ((i * 83492791) ^ (i * 2971215073)) >>> 0;
    const x = (h1 % W);
    const y = (h2 % H);
    const r = 1.2 + ((h1 >> 8) % 3) * 0.55;
    const bright = (h2 >> 10) & 1;

    actx.fillStyle = bright ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.22)';
    actx.beginPath();
    actx.arc(x, y, r, 0, Math.PI * 2);
    actx.fill();

    bctx.fillStyle = bright ? 'rgba(235,235,235,0.28)' : 'rgba(55,55,55,0.28)';
    bctx.beginPath();
    bctx.arc(x, y, r, 0, Math.PI * 2);
    bctx.fill();
  }

  // 2. Extended Seam Rib & Chevron Architecture across all 4 quadrants
  const drawSeam = (fn: (ctx: CanvasRenderingContext2D) => void) => {
    // Black deep channel groove
    actx.strokeStyle = '#0c0d10';
    actx.lineWidth = Math.round(W * 0.011);
    actx.beginPath();
    fn(actx);
    actx.stroke();

    bctx.strokeStyle = '#202020';
    bctx.lineWidth = Math.round(W * 0.012);
    bctx.beginPath();
    fn(bctx);
    bctx.stroke();

    // Vibrant AIM Burnt-Orange Piping Rib
    actx.strokeStyle = '#ea5815';
    actx.lineWidth = Math.round(W * 0.0055);
    actx.beginPath();
    fn(actx);
    actx.stroke();

    bctx.strokeStyle = '#d4d4d4';
    bctx.lineWidth = Math.round(W * 0.0048);
    bctx.beginPath();
    fn(bctx);
    bctx.stroke();

    rctx.strokeStyle = '#6c6c6c'; // semi-satin piping
    rctx.lineWidth = Math.round(W * 0.006);
    rctx.beginPath();
    fn(rctx);
    rctx.stroke();
  };

  // Equatorial + meridian interlocking geometric channels
  drawSeam((c) => {
    c.moveTo(0, H * 0.5);
    c.lineTo(W, H * 0.5);
  });
  for (let k = 0; k < 4; k++) {
    const cx = W * (0.125 + k * 0.25);
    drawSeam((c) => {
      c.moveTo(cx, 0);
      c.lineTo(cx, H);
    });
    // Angled faceted hexagon arcs matching the soccer-basketball hybrid seam design
    drawSeam((c) => {
      c.moveTo(cx - W * 0.125, H * 0.24);
      c.quadraticCurveTo(cx, H * 0.12, cx + W * 0.125, H * 0.24);
      c.moveTo(cx - W * 0.125, H * 0.76);
      c.quadraticCurveTo(cx, H * 0.88, cx + W * 0.125, H * 0.76);
    });
    // Silver-white secondary chevron stripes
    actx.strokeStyle = '#e5e7eb';
    actx.lineWidth = Math.round(W * 0.0024);
    actx.beginPath();
    actx.moveTo(cx - W * 0.085, H * 0.31);
    actx.lineTo(cx, H * 0.19);
    actx.lineTo(cx + W * 0.085, H * 0.31);
    actx.moveTo(cx - W * 0.085, H * 0.69);
    actx.lineTo(cx, H * 0.81);
    actx.lineTo(cx + W * 0.085, H * 0.69);
    actx.stroke();
  }

  // Front & Back Hexagonal Hero Crest Panels (lon = 0 at u=0.5, lon = 180 at u=0/1)
  drawHeroCrestPanel(actx, bctx, rctx, W * 0.5, H * 0.5, W, H);
  drawHeroCrestPanel(actx, bctx, rctx, 0, H * 0.5, W, H);
  drawHeroCrestPanel(actx, bctx, rctx, W, H * 0.5, W, H);
}

function drawHeroCrestPanel(
  actx: CanvasRenderingContext2D,
  bctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  W: number,
  H: number
) {
  const pw = W * 0.165;
  const ph = H * 0.24;

  const traceShield = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.moveTo(cx - pw, cy);
    ctx.lineTo(cx - pw * 0.62, cy - ph);
    ctx.lineTo(cx + pw * 0.62, cy - ph);
    ctx.lineTo(cx + pw, cy);
    ctx.lineTo(cx + pw * 0.62, cy + ph);
    ctx.lineTo(cx - pw * 0.62, cy + ph);
    ctx.closePath();
  };

  // White matte-satin panel fill
  traceShield(actx);
  actx.fillStyle = '#f1f3f5';
  actx.fill();
  actx.lineWidth = Math.round(W * 0.008);
  actx.strokeStyle = '#111216';
  actx.stroke();

  traceShield(actx);
  actx.lineWidth = Math.round(W * 0.0038);
  actx.strokeStyle = '#ea5815';
  actx.stroke();

  traceShield(bctx);
  bctx.fillStyle = '#9c9c9c';
  bctx.fill();
  bctx.lineWidth = Math.round(W * 0.008);
  bctx.strokeStyle = '#242424';
  bctx.stroke();

  traceShield(rctx);
  rctx.fillStyle = '#5e5e5e'; // smooth leather panel ~0.37 roughness
  rctx.fill();

  // Sharp vector fallback AIM branding (overlaid with crisp cropped photo once loaded)
  actx.save();
  actx.textAlign = 'center';
  actx.textBaseline = 'middle';
  actx.font = `900 ${Math.round(H * 0.088)}px sans-serif`;
  actx.fillStyle = '#18191e';
  actx.fillText('AI', cx - W * 0.028, cy - H * 0.015);
  actx.fillStyle = '#ea5815';
  actx.fillText('M', cx + W * 0.038, cy - H * 0.015);

  actx.font = `700 ${Math.round(H * 0.019)}px sans-serif`;
  actx.fillStyle = '#18191e';
  actx.fillText('ASCEND INTERNATIONAL MOVEMENT', cx, cy + ph * 0.42);
  actx.font = `600 ${Math.round(H * 0.015)}px sans-serif`;
  actx.fillText('HANDCRAFTED . PRO SERIES . 2024', cx, cy + ph * 0.62);
  actx.restore();
}

/**
 * Crops strictly inside the basketball sphere silhouette in IMG_5032_6d617a71.jpeg,
 * un-projects from 2D orthographic disc to spherical equirectangular coordinates (front + back),
 * and layers cleanly over the extended seam base + synced bump/roughness channels.
 */
function compositeCroppedPhotoOntoEquirectangular(
  actx: CanvasRenderingContext2D,
  bctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number
) {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const sctx = srcCanvas.getContext('2d')!;
  sctx.drawImage(img, 0, 0);
  const srcData = sctx.getImageData(0, 0, srcW, srcH).data;

  const dstImg = actx.getImageData(0, 0, W, H);
  const dst = dstImg.data;
  const bumpImg = bctx.getImageData(0, 0, W, H);
  const bump = bumpImg.data;
  const roughImg = rctx.getImageData(0, 0, W, H);
  const rough = roughImg.data;

  // Measured sphere silhouette bounds in IMG_5032_6d617a71.jpeg (1408x768)
  const cx = srcW * 0.5005;
  const cy = srcH * 0.5028;
  const sphereRadPx = srcH * 0.349; // strictly inside ball perimeter (zero gym background bleed)

  const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

  for (let py = 0; py < H; py++) {
    const v = 0.5 - (py + 0.5) / H; // +0.5 north pole .. -0.5 south pole
    const lat = v * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);

    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / W; // 0..1 around equator; u=0.5 is front center (lon=0)
      const lon = (u - 0.5) * Math.PI * 2;
      const sx = cosLat * Math.sin(lon);
      const sy = sinLat;
      const sz = cosLat * Math.cos(lon);

      // Wrap cropped front hemisphere symmetrically onto both front (+Z) & back (-Z) faces
      const frontFacing = Math.abs(sz);
      if (frontFacing <= 0.24) continue;

      // Feather blend cleanly into the extended side/polar seam architecture (no hard cut edges)
      const t = Math.min(1, Math.max(0, (frontFacing - 0.24) / 0.34));
      const blend = t * t * (3 - 2 * t);

      // Inverse spherical radial un-warp so panels look uniform across the 3D sphere
      const r2d = Math.hypot(sx, sy);
      const scaleFix = r2d > 0.0001 ? Math.asin(Math.min(0.999, r2d)) / ((Math.PI * 0.5) * r2d) : 1;
      const projX = sx * (0.35 + 0.65 * scaleFix);
      const projY = sy * (0.35 + 0.65 * scaleFix);

      // Exclude tiny floor-bounce specular hotspot at very bottom contact point of photo
      if (projY < -0.78) continue;
      const topBottomFade = projY < -0.62 ? Math.max(0, (projY + 0.78) / 0.16) : 1;
      const wBlend = blend * topBottomFade;
      if (wBlend <= 0.01) continue;

      const sampleX = cx + projX * sphereRadPx;
      const sampleY = cy - projY * sphereRadPx;

      const x0 = Math.floor(sampleX);
      const y0 = Math.floor(sampleY);
      if (x0 < 1 || y0 < 1 || x0 >= srcW - 2 || y0 >= srcH - 2) continue;
      const fx = sampleX - x0;
      const fy = sampleY - y0;

      const idx00 = (y0 * srcW + x0) * 4;
      const idx10 = idx00 + 4;
      const idx01 = idx00 + srcW * 4;
      const idx11 = idx01 + 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const sr = srcData[idx00] * w00 + srcData[idx10] * w10 + srcData[idx01] * w01 + srcData[idx11] * w11;
      const sg = srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11;
      const sb = srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11;

      // Subtle lighting flattening around rim of photo so 3D arena directional/rim lights shade it naturally
      const rimComp = 1 + (1 - frontFacing) * 0.16;
      const cr = clampByte(sr * rimComp);
      const cg = clampByte(sg * rimComp);
      const cb = clampByte(sb * rimComp);

      const dIdx = (py * W + px) * 4;
      dst[dIdx] = clampByte(dst[dIdx] * (1 - wBlend) + cr * wBlend);
      dst[dIdx + 1] = clampByte(dst[dIdx + 1] * (1 - wBlend) + cg * wBlend);
      dst[dIdx + 2] = clampByte(dst[dIdx + 2] * (1 - wBlend) + cb * wBlend);
      dst[dIdx + 3] = 255;

      // Derive micro-bump & satin/matte roughness layer from cropped leather/panel luminance
      const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
      const isWhitePanel = lum > 175 && Math.abs(cr - cb) < 28;
      const isOrangeRib = cr > 165 && cg > 55 && cg < 145 && cb < 65;
      const targetBump = isOrangeRib ? 205 : isWhitePanel ? 154 : Math.max(40, 95 + lum * 0.45);
      const targetRough = isWhitePanel ? 94 : isOrangeRib ? 108 : 168;

      const bVal = clampByte(bump[dIdx] * (1 - wBlend) + targetBump * wBlend);
      bump[dIdx] = bVal;
      bump[dIdx + 1] = bVal;
      bump[dIdx + 2] = bVal;

      const rVal = clampByte(rough[dIdx] * (1 - wBlend) + targetRough * wBlend);
      rough[dIdx] = rVal;
      rough[dIdx + 1] = rVal;
      rough[dIdx + 2] = rVal;
    }
  }

  actx.putImageData(dstImg, 0, 0);
  bctx.putImageData(bumpImg, 0, 0);
  rctx.putImageData(roughImg, 0, 0);
}
