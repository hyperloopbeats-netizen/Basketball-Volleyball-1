import * as THREE from 'three';
import { CourtSurface } from '../../types';

/**
 * CourtFloorMatrixSystem
 * Dedicated non-clipping FIVB Taraflex / Hardwood / Sand / Cyber floor matrix:
 *  - Crisp aspect-correct 1024x2048 inner court canvas textures (distinct 3m attack zones,
 *    backcourt tone separation, subtle welded seams, micro-stipple & center court branding)
 *  - Matching 1024x1024 roughness/micro-grip map for authentic specular stadium reflections
 *  - Strictly ordered flat elevation layers & renderOrder with zero Z-fighting:
 *      y = -0.024 (renderOrder 0): Outer stadium deck
 *      y = -0.008 (renderOrder 0): 15m x 25m Free-Zone Apron
 *      y =  0.000 (renderOrder 0): 9m x 18m Playable Court
 *      y =  0.003 (renderOrder 1): Sentient flat kinetic ripple shader (via SentientGameMatrix)
 *      y =  0.007 (renderOrder 2): End-zone branded court decals
 *      y =  0.010 (renderOrder 2): Inlaid FIVB court lines + service & coach dashes
 *      y =  0.013 (renderOrder 3): MovementEngine sprite coordination plates
 */
export class CourtFloorMatrixSystem {
  public readonly root = new THREE.Group();
  public readonly courtMat: THREE.MeshStandardMaterial;
  public readonly surroundMat: THREE.MeshStandardMaterial;
  public readonly courtTextures: Record<CourtSurface, THREE.CanvasTexture>;
  public readonly surroundTextures: Record<CourtSurface, THREE.CanvasTexture>;

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly lineMat: THREE.MeshStandardMaterial;

  constructor(
    scene: THREE.Scene,
    maxAnisotropy: number,
    courtWidth = 9.0,
    courtLength = 18.0
  ) {
    this.root.name = 'CourtFloorMatrixGroup';
    scene.add(this.root);

    const makeTex = (
      width: number,
      height: number,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
      rx = 1,
      ry = 1,
      isLinear = false
    ) => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d')!;
      draw(ctx, width, height);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = isLinear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(rx, ry);
      tex.anisotropy = maxAnisotropy;
      this.disposables.push(tex);
      return tex;
    };

