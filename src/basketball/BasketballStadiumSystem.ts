import * as THREE from 'three';
import { EnvironmentTheme } from '../types';

export class BasketballStadiumSystem {
  public readonly root = new THREE.Group();
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private ribbonTex: THREE.CanvasTexture;
  private ribbonMat: THREE.MeshBasicMaterial;
  private stepNosingMat: THREE.MeshBasicMaterial;
  private trussLedMat: THREE.MeshBasicMaterial;
  private lightBeams: THREE.Mesh[] = [];
  private lightBeamMats: THREE.MeshBasicMaterial[] = [];
  private actionFlashLight: THREE.PointLight;
  private flashIntensity = 0;

  constructor(parent: THREE.Object3D, maxAniso = 4, isSoftwareGl = false) {
    this.root.name = 'BasketballProStadiumArchitecture';

    this.stepNosingMat = this.track(new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    this.trussLedMat = this.track(new THREE.MeshBasicMaterial({ color: 0xffb347 }));

    this.ribbonTex = this.createFasciaTexture(maxAniso);
    this.ribbonMat = this.track(new THREE.MeshBasicMaterial({ map: this.ribbonTex }));

    this.buildBleachersWithAisles();
    this.buildPerimeterParapetsAndFascia();
    this.buildOverheadLightingTrusses(isSoftwareGl);
    this.buildSidelineTeamBenches();

    // Dynamic Dunk / Score / Block Arena Strobe Light
    this.actionFlashLight = new THREE.PointLight(0x00f0ff, 0, 32, 1.5);
    this.actionFlashLight.position.set(0, 7.2, -3.5);
    this.root.add(this.actionFlashLight);

    parent.add(this.root);
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private createFasciaTexture(maxAniso: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 64;
    const ctx = c.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#070b18');
    grad.addColorStop(0.5, '#131d3b');
    grad.addColorStop(1, '#070b18');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 64);

    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(0, 0, 1024, 4);
    ctx.fillStyle = '#ff3d7f';
    ctx.fillRect(0, 60, 1024, 4);

    ctx.font = 'bold 28px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('AIM VANCOUVER 3X3  ·  COAL HARBOUR ARENA  ·  OPTICAL CONTACT ENGINE  ·', 28, 32);

    const tex = this.track(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(2, 1);
    tex.anisotropy = maxAniso;
    return tex;
  }

  private buildBleachersWithAisles() {
    const tierMat = this.track(new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.78 }));
    const riserFrontMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.62, metalness: 0.22 })
    );
    const aisleMat = this.track(new THREE.MeshStandardMaterial({ color: 0x090d18, roughness: 0.85 }));

    // East & West stands cleanly span d = 25.4 (z: -12.7..+12.7) leaving generous room for corner bays!
    const tierConfigs = [
      { x: -15.6, z: 0, w: 6.0, d: 25.4, axis: 'X' as const },
      { x: 15.6, z: 0, w: 6.0, d: 25.4, axis: 'X' as const },
      { x: 0, z: -15.4, w: 26.8, d: 6.0, axis: 'Z' as const },
      { x: 0, z: 15.8, w: 26.8, d: 6.0, axis: 'Z' as const },
    ];

    for (const tp of tierConfigs) {
      for (let s = 0; s < 4; s++) {
        const inset = s * 1.35;
        const px = tp.x === 0 ? 0 : tp.x + Math.sign(tp.x) * inset;
        const py = 0.5 + s * 1.1;
        const pz = tp.z === 0 ? 0 : tp.z + Math.sign(tp.z) * inset;

        const step = new THREE.Mesh(this.track(new THREE.BoxGeometry(tp.w, 1.05, tp.d)), tierMat);
        step.position.set(px, py, pz);
        this.root.add(step);

        // Luminous front step nosing bar along each seating riser edge
        const nosingW = tp.axis === 'X' ? 0.08 : tp.w - 0.8;
        const nosingD = tp.axis === 'X' ? tp.d - 0.8 : 0.08;
        const edgeX = tp.axis === 'X' ? px - Math.sign(tp.x) * (tp.w * 0.5 - 0.04) : px;
        const edgeZ = tp.axis === 'Z' ? pz - Math.sign(tp.z) * (tp.d * 0.5 - 0.04) : pz;

        const nosing = new THREE.Mesh(
          this.track(new THREE.BoxGeometry(nosingW, 0.06, nosingD)),
          this.stepNosingMat
        );
        nosing.position.set(edgeX, py + 0.51, edgeZ);
        this.root.add(nosing);
      }

      // Twin Painted Concrete Stair Aisles ascending each stand
      for (const offset of [-6.4, 6.4]) {
        const stair = new THREE.Mesh(
          this.track(
            new THREE.BoxGeometry(tp.axis === 'X' ? 8.2 : 1.5, 0.14, tp.axis === 'X' ? 1.5 : 8.2)
          ),
          aisleMat
        );
        stair.position.set(
          tp.axis === 'X' ? tp.x + Math.sign(tp.x) * 1.2 : offset,
          2.65,
          tp.axis === 'Z' ? tp.z + Math.sign(tp.z) * 1.2 : offset
        );
        if (tp.axis === 'X') {
          stair.rotation.z = Math.sign(tp.x) * 0.58;
        } else {
          stair.rotation.x = -Math.sign(tp.z) * 0.58;
        }
        this.root.add(stair);
      }
    }

    // Architectural Corner Concourse Columns
    const colMat = riserFrontMat;
    for (const [cx, cz] of [
      [-22.2, -22.0],
      [22.2, -22.0],
      [-22.2, 22.0],
      [22.2, 22.0],
    ]) {
      const col = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.1, 14.8, 1.1)), colMat);
      col.position.set(cx, 7.4, cz);
      this.root.add(col);
    }
  }

  private buildPerimeterParapetsAndFascia() {
    const parapetMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.72, metalness: 0.25 })
    );
    const parapetConfigs = [
      { w: 0.9, h: 1.5, d: 35.6, x: -22.4, y: 4.85, z: 0, rotY: Math.PI / 2, len: 33.5 },
      { w: 0.9, h: 1.5, d: 35.6, x: 22.4, y: 4.85, z: 0, rotY: -Math.PI / 2, len: 33.5 },
      { w: 28, h: 1.5, d: 0.9, x: 0, y: 4.85, z: -22.2, rotY: 0, len: 26.8 },
    ];
    for (const pc of parapetConfigs) {
      const wall = new THREE.Mesh(this.track(new THREE.BoxGeometry(pc.w, pc.h, pc.d)), parapetMat);
      wall.position.set(pc.x, pc.y, pc.z);
      this.root.add(wall);

      // Continuous Illuminated LED Fascia Ribbon on inner stadium parapet wall
      const fascia = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(pc.len, 0.78)),
        this.ribbonMat
      );
      fascia.rotation.y = pc.rotY;
      fascia.position.set(
        pc.x + (pc.rotY !== 0 ? Math.sign(-pc.x) * 0.48 : 0),
        4.85,
        pc.z + (pc.rotY === 0 ? 0.48 : 0)
      );
      this.root.add(fascia);
    }
  }

  private buildOverheadLightingTrusses(isSoftwareGl: boolean) {
    const steelMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.82, roughness: 0.26 })
    );
    const housingMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.75, roughness: 0.3 })
    );
    const bulbMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfffbeb }));

    // 4 Cantilevered Arena Lighting Trusses arching at y = 14.2m
    const trussBanks = [
      { x: -13.5, z: -7.5, aimX: -3.5, aimZ: -2.0 },
      { x: 13.5, z: -7.5, aimX: 3.5, aimZ: -2.0 },
      { x: -13.5, z: 7.5, aimX: -3.5, aimZ: 2.0 },
      { x: 13.5, z: 7.5, aimX: 3.5, aimZ: 2.0 },
    ];

    const beamGeo = this.track(new THREE.ConeGeometry(4.4, 15.2, 16, 1, true));
    beamGeo.translate(0, -7.6, 0);

    for (const tb of trussBanks) {
      const grp = new THREE.Group();
      grp.position.set(tb.x, 14.2, tb.z);

      // Angled steel truss mast connecting outer stadium wall to floodlight pod
      const mast = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.42, 0.42, 7.6)), steelMat);
      mast.position.set(Math.sign(tb.x) * 3.6, 0.25, 0);
      mast.rotation.y = Math.sign(tb.x) * 0.65;
      grp.add(mast);

      // Floodlight rack head facing inward toward court center
      const rack = new THREE.Group();
      rack.lookAt(tb.aimX - tb.x, -12.8, tb.aimZ - tb.z);

      const bar = new THREE.Mesh(this.track(new THREE.BoxGeometry(3.4, 0.34, 0.42)), housingMat);
      rack.add(bar);

      const accentStrip = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(3.42, 0.08, 0.44)),
        this.trussLedMat
      );
      accentStrip.position.y = 0.2;
      rack.add(accentStrip);

      // 4 Individual Stadium LED Projectors per Truss Bank
      for (let i = -1.5; i <= 1.5; i += 1) {
        const pod = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.62, 0.42, 0.38)), housingMat);
        pod.position.set(i * 0.86, -0.25, 0.14);
        const lens = new THREE.Mesh(this.track(new THREE.PlaneGeometry(0.52, 0.32)), bulbMat);
        lens.position.set(i * 0.86, -0.25, 0.34);
        rack.add(pod, lens);
      }

      grp.add(rack);
      this.root.add(grp);

      // Atmospheric additive volumetric spotlight cone (guarded off on software WebGL)
      if (!isSoftwareGl) {
        const beamMat = this.track(
          new THREE.MeshBasicMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.045,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        const cone = new THREE.Mesh(beamGeo, beamMat);
        cone.position.set(tb.x, 14.0, tb.z);
        cone.lookAt(tb.aimX, 0, tb.aimZ);
        cone.rotateX(-Math.PI / 2);
        this.lightBeams.push(cone);
        this.lightBeamMats.push(beamMat);
        this.root.add(cone);
      }
    }

    // Main overhead Steel Span Catwalk across South-North ends
    const catwalk = new THREE.Mesh(this.track(new THREE.BoxGeometry(28.5, 0.38, 0.85)), steelMat);
    catwalk.position.set(0, 15.2, 0);
    this.root.add(catwalk);
  }

  private buildSidelineTeamBenches() {
    const frameMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.6 })
    );
    const cushionCyanMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 }));
    const cushionCoralMat = this.track(new THREE.MeshStandardMaterial({ color: 0xbe123c, roughness: 0.5 }));
    const coolerMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35 }));
    const towelMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 }));

    for (const side of [-1, 1] as const) {
      const benchGrp = new THREE.Group();
      // Placed cleanly along x = ±11.2, z = +1.8..+5.4 (clear of x=±10.2 barrier & z < 0 cheer pads)
      benchGrp.position.set(side * 11.15, 0, 3.2);
      benchGrp.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;

      const base = new THREE.Mesh(this.track(new THREE.BoxGeometry(3.4, 0.08, 0.85)), frameMat);
      base.position.y = 0.04;
      benchGrp.add(base);

      const trim = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(3.42, 0.05, 0.88)),
        this.track(new THREE.MeshBasicMaterial({ color: side < 0 ? 0x00f0ff : 0xff3d7f }))
      );
      trim.position.y = 0.08;
      benchGrp.add(trim);

      const seatMat = side < 0 ? cushionCyanMat : cushionCoralMat;
      for (let i = 0; i < 4; i++) {
        const cx = -1.12 + i * 0.74;
        const seat = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.56, 0.1, 0.52)), seatMat);
        seat.position.set(cx, 0.46, 0.04);
        const back = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.56, 0.5, 0.1)), seatMat);
        back.position.set(cx, 0.72, -0.2);
        const leg = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 8)), frameMat);
        leg.position.set(cx, 0.24, 0.02);
        benchGrp.add(seat, back, leg);

        if (i % 2 === 1) {
          const towel = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.32, 0.08, 0.26)), towelMat);
          towel.position.set(cx, 0.54, 0.06);
          benchGrp.add(towel);
        }
      }

      // Sideline Hydration Cooler at end of bench
      const cooler = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.22, 0.2, 0.52, 12)), coolerMat);
      cooler.position.set(1.95, 0.26, 0);
      const lid = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 12)), towelMat);
      lid.position.set(1.95, 0.54, 0);
      benchGrp.add(cooler, lid);

      this.root.add(benchGrp);
    }
  }

  public triggerScoreStrobe(colorHex: number, strength = 1.0) {
    this.actionFlashLight.color.setHex(colorHex);
    this.flashIntensity = Math.min(4.2, Math.max(this.flashIntensity, 2.8 * strength));
  }

  public update(dt: number, elapsedSec: number, bassAmp: number, trebleAmp: number, weather: EnvironmentTheme) {
    // Smooth scroll on 360° Arena LED Fascia Ribbon
    this.ribbonTex.offset.x = (elapsedSec * 0.055) % 1;

    // Beat-reactive step nosing & truss accent lights
    const stepHue = 0.52 + bassAmp * 0.14;
    this.stepNosingMat.color.setHSL(stepHue, 0.95, 0.52 + trebleAmp * 0.18);
    this.trussLedMat.color.setRGB(1.0, 0.65 + trebleAmp * 0.25, 0.22 + bassAmp * 0.35);

    // Volumetric beam visibility modulation by weather / music energy
    const beamOpacity = weather === 'NIGHT' || weather === 'CYBER' ? 0.075 : weather === 'SUNNY' ? 0.02 : 0.045;
    for (const bm of this.lightBeamMats) {
      bm.opacity = beamOpacity + bassAmp * 0.032;
    }

    if (this.flashIntensity > 0) {
      this.flashIntensity = Math.max(0, this.flashIntensity - dt * 5.2);
      this.actionFlashLight.intensity = this.flashIntensity;
    } else {
      this.actionFlashLight.intensity = 0;
    }
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.root.clear();
  }
}
