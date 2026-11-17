import * as THREE from 'three';
import { CourtSurface } from '../types';

export const COURT_W = 15.0; // Regulation FIBA 3x3 width (-7.5 to +7.5)
export const COURT_D = 11.0; // Regulation FIBA 3x3 half-court depth (-5.5 baseline to +5.5 top)
export const HOOP_POS = new THREE.Vector3(0, 3.05, -4.3);
export const BACKBOARD_Z = -4.52;
export const ARC_RADIUS = 6.75; // 2-pt arc in 3x3
export const RIM_RADIUS = 0.235;
export const RIM_TUBE_RADIUS = 0.018;

/**
 * BasketballCourtSystem
 * Volleyball-grade layered Taraflex / Maple Hardwood / Cyber / Venice court floor,
 * outer stadium concrete deck, AIM Vancouver LED sponsor barriers, corner beacons,
 * optical tempered-glass backboard with buzzer LED strip, breakaway spring rim,
 * and real-time ball-coupled diamond-braided nylon net.
 */
export class BasketballCourtSystem {
  public readonly courtGroup = new THREE.Group();
  public membraneMat: THREE.ShaderMaterial;
  public rimGroup!: THREE.Group;
  public rimMesh!: THREE.Mesh;
  public netMesh!: THREE.Mesh;
  public netOrigPositions!: Float32Array;
  public readonly reactiveLightPillars: THREE.Mesh[] = [];

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private courtMat: THREE.MeshStandardMaterial;
  private apronMat: THREE.MeshStandardMaterial;
  private lineMat: THREE.MeshStandardMaterial;
  private arcLineMat: THREE.MeshStandardMaterial;

  private courtTextures: Record<CourtSurface, THREE.CanvasTexture>;
  private apronTextures: Record<CourtSurface, THREE.CanvasTexture>;
  private trimTealMat: THREE.MeshBasicMaterial;
  private trimCoralMat: THREE.MeshBasicMaterial;

  private shotClockCanvas: HTMLCanvasElement;
  private shotClockCtx: CanvasRenderingContext2D;
  private shotClockTex: THREE.CanvasTexture;
  private backboardSquareMat: THREE.MeshBasicMaterial;
  private buzzerLedMat: THREE.MeshBasicMaterial;

  private netWhipTime = -1;
  private netWhipStrength = 1.0;
  private netWhipDirX = 0;
  private netWhipDirZ = 0;
  private rimBendAmount = 0;
  private rimRattlePhase = 0;
  private rimRattleAmp = 0;
  private buzzerFlashTimer = 0;
  private glassFlashTimer = 0;
  private backboardGlassMat!: THREE.MeshPhysicalMaterial;

  private isSoftwareGl: boolean;

  constructor(private scene: THREE.Scene, private maxAniso: number, isSoftwareGl = false) {
    this.isSoftwareGl = isSoftwareGl;
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
      tex.anisotropy = this.maxAniso;
      this.disposables.push(tex);
      return tex;
    };

