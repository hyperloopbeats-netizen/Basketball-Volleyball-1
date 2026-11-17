import * as THREE from 'three';
import { EnvironmentTheme } from '../../types';

interface TrafficSignalNode {
  x: number;
  z: number;
  nsGreenMat: THREE.MeshBasicMaterial;
  nsAmberMat: THREE.MeshBasicMaterial;
  nsRedMat: THREE.MeshBasicMaterial;
  ewGreenMat: THREE.MeshBasicMaterial;
  ewAmberMat: THREE.MeshBasicMaterial;
  ewRedMat: THREE.MeshBasicMaterial;
}

interface DynamicVehicle {
  group: THREE.Group;
  brakeMat: THREE.MeshBasicMaterial;
  axis: 'X' | 'Z';
  dir: 1 | -1;
  laneCoord: number;
  posCoord: number;
  minCoord: number;
  maxCoord: number;
  baseSpeed: number;
  curSpeed: number;
  length: number;
  isBus: boolean;
  stopLines: number[];
}

interface ParkingManeuverCar {
  group: THREE.Group;
  brakeMat: THREE.MeshBasicMaterial;
  waypoints: Array<{ x: number; z: number; pauseSec: number }>;
  segIdx: number;
  t: number;
  waitTimer: number;
  speed: number;
}

interface PedestrianAgent {
  group: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  t: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  crosswalkAxis: 'NS' | 'EW' | null;
  crosswalkMin: number;
  crosswalkMax: number;
}

interface SteamPuff {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  driftX: number;
  driftZ: number;
}

/**
 * VancouverCityDistrict
 * Expands the city outside AIM Vancouver Stadium with:
 * - Paved Urban Plaza & Multi-Street Downtown Vancouver Grid (Pacific Blvd, Burrard St, Beatty St, Waterfront Way, Nelson St)
 * - Animated 3-Aspect Traffic Signals & Zebra Crosswalks
 * - Large West & South Stadium Parking Lots (painted bays, wheel stops, EV bays, toll booths, floodlights, parked + dynamic maneuvering cars)
 * - Live Multi-Lane Street Traffic (sedans, SUVs, yellow taxis, TransLink electric buses) + Elevated SkyTrain Expo Line & Station
 * - Animated Pedestrians patrolling sidewalks, parking walkways & signalized crosswalks
 * - Authentic Vancouver Landmarks: Convention Centre West (living green roof), Gastown Steam Clock, Marine Building,
 *   Vancouver Public Library Colosseum, Rogers Arena, Cambie Steel-Truss Bridge & Stanley Park Seawall Evergreen Grove
 */
export class VancouverCityDistrict {
  public readonly root = new THREE.Group();
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private readonly trafficVehicles: DynamicVehicle[] = [];
  private readonly parkingCars: ParkingManeuverCar[] = [];
  private readonly pedestrians: PedestrianAgent[] = [];
  private readonly steamPuffs: SteamPuff[] = [];
  private readonly signalHeads: TrafficSignalNode[] = [];
  private readonly boomArms: THREE.Mesh[] = [];
  private readonly skyTrainCars: THREE.Group[] = [];
  private skyTrainProgress = 0;

  private readonly rogersRingMat: THREE.MeshBasicMaterial;
  private readonly streetLampGlowMat: THREE.MeshBasicMaterial;
  private readonly cityWindowMat: THREE.MeshStandardMaterial;
  private readonly storefrontGlowMat: THREE.MeshBasicMaterial;
  private readonly evChargerGlowMat: THREE.MeshBasicMaterial;

  private nsPhaseGreen = true;
  private nsPhaseAmber = false;
  private ewPhaseGreen = false;
  private ewPhaseAmber = false;