    // Shared micro-grip roughness map for subtle Taraflex / hardwood light sheen
    const gripRoughnessTex = makeTex(
      512,
      1024,
      (ctx, w, h) => {
        ctx.fillStyle = '#a8a8a8';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 6500; i++) {
          const px = (i * 193) % w;
          const py = (i * 431) % h;
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(60,60,60,0.14)';
          ctx.fillRect(px, py, 2, 2);
        }
        // Subtle front-zone polish band around attack zones
        ctx.fillStyle = 'rgba(215,215,215,0.16)';
        ctx.fillRect(0, h * (6 / 18), w, h * (6 / 18));
      },
      1,
      1,
      true
    );

    // 1. OLYMPIC_BLUE: Pro FIVB VNL Dual-Tone Taraflex (Rich royal backcourt + bright teal-azure 3m attack zone)
    const olympicCourt = makeTex(1024, 2048, (ctx, w, h) => {
      // Backcourt royal cobalt
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#13317a');
      bgGrad.addColorStop(0.5, '#193e99');
      bgGrad.addColorStop(1, '#13317a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Distinct 3m Attack Zone contrast (VNL championship Taraflex look)
      const atkTop = h * (6 / 18);
      const atkH = h * (6 / 18);
      const atkGrad = ctx.createLinearGradient(0, atkTop, 0, atkTop + atkH);
      atkGrad.addColorStop(0, '#0284c7');
      atkGrad.addColorStop(0.5, '#0ea5e9');
      atkGrad.addColorStop(1, '#0284c7');
      ctx.fillStyle = atkGrad;
      ctx.fillRect(0, atkTop, w, atkH);

      // Clean Taraflex roll weld seams
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Micro-stipple non-slip texture
      for (let i = 0; i < 6500; i++) {
        const px = (i * 251) % w;
        const py = (i * 523) % h;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(4,12,32,0.045)';
        ctx.fillRect(px, py, 2, 2);
      }

      // Subtle center court geometric ring
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 130, 0, Math.PI * 2);
      ctx.stroke();

      // Subtle watermark inside backcourt zones
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AIM VANCOUVER', w / 2, h * 0.17);
      ctx.translate(w / 2, h * 0.83);
      ctx.rotate(Math.PI);
      ctx.fillText('AIM VANCOUVER', 0, 0);
      ctx.restore();
    });

    const olympicSurround = makeTex(
      1024,
      1024,
      (ctx, w, h) => {
        const grad = ctx.createRadialGradient(w / 2, h / 2, 90, w / 2, h / 2, w * 0.72);
        grad.addColorStop(0, '#c2410c');
        grad.addColorStop(0.55, '#9a3412');
        grad.addColorStop(1, '#6c2710');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 2;
        for (let y = 0; y <= h; y += 128) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        for (let i = 0; i < 3200; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect((i * 313) % w, (i * 617) % h, 2, 2);
        }
      },
      3,
      5
    );

    // 2. HARDWOOD: Championship staggered maple parquet with stained front zone
    const hardwoodCourt = makeTex(1024, 2048, (ctx, w, h) => {
      ctx.fillStyle = '#c89256';
      ctx.fillRect(0, 0, w, h);
      const cols = 16;
      const plankW = w / cols;
      const atkTop = h * (6 / 18);
      const atkBot = h * (12 / 18);

      for (let col = 0; col < cols; col++) {
        const offset = (col % 2) * 128;
        for (let row = -1; row < 9; row++) {
          const py = row * 256 + offset;
          const inFrontZone = py + 128 > atkTop && py < atkBot;
          const tone = (col * 7 + row * 13) % 4;
          if (inFrontZone) {
            ctx.fillStyle =
              tone === 0 ? '#dfb176' : tone === 1 ? '#d4a366' : tone === 2 ? '#e2b77d' : '#cfa062';
          } else {
            ctx.fillStyle =
              tone === 0 ? '#b98249' : tone === 1 ? '#ad773f' : tone === 2 ? '#c28b50' : '#a46f38';
          }
          ctx.fillRect(col * plankW, py, plankW, 256);

          ctx.strokeStyle = 'rgba(78,42,14,0.12)';
          ctx.lineWidth = 1;
          for (let g = 1; g <= 4; g++) {
            const gx = col * plankW + (plankW * g) / 5;
            ctx.beginPath();
            ctx.moveTo(gx, py);
            ctx.lineTo(gx + Math.sin(row + g) * 2.5, py + 256);
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(58,30,10,0.24)';
          ctx.strokeRect(col * plankW, py, plankW, 256);
        }
      }
    });

    const hardwoodSurround = makeTex(
      1024,
      1024,
      (ctx, w, h) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(56,189,248,0.06)';
        ctx.lineWidth = 2;
        for (let x = 0; x <= w; x += 64) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y <= h; y += 64) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      },
      4,
      6
    );

    // 3. SAND: Sun-baked beach volleyball court with natural wind dunes
    const sandCourt = makeTex(1024, 2048, (ctx, w, h) => {
      ctx.fillStyle = '#dfbc7e';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        ctx.fillStyle = y % 32 === 0 ? 'rgba(255,246,220,0.14)' : 'rgba(150,108,52,0.10)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 64) {
          ctx.lineTo(x, y + Math.sin(x * 0.02 + y * 0.05) * 5);
        }
        ctx.lineTo(w, y + 12);
        ctx.lineTo(0, y + 12);
        ctx.closePath();
        ctx.fill();
      }
      for (let i = 0; i < 6000; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,244,214,0.12)' : 'rgba(116,80,36,0.1)';
        ctx.fillRect((i * 239) % w, (i * 577) % h, 2, 2);
      }
    });

    const sandSurround = makeTex(
      1024,
      1024,
      (ctx, w, h) => {
        ctx.fillStyle = '#c9a164';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 4000; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,243,210,0.12)' : 'rgba(120,86,42,0.10)';
          ctx.fillRect((i * 233) % w, (i * 571) % h, 3, 2);
        }
      },
      4,
      4
    );

    // 4. CYBER: Obsidian slate pro court with glowing cyan attack zones & coral edge trim
    const cyberCourt = makeTex(1024, 2048, (ctx, w, h) => {
      ctx.fillStyle = '#070b18';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0d1832';
      ctx.fillRect(0, h * (6 / 18), w, h * (6 / 18));

      ctx.strokeStyle = 'rgba(0,240,255,0.10)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,61,127,0.34)';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, w - 20, h - 20);
    });

    const cyberSurround = makeTex(
      1024,
      1024,
      (ctx, w, h) => {
        ctx.fillStyle = '#040610';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,61,127,0.08)';
        ctx.lineWidth = 2;
        for (let y = 0; y <= h; y += 128) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      },
      5,
      6
    );

    this.courtTextures = {
      OLYMPIC_BLUE: olympicCourt,
      HARDWOOD: hardwoodCourt,
      SAND: sandCourt,
      CYBER: cyberCourt,
    };
    this.surroundTextures = {
      OLYMPIC_BLUE: olympicSurround,
      HARDWOOD: hardwoodSurround,
      SAND: sandSurround,
      CYBER: cyberSurround,
    };

    // Inner Playable Court (9m x 18m)
    const courtGeo = new THREE.PlaneGeometry(courtWidth, courtLength);
    this.disposables.push(courtGeo);
    this.courtMat = new THREE.MeshStandardMaterial({
      map: this.courtTextures.OLYMPIC_BLUE,
      roughnessMap: gripRoughnessTex,
      color: 0xffffff,
      roughness: 0.48,
      metalness: 0.05,
    });
    this.disposables.push(this.courtMat);

    const courtMesh = new THREE.Mesh(courtGeo, this.courtMat);
    courtMesh.rotation.x = -Math.PI / 2;
    courtMesh.position.y = 0.0;
    courtMesh.renderOrder = 0;
    courtMesh.receiveShadow = true;
    this.root.add(courtMesh);

    // Pro Championship Free-Zone Apron (15m x 25m)
    const freeZoneGeo = new THREE.PlaneGeometry(15.0, 25.0);
    this.disposables.push(freeZoneGeo);
    this.surroundMat = new THREE.MeshStandardMaterial({
      map: this.surroundTextures.OLYMPIC_BLUE,
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.03,
    });
    this.disposables.push(this.surroundMat);

    const freeZoneMesh = new THREE.Mesh(freeZoneGeo, this.surroundMat);
    freeZoneMesh.rotation.x = -Math.PI / 2;
    freeZoneMesh.position.y = -0.016;
    freeZoneMesh.renderOrder = 0;
    freeZoneMesh.receiveShadow = true;
    this.root.add(freeZoneMesh);

    // Outer Stadium Concrete/Slate Deck (sized cleanly to the stadium footprint so it never overlaps outer city roads)
    const outerGeo = new THREE.PlaneGeometry(48, 54);
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x090d1a,
      roughness: 0.86,
      metalness: 0.06,
    });
    this.disposables.push(outerGeo, outerMat);
    const outerFloorMesh = new THREE.Mesh(outerGeo, outerMat);
    outerFloorMesh.rotation.x = -Math.PI / 2;
    outerFloorMesh.position.y = -0.036;
    outerFloorMesh.renderOrder = 0;
    outerFloorMesh.receiveShadow = true;
    this.root.add(outerFloorMesh);

    // Inlaid FIVB Boundary, Attack, Coach Dashed Extensions & Service Hash Lines (y = 0.014, renderOrder 2)
    this.lineMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.36,
      metalness: 0.04,
    });
    this.disposables.push(this.lineMat);

    const t = 0.058;
    const addLine = (w: number, l: number, x: number, z: number) => {
      const geo = new THREE.PlaneGeometry(w, l);
      this.disposables.push(geo);
      const m = new THREE.Mesh(geo, this.lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.014, z);
      m.renderOrder = 2;
      this.root.add(m);
    };

    addLine(courtWidth + t, t, 0, courtLength / 2);
    addLine(courtWidth + t, t, 0, -courtLength / 2);
    addLine(t, courtLength + t, -courtWidth / 2, 0);
    addLine(t, courtLength + t, courtWidth / 2, 0);
    addLine(courtWidth + t, t, 0, 3.0);
    addLine(courtWidth + t, t, 0, -3.0);
    addLine(courtWidth, 0.042, 0, 0);

    // FIVB 3m Coach Dashed Extension Marks
    for (const zAttack of [-3.0, 3.0]) {
      for (const side of [-1, 1]) {
        for (let d = 0; d < 5; d++) {
          const dashX = side * (courtWidth / 2 + 0.25 + d * 0.35);
          addLine(0.15, t, dashX, zAttack);
        }
      }
    }
    // FIVB Service Zone Hash Ticks
    for (const endZ of [-9.28, 9.28]) {
      for (const side of [-1, 1]) {
        addLine(t, 0.16, side * (courtWidth / 2), endZ);
      }
    }

    // Court End-Zone Branded Broadcast Wordmark Decals ("AIM VANCOUVER • BCCC")
    const ebTex = makeTex(512, 128, (ebCtx) => {
      ebCtx.clearRect(0, 0, 512, 128);
      ebCtx.fillStyle = 'rgba(255,255,255,0.78)';
      ebCtx.font = 'bold 40px sans-serif';
      ebCtx.textAlign = 'center';
      ebCtx.textBaseline = 'middle';
      ebCtx.fillText('AIM VANCOUVER • BCCC', 256, 64);
    });
    const ebMat = new THREE.MeshBasicMaterial({
      map: ebTex,
      transparent: true,
      depthWrite: false,
    });
    this.disposables.push(ebMat);

    for (const endZ of [-10.45, 10.45]) {
      const decalGeo = new THREE.PlaneGeometry(6.0, 1.35);
      this.disposables.push(decalGeo);
      const decal = new THREE.Mesh(decalGeo, ebMat);
      decal.rotation.x = -Math.PI / 2;
      if (endZ < 0) decal.rotation.z = Math.PI;
      decal.position.set(0, -0.006, endZ);
      decal.renderOrder = 2;
      this.root.add(decal);
    }
  }

  public applySurface(surface: CourtSurface, wetnessLevel: number): number {
    this.courtMat.map = this.courtTextures[surface];
    this.surroundMat.map = this.surroundTextures[surface];
    this.courtMat.color.setHex(0xffffff);
    this.surroundMat.color.setHex(0xffffff);
    this.courtMat.needsUpdate = true;
    this.surroundMat.needsUpdate = true;

    const baseRoughness =
      surface === 'HARDWOOD'
        ? 0.36
        : surface === 'OLYMPIC_BLUE'
        ? 0.48
        : surface === 'SAND'
        ? 0.92
        : 0.34;
    this.courtMat.roughness = THREE.MathUtils.lerp(baseRoughness, 0.12, wetnessLevel);
    return baseRoughness;
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.root.parent?.remove(this.root);
  }
}