    // Shared linear micro-grip roughness map for authentic Taraflex & maple specular sheen
    const gripRoughnessTex = makeTex(
      512,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = '#a4a4a4';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 6500; i++) {
          const px = (i * 193) % w;
          const py = (i * 431) % h;
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(55,55,55,0.14)';
          ctx.fillRect(px, py, 2, 2);
        }
        // Subtle polished key lane specular highlight
        ctx.fillStyle = 'rgba(220,220,220,0.18)';
        ctx.fillRect(w * 0.34, 0, w * 0.32, h * 0.54);
      },
      1,
      1,
      true
    );

    this.courtTextures = {
      OLYMPIC_BLUE: this.generateCourtTexture('OLYMPIC_BLUE', makeTex),
      HARDWOOD: this.generateCourtTexture('HARDWOOD', makeTex),
      SAND: this.generateCourtTexture('SAND', makeTex),
      CYBER: this.generateCourtTexture('CYBER', makeTex),
    };
    this.apronTextures = {
      OLYMPIC_BLUE: this.generateApronTexture('OLYMPIC_BLUE', makeTex),
      HARDWOOD: this.generateApronTexture('HARDWOOD', makeTex),
      SAND: this.generateApronTexture('SAND', makeTex),
      CYBER: this.generateApronTexture('CYBER', makeTex),
    };

    this.courtMat = new THREE.MeshStandardMaterial({
      map: this.courtTextures.OLYMPIC_BLUE,
      roughnessMap: gripRoughnessTex,
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.05,
    });
    this.apronMat = new THREE.MeshStandardMaterial({
      map: this.apronTextures.OLYMPIC_BLUE,
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.04,
    });
    this.lineMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.34,
      metalness: 0.04,
    });
    this.arcLineMat = new THREE.MeshStandardMaterial({
      color: 0xffb347,
      emissive: 0xff8c1a,
      emissiveIntensity: 0.14,
      roughness: 0.32,
    });

    this.trimTealMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.trimCoralMat = new THREE.MeshBasicMaterial({ color: 0xff3d7f });
    this.backboardSquareMat = new THREE.MeshBasicMaterial({ color: 0xff6b1a });
    this.buzzerLedMat = new THREE.MeshBasicMaterial({ color: 0xff1e42 });

    this.disposables.push(
      this.courtMat,
      this.apronMat,
      this.lineMat,
      this.arcLineMat,
      this.trimTealMat,
      this.trimCoralMat,
      this.backboardSquareMat,
      this.buzzerLedMat
    );

    this.shotClockCanvas = document.createElement('canvas');
    this.shotClockCanvas.width = 256;
    this.shotClockCanvas.height = 128;
    this.shotClockCtx = this.shotClockCanvas.getContext('2d')!;
    this.shotClockTex = new THREE.CanvasTexture(this.shotClockCanvas);
    this.shotClockTex.colorSpace = THREE.SRGBColorSpace;
    this.shotClockTex.anisotropy = maxAniso;
    this.disposables.push(this.shotClockTex);

    // Silky flat sub-surface kinetic ripple layer (matches Volleyball's crisp zero-clipping SentientGameMatrix)
    this.membraneMat = this.createFlatBasketballMembraneMaterial();
    this.disposables.push(this.membraneMat);

    this.buildCourtFloor(makeTex);
    this.buildSponsorBarriersAndBeacons(makeTex);
    this.buildHoopAssembly();
    this.scene.add(this.courtGroup);
    this.updateShotClockBoard(12.0, 0, 0, true);
  }

  private createFlatBasketballMembraneMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTouchPos: { value: new THREE.Vector2(0.5, 0.5) },
        uTouchTime: { value: -10.0 },
        uBassAmp: { value: 0.0 },
        uRippleStrength: { value: 0.0 },
        uOpacity: { value: 0.11 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mvPos.xyz;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec2 uTouchPos;
        uniform float uTouchTime;
        uniform float uBassAmp;
        uniform float uRippleStrength;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vViewPos;

        void main() {
          vec3 bioCyan = vec3(0.04, 0.88, 0.96);
          vec3 bioTeal = vec3(0.04, 0.62, 0.72);
          vec3 bioCoral = vec3(0.96, 0.25, 0.54);

          vec3 viewDir = normalize(vViewPos);
          float fresnel = pow(1.0 - max(0.0, abs(viewDir.z)), 2.8);

          float wave = 0.5 + 0.5 * sin(vUv.x * 10.0 + uTime * 1.4) * cos(vUv.y * 10.0 - uTime * 1.1);
          float diagFlow = smoothstep(0.76, 0.98, sin((vUv.x * 6.0 + vUv.y * 8.0) - uTime * 1.7));

          vec2 edgeDist = min(vUv, 1.0 - vUv);
          float borderGlow = smoothstep(0.036, 0.0, min(edgeDist.x, edgeDist.y));

          // Aspect-corrected radial bounce shockwave ripple
          float distToTouch = distance(vec2(vUv.x * 1.36, vUv.y), vec2(uTouchPos.x * 1.36, uTouchPos.y));
          float age = max(0.0, uTime - uTouchTime);
          float ring = 0.0;
          if (age < 1.35) {
            float radius = age * 0.38;
            ring = smoothstep(0.035, 0.0, abs(distToTouch - radius)) * exp(-age * 2.4);
          }

          vec3 baseCol = mix(bioTeal, bioCyan, wave * 0.55 + diagFlow * 0.45);
          vec3 sideTint = mix(bioCoral, bioCyan, step(0.45, vUv.y));
          vec3 finalColor = mix(baseCol * 0.35, sideTint * 0.9, clamp(borderGlow * 0.75, 0.0, 1.0));
          finalColor += bioCyan * ring * (1.2 + uRippleStrength * 0.75 + uBassAmp * 0.4);
          finalColor += bioTeal * fresnel * 0.12;

          float alpha = clamp(
            uOpacity * (0.16 + diagFlow * 0.14 + borderGlow * 0.5)
            + ring * 0.40
            + fresnel * 0.04,
            0.0,
            0.32
          );
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }

  private generateCourtTexture(
    surface: CourtSurface,
    makeTex: (
      w: number,
      h: number,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
    ) => THREE.CanvasTexture
  ): THREE.CanvasTexture {
    return makeTex(1024, 768, (ctx, w, h) => {
      const wx = (x: number) => ((x + COURT_W / 2) / COURT_W) * w;
      const wz = (z: number) => ((z + COURT_D / 2) / COURT_D) * h;
      const pxPerM_X = w / COURT_W;
      const pxPerM_Z = h / COURT_D;

      if (surface === 'SAND') {
        ctx.fillStyle = '#dfbc7e';
        ctx.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 16) {
          ctx.fillStyle = y % 32 === 0 ? 'rgba(255,246,220,0.14)' : 'rgba(150,108,52,0.10)';
          ctx.fillRect(0, y, w, 10);
        }
        for (let i = 0; i < 4500; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,244,214,0.1)' : 'rgba(116,80,36,0.09)';
          ctx.fillRect((i * 239) % w, (i * 577) % h, 2, 2);
        }
      } else if (surface === 'HARDWOOD') {
        // Staggered championship maple planks
        ctx.fillStyle = '#c89256';
        ctx.fillRect(0, 0, w, h);
        const cols = 20;
        const plankW = w / cols;
        for (let col = 0; col < cols; col++) {
          const offset = (col % 2) * 96;
          for (let row = -1; row < 6; row++) {
            const py = row * 192 + offset;
            const tone = (col * 7 + row * 13) % 4;
            ctx.fillStyle =
              tone === 0 ? '#dfb176' : tone === 1 ? '#d09b5b' : tone === 2 ? '#e2b77d' : '#c18a4e';
            ctx.fillRect(col * plankW, py, plankW, 192);
            ctx.strokeStyle = 'rgba(78,42,14,0.12)';
            ctx.lineWidth = 1;
            for (let g = 1; g <= 3; g++) {
              const gx = col * plankW + (plankW * g) / 4;
              ctx.beginPath();
              ctx.moveTo(gx, py);
              ctx.lineTo(gx + Math.sin(row + g) * 2, py + 192);
              ctx.stroke();
            }
            ctx.strokeStyle = 'rgba(58,30,10,0.22)';
            ctx.strokeRect(col * plankW, py, plankW, 192);
          }
        }
      } else if (surface === 'CYBER') {
        ctx.fillStyle = '#070b18';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
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
      } else {
        // OLYMPIC_BLUE: Pro FIVB-style dual-tone royal cobalt exterior + bright azure inside-arc contrast!
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#13317a');
        bgGrad.addColorStop(0.55, '#193e99');
        bgGrad.addColorStop(1, '#13317a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Two-point arc interior azure fill (vibrant VNL sky-cyan tone!)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(wx(-6.6), wz(-5.5));
        ctx.lineTo(wx(-6.6), wz(-2.9));
        ctx.ellipse(wx(0), wz(-4.3), ARC_RADIUS * pxPerM_X, ARC_RADIUS * pxPerM_Z, 0, Math.PI * 0.93, Math.PI * 0.07, true);
        ctx.lineTo(wx(6.6), wz(-5.5));
        ctx.closePath();
        const arcGrad = ctx.createRadialGradient(wx(0), wz(-4.3), 40, wx(0), wz(-2.2), 420);
        arcGrad.addColorStop(0, '#0ea5e9');
        arcGrad.addColorStop(0.75, '#0284c7');
        arcGrad.addColorStop(1, '#0369a1');
        ctx.fillStyle = arcGrad;
        ctx.fill();
        ctx.restore();

        // Roll weld seams & non-slip micro-stipple
        ctx.strokeStyle = 'rgba(255,255,255,0.045)';
        ctx.lineWidth = 2;
        for (let x = 0; x <= w; x += 128) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let i = 0; i < 5200; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(4,12,32,0.04)';
          ctx.fillRect((i * 251) % w, (i * 523) % h, 2, 2);
        }
      }

      // Painted Key / Lane (width 4.9m, z = -5.5 .. +0.3)
      const keyLeft = wx(-2.45);
      const keyRight = wx(2.45);
      const keyTop = wz(-5.5);
      const keyBot = wz(0.3);
      ctx.fillStyle =
        surface === 'CYBER'
          ? 'rgba(255, 61, 127, 0.32)'
          : surface === 'HARDWOOD'
          ? 'rgba(14, 116, 144, 0.88)'
          : surface === 'SAND'
          ? 'rgba(194, 65, 12, 0.55)'
          : '#e11d48';
      ctx.fillRect(keyLeft, keyTop, keyRight - keyLeft, keyBot - keyTop);

      // Subtle painted key hash stripes
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(keyLeft, keyTop, 10, keyBot - keyTop);
      ctx.fillRect(keyRight - 10, keyTop, 10, keyBot - keyTop);

      // Center Key Monogram ("AIM 3X3" + "VANCOUVER")
      ctx.save();
      ctx.translate(wx(0), wz(-2.4));
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.font = '900 58px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AIM 3X3', 0, -14);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillText('COAL HARBOUR', 0, 26);
      ctx.restore();

      // Subtle outer watermark outside the key
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AIM VANCOUVER', wx(0), wz(4.35));
      ctx.restore();
    });
  }

  private generateApronTexture(
    surface: CourtSurface,
    makeTex: (
      w: number,
      h: number,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
      rx?: number,
      ry?: number
    ) => THREE.CanvasTexture
  ): THREE.CanvasTexture {
    if (surface === 'OLYMPIC_BLUE') {
      return makeTex(
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
        },
        3,
        3
      );
    }
    if (surface === 'HARDWOOD') {
      return makeTex(
        512,
        512,
        (ctx, w, h) => {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(56,189,248,0.07)';
          ctx.lineWidth = 2;
          for (let i = 0; i <= w; i += 64) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(w, i);
            ctx.stroke();
          }
        },
        4,
        4
      );
    }
    if (surface === 'SAND') {
      return makeTex(
        512,
        512,
        (ctx, w, h) => {
          ctx.fillStyle = '#c9a164';
          ctx.fillRect(0, 0, w, h);
          for (let i = 0; i < 3500; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(255,243,210,0.12)' : 'rgba(120,86,42,0.10)';
            ctx.fillRect((i * 233) % w, (i * 571) % h, 3, 2);
          }
        },
        4,
        4
      );
    }
    return makeTex(
      512,
      512,
      (ctx, w, h) => {
        ctx.fillStyle = '#040610';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,61,127,0.09)';
        ctx.lineWidth = 2;
        for (let y = 0; y <= h; y += 64) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      },
      4,
      4
    );
  }

  private buildCourtFloor(
    makeTex: (
      w: number,
      h: number,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
    ) => THREE.CanvasTexture
  ) {
    // 1. Outer Stadium Concrete/Slate Deck (y = -0.036, seals entire arena footprint so ocean never clips)
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
    this.courtGroup.add(outerFloorMesh);

    // 2. Surrounding Pro Free-Zone Apron (21.6m x 17.6m at y = -0.016)
    const apronGeo = new THREE.PlaneGeometry(21.6, 17.6);
    this.disposables.push(apronGeo);
    const apron = new THREE.Mesh(apronGeo, this.apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.016, 0);
    apron.renderOrder = 0;
    apron.receiveShadow = true;
    this.courtGroup.add(apron);

    // 3. Main FIBA 3x3 Half-Court Surface (15m x 11m at y = 0.0)
    const floorGeo = new THREE.PlaneGeometry(COURT_W, COURT_D);
    this.disposables.push(floorGeo);
    const floor = new THREE.Mesh(floorGeo, this.courtMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.0, 0);
    floor.renderOrder = 0;
    floor.receiveShadow = true;
    this.courtGroup.add(floor);

    // 4. Flat Sub-Surface Kinetic Ripple Membrane (y = 0.005, renderOrder 1, strictly below lines)
    const bioGeo = new THREE.PlaneGeometry(COURT_W, COURT_D, 1, 1);
    this.disposables.push(bioGeo);
    const bioSheet = new THREE.Mesh(bioGeo, this.membraneMat);
    bioSheet.rotation.x = -Math.PI / 2;
    bioSheet.position.set(0, 0.005, 0);
    bioSheet.renderOrder = 1;
    this.courtGroup.add(bioSheet);

    // 5. Crisp 3D Inlaid Court Lines (y = 0.012, renderOrder 2 — zero texture blur!)
    const t = 0.055;
    const addLine = (w: number, l: number, x: number, z: number, mat: THREE.Material = this.lineMat) => {
      const geo = new THREE.PlaneGeometry(w, l);
      this.disposables.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      m.renderOrder = 2;
      this.courtGroup.add(m);
    };

    // Outer Court Boundary (15m x 11m)
    addLine(COURT_W + t, t, 0, COURT_D / 2);
    addLine(COURT_W + t, t, 0, -COURT_D / 2);
    addLine(t, COURT_D + t, -COURT_W / 2, 0);
    addLine(t, COURT_D + t, COURT_W / 2, 0);

    // Painted Key Borders (4.9m wide: -2.45..+2.45, z = -5.5..+0.3)
    addLine(t, 5.8 + t, -2.45, -2.6);
    addLine(t, 5.8 + t, 2.45, -2.6);
    addLine(4.9 + t, t, 0, 0.3);

    // Free Throw Hash Ticks
    for (const side of [-1, 1]) {
      for (const hz of [-3.6, -2.75, -1.9, -1.05]) {
        addLine(0.16, 0.055, side * 2.53, hz);
      }
    }

    // Free-Throw Circle (radius 1.8m centered at (0, 0.3))
    const ftGeo = new THREE.RingGeometry(1.77, 1.825, 48);
    this.disposables.push(ftGeo);
    const ftRing = new THREE.Mesh(ftGeo, this.lineMat);
    ftRing.rotation.x = -Math.PI / 2;
    ftRing.position.set(0, 0.012, 0.3);
    ftRing.renderOrder = 2;
    this.courtGroup.add(ftRing);

    // Restricted Area Semicircle (radius 1.25m centered at HOOP_POS (0, -4.3))
    const raGeo = new THREE.RingGeometry(1.225, 1.28, 36, 1, 0, Math.PI);
    this.disposables.push(raGeo);
    const raMesh = new THREE.Mesh(raGeo, this.lineMat);
    raMesh.rotation.x = -Math.PI / 2;
    raMesh.position.set(HOOP_POS.x, 0.012, HOOP_POS.z);
    raMesh.renderOrder = 2;
    this.courtGroup.add(raMesh);

    // 2-Point / 3-Point Arc (radius 6.75m centered at (0, -4.3), clipped smoothly to corner lines x = ±6.6)
    const cornerAngle = Math.acos(6.6 / ARC_RADIUS); // ~0.211 rad
    const arcGeo = new THREE.RingGeometry(
      ARC_RADIUS - 0.032,
      ARC_RADIUS + 0.032,
      64,
      1,
      cornerAngle,
      Math.PI - cornerAngle * 2
    );
    this.disposables.push(arcGeo);
    const arcMesh = new THREE.Mesh(arcGeo, this.arcLineMat);
    arcMesh.rotation.x = -Math.PI / 2;
    arcMesh.position.set(HOOP_POS.x, 0.013, HOOP_POS.z);
    arcMesh.renderOrder = 2;
    this.courtGroup.add(arcMesh);

    // Corner 2-PT Straight Lines (z = -5.5 .. -2.9 at x = ±6.6)
    addLine(0.064, 2.62, -6.6, -4.2, this.arcLineMat);
    addLine(0.064, 2.62, 6.6, -4.2, this.arcLineMat);

    // Check-Ball Circle at Top of Key (0, +2.65)
    const chkGeo = new THREE.RingGeometry(0.68, 0.74, 36);
    const chkMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.25,
      roughness: 0.3,
    });
    this.disposables.push(chkGeo, chkMat);
    const chkMesh = new THREE.Mesh(chkGeo, chkMat);
    chkMesh.rotation.x = -Math.PI / 2;
    chkMesh.position.set(0, 0.013, 2.65);
    chkMesh.renderOrder = 2;
    this.courtGroup.add(chkMesh);

    // End-Zone Branded Broadcast Wordmark Decals ("AIM VANCOUVER • BCCC")
    const ebTex = makeTex(512, 128, (ebCtx) => {
      ebCtx.clearRect(0, 0, 512, 128);
      ebCtx.fillStyle = 'rgba(255,255,255,0.82)';
      ebCtx.font = 'bold 38px sans-serif';
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

    for (const endZ of [-6.85, 6.85]) {
      const decalGeo = new THREE.PlaneGeometry(6.2, 1.35);
      this.disposables.push(decalGeo);
      const decal = new THREE.Mesh(decalGeo, ebMat);
      decal.rotation.x = -Math.PI / 2;
      if (endZ < 0) decal.rotation.z = Math.PI;
      decal.position.set(0, -0.005, endZ);
      decal.renderOrder = 2;
      this.courtGroup.add(decal);
    }
  }

  private buildSponsorBarriersAndBeacons(
    makeTex: (
      w: number,
      h: number,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
    ) => THREE.CanvasTexture
  ) {
    const buildSponsorLedTex = (primary: string, secondary: string, accentHex: string) =>
      makeTex(1024, 128, (sctx) => {
        const grad = sctx.createLinearGradient(0, 0, 1024, 0);
        grad.addColorStop(0, '#070b18');
        grad.addColorStop(0.5, '#121833');
        grad.addColorStop(1, '#070b18');
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, 1024, 128);

        sctx.fillStyle = accentHex;
        sctx.fillRect(0, 0, 1024, 6);
        sctx.fillRect(0, 122, 1024, 6);

        for (const cx of [110, 914]) {
          sctx.fillStyle = accentHex;
          sctx.beginPath();
          sctx.moveTo(cx - 42, 92);
          sctx.lineTo(cx - 12, 34);
          sctx.lineTo(cx + 8, 68);
          sctx.lineTo(cx + 22, 42);
          sctx.lineTo(cx + 46, 92);
          sctx.closePath();
          sctx.fill();
        }

        sctx.fillStyle = '#ffffff';
        sctx.font = 'bold 44px sans-serif';
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText(primary, 512, 48);

        sctx.fillStyle = accentHex;
        sctx.font = 'bold 21px monospace';
        sctx.fillText(secondary, 512, 94);
      });

    const aimVanTexA = buildSponsorLedTex('AIM VANCOUVER 3X3', 'COAL HARBOUR ARENA · B.C. BASKETBALL', '#00f0ff');
    const aimVanTexB = buildSponsorLedTex('AIM VANCOUVER • BCCC', 'PACIFIC NORTHWEST PRO 3X3 SERIES', '#ff3d7f');

    const padMat = new THREE.MeshStandardMaterial({ color: 0x090612, roughness: 0.45, metalness: 0.25 });
    const ledFaceMatA = new THREE.MeshBasicMaterial({ map: aimVanTexA });
    const ledFaceMatB = new THREE.MeshBasicMaterial({ map: aimVanTexB });
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.78, roughness: 0.25 });
    this.disposables.push(padMat, ledFaceMatA, ledFaceMatB, pylonMat);

    const perimX = 10.2;
    const perimZ = 8.2;

    const addBarrier = (
      w: number,
      d: number,
      x: number,
      z: number,
      useCoral: boolean,
      innerFaceDir: 'X+' | 'X-' | 'Z+' | 'Z-'
    ) => {
      const grp = new THREE.Group();
      const boxGeo = new THREE.BoxGeometry(w, 0.72, d);
      const box = new THREE.Mesh(boxGeo, padMat);
      box.position.y = 0.36;
      grp.add(box);

      const stripGeo = new THREE.BoxGeometry(w, 0.06, d + 0.01);
      const topStrip = new THREE.Mesh(stripGeo, useCoral ? this.trimCoralMat : this.trimTealMat);
      topStrip.position.y = 0.73;
      grp.add(topStrip);

      const panelLen = Math.max(w, d) - 0.6;
      const ledGeo = new THREE.PlaneGeometry(panelLen, 0.62);
      const ledPlane = new THREE.Mesh(ledGeo, useCoral ? ledFaceMatB : ledFaceMatA);
      if (innerFaceDir === 'X+') {
        ledPlane.rotation.y = Math.PI / 2;
        ledPlane.position.set(w * 0.5 + 0.012, 0.36, 0);
      } else if (innerFaceDir === 'X-') {
        ledPlane.rotation.y = -Math.PI / 2;
        ledPlane.position.set(-w * 0.5 - 0.012, 0.36, 0);
      } else if (innerFaceDir === 'Z+') {
        ledPlane.position.set(0, 0.36, d * 0.5 + 0.012);
      } else {
        ledPlane.rotation.y = Math.PI;
        ledPlane.position.set(0, 0.36, -d * 0.5 - 0.012);
      }
      grp.add(ledPlane);
      grp.position.set(x, 0, z);
      this.courtGroup.add(grp);
      this.disposables.push(boxGeo, stripGeo, ledGeo);
    };

    addBarrier(0.24, perimZ * 2, -perimX, 0, false, 'X+');
    addBarrier(0.24, perimZ * 2, perimX, 0, true, 'X-');
    addBarrier(perimX * 2, 0.24, 0, -perimZ, false, 'Z+');
    addBarrier(perimX * 2, 0.24, 0, perimZ, true, 'Z-');

    // Low-Profile Corner LED Beacons flush with barrier corners
    const corners: [number, number, number][] = [
      [-perimX - 0.4, -perimZ - 0.4, 0x00f0ff],
      [perimX + 0.4, -perimZ - 0.4, 0xff6b1a],
      [-perimX - 0.4, perimZ + 0.4, 0xff6b1a],
      [perimX + 0.4, perimZ + 0.4, 0xff3d7f],
    ];
    for (const [px, pz, colHex] of corners) {
      const baseGeo = new THREE.BoxGeometry(0.42, 0.84, 0.42);
      const basePylon = new THREE.Mesh(baseGeo, pylonMat);
      basePylon.position.set(px, 0.42, pz);

      const glowGeo = new THREE.BoxGeometry(0.24, 0.72, 0.24);
      const glowMat = new THREE.MeshBasicMaterial({ color: colHex });
      const glowBar = new THREE.Mesh(glowGeo, glowMat);
      glowBar.position.set(px - Math.sign(px) * 0.14, 0.44, pz - Math.sign(pz) * 0.14);

      this.courtGroup.add(basePylon, glowBar);
      this.reactiveLightPillars.push(glowBar);
      this.disposables.push(baseGeo, glowGeo, glowMat);
    }
  }

  private generateBraidedNetTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 256);

    const drawCord = (x1: number, y1: number, x2: number, y2: number, thickness: number) => {
      // Soft dark ambient outline for braided depth
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.lineWidth = thickness + 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Bright white woven nylon core
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const cols = 12; // 12 official rim loops
    const rows = 5;
    const cellW = 512 / cols;
    const rowH = (256 - 24) / rows;

    // Top rim mounting cord loops
    for (let i = 0; i < cols; i++) {
      const cx = (i + 0.5) * cellW;
      drawCord(cx - cellW * 0.24, 4, cx, 22, 5.5);
      drawCord(cx + cellW * 0.24, 4, cx, 22, 5.5);
    }

    // Crisp Diamond Crisscross Braided Nylon Webbing (tiling seamlessly horizontally across UV=0..1)
    for (let r = 0; r < rows; r++) {
      const yTop = 22 + r * rowH;
      const yBot = yTop + rowH;
      const shift = (r % 2) * (cellW * 0.5);
      const thick = Math.max(3.6, 5.6 - r * 0.35);

      for (let i = -1; i <= cols + 1; i++) {
        const xBase = i * cellW + shift;
        drawCord(xBase, yTop, xBase + cellW * 0.5, yBot, thick);
        drawCord(xBase, yTop, xBase - cellW * 0.5, yBot, thick);

        // Reinforced double-knot bead at each diamond junction
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.arc(xBase, yTop, thick * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bottom whip band ring
    drawCord(0, 246, 512, 246, 5.0);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = this.maxAniso;
    this.disposables.push(tex);
    return tex;
  }

  private buildHoopAssembly() {
    const hoopGrp = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.78, roughness: 0.26 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.16 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x0c4a6e, roughness: 0.45, metalness: 0.12 });
    const padAccentMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x0088aa,
      emissiveIntensity: 0.25,
      roughness: 0.35,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xff5a1f,
      emissive: 0xd93800,
      emissiveIntensity: 0.22,
      metalness: 0.58,
      roughness: 0.28,
    });

    this.disposables.push(steelMat, chromeMat, padMat, padAccentMat, rimMat);

    // 1. Heavy Hydraulic Base & Slanted Arena Stanchion
    const baseBox = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.88, 1.85), padMat);
    baseBox.position.set(0, 0.44, -6.38);
    baseBox.castShadow = true;
    baseBox.receiveShadow = true;
    hoopGrp.add(baseBox);

    const baseAccent = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.12, 1.88), padAccentMat);
    baseAccent.position.set(0, 0.84, -6.38);
    hoopGrp.add(baseAccent);

    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.45, 0.32), steelMat);
    mast.position.set(0, 1.98, -5.82);
    mast.castShadow = true;
    hoopGrp.add(mast);

    const mastPad = new THREE.Mesh(new THREE.BoxGeometry(0.44, 2.25, 0.46), padMat);
    mastPad.position.set(0, 1.18, -5.76);
    mastPad.castShadow = true;
    hoopGrp.add(mastPad);

    // Dual Diagonal Stabilizer Truss Arms
    for (const side of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 1.65, 8), chromeMat);
      brace.position.set(side * 0.32, 3.1, -5.18);
      brace.rotation.x = Math.PI * 0.24;
      brace.rotation.z = side * -0.18;
      hoopGrp.add(brace);
    }

    // Cantilever Overhead Boom reaching forward to Backboard
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 1.48), steelMat);
    boom.position.set(0, 3.45, -5.2);
    boom.castShadow = true;
    hoopGrp.add(boom);

    // 2. Optical Tempered Glass Backboard + Safety U-Bumper + Red Shot-Clock Perimeter LED
    this.backboardGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: this.isSoftwareGl ? 0.22 : 0.30,
      roughness: 0.06,
      metalness: 0.08,
      clearcoat: this.isSoftwareGl ? 0.2 : 1.0,
      clearcoatRoughness: 0.06,
      transmission: this.isSoftwareGl ? 0 : 0.28,
    });
    this.disposables.push(this.backboardGlassMat);

    const backboardGlass = new THREE.Mesh(new THREE.BoxGeometry(1.82, 1.08, 0.045), this.backboardGlassMat);
    backboardGlass.position.set(0, 3.45, BACKBOARD_Z);
    hoopGrp.add(backboardGlass);

    // Crisp Anodized Steel Perimeter Frame + Bottom Padded Safety Bumper
    const addEdge = (w: number, h: number, d: number, x: number, y: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, BACKBOARD_Z);
      hoopGrp.add(m);
    };
    addEdge(1.88, 0.06, 0.065, 0, 3.99, chromeMat);
    addEdge(1.88, 0.085, 0.085, 0, 2.90, padMat);
    addEdge(0.06, 1.08, 0.065, -0.915, 3.45, chromeMat);
    addEdge(0.06, 1.08, 0.065, 0.915, 3.45, chromeMat);

    // Subtle Shot-Clock Violation LED Strip inside frame bezel (pulses crimson at <= 0.5s or buzzer)
    const addBuzzerBar = (w: number, h: number, x: number, y: number) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.072), this.buzzerLedMat);
      bar.position.set(x, y, BACKBOARD_Z);
      hoopGrp.add(bar);
    };
    addBuzzerBar(1.80, 0.018, 0, 3.975);
    addBuzzerBar(0.018, 1.04, -0.895, 3.45);
    addBuzzerBar(0.018, 1.04, 0.895, 3.45);

    // Shooter's Square (0.59m x 0.45m right above rim)
    const addSquareEdge = (w: number, h: number, x: number, y: number) => {
      const sq = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.056), this.backboardSquareMat);
      sq.position.set(x, y, BACKBOARD_Z + 0.006);
      hoopGrp.add(sq);
    };
    addSquareEdge(0.61, 0.036, 0, 3.51);
    addSquareEdge(0.61, 0.036, 0, 3.06);
    addSquareEdge(0.036, 0.48, -0.305, 3.285);
    addSquareEdge(0.036, 0.48, 0.305, 3.285);

    // 3. 3D Live Shot Clock Display mounted above Backboard
    const clockMount = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.16), steelMat);
    clockMount.position.set(0, 4.10, BACKBOARD_Z - 0.05);
    hoopGrp.add(clockMount);

    const clockHousing = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.56, 0.22), steelMat);
    clockHousing.position.set(0, 4.42, BACKBOARD_Z - 0.05);
    hoopGrp.add(clockHousing);

    const clockScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.08, 0.48),
      new THREE.MeshBasicMaterial({ map: this.shotClockTex })
    );
    clockScreen.position.set(0, 4.42, BACKBOARD_Z + 0.065);
    hoopGrp.add(clockScreen);

    // 4. Breakaway Rim Group (pivots cleanly around hinge plate on dunks & clanks!)
    this.rimGroup = new THREE.Group();
    this.rimGroup.position.set(HOOP_POS.x, HOOP_POS.y, BACKBOARD_Z + 0.035);
    hoopGrp.add(this.rimGroup);

    const hingePlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.045), rimMat);
    hingePlate.position.set(0, 0, 0);
    this.rimGroup.add(hingePlate);

    const springBox = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.14), steelMat);
    springBox.position.set(0, -0.055, 0.06);
    this.rimGroup.add(springBox);

    const neckOffsetZ = HOOP_POS.z - (BACKBOARD_Z + 0.035); // +0.185m forward from hinge
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.034, Math.max(0.08, neckOffsetZ - RIM_RADIUS + 0.04)), rimMat);
    neck.position.set(0, 0, neckOffsetZ * 0.35);
    this.rimGroup.add(neck);

    const rimGeo = new THREE.TorusGeometry(RIM_RADIUS, RIM_TUBE_RADIUS, 16, 42);
    rimGeo.rotateX(Math.PI / 2);
    this.rimMesh = new THREE.Mesh(rimGeo, rimMat);
    this.rimMesh.position.set(0, 0, neckOffsetZ);
    this.rimMesh.castShadow = !this.isSoftwareGl;
    this.rimGroup.add(this.rimMesh);

    // 12 Steel Net Hook Eyelets welded around underside of rim
    const hookGeo = new THREE.TorusGeometry(0.014, 0.004, 6, 10);
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const hook = new THREE.Mesh(hookGeo, chromeMat);
      hook.position.set(Math.cos(ang) * RIM_RADIUS, -0.022, neckOffsetZ + Math.sin(ang) * RIM_RADIUS);
      hook.rotation.y = -ang;
      this.rimGroup.add(hook);
    }

    // 5. Realistic Diamond-Braided Nylon Net with Real-Time Ball-Coupled Vertex Cloth Deformer
    const netTex = this.generateBraidedNetTexture();
    const netGeo = new THREE.CylinderGeometry(0.228, 0.128, 0.44, 36, 12, true);
    const netMat = new THREE.MeshStandardMaterial({
      map: netTex,
      color: 0xf8fafc,
      roughness: 0.72,
      metalness: 0.04,
      transparent: true,
      alphaTest: 0.22,
      side: THREE.DoubleSide,
    });
    this.disposables.push(netGeo, netMat, rimGeo, hookGeo);

    this.netMesh = new THREE.Mesh(netGeo, netMat);
    this.netMesh.position.set(0, -0.23, neckOffsetZ);
    this.netOrigPositions = new Float32Array(netGeo.attributes.position.array);
    this.rimGroup.add(this.netMesh);

    this.courtGroup.add(hoopGrp);
  }

  public setCourtSurface(surface: CourtSurface) {
    this.courtMat.map = this.courtTextures[surface];
    this.apronMat.map = this.apronTextures[surface];
    this.courtMat.needsUpdate = true;
    this.apronMat.needsUpdate = true;
    this.courtMat.roughness = surface === 'HARDWOOD' ? 0.34 : surface === 'SAND' ? 0.9 : 0.42;
    this.arcLineMat.color.setHex(surface === 'CYBER' ? 0xff3d7f : 0xffb347);
  }

  public triggerRipple(worldX: number, worldZ: number, strength: number, elapsedSec: number) {
    const u = this.membraneMat?.uniforms;
    if (!u) return;
    if (u.uTouchPos?.value) {
      u.uTouchPos.value.set(
        THREE.MathUtils.clamp(worldX / COURT_W + 0.5, 0, 1),
        THREE.MathUtils.clamp(worldZ / COURT_D + 0.5, 0, 1)
      );
    }
    if (u.uTouchTime) u.uTouchTime.value = elapsedSec;
    if (u.uRippleStrength) {
      u.uRippleStrength.value = Math.max(u.uRippleStrength.value, strength);
    }
  }

  public triggerNetSwish(strength = 1.0, rimBend = 0, dirX = 0, dirZ = 0) {
    this.netWhipTime = 0;
    this.netWhipStrength = Math.min(2.4, Math.max(0.45, strength));
    this.netWhipDirX = THREE.MathUtils.clamp(dirX, -1, 1);
    this.netWhipDirZ = THREE.MathUtils.clamp(dirZ, -1, 1);
    if (rimBend > 0) {
      this.rimBendAmount = Math.max(this.rimBendAmount, rimBend);
    }
  }

  public triggerRimClank(strength = 0.7) {
    this.rimRattleAmp = Math.max(this.rimRattleAmp, THREE.MathUtils.clamp(strength, 0.2, 1.4));
    this.rimRattlePhase = 0;
    this.netWhipTime = 0;
    this.netWhipStrength = Math.max(this.netWhipStrength, 0.45 * strength);
  }

  public triggerBackboardImpact() {
    this.glassFlashTimer = 0.25;
  }

  public triggerBuzzerFlash() {
    this.buzzerFlashTimer = 0.85;
  }

  public updateShotClockBoard(shotClock: number, scoreA: number, scoreB: number, arcCleared: boolean) {
    const ctx = this.shotClockCtx;
    ctx.fillStyle = '#050812';
    ctx.fillRect(0, 0, 256, 128);

    ctx.strokeStyle = shotClock <= 3.5 ? '#ff3d7f' : '#00f0ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 120);

    ctx.textAlign = 'center';
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`CY ${scoreA}`, 44, 34);

    ctx.fillStyle = '#ff3d7f';
    ctx.fillText(`VC ${scoreB}`, 212, 34);

    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = arcCleared ? '#34d399' : '#ffb347';
    ctx.fillText(arcCleared ? 'LIVE' : 'CLR ARC', 128, 28);

    ctx.font = '900 58px monospace';
    ctx.fillStyle = shotClock <= 3.5 ? '#ff3d7f' : '#ffb347';
    ctx.fillText(shotClock.toFixed(1), 128, 98);

    this.shotClockTex.needsUpdate = true;
  }

  public update(
    dt: number,
    elapsedSec: number,
    bassAmp: number,
    trebleAmp: number,
    ballPos?: THREE.Vector3,
    ballVel?: THREE.Vector3
  ) {
    // Beat-reactive stadium LED trim
    this.trimTealMat.color.setRGB(
      THREE.MathUtils.clamp(bassAmp * 0.55, 0, 1),
      THREE.MathUtils.clamp(0.86 + trebleAmp * 0.14, 0, 1),
      1.0
    );
    this.trimCoralMat.color.setRGB(
      1.0,
      THREE.MathUtils.clamp(0.24 + bassAmp * 0.35, 0, 1),
      THREE.MathUtils.clamp(0.45 + trebleAmp * 0.42, 0, 1)
    );

    for (let i = 0; i < this.reactiveLightPillars.length; i++) {
      const p = this.reactiveLightPillars[i];
      p.scale.y = 0.85 + bassAmp * 0.45;
    }

    // Breakaway Rim Dunk Flex + Iron Clank Rattle
    let rotX = 0;
    let rotZ = 0;
    if (this.rimBendAmount > 0.001) {
      this.rimBendAmount = THREE.MathUtils.damp(this.rimBendAmount, 0, 11, dt);
      rotX += this.rimBendAmount * 0.24;
    }
    if (this.rimRattleAmp > 0.002) {
      this.rimRattlePhase += dt * 42;
      this.rimRattleAmp = THREE.MathUtils.damp(this.rimRattleAmp, 0, 9, dt);
      rotX += Math.sin(this.rimRattlePhase) * this.rimRattleAmp * 0.05;
      rotZ += Math.cos(this.rimRattlePhase * 1.3) * this.rimRattleAmp * 0.035;
    }
    this.rimGroup.rotation.x = rotX;
    this.rimGroup.rotation.z = rotZ;

    // Backboard Buzzer LED & Glass Impact Shimmer
    if (this.buzzerFlashTimer > 0) {
      this.buzzerFlashTimer = Math.max(0, this.buzzerFlashTimer - dt);
      this.buzzerLedMat.color.setRGB(1.0, 0.12, 0.2);
    } else {
      this.buzzerLedMat.color.setRGB(0.22, 0.03, 0.06);
    }

    if (this.glassFlashTimer > 0) {
      this.glassFlashTimer = Math.max(0, this.glassFlashTimer - dt);
      this.backboardGlassMat.opacity = 0.30 + this.glassFlashTimer * 0.55;
    } else {
      this.backboardGlassMat.opacity = 0.30;
    }

    // Real-Time Ball-Coupled Braided Nylon Net Deformation + Whip Spring
    const posAttr = this.netMesh.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const ballInNetZone =
      Boolean(ballPos) &&
      ballPos!.y >= HOOP_POS.y - 0.52 &&
      ballPos!.y <= HOOP_POS.y + 0.08 &&
      Math.hypot(ballPos!.x - HOOP_POS.x, ballPos!.z - HOOP_POS.z) < 0.36;

    if (ballInNetZone || this.netWhipTime >= 0) {
      if (this.netWhipTime >= 0) {
        this.netWhipTime += dt;
      }
      const whipDecay =
        this.netWhipTime >= 0 ? Math.exp(-this.netWhipTime * 3.4) * this.netWhipStrength : 0;

      const localBallX = ballPos ? ballPos.x - HOOP_POS.x : 0;
      const localBallY = ballPos ? ballPos.y - (HOOP_POS.y - 0.23) : 0;
      const localBallZ = ballPos ? ballPos.z - HOOP_POS.z : 0;
      const vx = ballVel ? THREE.MathUtils.clamp(ballVel.x * 0.02, -0.08, 0.08) : 0;
      const vz = ballVel ? THREE.MathUtils.clamp(ballVel.z * 0.02, -0.08, 0.08) : 0;

      for (let i = 0; i < arr.length; i += 3) {
        const ox = this.netOrigPositions[i];
        const oy = this.netOrigPositions[i + 1];
        const oz = this.netOrigPositions[i + 2];

        // Top loop anchored firmly to steel rim eyelets (dropFactor = 0 at top y=+0.22, 1 at bottom y=-0.22)
        const dropFactor = THREE.MathUtils.clamp((0.22 - oy) / 0.44, 0, 1);

        let nx = ox;
        let ny = oy;
        let nz = oz;

        // 1. Directional wave + upward splash flare after ball exits
        if (whipDecay > 0.01) {
          const phase = this.netWhipTime * 19.0 - dropFactor * 3.8;
          const radialFlare = Math.sin(phase) * 0.14 * dropFactor * whipDecay;
          const upKick = Math.max(0, Math.sin(this.netWhipTime * 11.5 - dropFactor * 1.4)) * 0.12 * dropFactor * whipDecay;
          nx += ox * radialFlare * 2.1 + this.netWhipDirX * 0.06 * dropFactor * whipDecay;
          ny += upKick;
          nz += oz * radialFlare * 2.1 + this.netWhipDirZ * 0.06 * dropFactor * whipDecay;
        }

        // 2. Real-time radial push-out & drag directly around the leather basketball!
        if (ballInNetZone) {
          const dx = nx - localBallX;
          const dy = ny - localBallY;
          const dz = nz - localBallZ;
          const dist3D = Math.hypot(dx, dy, dz);
          const minShell = 0.155; // Ball radius + nylon thickness
          if (dist3D < minShell + 0.09 && dropFactor > 0.06) {
            const push = Math.max(0, (minShell + 0.04 - dist3D) * 0.95) * Math.min(1, dropFactor * 2.2);
            const rx = nx;
            const rz = nz;
            const rLen = Math.hypot(rx, rz) || 1;
            nx += (rx / rLen) * push + vx * dropFactor;
            nz += (rz / rLen) * push + vz * dropFactor;
            ny -= push * 0.16;
          }
        }

        arr[i] = nx;
        arr[i + 1] = ny;
        arr[i + 2] = nz;
      }
      posAttr.needsUpdate = true;

      if (!ballInNetZone && this.netWhipTime > 1.45) {
        this.netWhipTime = -1;
        arr.set(this.netOrigPositions);
        posAttr.needsUpdate = true;
      }
    }

    // Sync flat sub-surface membrane uniforms
    const u = this.membraneMat?.uniforms;
    if (u) {
      if (u.uTime) u.uTime.value = elapsedSec;
      if (u.uBassAmp) u.uBassAmp.value = bassAmp;
      if (u.uRippleStrength) {
        u.uRippleStrength.value = Math.max(0, u.uRippleStrength.value - dt * 1.8);
      }
    }

    // Subtle harmonic glow on shooter's square
    const pulse = 0.55 + 0.45 * Math.sin(elapsedSec * 3.2 + bassAmp * 4);
    this.backboardSquareMat.color.setRGB(1.0, 0.38 + pulse * 0.25, 0.08 + trebleAmp * 0.25);
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.scene.remove(this.courtGroup);
  }
}