  constructor(scene: THREE.Scene, maxAnisotropy = 4) {
    this.root.name = 'VancouverCityDistrictGroup';

    this.rogersRingMat = this.track(new THREE.MeshBasicMaterial({ color: 0xff6b1a }));
    this.streetLampGlowMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));
    this.storefrontGlowMat = this.track(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    this.evChargerGlowMat = this.track(new THREE.MeshBasicMaterial({ color: 0x10b981 }));

    const winTex = this.createCityWindowTexture(maxAnisotropy);
    this.cityWindowMat = this.track(
      new THREE.MeshStandardMaterial({
        map: winTex,
        emissiveMap: winTex,
        emissive: new THREE.Color(0x93c5fd),
        emissiveIntensity: 0.65,
        roughness: 0.28,
        metalness: 0.62,
      })
    );

    this.buildUrbanGroundAndStreets(maxAnisotropy);
    this.buildStadiumParkingLots(maxAnisotropy);
    this.buildTrafficSignals();
    this.buildElevatedSkyTrain();
    this.buildVancouverLandmarks();
    this.buildDenseCityBlocks();
    this.buildDynamicStreetTraffic();
    this.buildDynamicPedestrians();
    this.buildBoulevardLampsAndPlazaPortal();

    scene.add(this.root);
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private createCityWindowTexture(anisotropy: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const bg = ctx.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, '#0d192b');
    bg.addColorStop(1, '#16243d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 512);

    const cols = 8;
    const rows = 24;
    const cw = 256 / cols;
    const ch = 512 / rows;
    for (let r = 1; r < rows - 1; r++) {
      for (let col = 1; col < cols - 1; col++) {
        const h = (r * 29 + col * 17) % 10;
        if (h < 3) continue;
        ctx.fillStyle =
          h === 4 || h === 8
            ? 'rgba(253, 224, 71, 0.85)'
            : h === 9
            ? 'rgba(56, 189, 248, 0.82)'
            : 'rgba(226, 232, 240, 0.54)';
        ctx.fillRect(col * cw + 4, r * ch + 4, cw - 8, ch - 8);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return this.track(tex);
  }

  private createAsphaltRoadTexture(anisotropy: number, isNS: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = '#1b2232';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle aggregate grit
    for (let i = 0; i < 1600; i++) {
      const gx = (i * 73) % 512;
      const gy = (i * 139) % 512;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(gx, gy, 2, 2);
    }

    if (isNS) {
      // Double amber center line
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(250, 0, 4, 512);
      ctx.fillRect(258, 0, 4, 512);
      // White dashed lane dividers
      ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
      for (let y = 16; y < 512; y += 64) {
        ctx.fillRect(132, y, 4, 34);
        ctx.fillRect(376, y, 4, 34);
      }
    } else {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 250, 512, 4);
      ctx.fillRect(0, 258, 512, 4);
      ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
      for (let x = 16; x < 512; x += 64) {
        ctx.fillRect(x, 132, 34, 4);
        ctx.fillRect(x, 376, 34, 4);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return this.track(tex);
  }

  private createParkingLotTexture(anisotropy: number, cols: number, rows: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = '#18202f';
    ctx.fillRect(0, 0, 1024, 1024);

    // Asphalt grain
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.07)';
      ctx.fillRect((i * 113) % 1024, (i * 211) % 1024, 2, 2);
    }

    const padX = 76;
    const usableW = 1024 - padX * 2;
    const stallW = usableW / cols;
    const rowBandH = 1024 / rows;

    for (let r = 0; r < rows; r++) {
      const yTop = r * rowBandH;
      // Top & bottom stall banks separated by wide central driving aisle
      const bayDepth = rowBandH * 0.29;
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.78)';
      ctx.lineWidth = 4;

      for (let s = 0; s <= cols; s++) {
        const sx = padX + s * stallW;
        // Upper bay lines
        ctx.beginPath();
        ctx.moveTo(sx, yTop + 14);
        ctx.lineTo(sx, yTop + 14 + bayDepth);
        ctx.stroke();

        // Lower bay lines
        ctx.beginPath();
        ctx.moveTo(sx, yTop + rowBandH - 14 - bayDepth);
        ctx.lineTo(sx, yTop + rowBandH - 14);
        ctx.stroke();
      }

      // Row spine divider
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(padX, yTop + 12, usableW, 4);
      ctx.fillRect(padX, yTop + rowBandH - 16, usableW, 4);

      // EV / Accessible accent stalls at row ends
      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.fillRect(padX + 4, yTop + 16, stallW - 8, bayDepth - 4);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.fillRect(padX + usableW - stallW + 4, yTop + 16, stallW - 8, bayDepth - 4);

      // Driving lane directional arrows
      const laneY = yTop + rowBandH * 0.5;
      ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
      for (let ax = 180; ax < 900; ax += 220) {
        ctx.fillRect(ax, laneY - 3, 44, 6);
        ctx.beginPath();
        const dir = r % 2 === 0 ? 1 : -1;
        const tipX = dir > 0 ? ax + 58 : ax - 14;
        const base = dir > 0 ? ax + 42 : ax + 2;
        ctx.moveTo(tipX, laneY);
        ctx.lineTo(base, laneY - 12);
        ctx.lineTo(base, laneY + 12);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Perimeter lot title stencil
    ctx.fillStyle = 'rgba(255, 179, 71, 0.65)';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('AIM STADIUM PARKING', 96, 50);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    return this.track(tex);
  }

  private buildUrbanGroundAndStreets(anisotropy: number) {
    // Landmass ground slab (south of Coal Harbour Seawall z = -47, keeping Burrard Inlet open to North)
    const landMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.88, metalness: 0.08 })
    );
    const landGeo = this.track(new THREE.BoxGeometry(270, 0.14, 180));
    const land = new THREE.Mesh(landGeo, landMat);
    land.position.set(0, -0.14, 43);
    land.receiveShadow = true;
    this.root.add(land);

    // Sidewalk & Stadium Promenade Deck wrapping around the Arena (y = 0.08, hollow ring via 4 strips outside [-22..22, -26..26])
    const plazaMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78, metalness: 0.12 })
    );
    const plazaSegments: Array<[number, number, number, number]> = [
      // South stadium apron
      [0, 29.0, 56, 6.2],
      // North stadium apron
      [0, -29.5, 56, 6.5],
      // West stadium apron
      [-25.5, 0, 6.4, 52],
      // East stadium apron
      [25.5, 0, 6.4, 52],
      // South-West block sidewalk pad
      [-55, 54, 42, 34],
      // South-Center block sidewalk pad
      [0, 54, 54, 34],
      // South-East Rogers & SkyTrain block
      [56, 54, 44, 34],
      // East Library / Gastown block
      [56, -4, 42, 54],
      // West Convention / Marine Plaza block
      [-56, -40, 42, 16],
      // Outer South blocks
      [-55, 96, 44, 34],
      [0, 96, 54, 34],
      [56, 96, 44, 34],
      [-98, 22, 36, 118],
      [98, 22, 36, 118],
    ];
    for (const [px, pz, pw, pd] of plazaSegments) {
      const m = new THREE.Mesh(this.track(new THREE.BoxGeometry(pw, 0.1, pd)), plazaMat);
      m.position.set(px, 0.03, pz);
      m.receiveShadow = true;
      this.root.add(m);
    }

    // Street Network (Asphalt top at y = 0.05)
    const roadTexNS = this.createAsphaltRoadTexture(anisotropy, true);
    const roadTexEW = this.createAsphaltRoadTexture(anisotropy, false);

    const makeRoadMesh = (
      x: number,
      z: number,
      w: number,
      d: number,
      isNS: boolean,
      repeatLen: number
    ) => {
      const tex = (isNS ? roadTexNS : roadTexEW).clone();
      tex.needsUpdate = true;
      tex.repeat.set(isNS ? 1 : repeatLen, isNS ? repeatLen : 1);
      this.track(tex);
      const mat = this.track(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.72,
          metalness: 0.12,
        })
      );
      const mesh = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, 0.04, d)), mat);
      mesh.position.set(x, 0.03, z);
      mesh.receiveShadow = true;
      this.root.add(mesh);
    };

    // East-West Avenues: Waterfront Way (z=-38), Pacific Blvd (z=+34), Nelson Corridor (z=+74)
    makeRoadMesh(0, -38, 220, 7.6, false, 14);
    makeRoadMesh(0, 34, 220, 8.6, false, 14);
    makeRoadMesh(0, 74, 220, 8.0, false, 14);

    // North-South Streets: Burrard St (x=-33), Beatty St (x=+33), Homer St (x=-78), Quebec St (x=+78)
    makeRoadMesh(-33, 26, 8.2, 144, true, 9);
    makeRoadMesh(33, 26, 8.2, 144, true, 9);
    makeRoadMesh(-78, 26, 7.4, 144, true, 9);
    makeRoadMesh(78, 26, 7.4, 144, true, 9);

    // Clean Intersection Asphalt Patches + Zebra Crosswalks
    const asphaltPlain = this.track(
      new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.74, metalness: 0.1 })
    );
    const stripeMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xf1f5f9,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    const stripeGeoNS = this.track(new THREE.PlaneGeometry(0.55, 2.3));
    const stripeGeoEW = this.track(new THREE.PlaneGeometry(2.3, 0.55));

    const intersections: Array<[number, number]> = [
      [-33, -38],
      [33, -38],
      [-33, 34],
      [33, 34],
      [-33, 74],
      [33, 74],
      [-78, 34],
      [78, 34],
    ];

    for (const [ix, iz] of intersections) {
      const box = new THREE.Mesh(this.track(new THREE.BoxGeometry(9.0, 0.044, 9.0)), asphaltPlain);
      box.position.set(ix, 0.031, iz);
      box.receiveShadow = true;
      this.root.add(box);

      // Zebra crosswalk stripes on 4 sides of each intersection
      for (let k = -3; k <= 3; k++) {
        for (const side of [-1, 1]) {
          const sNS = new THREE.Mesh(stripeGeoNS, stripeMat);
          sNS.rotation.x = -Math.PI / 2;
          sNS.position.set(ix + k * 1.05, 0.06, iz + side * 5.6);
          this.root.add(sNS);

          const sEW = new THREE.Mesh(stripeGeoEW, stripeMat);
          sEW.rotation.x = -Math.PI / 2;
          sEW.position.set(ix + side * 5.6, 0.06, iz + k * 1.05);
          this.root.add(sEW);
        }
      }
    }
  }

  private createCompositeCar(colorHex: number, isSuv = false, isTaxi = false): {
    group: THREE.Group;
    brakeMat: THREE.MeshBasicMaterial;
  } {
    const grp = new THREE.Group();
    const paintMat = this.track(
      new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.28, metalness: 0.62 })
    );
    const glassMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.14, metalness: 0.82 })
    );
    const tireMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.85, metalness: 0.1 })
    );
    const headMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfef9c3 }));
    const brakeMat = this.track(new THREE.MeshBasicMaterial({ color: 0xef4444 }));

    const bodyW = isSuv ? 1.85 : 1.72;
    const bodyH = isSuv ? 0.62 : 0.50;
    const bodyL = isSuv ? 4.35 : 4.05;

    // 1. Lower Chassis
    const chassis = new THREE.Mesh(this.track(new THREE.BoxGeometry(bodyW, bodyH, bodyL)), paintMat);
    chassis.position.y = 0.28 + bodyH * 0.5;
    chassis.castShadow = true;
    grp.add(chassis);

    // 2. Cabin Greenhouse
    const cabH = isSuv ? 0.56 : 0.44;
    const cabL = isSuv ? 2.45 : 2.15;
    const cabin = new THREE.Mesh(this.track(new THREE.BoxGeometry(bodyW * 0.86, cabH, cabL)), glassMat);
    cabin.position.set(0, 0.28 + bodyH + cabH * 0.46, -0.15);
    cabin.castShadow = true;
    grp.add(cabin);

    // 3. Roof Cap (plus Taxi Beacon if taxi)
    const roof = new THREE.Mesh(this.track(new THREE.BoxGeometry(bodyW * 0.82, 0.08, cabL * 0.88)), paintMat);
    roof.position.set(0, 0.28 + bodyH + cabH * 0.92, -0.15);
    grp.add(roof);

    if (isTaxi) {
      const signMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      const sign = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.45, 0.14, 0.22)), signMat);
      sign.position.set(0, 0.28 + bodyH + cabH + 0.06, 0.1);
      grp.add(sign);
    }

    // 4. Four Wheels
    const wheelGeo = this.track(new THREE.CylinderGeometry(0.29, 0.29, 0.22, 10));
    wheelGeo.rotateZ(Math.PI / 2);
    for (const wx of [-bodyW * 0.48, bodyW * 0.48]) {
      for (const wz of [-bodyL * 0.31, bodyL * 0.31]) {
        const w = new THREE.Mesh(wheelGeo, tireMat);
        w.position.set(wx, 0.29, wz);
        grp.add(w);
      }
    }

    // 5. Headlights (+Z front) & Taillights (-Z rear)
    const lightGeo = this.track(new THREE.BoxGeometry(0.32, 0.12, 0.06));
    for (const lx of [-bodyW * 0.32, bodyW * 0.32]) {
      const hl = new THREE.Mesh(lightGeo, headMat);
      hl.position.set(lx, 0.48, bodyL * 0.5 + 0.01);
      const tl = new THREE.Mesh(lightGeo, brakeMat);
      tl.position.set(lx, 0.48, -bodyL * 0.5 - 0.01);
      grp.add(hl, tl);
    }

    return { group: grp, brakeMat };
  }

  private createTransLinkBus(): { group: THREE.Group; brakeMat: THREE.MeshBasicMaterial } {
    const grp = new THREE.Group();
    const hullMat = this.track(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.2 }));
    const stripeMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.38 }));
    const glassMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.78 }));
    const tireMat = this.track(new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.85 }));
    const destMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    const headMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfef9c3 }));
    const brakeMat = this.track(new THREE.MeshBasicMaterial({ color: 0xef4444 }));

    const hull = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.35, 2.35, 8.6)), hullMat);
    hull.position.y = 1.52;
    hull.castShadow = true;
    const blueBand = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.38, 0.45, 8.62)), stripeMat);
    blueBand.position.y = 0.72;
    const windows = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.39, 0.92, 7.9)), glassMat);
    windows.position.y = 1.92;
    const destSign = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.5, 0.24, 0.08)), destMat);
    destSign.position.set(0, 2.52, 4.32);
    grp.add(hull, blueBand, windows, destSign);

    const wheelGeo = this.track(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 12));
    wheelGeo.rotateZ(Math.PI / 2);
    for (const wx of [-1.14, 1.14]) {
      for (const wz of [-2.85, 0.2, 2.85]) {
        const w = new THREE.Mesh(wheelGeo, tireMat);
        w.position.set(wx, 0.42, wz);
        grp.add(w);
      }
    }
    const lightGeo = this.track(new THREE.BoxGeometry(0.38, 0.16, 0.06));
    for (const lx of [-0.78, 0.78]) {
      const hl = new THREE.Mesh(lightGeo, headMat);
      hl.position.set(lx, 0.72, 4.32);
      const tl = new THREE.Mesh(lightGeo, brakeMat);
      tl.position.set(lx, 0.72, -4.32);
      grp.add(hl, tl);
    }

    return { group: grp, brakeMat };
  }

  private buildStadiumParkingLots(anisotropy: number) {
    // 1. LARGE WEST STADIUM MEGA PARKING LOT: x in [-72, -39], z in [-28, +26] (33m x 54m)
    const westLotTex = this.createParkingLotTexture(anisotropy, 8, 3);
    const westLotMat = this.track(
      new THREE.MeshStandardMaterial({ map: westLotTex, roughness: 0.78, metalness: 0.1 })
    );
    const westLotPad = new THREE.Mesh(this.track(new THREE.BoxGeometry(33, 0.05, 54)), westLotMat);
    westLotPad.position.set(-55.5, 0.03, -1);
    westLotPad.receiveShadow = true;
    this.root.add(westLotPad);

    // 2. LARGE SOUTH FAN & VIP PARKING LOT: x in [-26, +26], z in [+40, +68] (52m x 28m)
    const southLotTex = this.createParkingLotTexture(anisotropy, 12, 2);
    const southLotMat = this.track(
      new THREE.MeshStandardMaterial({ map: southLotTex, roughness: 0.78, metalness: 0.1 })
    );
    const southLotPad = new THREE.Mesh(this.track(new THREE.BoxGeometry(52, 0.05, 28)), southLotMat);
    southLotPad.position.set(0, 0.03, 54);
    southLotPad.receiveShadow = true;
    this.root.add(southLotPad);

    // Parking Ticket Kiosks & Animated Entry Boom Gates
    const boothMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.5 }));
    const boothAccentMat = this.track(new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    const armMat = this.track(new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.4 }));

    const gatePositions: Array<[number, number, number]> = [
      [-39.2, 0.05, 16],
      [-39.2, 0.05, -16],
      [-14, 0.05, 39.8],
      [14, 0.05, 39.8],
    ];
    for (const [gx, gy, gz] of gatePositions) {
      const kiosk = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.4, 2.2, 1.4)), boothMat);
      kiosk.position.set(gx, gy + 1.1, gz);
      const trim = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.5, 0.18, 1.5)), boothAccentMat);
      trim.position.set(gx, gy + 2.24, gz);
      const armGeo = this.track(new THREE.BoxGeometry(3.2, 0.12, 0.12));
      armGeo.translate(1.5, 0, 0);
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(gx + 0.6, gy + 1.05, gz);
      this.boomArms.push(arm);
      this.root.add(kiosk, trim, arm);
    }

    // EV Charging Pedestals + Tall Dual-Arm Parking Lot Floodlight Poles
    const poleMat = this.track(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.72, roughness: 0.3 }));
    const floodPositions: Array<[number, number]> = [
      [-55.5, -18],
      [-55.5, 0],
      [-55.5, 18],
      [-16, 54],
      [0, 54],
      [16, 54],
    ];
    for (const [fx, fz] of floodPositions) {
      const pole = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.14, 0.2, 7.6, 8)), poleMat);
      pole.position.set(fx, 3.8, fz);
      const cross = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.4, 0.16, 0.24)), poleMat);
      cross.position.set(fx, 7.6, fz);
      const lampL = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.55, 0.14, 0.4)), this.streetLampGlowMat);
      lampL.position.set(fx - 0.95, 7.5, fz);
      const lampR = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.55, 0.14, 0.4)), this.streetLampGlowMat);
      lampR.position.set(fx + 0.95, 7.5, fz);
      this.root.add(pole, cross, lampL, lampR);

      // EV Charger Pedestal nearby
      const evPost = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.36, 1.35, 0.3)), boothMat);
      evPost.position.set(fx + 1.4, 0.7, fz);
      const evStrip = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.38, 0.22, 0.32)), this.evChargerGlowMat);
      evStrip.position.set(fx + 1.4, 1.25, fz);
      this.root.add(evPost, evStrip);
    }

    // Populated Parked Cars across West & South Lots (~42 composite cars)
    const carPalette = [0xe2e8f0, 0x334155, 0x0284c7, 0xdc2626, 0x0f766e, 0xf59e0b, 0x64748b, 0x1e293b];
    let idx = 0;

    // West Lot parked stalls (3 aisle bands centered at z = -19, -1, +17)
    const westRows = [-24.5, -13.5, -6.5, 4.5, 11.5, 22.5];
    for (let r = 0; r < westRows.length; r++) {
      for (let c = 0; c < 6; c++) {
        // Leave realistic open stalls and clearance for moving cars
        if ((r + c) % 4 === 1) continue;
        const px = -67.5 + c * 4.5;
        const pz = westRows[r];
        const car = this.createCompositeCar(carPalette[idx % carPalette.length], idx % 3 === 0, false);
        car.group.position.set(px, 0.055, pz);
        car.group.rotation.y = r % 2 === 0 ? 0 : Math.PI;
        this.root.add(car.group);
        idx++;
      }
    }

    // South Lot parked stalls
    const southRows = [43.2, 50.2, 57.8, 64.8];
    for (let r = 0; r < southRows.length; r++) {
      for (let c = 0; c < 9; c++) {
        if ((r * 3 + c) % 3 === 0) continue;
        const px = -21.5 + c * 5.2;
        const pz = southRows[r];
        const car = this.createCompositeCar(carPalette[idx % carPalette.length], idx % 2 === 0, false);
        car.group.position.set(px, 0.055, pz);
        car.group.rotation.y = r % 2 === 0 ? 0 : Math.PI;
        this.root.add(car.group);
        idx++;
      }
    }

    // Dynamic Maneuvering Cars inside West & South Parking Lots (driving aisles & circling stalls!)
    const parkingPaths: Array<{
      color: number;
      suv: boolean;
      speed: number;
      waypoints: Array<{ x: number; z: number; pauseSec: number }>;
    }> = [
      {
        color: 0x38bdf8,
        suv: true,
        speed: 4.8,
        waypoints: [
          { x: -39.5, z: 16.5, pauseSec: 0.8 },
          { x: -67.0, z: 16.5, pauseSec: 0.4 },
          { x: -67.0, z: -1.0, pauseSec: 0.4 },
          { x: -41.5, z: -1.0, pauseSec: 1.6 },
          { x: -41.5, z: -19.0, pauseSec: 0.4 },
          { x: -67.0, z: -19.0, pauseSec: 0.6 },
          { x: -67.0, z: 16.5, pauseSec: 0.3 },
        ],
      },
      {
        color: 0xf43f5e,
        suv: false,
        speed: 5.2,
        waypoints: [
          { x: -41.5, z: -18.5, pauseSec: 0.6 },
          { x: -66.5, z: -18.5, pauseSec: 0.4 },
          { x: -66.5, z: -1.5, pauseSec: 1.4 },
          { x: -41.5, z: -1.5, pauseSec: 0.4 },
          { x: -41.5, z: -18.5, pauseSec: 0.8 },
        ],
      },
      {
        color: 0xfacc15,
        suv: false,
        speed: 4.5,
        waypoints: [
          { x: -14.0, z: 46.8, pauseSec: 0.7 },
          { x: 20.5, z: 46.8, pauseSec: 1.2 },
          { x: 20.5, z: 61.4, pauseSec: 0.4 },
          { x: -20.5, z: 61.4, pauseSec: 0.4 },
          { x: -20.5, z: 46.8, pauseSec: 0.5 },
        ],
      },
      {
        color: 0xe2e8f0,
        suv: true,
        speed: 4.9,
        waypoints: [
          { x: 18.0, z: 61.4, pauseSec: 0.9 },
          { x: -18.0, z: 61.4, pauseSec: 0.5 },
          { x: -18.0, z: 46.8, pauseSec: 1.5 },
          { x: 18.0, z: 46.8, pauseSec: 0.5 },
        ],
      },
    ];

    for (const pp of parkingPaths) {
      const car = this.createCompositeCar(pp.color, pp.suv, false);
      car.group.position.set(pp.waypoints[0].x, 0.055, pp.waypoints[0].z);
      this.root.add(car.group);
      this.parkingCars.push({
        group: car.group,
        brakeMat: car.brakeMat,
        waypoints: pp.waypoints,
        segIdx: 0,
        t: 0,
        waitTimer: 0,
        speed: pp.speed,
      });
    }
  }

  private buildTrafficSignals() {
    const poleMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.75, roughness: 0.3 }));
    const housingMat = this.track(new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.4 }));
    const corners: Array<[number, number]> = [
      [-37.8, 29.2],
      [37.8, 29.2],
      [-37.8, -42.6],
      [37.8, -42.6],
      [-37.8, 69.2],
      [37.8, 69.2],
    ];

    const bulbGeo = this.track(new THREE.SphereGeometry(0.11, 8, 8));

    for (const [cx, cz] of corners) {
      const grp = new THREE.Group();
      grp.position.set(cx, 0.05, cz);

      const post = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.11, 0.14, 5.4, 8)), poleMat);
      post.position.y = 2.7;
      const arm = new THREE.Mesh(this.track(new THREE.BoxGeometry(3.8, 0.14, 0.14)), poleMat);
      arm.position.set(cx < 0 ? 1.8 : -1.8, 5.2, 0);
      grp.add(post, arm);

      const nsBox = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.36, 0.95, 0.28)), housingMat);
      nsBox.position.set(cx < 0 ? 2.6 : -2.6, 5.15, 0);
      grp.add(nsBox);

      const nsRedMat = this.track(new THREE.MeshBasicMaterial({ color: 0x331111 }));
      const nsAmberMat = this.track(new THREE.MeshBasicMaterial({ color: 0x332200 }));
      const nsGreenMat = this.track(new THREE.MeshBasicMaterial({ color: 0x22c55e }));
      const ewRedMat = this.track(new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      const ewAmberMat = this.track(new THREE.MeshBasicMaterial({ color: 0x332200 }));
      const ewGreenMat = this.track(new THREE.MeshBasicMaterial({ color: 0x113311 }));

      const bx = cx < 0 ? 2.6 : -2.6;
      const addTriple = (ox: number, oz: number, rM: THREE.Material, aM: THREE.Material, gM: THREE.Material) => {
        const r = new THREE.Mesh(bulbGeo, rM);
        r.position.set(ox, 5.42, oz);
        const a = new THREE.Mesh(bulbGeo, aM);
        a.position.set(ox, 5.15, oz);
        const g = new THREE.Mesh(bulbGeo, gM);
        g.position.set(ox, 4.88, oz);
        grp.add(r, a, g);
      };

      addTriple(bx, 0.16, nsRedMat, nsAmberMat, nsGreenMat);
      addTriple(bx, -0.16, nsRedMat, nsAmberMat, nsGreenMat);
      addTriple(bx + 0.2, 0, ewRedMat, ewAmberMat, ewGreenMat);
      addTriple(bx - 0.2, 0, ewRedMat, ewAmberMat, ewGreenMat);

      this.root.add(grp);
      this.signalHeads.push({
        x: cx,
        z: cz,
        nsGreenMat,
        nsAmberMat,
        nsRedMat,
        ewGreenMat,
        ewAmberMat,
        ewRedMat,
      });
    }
  }

  private buildElevatedSkyTrain() {
    // Elevated Vancouver Expo Line Concrete Guideway along East Corridor (x = +43, z = -42..+96)
    const pierMat = this.track(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 }));
    const trackMat = this.track(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.2 }));
    const canopyMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.42,
        roughness: 0.15,
        metalness: 0.2,
        depthWrite: false,
      })
    );
    const stationSignMat = this.track(new THREE.MeshBasicMaterial({ color: 0x00f0ff }));

    const guidewayBeam = new THREE.Mesh(this.track(new THREE.BoxGeometry(3.8, 0.72, 152)), trackMat);
    guidewayBeam.position.set(43, 6.2, 24);
    guidewayBeam.castShadow = true;
    this.root.add(guidewayBeam);

    // Concrete T-Piers
    for (let pz = -42; pz <= 92; pz += 14) {
      const col = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.55, 0.65, 6.0, 10)), pierMat);
      col.position.set(43, 3.0, pz);
      const cap = new THREE.Mesh(this.track(new THREE.BoxGeometry(3.6, 0.55, 1.3)), pierMat);
      cap.position.set(43, 5.75, pz);
      this.root.add(col, cap);
    }

    // Stadium-Chinatown SkyTrain Station Glass Canopy at (43, 6.6, 8)
    const stationPlat = new THREE.Mesh(this.track(new THREE.BoxGeometry(6.6, 0.4, 24)), pierMat);
    stationPlat.position.set(43, 6.5, 8);
    const stationRoof = new THREE.Mesh(this.track(new THREE.BoxGeometry(7.2, 0.2, 24)), canopyMat);
    stationRoof.position.set(43, 9.2, 8);
    const neonEdge = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.18, 0.22, 24)), stationSignMat);
    neonEdge.position.set(39.4, 9.2, 8);
    this.root.add(stationPlat, stationRoof, neonEdge);

    // 4-Car Articulated SkyTrain
    const trainBodyMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.28, metalness: 0.35 }));
    const trainStripeMat = this.track(new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }));
    const trainGlassMat = this.track(new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.1, metalness: 0.85 }));

    for (let c = 0; c < 4; c++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.3, 2.1, 8.8)), trainBodyMat);
      body.position.y = 1.05;
      const stripe = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.34, 0.28, 8.82)), trainStripeMat);
      stripe.position.y = 0.45;
      const glass = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.34, 0.78, 8.2)), trainGlassMat);
      glass.position.y = 1.32;
      car.add(body, stripe, glass);
      car.position.set(43, 6.62, -40 + c * 9.4);
      this.skyTrainCars.push(car);
      this.root.add(car);
    }
  }

  private buildVancouverLandmarks() {
    // 1. Vancouver Convention Centre West (Sloping Living Green Roof + Waterfront Glass Hall at x = -54, z = -43)
    const conv = new THREE.Group();
    conv.position.set(-54, 0.05, -43);
    const convGlassMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xbae6fd, roughness: 0.2, metalness: 0.65 })
    );
    const livingRoofMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.85, metalness: 0.05 })
    );
    const timberMat = this.track(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.6 }));

    const convHall = new THREE.Mesh(this.track(new THREE.BoxGeometry(22, 5.2, 11)), convGlassMat);
    convHall.position.y = 2.6;
    const greenRoof = new THREE.Mesh(this.track(new THREE.BoxGeometry(23.5, 0.8, 12.6)), livingRoofMat);
    greenRoof.position.set(0, 5.6, 0);
    greenRoof.rotation.z = -0.14;
    greenRoof.rotation.x = 0.06;
    const timberSoffit = new THREE.Mesh(this.track(new THREE.BoxGeometry(23.2, 0.35, 12.2)), timberMat);
    timberSoffit.position.set(0, 5.1, 0);
    timberSoffit.rotation.copy(greenRoof.rotation);
    conv.add(convHall, timberSoffit, greenRoof);
    this.root.add(conv);

    // 2. Gastown Steam Clock (Heritage Brick Monument + Brass Crown + Clock Faces + Animated Steam Puffs at x = 39.5, z = -32)
    const steamClock = new THREE.Group();
    steamClock.position.set(39.5, 0.08, -32);
    const brickMat = this.track(new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.82 }));
    const brassMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.85 }));
    const dialMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));

    const plinth = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.5, 1.3, 1.5)), brickMat);
    plinth.position.y = 0.65;
    const shaft = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.05, 3.1, 1.05)), brickMat);
    shaft.position.y = 2.8;
    const clockHead = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.22, 1.15, 1.22)), brassMat);
    clockHead.position.y = 4.65;
    const finial = new THREE.Mesh(this.track(new THREE.ConeGeometry(0.65, 1.25, 4)), brassMat);
    finial.position.y = 5.85;
    finial.rotation.y = Math.PI * 0.25;
    steamClock.add(plinth, shaft, clockHead, finial);

    const dialGeo = this.track(new THREE.CircleGeometry(0.42, 16));
    for (let f = 0; f < 4; f++) {
      const dial = new THREE.Mesh(dialGeo, dialMat);
      const ang = (f * Math.PI) / 2;
      dial.position.set(Math.sin(ang) * 0.63, 4.65, Math.cos(ang) * 0.63);
      dial.rotation.y = ang;
      steamClock.add(dial);
    }
    this.root.add(steamClock);

    // Animated Steam Puffs above Steam Clock
    const puffGeo = this.track(new THREE.SphereGeometry(0.28, 8, 8));
    for (let s = 0; s < 6; s++) {
      const puffMat = this.track(
        new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.45, depthWrite: false })
      );
      const puff = new THREE.Mesh(puffGeo, puffMat);
      puff.position.set(39.5, 6.4 + s * 0.55, -32);
      this.root.add(puff);
      this.steamPuffs.push({
        mesh: puff,
        age: s * 0.4,
        life: 2.4,
        driftX: (s % 2 === 0 ? 1 : -1) * 0.22,
        driftZ: -0.18,
      });
    }

    // 3. Marine Building Art Deco Ziggurat Spire (x = -54, z = -56)
    const marine = new THREE.Group();
    marine.position.set(-54, 0, -56);
    const decoStone = this.track(new THREE.MeshStandardMaterial({ color: 0xd6bfa6, roughness: 0.55 }));
    const decoCopper = this.track(new THREE.MeshStandardMaterial({ color: 0x2dd4bf, roughness: 0.35, metalness: 0.45 }));
    const tiers: Array<[number, number, number, number]> = [
      [8.2, 10, 7.6, 5],
      [6.4, 14, 6.0, 17],
      [4.6, 10, 4.4, 29],
      [2.6, 6.5, 2.6, 37.25],
    ];
    for (const [w, h, d, y] of tiers) {
      const m = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), decoStone);
      m.position.y = y;
      marine.add(m);
    }
    const roofCap = new THREE.Mesh(this.track(new THREE.ConeGeometry(2.0, 6.2, 4)), decoCopper);
    roofCap.position.y = 43.4;
    roofCap.rotation.y = Math.PI * 0.25;
    marine.add(roofCap);
    this.root.add(marine);

    // 4. Vancouver Public Library Colosseum (Library Square at x = +56, z = -10)
    const vpl = new THREE.Group();
    vpl.position.set(56, 0.08, -10);
    const sandstoneMat = this.track(new THREE.MeshStandardMaterial({ color: 0xc29b7a, roughness: 0.65 }));
    const vplGlass = this.track(new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.22, metalness: 0.55 }));
    const vplOuter = new THREE.Mesh(this.track(new THREE.CylinderGeometry(11.5, 12.2, 11.5, 20, 1, true)), sandstoneMat);
    vplOuter.position.y = 5.75;
    const vplCore = new THREE.Mesh(this.track(new THREE.CylinderGeometry(9.6, 9.6, 12.6, 20)), vplGlass);
    vplCore.position.y = 6.3;
    const vplRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(11.6, 0.42, 8, 28)), sandstoneMat);
    vplRing.rotation.x = Math.PI / 2;
    vplRing.position.y = 11.5;
    vpl.add(vplOuter, vplCore, vplRing);
    this.root.add(vpl);

    // 5. Rogers Arena Neighbour Sports Dome (x = +60, z = +54)
    const rogers = new THREE.Group();
    rogers.position.set(60, 0.08, 54);
    const arenaBody = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(15.5, 14.2, 8.6, 24)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.45 }))
    );
    arenaBody.position.y = 4.3;
    const arenaRoof = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(15.4, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.34)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.38, metalness: 0.3 }))
    );
    arenaRoof.scale.set(1, 0.42, 1);
    arenaRoof.position.y = 6.9;
    const arenaRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(15.4, 0.45, 8, 32)), this.rogersRingMat);
    arenaRing.rotation.x = Math.PI / 2;
    arenaRing.position.y = 8.4;
    rogers.add(arenaBody, arenaRoof, arenaRing);
    this.root.add(rogers);

    // 6. False Creek / Cambie South Bridge Span (x = +12, z = +116)
    const southBridge = new THREE.Group();
    southBridge.position.set(12, 0, 114);
    const sDeck = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(110, 1.3, 6.2)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 }))
    );
    sDeck.position.y = 8.4;
    southBridge.add(sDeck);
    for (const px of [-36, 0, 36]) {
      const pier = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(2.6, 8.4, 6.6)),
        this.track(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72 }))
      );
      pier.position.set(px, 4.2, 0);
      southBridge.add(pier);
    }
    this.root.add(southBridge);

    // 7. Instanced Stanley Park & Boulevard Evergreen Grove (Pacific Northwest Douglas Firs)
    const treeCoords: Array<[number, number, number]> = [
      [-92, -32, 1.25],
      [-96, -24, 1.15],
      [-102, -36, 1.4],
      [-88, -40, 1.1],
      [-74, -44, 1.05],
      [-64, -44, 0.95],
      [-37, -28, 0.85],
      [37, -28, 0.85],
      [-37, 28, 0.9],
      [37, 28, 0.9],
      [-28, 38, 0.95],
      [28, 38, 0.95],
      [-37, 68, 0.9],
      [37, 68, 0.9],
      [48, -32, 1.05],
      [62, -32, 1.1],
      [74, -42, 1.15],
      [-86, 48, 1.1],
      [-86, 62, 1.0],
      [-86, 84, 1.15],
      [86, 48, 1.1],
      [86, 78, 1.05],
    ];
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 7));
    const crownGeo = this.track(new THREE.ConeGeometry(1.45, 4.6, 8));
    const trunkMat = this.track(new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 }));
    const foliageMat = this.track(new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.82 }));
    const nTrees = treeCoords.length;
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, nTrees);
    const crownInst = new THREE.InstancedMesh(crownGeo, foliageMat, nTrees);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    treeCoords.forEach(([tx, tz, sc], i) => {
      dummy.position.set(tx, 1.2 * sc, tz);
      dummy.scale.set(sc, sc, sc);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tx, 3.6 * sc, tz);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i, dummy.matrix);
      col.setHSL(0.37 + (i % 4) * 0.015, 0.58, 0.25 + (i % 3) * 0.04);
      crownInst.setColorAt(i, col);
    });
    trunkInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceMatrix.needsUpdate = true;
    if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    crownInst.computeBoundingSphere();
    trunkInst.frustumCulled = false;
    crownInst.frustumCulled = false;
    this.root.add(trunkInst, crownInst);
  }

  private buildDenseCityBlocks() {
    // 28+ Surrounding Yaletown / Gastown / Downtown High-Rises & Retail Podiums
    const buildingSpecs: Array<{
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      tint: number;
      hasRetail: boolean;
    }> = [
      // South-West District (below Parking Lot A & West of Lot B)
      { x: -56, z: 90, w: 12, d: 11, h: 28, tint: 0xbae6fd, hasRetail: true },
      { x: -42, z: 96, w: 10, d: 10, h: 36, tint: 0xdbeafe, hasRetail: true },
      { x: -68, z: 100, w: 11, d: 11, h: 24, tint: 0xcffafe, hasRetail: true },
      { x: -54, z: 110, w: 13, d: 10, h: 32, tint: 0xe0f2fe, hasRetail: false },
      // South-Center Yaletown Towers (south of Nelson St z=74)
      { x: -16, z: 92, w: 11, d: 10, h: 38, tint: 0xbae6fd, hasRetail: true },
      { x: 0, z: 96, w: 12, d: 11, h: 46, tint: 0xdbeafe, hasRetail: true },
      { x: 16, z: 90, w: 11, d: 10, h: 34, tint: 0xcffafe, hasRetail: true },
      { x: -8, z: 110, w: 13, d: 10, h: 28, tint: 0xe2e8f0, hasRetail: false },
      { x: 20, z: 108, w: 12, d: 11, h: 31, tint: 0xbae6fd, hasRetail: false },
      // South-East Towers
      { x: 54, z: 92, w: 12, d: 11, h: 29, tint: 0xdbeafe, hasRetail: true },
      { x: 68, z: 96, w: 11, d: 10, h: 35, tint: 0xcffafe, hasRetail: true },
      { x: 88, z: 88, w: 12, d: 11, h: 26, tint: 0xe0f2fe, hasRetail: true },
      // Far West Commercial Corridor (West of Homer St x=-78)
      { x: -94, z: -12, w: 12, d: 14, h: 26, tint: 0xbae6fd, hasRetail: true },
      { x: -96, z: 8, w: 13, d: 14, h: 34, tint: 0xdbeafe, hasRetail: true },
      { x: -94, z: 26, w: 12, d: 12, h: 29, tint: 0xcffafe, hasRetail: true },
      { x: -96, z: 54, w: 13, d: 14, h: 37, tint: 0xe0f2fe, hasRetail: true },
      { x: -94, z: 74, w: 12, d: 12, h: 24, tint: 0xe2e8f0, hasRetail: false },
      { x: -112, z: 18, w: 13, d: 14, h: 41, tint: 0xbae6fd, hasRetail: false },
      { x: -112, z: 46, w: 13, d: 14, h: 33, tint: 0xdbeafe, hasRetail: false },
      // Far East Gastown / Chinatown Corridor (East of Quebec St x=+78)
      { x: 94, z: -20, w: 12, d: 13, h: 22, tint: 0xfde68a, hasRetail: true },
      { x: 96, z: 0, w: 13, d: 14, h: 27, tint: 0xdbeafe, hasRetail: true },
      { x: 94, z: 20, w: 12, d: 13, h: 31, tint: 0xcffafe, hasRetail: true },
      { x: 96, z: 44, w: 13, d: 14, h: 36, tint: 0xbae6fd, hasRetail: true },
      { x: 94, z: 66, w: 12, d: 12, h: 25, tint: 0xe2e8f0, hasRetail: false },
      { x: 112, z: 12, w: 13, d: 14, h: 39, tint: 0xdbeafe, hasRetail: false },
      { x: 112, z: 42, w: 13, d: 14, h: 33, tint: 0xcffafe, hasRetail: false },
      // Mid-East Heritage Brick Podiums along Beatty/Gastown
      { x: 58, z: -28, w: 13, d: 10, h: 15, tint: 0xfed7aa, hasRetail: true },
      { x: 58, z: 22, w: 12, d: 11, h: 22, tint: 0xbae6fd, hasRetail: true },
    ];

    const unitBox = this.track(new THREE.BoxGeometry(1, 1, 1));
    const podiumMat = this.track(new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55, metalness: 0.35 }));
    const n = buildingSpecs.length;
    const podInst = new THREE.InstancedMesh(unitBox, podiumMat, n);
    const towerInst = new THREE.InstancedMesh(unitBox, this.cityWindowMat, n);
    const storefrontInst = new THREE.InstancedMesh(unitBox, this.storefrontGlowMat, n);

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    buildingSpecs.forEach((b, i) => {
      const podH = 3.8;
      dummy.position.set(b.x, podH * 0.5 + 0.05, b.z);
      dummy.scale.set(b.w * 1.06, podH, b.d * 1.06);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      podInst.setMatrixAt(i, dummy.matrix);

      const shaftH = b.h - podH;
      dummy.position.set(b.x, podH + shaftH * 0.5, b.z);
      dummy.scale.set(b.w, shaftH, b.d);
      dummy.updateMatrix();
      towerInst.setMatrixAt(i, dummy.matrix);
      col.setHex(b.tint);
      towerInst.setColorAt(i, col);

      if (b.hasRetail) {
        dummy.position.set(b.x, 1.8, b.z);
        dummy.scale.set(b.w * 1.08, 0.32, b.d * 1.08);
      } else {
        dummy.position.set(0, -50, 0);
        dummy.scale.set(0.01, 0.01, 0.01);
      }
      dummy.updateMatrix();
      storefrontInst.setMatrixAt(i, dummy.matrix);
    });

    for (const inst of [podInst, towerInst, storefrontInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.frustumCulled = false;
      this.root.add(inst);
    }

    // Streetlight Row along Pacific Blvd & Waterfront Way
    const lampPoleGeo = this.track(new THREE.CylinderGeometry(0.08, 0.11, 5.2, 6));
    const lampHeadGeo = this.track(new THREE.BoxGeometry(0.45, 0.14, 0.25));
    const lampMat = this.track(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 }));
    const lampSpots: Array<[number, number]> = [];
    for (let x = -70; x <= 70; x += 20) {
      lampSpots.push([x, 29.2]);
      lampSpots.push([x, -33.6]);
    }
    const lpInst = new THREE.InstancedMesh(lampPoleGeo, lampMat, lampSpots.length);
    const lhInst = new THREE.InstancedMesh(lampHeadGeo, this.streetLampGlowMat, lampSpots.length);
    lampSpots.forEach(([lx, lz], i) => {
      dummy.position.set(lx, 2.65, lz);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lpInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(lx, 5.25, lz);
      dummy.updateMatrix();
      lhInst.setMatrixAt(i, dummy.matrix);
    });
    lpInst.instanceMatrix.needsUpdate = true;
    lhInst.instanceMatrix.needsUpdate = true;
    lpInst.computeBoundingSphere();
    lhInst.computeBoundingSphere();
    lpInst.frustumCulled = false;
    lhInst.frustumCulled = false;
    this.root.add(lpInst, lhInst);
  }

  private buildDynamicStreetTraffic() {
    const colors = [0x0ea5e9, 0xef4444, 0xf8fafc, 0x475569, 0x10b981, 0xf59e0b, 0x6366f1];

    // Pacific Blvd (z=34) Eastbound (+X, lane z=+35.9) & Westbound (-X, lane z=+32.1)
    for (let i = 0; i < 7; i++) {
      const isBus = i === 2;
      const isTaxi = i === 5;
      const v = isBus
        ? this.createTransLinkBus()
        : this.createCompositeCar(isTaxi ? 0xfacc15 : colors[i % colors.length], i % 2 === 0, isTaxi);
      this.root.add(v.group);
      this.trafficVehicles.push({
        group: v.group,
        brakeMat: v.brakeMat,
        axis: 'X',
        dir: 1,
        laneCoord: 35.9,
        posCoord: -95 + i * 28,
        minCoord: -102,
        maxCoord: 102,
        baseSpeed: isBus ? 7.8 : 10.5 + (i % 3) * 1.1,
        curSpeed: 9,
        length: isBus ? 9.5 : 5.2,
        isBus,
        stopLines: [-38.5, 27.5],
      });
    }

    for (let i = 0; i < 7; i++) {
      const isTaxi = i === 1 || i === 4;
      const v = this.createCompositeCar(isTaxi ? 0x22c55e : colors[(i + 3) % colors.length], i % 3 === 0, isTaxi);
      this.root.add(v.group);
      this.trafficVehicles.push({
        group: v.group,
        brakeMat: v.brakeMat,
        axis: 'X',
        dir: -1,
        laneCoord: 32.1,
        posCoord: 92 - i * 27,
        minCoord: -102,
        maxCoord: 102,
        baseSpeed: 10.8 + (i % 2) * 1.4,
        curSpeed: 10,
        length: 5.2,
        isBus: false,
        stopLines: [38.5, -27.5],
      });
    }

    // Burrard St (x=-33) Northbound (-Z, lane x=-31.1) & Southbound (+Z, lane x=-34.9)
    for (let i = 0; i < 6; i++) {
      const isBus = i === 3;
      const v = isBus ? this.createTransLinkBus() : this.createCompositeCar(colors[(i + 1) % colors.length], i % 2 === 1, false);
      this.root.add(v.group);
      this.trafficVehicles.push({
        group: v.group,
        brakeMat: v.brakeMat,
        axis: 'Z',
        dir: 1,
        laneCoord: -34.9,
        posCoord: -40 + i * 24,
        minCoord: -44,
        maxCoord: 96,
        baseSpeed: isBus ? 7.6 : 10.2 + (i % 3),
        curSpeed: 9,
        length: isBus ? 9.5 : 5.2,
        isBus,
        stopLines: [28.5, 68.5],
      });
    }

    for (let i = 0; i < 6; i++) {
      const v = this.createCompositeCar(colors[(i + 4) % colors.length], i % 2 === 0, i === 2);
      this.root.add(v.group);
      this.trafficVehicles.push({
        group: v.group,
        brakeMat: v.brakeMat,
        axis: 'Z',
        dir: -1,
        laneCoord: -31.1,
        posCoord: 90 - i * 24,
        minCoord: -44,
        maxCoord: 96,
        baseSpeed: 10.4 + (i % 3) * 0.9,
        curSpeed: 9.5,
        length: 5.2,
        isBus: false,
        stopLines: [79.5, 39.5, -32.5],
      });
    }

    // Beatty / Cambie St (x=+33) & Waterfront Way (z=-38)
    for (let i = 0; i < 5; i++) {
      const v = this.createCompositeCar(colors[(i + 2) % colors.length], i % 2 === 0, false);
      this.root.add(v.group);
      this.trafficVehicles.push({
        group: v.group,
        brakeMat: v.brakeMat,
        axis: 'Z',
        dir: -1,
        laneCoord: 34.8,
        posCoord: 88 - i * 26,
        minCoord: -44,
        maxCoord: 96,
        baseSpeed: 10.6,
        curSpeed: 9,
        length: 5.2,
        isBus: false,
        stopLines: [79.5, 39.5, -32.5],
      });
    }

    for (let i = 0; i < 5; i++) {
      const v = this.createCompositeCar(colors[i % colors.length], i % 3 === 0, i === 1);
      this.root.add(v.group);
      this.trafficVehicles.push({
        group: v.group,
        brakeMat: v.brakeMat,
        axis: 'X',
        dir: 1,
        laneCoord: -36.3,
        posCoord: -90 + i * 36,
        minCoord: -102,
        maxCoord: 102,
        baseSpeed: 9.8,
        curSpeed: 9,
        length: 5.2,
        isBus: false,
        stopLines: [-38.5, 27.5],
      });
    }
  }

  private buildDynamicPedestrians() {
    const legGeo = this.track(new THREE.CylinderGeometry(0.055, 0.048, 0.72, 6));
    legGeo.translate(0, -0.36, 0);
    const armGeo = this.track(new THREE.CylinderGeometry(0.042, 0.036, 0.52, 6));
    armGeo.translate(0, -0.26, 0);
    const torsoGeo = this.track(new THREE.CylinderGeometry(0.16, 0.14, 0.56, 8));
    const headGeo = this.track(new THREE.SphereGeometry(0.13, 8, 8));
    const pantsMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 }));
    const skinMat = this.track(new THREE.MeshStandardMaterial({ color: 0xd9a079, roughness: 0.6 }));

    const coatPalette = [0x00f0ff, 0xff6b1a, 0xff3d7f, 0xe2e8f0, 0x3b82f6, 0x10b981, 0xf59e0b, 0x475569];
    const coatMats = coatPalette.map((hex) =>
      this.track(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.65 }))
    );

    const routes: Array<{
      x1: number;
      z1: number;
      x2: number;
      z2: number;
      crosswalkAxis: 'NS' | 'EW' | null;
      crosswalkMin: number;
      crosswalkMax: number;
    }> = [
      // Stadium South Promenade
      { x1: -26, z1: 28.8, x2: 26, z2: 28.8, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      { x1: 24, z1: 29.4, x2: -24, z2: 29.4, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      // Stadium North Promenade
      { x1: -26, z1: -29.2, x2: 26, z2: -29.2, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      // Stadium West & East Sidewalks
      { x1: -27.5, z1: -24, x2: -27.5, z2: 25, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      { x1: 27.5, z1: -24, x2: 27.5, z2: 25, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      // Parking Lot Walkways -> Stadium Gates
      { x1: -55, z1: 12, x2: -36, z2: 12, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      { x1: -50, z1: -10, x2: -36, z2: -10, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      { x1: -6, z1: 62, x2: -6, z2: 39, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      { x1: 8, z1: 60, x2: 8, z2: 39, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      // Coal Harbour Waterfront Seawall Stroll
      { x1: -80, z1: -45.5, x2: 70, z2: -45.5, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      // SkyTrain Concourse & Library Plaza
      { x1: 38, z1: -16, x2: 38, z2: 26, crosswalkAxis: null, crosswalkMin: 0, crosswalkMax: 0 },
      // Signalized Crosswalks across Pacific Blvd (NS crossing) & Burrard/Beatty (EW crossing)
      { x1: -37.2, z1: 27.5, x2: -37.2, z2: 40.5, crosswalkAxis: 'NS', crosswalkMin: 29.5, crosswalkMax: 38.5 },
      { x1: 37.2, z1: 27.5, x2: 37.2, z2: 40.5, crosswalkAxis: 'NS', crosswalkMin: 29.5, crosswalkMax: 38.5 },
      { x1: -39.5, z1: 28.8, x2: -26.5, z2: 28.8, crosswalkAxis: 'EW', crosswalkMin: -37.5, crosswalkMax: -28.5 },
      { x1: 26.5, z1: 28.8, x2: 39.5, z2: 28.8, crosswalkAxis: 'EW', crosswalkMin: 28.5, crosswalkMax: 37.5 },
    ];

    // Spawn 52 pedestrians distributed cleanly across all routes
    for (let i = 0; i < 52; i++) {
      const rt = routes[i % routes.length];
      const grp = new THREE.Group();
      const legL = new THREE.Mesh(legGeo, pantsMat);
      legL.position.set(-0.08, 0.72, 0);
      const legR = new THREE.Mesh(legGeo, pantsMat);
      legR.position.set(0.08, 0.72, 0);
      const torso = new THREE.Mesh(torsoGeo, coatMats[i % coatMats.length]);
      torso.position.y = 1.02;
      const head = new THREE.Mesh(headGeo, skinMat);
      head.position.y = 1.44;
      const armL = new THREE.Mesh(armGeo, coatMats[i % coatMats.length]);
      armL.position.set(-0.21, 1.24, 0);
      const armR = new THREE.Mesh(armGeo, coatMats[i % coatMats.length]);
      armR.position.set(0.21, 1.24, 0);
      grp.add(legL, legR, torso, head, armL, armR);
      this.root.add(grp);

      const startT = ((i * 0.23) % 0.92) + 0.04;
      const jitterX = ((i % 3) - 1) * 0.45;
      const jitterZ = (((i + 1) % 3) - 1) * 0.35;
      const x1 = rt.x1 + (rt.crosswalkAxis === 'NS' ? jitterX : 0);
      const x2 = rt.x2 + (rt.crosswalkAxis === 'NS' ? jitterX : 0);
      const z1 = rt.z1 + (rt.crosswalkAxis === 'EW' ? jitterZ : 0);
      const z2 = rt.z2 + (rt.crosswalkAxis === 'EW' ? jitterZ : 0);

      grp.position.set(
        THREE.MathUtils.lerp(x1, x2, startT),
        0.08,
        THREE.MathUtils.lerp(z1, z2, startT)
      );

      this.pedestrians.push({
        group: grp,
        legL,
        legR,
        armL,
        armR,
        x1,
        z1,
        x2,
        z2,
        t: startT,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 1.45 + (i % 5) * 0.22,
        phase: i * 0.85,
        crosswalkAxis: rt.crosswalkAxis,
        crosswalkMin: rt.crosswalkMin,
        crosswalkMax: rt.crosswalkMax,
      });
    }
  }

  private buildBoulevardLampsAndPlazaPortal() {
    const poleMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.72 })
    );
    const poleGeo = this.track(new THREE.CylinderGeometry(0.11, 0.14, 5.2, 8));
    const headGeo = this.track(new THREE.BoxGeometry(0.95, 0.16, 0.34));

    const coords: Array<{ x: number; z: number; rotY: number }> = [];
    for (let x = -72; x <= 72; x += 24) {
      if (Math.abs(x) < 18) continue;
      coords.push({ x, z: 29.2, rotY: 0 });
      coords.push({ x, z: -41.5, rotY: Math.PI });
    }
    for (let z = -24; z <= 64; z += 22) {
      coords.push({ x: -28.2, z, rotY: Math.PI / 2 });
      coords.push({ x: 28.2, z, rotY: -Math.PI / 2 });
    }

    const poles = new THREE.InstancedMesh(poleGeo, poleMat, coords.length);
    const heads = new THREE.InstancedMesh(headGeo, this.streetLampGlowMat, coords.length);
    const dummy = new THREE.Object3D();

    coords.forEach((pt, idx) => {
      dummy.position.set(pt.x, 2.6, pt.z);
      dummy.rotation.set(0, pt.rotY, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(
        pt.x + Math.sin(pt.rotY) * 0.42,
        5.25,
        pt.z + Math.cos(pt.rotY) * 0.42
      );
      dummy.updateMatrix();
      heads.setMatrixAt(idx, dummy.matrix);
    });

    for (const inst of [poles, heads]) {
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.frustumCulled = false;
      this.root.add(inst);
    }

    // Illuminated AIM Coal Harbour Plaza Gateways flanking South concourse
    const archGeo = this.track(new THREE.BoxGeometry(18, 0.55, 0.9));
    const pillarGeo = this.track(new THREE.BoxGeometry(1.1, 7.2, 1.1));
    const gateway = new THREE.Group();
    gateway.position.set(0, 0, 27.6);
    const leftP = new THREE.Mesh(pillarGeo, poleMat);
    leftP.position.set(-8.6, 3.6, 0);
    const rightP = new THREE.Mesh(pillarGeo, poleMat);
    rightP.position.set(8.6, 3.6, 0);
    const lintel = new THREE.Mesh(archGeo, poleMat);
    lintel.position.set(0, 7.1, 0);
    const neonBar = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(16.6, 0.18, 0.98)),
      this.storefrontGlowMat
    );
    neonBar.position.set(0, 7.1, 0);
    gateway.add(leftP, rightP, lintel, neonBar);
    this.root.add(gateway);
  }

  public update(
    dt: number,
    elapsedSec: number,
    weather: EnvironmentTheme,
    bassAmp = 0,
    trebleAmp = 0
  ) {
    const safeDt = Math.min(0.08, Math.max(0.001, dt));
    const isDay = weather === 'SUNNY' || weather === 'BEACH';

    // 1. Traffic Signal Cycle (16s full cycle: 0..6.5 NS Green, 6.5..8.0 NS Amber, 8.0..14.5 EW Green, 14.5..16.0 EW Amber)
    const cyc = elapsedSec % 16.0;
    this.nsPhaseGreen = cyc < 6.5;
    this.nsPhaseAmber = cyc >= 6.5 && cyc < 8.0;
    this.ewPhaseGreen = cyc >= 8.0 && cyc < 14.5;
    this.ewPhaseAmber = cyc >= 14.5;

    for (let i = 0; i < this.signalHeads.length; i++) {
      const sh = this.signalHeads[i];
      sh.nsGreenMat.color.setHex(this.nsPhaseGreen ? 0x22c55e : 0x0b2615);
      sh.nsAmberMat.color.setHex(this.nsPhaseAmber ? 0xf59e0b : 0x291a04);
      sh.nsRedMat.color.setHex(!this.nsPhaseGreen && !this.nsPhaseAmber ? 0xef4444 : 0x2b0a0a);

      sh.ewGreenMat.color.setHex(this.ewPhaseGreen ? 0x22c55e : 0x0b2615);
      sh.ewAmberMat.color.setHex(this.ewPhaseAmber ? 0xf59e0b : 0x291a04);
      sh.ewRedMat.color.setHex(!this.ewPhaseGreen && !this.ewPhaseAmber ? 0xef4444 : 0x2b0a0a);
    }

    // 2. Street Traffic Movement (signal + headway reactive)
    for (let i = 0; i < this.trafficVehicles.length; i++) {
      const v = this.trafficVehicles[i];
      const greenLight = v.axis === 'Z' ? this.nsPhaseGreen : this.ewPhaseGreen;
      let mustStop = false;

      if (!greenLight) {
        for (let s = 0; s < v.stopLines.length; s++) {
          const dist = (v.stopLines[s] - v.posCoord) * v.dir;
          if (dist > 0.2 && dist < 5.6) {
            mustStop = true;
            break;
          }
        }
      }

      if (!mustStop) {
        for (let j = 0; j < this.trafficVehicles.length; j++) {
          if (i === j) continue;
          const other = this.trafficVehicles[j];
          if (other.axis !== v.axis || other.dir !== v.dir || Math.abs(other.laneCoord - v.laneCoord) > 0.6) {
            continue;
          }
          const gap = (other.posCoord - v.posCoord) * v.dir - (other.length * 0.5 + v.length * 0.5);
          if (gap > -0.5 && gap < 4.5) {
            mustStop = true;
            break;
          }
        }
      }

      const targetSpd = mustStop ? 0 : v.baseSpeed;
      v.curSpeed = THREE.MathUtils.damp(v.curSpeed, targetSpd, mustStop ? 7.5 : 3.2, safeDt);
      v.posCoord += v.curSpeed * v.dir * safeDt;
      if (v.dir > 0 && v.posCoord > v.maxCoord) v.posCoord = v.minCoord;
      if (v.dir < 0 && v.posCoord < v.minCoord) v.posCoord = v.maxCoord;

      if (v.axis === 'X') {
        v.group.position.set(v.posCoord, 0.055, v.laneCoord);
        v.group.rotation.y = v.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        v.group.position.set(v.laneCoord, 0.055, v.posCoord);
        v.group.rotation.y = v.dir > 0 ? 0 : Math.PI;
      }
      v.brakeMat.color.setHex(mustStop || v.curSpeed < 2.2 ? 0xff1f4b : 0x881322);
    }

    // 3. Dynamic Parking Lot Maneuvering Cars + Boom Gates
    for (let i = 0; i < this.parkingCars.length; i++) {
      const pc = this.parkingCars[i];
      if (pc.waitTimer > 0) {
        pc.waitTimer -= safeDt;
        pc.brakeMat.color.setHex(0xff1f4b);
        continue;
      }
      const curWp = pc.waypoints[pc.segIdx];
      const nextIdx = (pc.segIdx + 1) % pc.waypoints.length;
      const nextWp = pc.waypoints[nextIdx];
      const segDist = Math.max(0.5, Math.hypot(nextWp.x - curWp.x, nextWp.z - curWp.z));
      pc.t += (pc.speed * safeDt) / segDist;

      if (pc.t >= 1) {
        pc.t = 0;
        pc.segIdx = nextIdx;
        pc.waitTimer = nextWp.pauseSec;
      }
      const x = THREE.MathUtils.lerp(curWp.x, nextWp.x, pc.t);
      const z = THREE.MathUtils.lerp(curWp.z, nextWp.z, pc.t);
      pc.group.position.set(x, 0.055, z);
      const targetYaw = Math.atan2(nextWp.x - curWp.x, nextWp.z - curWp.z);
      pc.group.rotation.y = targetYaw;
      pc.brakeMat.color.setHex(0x881322);
    }

    for (let i = 0; i < this.boomArms.length; i++) {
      const lift = Math.max(0, Math.sin(elapsedSec * 0.7 + i * 1.4));
      this.boomArms[i].rotation.z = lift > 0.72 ? (lift - 0.72) * 3.8 : 0;
    }

    // 4. Elevated SkyTrain Expo Line Motion
    const trackLen = 148;
    this.skyTrainProgress = (elapsedSec * 16.5) % (trackLen * 2);
    const pingPong =
      this.skyTrainProgress < trackLen
        ? -48 + this.skyTrainProgress
        : -48 + (trackLen * 2 - this.skyTrainProgress);
    for (let c = 0; c < this.skyTrainCars.length; c++) {
      this.skyTrainCars[c].position.z = pingPong + c * 9.35;
    }

    // 5. Pedestrians & Signalized Crosswalk Crossing
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      const segLen = Math.max(1, Math.hypot(p.x2 - p.x1, p.z2 - p.z1));
      const curX = THREE.MathUtils.lerp(p.x1, p.x2, p.t);
      const curZ = THREE.MathUtils.lerp(p.z1, p.z2, p.t);

      let paused = false;
      if (p.crosswalkAxis === 'NS') {
        const approachingCurb = curZ > p.crosswalkMin - 0.9 && curZ < p.crosswalkMax + 0.9;
        if (approachingCurb && !this.nsPhaseGreen) paused = true;
      } else if (p.crosswalkAxis === 'EW') {
        const approachingCurb = curX > p.crosswalkMin - 0.9 && curX < p.crosswalkMax + 0.9;
        if (approachingCurb && !this.ewPhaseGreen) paused = true;
      }

      if (!paused) {
        p.t += ((p.speed * safeDt) / segLen) * p.dir;
        if (p.t >= 1) {
          p.t = 1;
          p.dir = -1;
        } else if (p.t <= 0) {
          p.t = 0;
          p.dir = 1;
        }
        const nx = THREE.MathUtils.lerp(p.x1, p.x2, p.t);
        const nz = THREE.MathUtils.lerp(p.z1, p.z2, p.t);
        p.group.position.set(nx, 0.08, nz);
        p.group.rotation.y = Math.atan2((p.x2 - p.x1) * p.dir, (p.z2 - p.z1) * p.dir);

        const stride = Math.sin(elapsedSec * 7.8 + p.phase);
        p.legL.rotation.x = stride * 0.45;
        p.legR.rotation.x = -stride * 0.45;
        p.armL.rotation.x = -stride * 0.35;
        p.armR.rotation.x = stride * 0.35;
      } else {
        p.legL.rotation.x = THREE.MathUtils.lerp(p.legL.rotation.x, 0, safeDt * 8);
        p.legR.rotation.x = THREE.MathUtils.lerp(p.legR.rotation.x, 0, safeDt * 8);
        p.armL.rotation.x = THREE.MathUtils.lerp(p.armL.rotation.x, 0, safeDt * 8);
        p.armR.rotation.x = THREE.MathUtils.lerp(p.armR.rotation.x, 0, safeDt * 8);
      }
    }

    // 6. Gastown Steam Clock Puffs
    for (let i = 0; i < this.steamPuffs.length; i++) {
      const sp = this.steamPuffs[i];
      sp.age += safeDt;
      if (sp.age >= sp.life) sp.age = 0;
      const u = sp.age / sp.life;
      sp.mesh.position.set(39.5 + sp.driftX * sp.age, 6.2 + u * 2.8, -32 + sp.driftZ * sp.age);
      sp.mesh.scale.setScalar(0.55 + u * 1.45);
      (sp.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.42;
    }

    // 7. Atmosphere & Music EQ City Illumination
    this.cityWindowMat.emissiveIntensity = (isDay ? 0.22 : 0.65) + bassAmp * 0.48;
    this.rogersRingMat.color.setRGB(
      1.0,
      THREE.MathUtils.clamp(0.42 + trebleAmp * 0.4, 0, 1),
      THREE.MathUtils.clamp(0.12 + bassAmp * 0.35, 0, 1)
    );
    this.storefrontGlowMat.color.setHex(isDay ? 0xbae6fd : bassAmp > 0.45 ? 0x00f0ff : 0x38bdf8);
    this.streetLampGlowMat.color.setHex(isDay ? 0xe2e8f0 : 0xfef3c7);
  }

  public dispose() {
    this.root.parent?.remove(this.root);
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
