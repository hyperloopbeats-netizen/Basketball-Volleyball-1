import * as THREE from 'three';
import { EnvironmentTheme } from '../../types';

/**
 * Procedural 3D Vancouver B.C. Skyline, Burrard Inlet & Music-Reactive Waterfront
 * Positioned outside the court & stands perimeter (radius ~46–190m) with:
 * - Atmospheric Twilight Aurora Horizon + Starfield Dome
 * - North Shore Mountain Ridges with Snow Caps
 * - Coal Harbour Marina Piers, Yachts & Lit Promenade Seawall
 * - Multi-Tier Setback Architectural Skyscrapers + Neon Crowns + Vertical Light Fins
 * - Iconic Landmarks: Canada Place, Harbour Centre Lookout, Shangri-La, Vancouver House,
 *   BC Place, Science World, Lions Gate Suspension Bridge & East Burrard Steel Arch Bridge
 * - Live Beat-Reactive Music Synchronization (bassAmp, midAmp, trebleAmp)
 */
export class VancouverSkyline {
  public readonly root = new THREE.Group();
  private readonly disposables: {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  } = {
    geometries: [],
    materials: [],
    textures: [],
  };

  private readonly lookoutDisc: THREE.Group;
  private readonly lookoutGlowMat: THREE.MeshBasicMaterial;
  private readonly bcPlaceCrown: THREE.Mesh;
  private readonly bcPlaceHaloMat: THREE.MeshBasicMaterial;
  private readonly scienceWorldMat: THREE.MeshStandardMaterial;
  private readonly scienceWorldDome: THREE.Mesh;
  private readonly towerMat: THREE.MeshStandardMaterial;
  private readonly podiumMat: THREE.MeshStandardMaterial;
  private readonly mountainMat: THREE.MeshStandardMaterial;
  private readonly snowCapMat: THREE.MeshStandardMaterial;
  private readonly auroraBandMat: THREE.MeshBasicMaterial;
  private readonly starsMat: THREE.PointsMaterial;
  private readonly beaconLights: THREE.Mesh[] = [];
  private readonly harbourSeawallMat: THREE.MeshBasicMaterial;
  private readonly neonCrownMat: THREE.MeshBasicMaterial;
  private readonly neonFinMat: THREE.MeshBasicMaterial;
  private readonly bridgeArchGlowMat: THREE.MeshBasicMaterial;
  private readonly yachtNavMat: THREE.MeshBasicMaterial;
  private readonly skyBeamMat: THREE.MeshBasicMaterial;
  private readonly skyBeams: THREE.Mesh[] = [];
  private readonly harbourSeaplane: THREE.Group;
  private readonly seaBusFerry: THREE.Group;
  private readonly yachts: { mesh: THREE.Group; baseY: number; phase: number }[] = [];

  constructor(scene: THREE.Scene, maxAnisotropy = 4) {
    this.root.name = 'VancouverSkylineGroup';

    const glassWindowTex = this.createSkyscraperWindowTexture(maxAnisotropy);
    const sailTex = this.createCanadaPlaceSailTexture(maxAnisotropy);

    this.towerMat = new THREE.MeshStandardMaterial({
      map: glassWindowTex,
      emissiveMap: glassWindowTex,
      emissive: new THREE.Color(0x88d4ff),
      emissiveIntensity: 0.78,
      roughness: 0.22,
      metalness: 0.72,
    });
    this.podiumMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.45,
    });
    this.neonCrownMat = new THREE.MeshBasicMaterial({ color: 0xff6b1a });
    this.neonFinMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.disposables.materials.push(this.towerMat, this.podiumMat, this.neonCrownMat, this.neonFinMat);

    // 0. High-Altitude Vancouver Night Starfield & Twilight Horizon Aurora Band
    const starCount = 420;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = ((i * 137.5) % 360) * (Math.PI / 180);
      const radius = 155 + ((i * 31) % 65);
      const elev = 28 + ((i * 53) % 92);
      starPositions[i * 3] = Math.cos(theta) * radius;
      starPositions[i * 3 + 1] = elev;
      starPositions[i * 3 + 2] = Math.sin(theta) * radius - 25;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starsMat = new THREE.PointsMaterial({
      color: 0xe0f2fe,
      size: 0.85,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.disposables.geometries.push(starGeo);
    this.disposables.materials.push(this.starsMat);
    const stars = new THREE.Points(starGeo, this.starsMat);
    this.root.add(stars);

    const auroraGeo = new THREE.CylinderGeometry(195, 195, 36, 48, 1, true, Math.PI * 0.55, Math.PI * 0.9);
    const auroraTex = this.createHorizonGlowTexture(maxAnisotropy);
    this.auroraBandMat = new THREE.MeshBasicMaterial({
      map: auroraTex,
      transparent: true,
      opacity: 0.52,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.disposables.geometries.push(auroraGeo);
    this.disposables.materials.push(this.auroraBandMat);
    const auroraBand = new THREE.Mesh(auroraGeo, this.auroraBandMat);
    auroraBand.position.set(0, 14, -20);
    this.root.add(auroraBand);

    // 1. North Shore Mountains (Grouse, Crown & Mount Seymour layered ridges at z ~ -128..-165)
    this.mountainMat = new THREE.MeshStandardMaterial({
      color: 0x16243b,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });
    this.snowCapMat = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      roughness: 0.6,
      metalness: 0.08,
      flatShading: true,
    });
    this.disposables.materials.push(this.mountainMat, this.snowCapMat);

    const peaks = [
      { x: -145, z: -154, r: 48, h: 50, snow: true },
      { x: -96, z: -144, r: 38, h: 42, snow: true },
      { x: -52, z: -158, r: 44, h: 54, snow: true },
      { x: -18, z: -152, r: 50, h: 62, snow: true }, // Grouse / Crown Peak
      { x: 26, z: -148, r: 44, h: 54, snow: true },  // Cathedral / Lynn
      { x: 72, z: -156, r: 46, h: 56, snow: true },
      { x: 112, z: -144, r: 46, h: 50, snow: true }, // Mount Seymour
      { x: 158, z: -138, r: 40, h: 38, snow: false },
      { x: -172, z: -102, r: 36, h: 34, snow: false },
      { x: 170, z: -98, r: 36, h: 32, snow: false },
    ];
    for (const pk of peaks) {
      const mGeo = new THREE.ConeGeometry(pk.r, pk.h, 7);
      this.disposables.geometries.push(mGeo);
      const peakMesh = new THREE.Mesh(mGeo, this.mountainMat);
      peakMesh.position.set(pk.x, pk.h * 0.45 - 1.0, pk.z);
      peakMesh.rotation.y = (pk.x * 0.13) % Math.PI;
      this.root.add(peakMesh);

      if (pk.snow) {
        const capGeo = new THREE.ConeGeometry(pk.r * 0.36, pk.h * 0.36, 7);
        this.disposables.geometries.push(capGeo);
        const cap = new THREE.Mesh(capGeo, this.snowCapMat);
        cap.position.set(pk.x, pk.h * 0.76 - 0.7, pk.z);
        cap.rotation.y = peakMesh.rotation.y;
        this.root.add(cap);
      }
    }

    // 2. Coal Harbour Waterfront Seawall Apron + Illuminated Promenade + Marina Piers & Yachts
    const seawallGeo = new THREE.BoxGeometry(260, 1.2, 10);
    const seawallMat = new THREE.MeshStandardMaterial({ color: 0x161c2e, roughness: 0.74, metalness: 0.22 });
    this.disposables.geometries.push(seawallGeo);
    this.disposables.materials.push(seawallMat);
    const seawall = new THREE.Mesh(seawallGeo, seawallMat);
    seawall.position.set(0, 0.25, -52);
    this.root.add(seawall);

    const seawallTrimGeo = new THREE.BoxGeometry(260, 0.2, 0.42);
    this.harbourSeawallMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.disposables.geometries.push(seawallTrimGeo);
    this.disposables.materials.push(this.harbourSeawallMat);
    const seawallTrim = new THREE.Mesh(seawallTrimGeo, this.harbourSeawallMat);
    seawallTrim.position.set(0, 0.94, -47.1);
    this.root.add(seawallTrim);

    // Coal Harbour Marina Slips + Bobbing Illuminated Yachts
    const dockGeo = new THREE.BoxGeometry(1.4, 0.35, 11);
    const hullGeo = new THREE.BoxGeometry(1.8, 0.65, 4.6);
    const cabinGeo = new THREE.BoxGeometry(1.3, 0.55, 2.2);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.15 });
    this.yachtNavMat = new THREE.MeshBasicMaterial({ color: 0xff6b1a });
    const navDotGeo = new THREE.BoxGeometry(0.28, 0.22, 0.28);
    this.disposables.geometries.push(dockGeo, hullGeo, cabinGeo, navDotGeo);
    this.disposables.materials.push(hullMat, this.yachtNavMat);

    for (const mx of [-56, -44, 34, 48]) {
      const dock = new THREE.Mesh(dockGeo, seawallMat);
      dock.position.set(mx, 0.35, -43);
      this.root.add(dock);

      const yacht = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, hullMat);
      const cabin = new THREE.Mesh(cabinGeo, this.podiumMat);
      cabin.position.set(0, 0.5, -0.2);
      const nav = new THREE.Mesh(navDotGeo, this.yachtNavMat);
      nav.position.set(0, 0.88, 0.2);
      yacht.add(hull, cabin, nav);
      yacht.position.set(mx + 2.4, 0.15, -42.5);
      yacht.rotation.y = mx < 0 ? 0.12 : -0.15;
      this.root.add(yacht);
      this.yachts.push({ mesh: yacht, baseY: 0.15, phase: mx * 0.27 });
    }

    // 3. Canada Place ("Five Sails") Waterfront Pavilion (x = -24, z = -60)
    const canadaPlace = new THREE.Group();
    canadaPlace.position.set(-24, 0.4, -60);
    const pierGeo = new THREE.BoxGeometry(20, 1.5, 9.5);
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.58, metalness: 0.28 });
    const sailGeo = new THREE.ConeGeometry(2.45, 7.2, 4);
    const sailMat = new THREE.MeshStandardMaterial({
      map: sailTex,
      color: 0xf8fafc,
      emissive: new THREE.Color(0x0ea5e9),
      emissiveIntensity: 0.28,
      roughness: 0.32,
      metalness: 0.12,
    });
    const pierTrimGeo = new THREE.BoxGeometry(20.2, 0.18, 0.35);
    this.disposables.geometries.push(pierGeo, sailGeo, pierTrimGeo);
    this.disposables.materials.push(pierMat, sailMat);
    const pier = new THREE.Mesh(pierGeo, pierMat);
    pier.position.y = 0.75;
    const pierTrim = new THREE.Mesh(pierTrimGeo, this.harbourSeawallMat);
    pierTrim.position.set(0, 1.5, 4.8);
    canadaPlace.add(pier, pierTrim);
    for (let s = 0; s < 5; s++) {
      const sail = new THREE.Mesh(sailGeo, sailMat);
      sail.position.set(-6.6 + s * 3.3, 4.6, 0);
      sail.scale.set(0.88, 1.0, 1.5);
      sail.rotation.y = Math.PI * 0.25;
      canadaPlace.add(sail);
    }
    this.root.add(canadaPlace);

    // 4. Harbour Centre & Rotating Illuminated Vancouver Lookout Saucer (x = -4, z = -66)
    const harbourCentre = new THREE.Group();
    harbourCentre.position.set(-4, 0, -66);
    const hcPodiumGeo = new THREE.BoxGeometry(8.2, 4.5, 8.2);
    const hcShaftGeo = new THREE.BoxGeometry(5.8, 28, 5.8);
    const hcCoreGeo = new THREE.CylinderGeometry(1.45, 1.65, 33.5, 12);
    const hcNeckMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.72 });
    this.disposables.geometries.push(hcPodiumGeo, hcShaftGeo, hcCoreGeo);
    this.disposables.materials.push(hcNeckMat);
    const hcPodium = new THREE.Mesh(hcPodiumGeo, this.podiumMat);
    hcPodium.position.y = 2.25;
    const hcShaft = new THREE.Mesh(hcShaftGeo, this.towerMat);
    hcShaft.position.y = 14;
    const hcCore = new THREE.Mesh(hcCoreGeo, hcNeckMat);
    hcCore.position.y = 16.5;
    harbourCentre.add(hcPodium, hcShaft, hcCore);

    this.lookoutDisc = new THREE.Group();
    this.lookoutDisc.position.y = 30.6;
    const saucerGeo = new THREE.CylinderGeometry(4.8, 3.7, 2.0, 24);
    const ringGeo = new THREE.TorusGeometry(4.85, 0.24, 8, 32);
    const spireGeo = new THREE.CylinderGeometry(0.12, 0.38, 7.6, 8);
    const lookoutShellMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.28, metalness: 0.78 });
    this.lookoutGlowMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    this.disposables.geometries.push(saucerGeo, ringGeo, spireGeo);
    this.disposables.materials.push(lookoutShellMat, this.lookoutGlowMat);

    const saucer = new THREE.Mesh(saucerGeo, lookoutShellMat);
    const rim = new THREE.Mesh(ringGeo, this.lookoutGlowMat);
    rim.rotation.x = Math.PI / 2;
    const spire = new THREE.Mesh(spireGeo, hcNeckMat);
    spire.position.y = 4.4;
    const hcBeaconGeo = new THREE.SphereGeometry(0.42, 8, 8);
    this.disposables.geometries.push(hcBeaconGeo);
    const hcBeacon = new THREE.Mesh(hcBeaconGeo, this.neonCrownMat);
    hcBeacon.position.y = 8.4;
    this.beaconLights.push(hcBeacon);
    this.lookoutDisc.add(saucer, rim, spire, hcBeacon);
    harbourCentre.add(this.lookoutDisc);
    this.root.add(harbourCentre);

    // 5. Living Shangri-La Architectural Setback Supertall (x = -41, z = -70)
    const shangriLa = new THREE.Group();
    shangriLa.position.set(-41, 0, -70);
    const slPodiumGeo = new THREE.BoxGeometry(9.2, 5.0, 8.2);
    const slBaseGeo = new THREE.BoxGeometry(7.2, 26, 6.4);
    const slTopGeo = new THREE.BoxGeometry(5.6, 15, 5.2);
    const slCrownGeo = new THREE.BoxGeometry(4.4, 4.4, 0.42);
    const slFinGeo = new THREE.BoxGeometry(0.32, 40, 0.32);
    this.disposables.geometries.push(slPodiumGeo, slBaseGeo, slTopGeo, slCrownGeo, slFinGeo);
    const slPodium = new THREE.Mesh(slPodiumGeo, this.podiumMat);
    slPodium.position.y = 2.5;
    const slBase = new THREE.Mesh(slBaseGeo, this.towerMat);
    slBase.position.y = 13;
    const slTop = new THREE.Mesh(slTopGeo, this.towerMat);
    slTop.position.set(-0.4, 33.5, 0);
    const slCrown = new THREE.Mesh(slCrownGeo, this.neonFinMat);
    slCrown.position.set(-0.4, 41.8, 2.45);
    const slFin = new THREE.Mesh(slFinGeo, this.neonFinMat);
    slFin.position.set(3.2, 20, 2.9);
    shangriLa.add(slPodium, slBase, slTop, slCrown, slFin);
    this.root.add(shangriLa);

    // 6. Vancouver House Twisting Cantilevered Tower (x = -62, z = -62)
    const vanHouse = new THREE.Group();
    vanHouse.position.set(-62, 0, -62);
    const vhLowerMat = new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.25, metalness: 0.42 });
    this.disposables.materials.push(vhLowerMat);
    for (let seg = 0; seg < 7; seg++) {
      const segH = 5.0;
      const w = 3.1 + seg * 0.52;
      const segGeo = new THREE.BoxGeometry(w, segH, 4.1 + seg * 0.2);
      this.disposables.geometries.push(segGeo);
      const segMesh = new THREE.Mesh(segGeo, seg % 2 === 0 ? this.towerMat : vhLowerMat);
      segMesh.position.set(seg * 0.32, seg * segH + segH * 0.5, 0);
      segMesh.rotation.y = seg * 0.085;
      vanHouse.add(segMesh);
    }
    this.root.add(vanHouse);

    // 7. BC Place Stadium Illuminated Cable-Roof Crown (x = 24, z = -72)
    const bcPlace = new THREE.Group();
    bcPlace.position.set(24, 0, -72);
    const bcpBowlGeo = new THREE.CylinderGeometry(13.8, 12.0, 7.4, 24);
    const bcpCrownGeo = new THREE.TorusGeometry(12.4, 0.82, 10, 32);
    const bcpRoofGeo = new THREE.CylinderGeometry(7.2, 12.8, 3.2, 24);
    const bcpBowlMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.48, metalness: 0.42 });
    const bcpRoofMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, emissive: 0x0f172a });
    this.bcPlaceHaloMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.disposables.geometries.push(bcpBowlGeo, bcpCrownGeo, bcpRoofGeo);
    this.disposables.materials.push(bcpBowlMat, bcpRoofMat, this.bcPlaceHaloMat);
    const bcpBowl = new THREE.Mesh(bcpBowlGeo, bcpBowlMat);
    bcpBowl.position.y = 3.7;
    this.bcPlaceCrown = new THREE.Mesh(bcpCrownGeo, this.bcPlaceHaloMat);
    this.bcPlaceCrown.rotation.x = Math.PI / 2;
    this.bcPlaceCrown.position.y = 7.6;
    const bcpRoof = new THREE.Mesh(bcpRoofGeo, bcpRoofMat);
    bcpRoof.position.y = 8.6;
    bcPlace.add(bcpBowl, this.bcPlaceCrown, bcpRoof);
    this.root.add(bcPlace);

    // 8. Science World Glowing Geodesic Sphere (x = 54, z = -66)
    const scienceWorld = new THREE.Group();
    scienceWorld.position.set(54, 0, -66);
    const swBaseGeo = new THREE.CylinderGeometry(7.2, 7.8, 3.6, 16);
    const swDomeGeo = new THREE.IcosahedronGeometry(6.6, 2);
    this.scienceWorldMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x00f0ff),
      emissiveIntensity: 0.85,
      wireframe: true,
      roughness: 0.25,
    });
    const swCoreGeo = new THREE.SphereGeometry(5.7, 18, 14);
    const swCoreMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.5,
      roughness: 0.38,
    });
    this.disposables.geometries.push(swBaseGeo, swDomeGeo, swCoreGeo);
    this.disposables.materials.push(this.scienceWorldMat, swCoreMat);
    const swBase = new THREE.Mesh(swBaseGeo, bcpBowlMat);
    swBase.position.y = 1.8;
    const swCore = new THREE.Mesh(swCoreGeo, swCoreMat);
    swCore.position.y = 8.3;
    this.scienceWorldDome = new THREE.Mesh(swDomeGeo, this.scienceWorldMat);
    this.scienceWorldDome.position.y = 8.3;
    scienceWorld.add(swBase, swCore, this.scienceWorldDome);
    this.root.add(scienceWorld);

    // 9. Lions Gate Bridge (NW inlet) + Burrard / False Creek Steel Arch Bridge (NE inlet)
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(-88, 0, -94);
    bridgeGroup.rotation.y = 0.22;
    const bridgeGreenMat = new THREE.MeshStandardMaterial({ color: 0x2f6f5e, roughness: 0.42, metalness: 0.55 });
    const bridgeDeckGeo = new THREE.BoxGeometry(92, 1.1, 3.2);
    const bridgeTowerGeo = new THREE.BoxGeometry(2.0, 26, 2.2);
    const beaconGeo = new THREE.SphereGeometry(0.45, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3d7f });
    this.disposables.geometries.push(bridgeDeckGeo, bridgeTowerGeo, beaconGeo);
    this.disposables.materials.push(bridgeGreenMat, beaconMat);

    const deck = new THREE.Mesh(bridgeDeckGeo, bridgeGreenMat);
    deck.position.y = 9.5;
    bridgeGroup.add(deck);
    for (const tx of [-22, 22]) {
      const tower = new THREE.Mesh(bridgeTowerGeo, bridgeGreenMat);
      tower.position.set(tx, 13, 0);
      bridgeGroup.add(tower);
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(tx, 26.4, 0);
      bridgeGroup.add(beacon);
      this.beaconLights.push(beacon);
    }
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-46, 10.0, 0),
      new THREE.Vector3(-22, 25.5, 0),
      new THREE.Vector3(0, 12.2, 0),
      new THREE.Vector3(22, 25.5, 0),
      new THREE.Vector3(46, 10.0, 0),
    ]);
    const cableGeo = new THREE.TubeGeometry(cableCurve, 28, 0.26, 6, false);
    this.disposables.geometries.push(cableGeo);
    bridgeGroup.add(new THREE.Mesh(cableGeo, bridgeGreenMat));
    this.root.add(bridgeGroup);

    // East Harbour Illuminated Arch Bridge (x = +96, z = -76)
    const eastBridge = new THREE.Group();
    eastBridge.position.set(96, 0, -76);
    eastBridge.rotation.y = -0.34;
    const ebDeckGeo = new THREE.BoxGeometry(68, 1.0, 3.0);
    const ebArchCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-26, 8.2, 0),
      new THREE.Vector3(-12, 19.5, 0),
      new THREE.Vector3(0, 23.0, 0),
      new THREE.Vector3(12, 19.5, 0),
      new THREE.Vector3(26, 8.2, 0),
    ]);
    const ebArchGeo = new THREE.TubeGeometry(ebArchCurve, 24, 0.42, 6, false);
    this.bridgeArchGlowMat = new THREE.MeshBasicMaterial({ color: 0xff6b1a });
    this.disposables.geometries.push(ebDeckGeo, ebArchGeo);
    this.disposables.materials.push(this.bridgeArchGlowMat);
    const ebDeck = new THREE.Mesh(ebDeckGeo, this.podiumMat);
    ebDeck.position.y = 8.0;
    const ebArch = new THREE.Mesh(ebArchGeo, this.bridgeArchGlowMat);
    eastBridge.add(ebDeck, ebArch);
    this.root.add(eastBridge);

    // 10. Multi-Tier Architectural Setback Skyscrapers (Podiums + Glass Shafts + Upper Setbacks + Neon Crowns + Vertical Light Fins)
    const towerSpecs: { x: number; z: number; w: number; d: number; h: number; tint: number; rot?: number }[] = [
      // Coal Harbour & Downtown Waterfront Row (-Z)
      { x: -78, z: -70, w: 6.4, d: 6.0, h: 25, tint: 0xdbeafe },
      { x: -51, z: -74, w: 6.8, d: 6.4, h: 32, tint: 0xbae6fd },
      { x: -32, z: -78, w: 6.2, d: 5.8, h: 37, tint: 0xe0f2fe },
      { x: -14, z: -75, w: 7.4, d: 6.8, h: 41, tint: 0xcffafe },
      { x: 6, z: -76, w: 6.8, d: 6.2, h: 35, tint: 0xbae6fd },
      { x: 14, z: -64, w: 5.8, d: 5.6, h: 26, tint: 0xe2e8f0 },
      { x: 39, z: -78, w: 7.0, d: 6.2, h: 31, tint: 0xdbeafe },
      { x: 68, z: -76, w: 6.5, d: 6.0, h: 27, tint: 0xcffafe },
      { x: 84, z: -68, w: 7.2, d: 6.6, h: 24, tint: 0xbae6fd },
      { x: -92, z: -58, w: 6.0, d: 5.5, h: 22, tint: 0xe0f2fe },
      // East & West Flank Vancouver Glass Towers
      { x: -58, z: -42, w: 6.2, d: 6.2, h: 23, tint: 0xbae6fd },
      { x: -64, z: -20, w: 6.6, d: 6.4, h: 29, tint: 0xdbeafe },
      { x: -60, z: 4, w: 6.0, d: 6.0, h: 25, tint: 0xcffafe },
      { x: -66, z: 26, w: 6.8, d: 6.2, h: 27, tint: 0xe0f2fe },
      { x: 62, z: -40, w: 6.4, d: 6.0, h: 26, tint: 0xcffafe },
      { x: 68, z: -18, w: 6.6, d: 6.4, h: 30, tint: 0xbae6fd },
      { x: 64, z: 8, w: 6.2, d: 6.2, h: 24, tint: 0xdbeafe },
      { x: 70, z: 30, w: 6.4, d: 6.0, h: 22, tint: 0xe2e8f0 },
      // Deep Financial Core Skyline Tier
      { x: -24, z: -92, w: 8.0, d: 7.4, h: 44, tint: 0xa5f3fc },
      { x: 0, z: -94, w: 7.8, d: 7.0, h: 47, tint: 0xdbeafe },
      { x: 18, z: -90, w: 7.4, d: 6.8, h: 40, tint: 0xbae6fd },
      { x: 46, z: -92, w: 7.2, d: 6.8, h: 35, tint: 0xe0f2fe },
      { x: -48, z: -90, w: 7.5, d: 7.0, h: 38, tint: 0xcffafe },
      { x: 98, z: -84, w: 7.4, d: 6.8, h: 29, tint: 0xbae6fd },
    ];

    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const spireRodGeo = new THREE.CylinderGeometry(0.12, 0.24, 1, 6);
    this.disposables.geometries.push(unitBoxGeo, spireRodGeo);

    const n = towerSpecs.length;
    const podiumInst = new THREE.InstancedMesh(unitBoxGeo, this.podiumMat, n);
    const mainShaftInst = new THREE.InstancedMesh(unitBoxGeo, this.towerMat, n);
    const crownTierInst = new THREE.InstancedMesh(unitBoxGeo, this.towerMat, n);
    const neonBandInst = new THREE.InstancedMesh(unitBoxGeo, this.neonCrownMat, n);
    const verticalFinInst = new THREE.InstancedMesh(unitBoxGeo, this.neonFinMat, n);
    const spireInst = new THREE.InstancedMesh(spireRodGeo, this.podiumMat, n);

    const dummy = new THREE.Object3D();
    const tintCol = new THREE.Color();

    towerSpecs.forEach((ts, idx) => {
      const yaw = ts.rot ?? (idx % 3) * 0.08;
      const podiumH = Math.max(3.6, ts.h * 0.16);
      const mainH = ts.h * 0.68;
      const upperH = ts.h * 0.28;

      // Ground Architectural Podium
      dummy.position.set(ts.x, podiumH * 0.5, ts.z);
      dummy.scale.set(ts.w * 1.18, podiumH, ts.d * 1.18);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      podiumInst.setMatrixAt(idx, dummy.matrix);

      // Main Glass Shaft
      dummy.position.set(ts.x, mainH * 0.5, ts.z);
      dummy.scale.set(ts.w, mainH, ts.d);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      mainShaftInst.setMatrixAt(idx, dummy.matrix);
      tintCol.setHex(ts.tint);
      mainShaftInst.setColorAt(idx, tintCol);

      // Stepped Upper Setback Crown Tier
      const upperCenterY = mainH + upperH * 0.5;
      dummy.position.set(ts.x, upperCenterY, ts.z);
      dummy.scale.set(ts.w * 0.72, upperH, ts.d * 0.72);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      crownTierInst.setMatrixAt(idx, dummy.matrix);
      crownTierInst.setColorAt(idx, tintCol);

      // Illuminated Rooftop Crown Band (music reactive!)
      dummy.position.set(ts.x, mainH + upperH + 0.25, ts.z);
      dummy.scale.set(ts.w * 0.76, 0.45, ts.d * 0.76);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      neonBandInst.setMatrixAt(idx, dummy.matrix);

      // Vertical Neon Light Fin Along Front Corner
      dummy.position.set(ts.x + ts.w * 0.44, mainH * 0.52, ts.z + ts.d * 0.46);
      dummy.scale.set(0.24, mainH * 0.88, 0.24);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      verticalFinInst.setMatrixAt(idx, dummy.matrix);

      // Rooftop Communications Spire (alternating towers)
      const spireH = idx % 2 === 0 ? 5.8 : 2.6;
      dummy.position.set(ts.x, mainH + upperH + spireH * 0.5 + 0.4, ts.z);
      dummy.scale.set(1, spireH, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      spireInst.setMatrixAt(idx, dummy.matrix);
    });

    for (const inst of [podiumInst, mainShaftInst, crownTierInst, neonBandInst, verticalFinInst, spireInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.frustumCulled = false;
      this.root.add(inst);
    }

    // 11. Coal Harbour Floatplane (composite 6-part craft gliding over Burrard Inlet)
    this.harbourSeaplane = new THREE.Group();
    const fuselageMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.25 });
    const planeTrimMat = new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.35 });
    const pontoonGeo = new THREE.BoxGeometry(0.42, 0.28, 3.4);
    const fuselageGeo = new THREE.CylinderGeometry(0.45, 0.32, 4.4, 10);
    fuselageGeo.rotateX(Math.PI / 2);
    const wingGeo = new THREE.BoxGeometry(6.8, 0.14, 1.15);
    const tailGeo = new THREE.BoxGeometry(0.14, 1.1, 0.9);
    this.disposables.materials.push(fuselageMat, planeTrimMat);
    this.disposables.geometries.push(pontoonGeo, fuselageGeo, wingGeo, tailGeo);

    const fBody = new THREE.Mesh(fuselageGeo, fuselageMat);
    const fWing = new THREE.Mesh(wingGeo, planeTrimMat);
    fWing.position.set(0, 0.48, 0.35);
    const fTail = new THREE.Mesh(tailGeo, planeTrimMat);
    fTail.position.set(0, 0.65, -1.85);
    const fFloatL = new THREE.Mesh(pontoonGeo, this.podiumMat);
    fFloatL.position.set(-0.68, -0.58, 0.2);
    const fFloatR = new THREE.Mesh(pontoonGeo, this.podiumMat);
    fFloatR.position.set(0.68, -0.58, 0.2);
    const fBeacon = new THREE.Mesh(beaconGeo, this.neonFinMat);
    fBeacon.position.set(0, 1.25, -1.85);
    this.harbourSeaplane.add(fBody, fWing, fTail, fFloatL, fFloatR, fBeacon);
    this.harbourSeaplane.position.set(-40, 14, -92);
    this.root.add(this.harbourSeaplane);

    // 12. Burrard Inlet SeaBus Ferry (lit passenger catamaran shuttle)
    this.seaBusFerry = new THREE.Group();
    const ferryHullGeo = new THREE.BoxGeometry(6.2, 0.95, 3.2);
    const ferryCabinGeo = new THREE.BoxGeometry(5.2, 1.35, 2.7);
    const ferryGlowGeo = new THREE.BoxGeometry(5.4, 0.24, 2.82);
    this.disposables.geometries.push(ferryHullGeo, ferryCabinGeo, ferryGlowGeo);
    const sbHull = new THREE.Mesh(ferryHullGeo, this.podiumMat);
    sbHull.position.y = 0.45;
    const sbCabin = new THREE.Mesh(ferryCabinGeo, fuselageMat);
    sbCabin.position.y = 1.5;
    const sbGlow = new THREE.Mesh(ferryGlowGeo, this.neonCrownMat);
    sbGlow.position.y = 1.55;
    this.seaBusFerry.add(sbHull, sbCabin, sbGlow);
    this.seaBusFerry.position.set(0, 0.1, -86);
    this.root.add(this.seaBusFerry);

    // 13. Sweeping Waterfront Arena Skybeams (BC Place & Canada Place)
    const beamConeGeo = new THREE.ConeGeometry(4.2, 62, 12, 1, true);
    beamConeGeo.translate(0, 31, 0);
    this.skyBeamMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.065,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.disposables.geometries.push(beamConeGeo);
    this.disposables.materials.push(this.skyBeamMat);
    for (const bx of [-24, 24]) {
      const sb = new THREE.Mesh(beamConeGeo, this.skyBeamMat);
      sb.position.set(bx, 8, -68);
      this.skyBeams.push(sb);
      this.root.add(sb);
    }

    scene.add(this.root);
  }

  private createHorizonGlowTexture(anisotropy: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const vGrad = ctx.createLinearGradient(0, 0, 0, 128);
    vGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
    vGrad.addColorStop(0.45, 'rgba(0, 240, 255, 0.22)');
    vGrad.addColorStop(0.76, 'rgba(255, 107, 26, 0.42)');
    vGrad.addColorStop(1.0, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, 512, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    this.disposables.textures.push(tex);
    return tex;
  }

  private createSkyscraperWindowTexture(anisotropy: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
    bgGrad.addColorStop(0, '#0c182c');
    bgGrad.addColorStop(0.5, '#0f233f');
    bgGrad.addColorStop(1, '#091224');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 256, 512);

    const cols = 10;
    const rows = 28;
    const cw = 256 / cols;
    const ch = 512 / rows;
    for (let r = 1; r < rows - 1; r++) {
      for (let col = 1; col < cols - 1; col++) {
        const hash = (r * 37 + col * 19) % 11;
        if (hash <= 2) continue;
        ctx.fillStyle =
          hash === 3 || hash === 7
            ? 'rgba(255, 179, 71, 0.88)'
            : hash >= 8
            ? 'rgba(0, 240, 255, 0.84)'
            : 'rgba(186, 230, 253, 0.56)';
        ctx.fillRect(col * cw + 3, r * ch + 3, cw - 6, ch - 6);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.disposables.textures.push(tex);
    return tex;
  }

  private createCanadaPlaceSailTexture(anisotropy: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 4;
    for (let y = 24; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    this.disposables.textures.push(tex);
    return tex;
  }

  public update(
    dt: number,
    elapsedSec: number,
    weather: EnvironmentTheme,
    bassAmp = 0,
    midAmp = 0,
    trebleAmp = 0
  ) {
    this.lookoutDisc.rotation.y += dt * (0.22 + bassAmp * 0.42);
    this.scienceWorldDome.rotation.y += dt * (0.08 + trebleAmp * 0.25);

    const isDay = weather === 'SUNNY' || weather === 'BEACH';
    this.towerMat.emissiveIntensity =
      (isDay ? 0.3 : 0.78 + Math.sin(elapsedSec * 1.4) * 0.08) + bassAmp * 0.65 + midAmp * 0.3;
    this.scienceWorldMat.emissiveIntensity =
      (isDay ? 0.38 : 0.78 + Math.sin(elapsedSec * 2.2) * 0.2) + trebleAmp * 1.15;

    // Gentle boat bobbing along Coal Harbour marina slips
    for (const y of this.yachts) {
      y.mesh.position.y = y.baseY + Math.sin(elapsedSec * 1.8 + y.phase) * 0.07;
      y.mesh.rotation.z = Math.sin(elapsedSec * 1.4 + y.phase) * 0.035;
    }

    // Reactive Skyscraper Crowns, Vertical Fins & Landmarks synchronized to Music EQ
    const crownPulse = Math.min(1, 0.45 + bassAmp * 0.85);
    this.neonCrownMat.color.setRGB(
      1.0,
      THREE.MathUtils.clamp(0.42 + trebleAmp * 0.38, 0, 1),
      THREE.MathUtils.clamp(0.1 + bassAmp * 0.25, 0, 1)
    );
    this.neonFinMat.color.setRGB(
      THREE.MathUtils.clamp(0.05 + trebleAmp * 0.55, 0, 1),
      THREE.MathUtils.clamp(0.85 + midAmp * 0.15, 0, 1),
      1.0
    );
    this.bcPlaceCrown.scale.setScalar(1.0 + bassAmp * 0.07);
    this.bridgeArchGlowMat.color.setRGB(
      1.0,
      THREE.MathUtils.clamp(0.45 + crownPulse * 0.35, 0, 1),
      THREE.MathUtils.clamp(0.15 + trebleAmp * 0.35, 0, 1)
    );
    this.lookoutGlowMat.color.setRGB(
      1.0,
      THREE.MathUtils.clamp(0.68 + midAmp * 0.28, 0, 1),
      THREE.MathUtils.clamp(0.25 + trebleAmp * 0.45, 0, 1)
    );

    if (weather === 'CYBER') {
      this.bcPlaceHaloMat.color.setHex(bassAmp > 0.45 ? 0xff6b1a : 0xff3d7f);
      this.harbourSeawallMat.color.setHex(trebleAmp > 0.35 ? 0xffffff : 0x00f0ff);
    } else if (weather === 'SUNSET') {
      this.bcPlaceHaloMat.color.setHex(
        bassAmp > 0.48 ? 0xff6b1a : Math.sin(elapsedSec * 0.8) > 0 ? 0x00f0ff : 0xffb347
      );
      this.harbourSeawallMat.color.setHex(midAmp > 0.38 ? 0xffb347 : 0x00f0ff);
    } else {
      this.bcPlaceHaloMat.color.setHex(bassAmp > 0.45 ? 0x00f0ff : 0x38bdf8);
      this.harbourSeawallMat.color.setHex(0x38bdf8);
    }

    this.auroraBandMat.opacity = isDay ? 0.12 : THREE.MathUtils.clamp(0.44 + bassAmp * 0.28, 0.38, 0.78);
    this.starsMat.opacity = isDay ? 0.05 : THREE.MathUtils.clamp(0.65 + trebleAmp * 0.35, 0.6, 1.0);

    const pulse = 0.65 + 0.35 * Math.sin(elapsedSec * 3.1) + bassAmp * 0.45;
    for (const b of this.beaconLights) {
      b.scale.setScalar(pulse);
    }

    // Floatplane banking flyby across Coal Harbour
    const planeT = (elapsedSec * 0.055) % (Math.PI * 2);
    const px = Math.cos(planeT) * 78;
    const pz = -98 + Math.sin(planeT) * 26;
    this.harbourSeaplane.position.set(px, 16 + Math.sin(elapsedSec * 0.8) * 1.8, pz);
    this.harbourSeaplane.rotation.y = Math.atan2(-Math.sin(planeT) * 78, Math.cos(planeT) * 26);
    this.harbourSeaplane.rotation.z = -0.18;

    // SeaBus catamaran gliding along Burrard Inlet
    const sbT = Math.sin(elapsedSec * 0.09);
    this.seaBusFerry.position.set(sbT * 62, 0.1 + Math.sin(elapsedSec * 1.6) * 0.06, -86);
    this.seaBusFerry.rotation.y = Math.cos(elapsedSec * 0.09) >= 0 ? 0 : Math.PI;

    // Sweeping waterfront searchlights
    this.skyBeamMat.opacity = isDay ? 0.01 : 0.05 + bassAmp * 0.045;
    for (let i = 0; i < this.skyBeams.length; i++) {
      this.skyBeams[i].rotation.z = Math.sin(elapsedSec * 0.55 + i * 1.8) * 0.34;
      this.skyBeams[i].rotation.x = -0.22 + Math.cos(elapsedSec * 0.42 + i) * 0.12;
    }
  }

  public dispose() {
    this.root.parent?.remove(this.root);
    this.disposables.geometries.forEach((g) => g.dispose());
    this.disposables.materials.forEach((m) => m.dispose());
    this.disposables.textures.forEach((t) => t.dispose());
  }
}
