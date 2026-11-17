import * as THREE from 'three';
import { BallTransitionState, CeremonyPhase, GameState } from '../../types';

interface LineJudgeRig {
  group: THREE.Group;
  armR: THREE.Group;
  head: THREE.Mesh;
  flag: THREE.Mesh;
  side: 'A' | 'B';
  basePos: THREE.Vector3;
  baseYaw: number;
}

interface CameraOpRig {
  group: THREE.Group;
  panHead: THREE.Group;
  tallyLed: THREE.Mesh;
  basePos: THREE.Vector3;
}

interface BallCrewRig {
  group: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  mopProp: THREE.Group;
  homePos: THREE.Vector3;
  phase: number;
  hasMop: boolean;
}

interface CheerleaderRig {
  group: THREE.Group;
  hips: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  ponytailRoot: THREE.Group;
  ponytailTip: THREE.Group;
  armL: THREE.Group;
  elbowL: THREE.Group;
  armR: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  kneeL: THREE.Group;
  hipR: THREE.Group;
  kneeR: THREE.Group;
  pomL: THREE.Group;
  pomR: THREE.Group;
  homePos: THREE.Vector3;
  homeYaw: number;
  phase: number;
  team: 'A' | 'B';
  laneMinZ: number;
  laneMaxZ: number;
}

/**
 * StadiumPersonnelSystem
 * Off-court working personnel and entertainment troupe stationed cleanly outside
 * the 9m x 18m playing court and camera sightlines:
 *  - 1st Referee (elevated left stand, whistle & arm signals pointing winner / IN / OUT)
 *  - 2nd Referee (opposite stanchion checking net & rotations)
 *  - 4 Corner Line Judges with animated IN/OUT signal flags
 *  - 2 Broadcast Camera Operators with panning shoulder/tripod rigs & red tally lights
 *  - 4 Ball Retrievers & Quick-Mop Crew patrolling outer perimeter & dead-ball apron
 *  - 4 Cheerleaders with glowing pom-poms executing music-synced dance choreography
 *    during Opening Ceremony & Intermissions
 */
export class StadiumPersonnelSystem {
  private readonly root = new THREE.Group();
  private readonly disposables: Array<{ dispose: () => void }> = [];

  // 1st & 2nd Referees
  private ref1Group!: THREE.Group;
  private ref1Body!: THREE.Group;
  private readonly ref1StandParts: THREE.Mesh[] = [];
  private ref1Head!: THREE.Mesh;
  private ref1ArmL!: THREE.Group;
  private ref1ArmR!: THREE.Group;

  private ref2Group!: THREE.Group;
  private ref2Head!: THREE.Mesh;
  private ref2ArmL!: THREE.Group;
  private ref2ArmR!: THREE.Group;

  private readonly lineJudges: LineJudgeRig[] = [];
  private readonly cameraOps: CameraOpRig[] = [];
  private readonly ballCrew: BallCrewRig[] = [];
  private readonly cheerleaders: CheerleaderRig[] = [];
  private readonly cheerPads: { pad: THREE.Mesh; rim: THREE.Mesh }[] = [];

  // Signal state
  private signalTimer = 0;
  private signalWinner: 'A' | 'B' | null = null;
  private signalReason: 'IN' | 'OUT' | 'NET' | 'BLOCK' | 'ACE' = 'IN';

  // Zero-GC scratch helpers
  private readonly _targetVec = new THREE.Vector3();

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    this.buildReferees();
    this.buildLineJudges();
    this.buildCameraOperators();
    this.buildBallCrew();
    this.buildCheerleaders();
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private createHumanLimb(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  }

  private buildReferees() {
    const standMat = this.track(new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.4, metalness: 0.45 }));
    const padMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 }));
    const refShirtMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.65 }));
    const darkPantsMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72 }));
    const skinMat = this.track(new THREE.MeshStandardMaterial({ color: 0xd69e76, roughness: 0.6 }));

    // 1st Referee Stand at (-6.85, 0, 0) — outside net post & clear of court cameras
    this.ref1Group = new THREE.Group();
    this.ref1Group.position.set(-6.85, 0, 0);

    const ladder = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.65, 1.55, 0.72)), standMat);
    ladder.position.y = 0.775;
    ladder.castShadow = true;
    this.ref1Group.add(ladder);

    const pad = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.72, 1.05, 0.78)), padMat);
    pad.position.set(0.05, 1.05, 0);
    this.ref1Group.add(pad);
    this.ref1StandParts.push(ladder, pad);

    const ref1Body = new THREE.Group();
    ref1Body.position.set(0, 1.56, 0);
    ref1Body.rotation.y = Math.PI / 2;
    this.ref1Body = ref1Body;

    const legs = this.createHumanLimb(this.track(new THREE.CylinderGeometry(0.14, 0.13, 0.85, 10)), darkPantsMat, 0, 0.42, 0);
    const torso = this.createHumanLimb(this.track(new THREE.CylinderGeometry(0.18, 0.15, 0.58, 10)), refShirtMat, 0, 1.12, 0);
    this.ref1Head = this.createHumanLimb(this.track(new THREE.SphereGeometry(0.14, 12, 12)), skinMat, 0, 1.54, 0);

    const armGeo = this.track(new THREE.CylinderGeometry(0.048, 0.042, 0.54, 8));
    armGeo.translate(0, -0.24, 0);

    this.ref1ArmL = new THREE.Group();
    this.ref1ArmL.position.set(-0.22, 1.36, 0);
    this.ref1ArmL.add(new THREE.Mesh(armGeo, refShirtMat));

    this.ref1ArmR = new THREE.Group();
    this.ref1ArmR.position.set(0.22, 1.36, 0);
    this.ref1ArmR.add(new THREE.Mesh(armGeo, refShirtMat));

    ref1Body.add(legs, torso, this.ref1Head, this.ref1ArmL, this.ref1ArmR);
    this.ref1Group.add(ref1Body);
    this.root.add(this.ref1Group);

    // 2nd Referee at (+5.85, 0, 0.35) — floor official opposite stand
    this.ref2Group = new THREE.Group();
    this.ref2Group.position.set(5.85, 0, 0.35);
    this.ref2Group.rotation.y = -Math.PI / 2;

    const r2Legs = this.createHumanLimb(this.track(new THREE.CylinderGeometry(0.13, 0.12, 0.86, 10)), darkPantsMat, 0, 0.43, 0);
    const r2Torso = this.createHumanLimb(this.track(new THREE.CylinderGeometry(0.17, 0.14, 0.56, 10)), refShirtMat, 0, 1.12, 0);
    this.ref2Head = this.createHumanLimb(this.track(new THREE.SphereGeometry(0.135, 12, 12)), skinMat, 0, 1.52, 0);

    this.ref2ArmL = new THREE.Group();
    this.ref2ArmL.position.set(-0.21, 1.35, 0);
    this.ref2ArmL.add(new THREE.Mesh(armGeo, refShirtMat));

    this.ref2ArmR = new THREE.Group();
    this.ref2ArmR.position.set(0.21, 1.35, 0);
    this.ref2ArmR.add(new THREE.Mesh(armGeo, refShirtMat));

    this.ref2Group.add(r2Legs, r2Torso, this.ref2Head, this.ref2ArmL, this.ref2ArmR);
    this.root.add(this.ref2Group);
  }

  private buildLineJudges() {
    const jacketMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 }));
    const accentMat = this.track(new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x005577, emissiveIntensity: 0.4 }));
    const skinMat = this.track(new THREE.MeshStandardMaterial({ color: 0xd9a079, roughness: 0.6 }));
    const flagPoleMat = this.track(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.5, roughness: 0.3 }));
    const flagClothMat = this.track(new THREE.MeshStandardMaterial({
      color: 0xff3d3d,
      emissive: 0x991111,
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.55,
    }));

    const armGeo = this.track(new THREE.CylinderGeometry(0.044, 0.038, 0.50, 8));
    armGeo.translate(0, -0.22, 0);
    const poleGeo = this.track(new THREE.CylinderGeometry(0.015, 0.015, 0.72, 6));
    poleGeo.translate(0, -0.36, 0);
    const flagGeo = this.track(new THREE.PlaneGeometry(0.32, 0.24));

    const spots: Array<{ pos: [number, number, number]; yaw: number; side: 'A' | 'B' }> = [
      { pos: [-5.65, 0, -9.95], yaw: Math.PI * 0.2, side: 'B' },
      { pos: [5.65, 0, -9.95], yaw: -Math.PI * 0.2, side: 'B' },
      { pos: [-5.65, 0, 9.95], yaw: Math.PI * 0.8, side: 'A' },
      { pos: [5.65, 0, 9.95], yaw: -Math.PI * 0.8, side: 'A' },
    ];

    for (const spot of spots) {
      const grp = new THREE.Group();
      grp.position.set(...spot.pos);
      grp.rotation.y = spot.yaw;

      const legs = this.createHumanLimb(this.track(new THREE.CylinderGeometry(0.12, 0.11, 0.82, 8)), jacketMat, 0, 0.41, 0);
      const torso = this.createHumanLimb(this.track(new THREE.CylinderGeometry(0.16, 0.13, 0.52, 8)), jacketMat, 0, 1.07, 0);
      const sash = this.createHumanLimb(this.track(new THREE.BoxGeometry(0.28, 0.08, 0.27)), accentMat, 0, 1.14, 0);
      const head = this.createHumanLimb(this.track(new THREE.SphereGeometry(0.125, 10, 10)), skinMat, 0, 1.44, 0);

      const armR = new THREE.Group();
      armR.position.set(0.19, 1.28, 0);
      armR.add(new THREE.Mesh(armGeo, jacketMat));

      const pole = new THREE.Mesh(poleGeo, flagPoleMat);
      pole.position.set(0, -0.44, 0.04);
      pole.rotation.x = Math.PI / 2;
      armR.add(pole);

      const flag = new THREE.Mesh(flagGeo, flagClothMat);
      flag.position.set(0.16, -0.44, 0.56);
      armR.add(flag);

      grp.add(legs, torso, sash, head, armR);
      this.root.add(grp);

      this.lineJudges.push({
        group: grp,
        armR,
        head,
        flag,
        side: spot.side,
        basePos: new THREE.Vector3(...spot.pos),
        baseYaw: spot.yaw,
      });
    }
  }

  private buildCameraOperators() {
    const tripodMat = this.track(new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.35 }));
    const camBodyMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.55, roughness: 0.3 }));
    const lensGlassMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0ea5e9, emissiveIntensity: 0.55, roughness: 0.15 }));
    const tallyMat = this.track(new THREE.MeshBasicMaterial({ color: 0xff2244 }));
    const vestMat = this.track(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 }));
    const skinMat = this.track(new THREE.MeshStandardMaterial({ color: 0xc9936d, roughness: 0.6 }));

    const spots: Array<[number, number, number]> = [
      [-6.35, 0, 11.75],
      [6.35, 0, -11.75],
    ];

    for (const [cx, cy, cz] of spots) {
      const grp = new THREE.Group();
      grp.position.set(cx, cy, cz);

      // Tripod mast & legs
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.025, 0.02, 1.35, 6)), tripodMat);
        leg.position.set(Math.sin(ang) * 0.25, 0.62, Math.cos(ang) * 0.25);
        leg.rotation.z = -Math.sin(ang) * 0.34;
        leg.rotation.x = Math.cos(ang) * 0.34;
        grp.add(leg);
      }

      const panHead = new THREE.Group();
      panHead.position.set(0, 1.32, 0);

      const camBody = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.24, 0.24, 0.48)), camBodyMat);
      const camLens = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.085, 0.095, 0.22, 12)), tripodMat);
      camLens.rotation.x = Math.PI / 2;
      camLens.position.z = 0.32;
      const lensGlass = new THREE.Mesh(this.track(new THREE.CircleGeometry(0.078, 12)), lensGlassMat);
      lensGlass.position.z = 0.432;
      const tallyLed = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.028, 8, 8)), tallyMat);
      tallyLed.position.set(0, 0.14, 0.16);

      panHead.add(camBody, camLens, lensGlass, tallyLed);
      grp.add(panHead);

      // Operator standing behind tripod
      const opLegs = this.createHumanLimb(this.track(new THREE.CylinderGeometry(0.13, 0.12, 0.84, 8)), tripodMat, 0, 0.42, -0.48);
      const opTorso = this.createHumanLimb(this.track(new THREE.CylinderGeometry(0.17, 0.14, 0.54, 8)), vestMat, 0, 1.08, -0.48);
      const opHead = this.createHumanLimb(this.track(new THREE.SphereGeometry(0.125, 10, 10)), skinMat, 0, 1.46, -0.44);
      grp.add(opLegs, opTorso, opHead);

      this.root.add(grp);
      this.cameraOps.push({ group: grp, panHead, tallyLed, basePos: new THREE.Vector3(cx, cy, cz) });
    }
  }

  private buildBallCrew() {
    const crewShirtMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0e7490, roughness: 0.6 }));
    const crewShortMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72 }));
    const skinMat = this.track(new THREE.MeshStandardMaterial({ color: 0xd6a078, roughness: 0.6 }));
    const poleMat = this.track(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.45, roughness: 0.35 }));
    const mopHeadMat = this.track(new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.85 }));

    const armGeo = this.track(new THREE.CylinderGeometry(0.04, 0.036, 0.44, 8));
    armGeo.translate(0, -0.20, 0);
    const legGeo = this.track(new THREE.CylinderGeometry(0.055, 0.048, 0.68, 8));
    legGeo.translate(0, -0.34, 0);

    const crewSpecs: Array<{ pos: [number, number, number]; hasMop: boolean; phase: number }> = [
      { pos: [-6.6, 0, -11.4], hasMop: true, phase: 0.0 },
      { pos: [6.6, 0, -11.4], hasMop: false, phase: 1.4 },
      { pos: [-6.6, 0, 11.4], hasMop: false, phase: 2.8 },
      { pos: [6.6, 0, 11.4], hasMop: true, phase: 4.1 },
    ];

    for (const spec of crewSpecs) {
      const grp = new THREE.Group();
      grp.position.set(...spec.pos);

      const legL = new THREE.Mesh(legGeo, crewShortMat);
      legL.position.set(-0.08, 0.68, 0);
      const legR = new THREE.Mesh(legGeo, crewShortMat);
      legR.position.set(0.08, 0.68, 0);

      const torso = this.createHumanLimb(this.track(new THREE.CylinderGeometry(0.15, 0.13, 0.48, 8)), crewShirtMat, 0, 0.94, 0);
      const head = this.createHumanLimb(this.track(new THREE.SphereGeometry(0.115, 10, 10)), skinMat, 0, 1.30, 0);

      const armL = new THREE.Group();
      armL.position.set(-0.18, 1.14, 0);
      armL.add(new THREE.Mesh(armGeo, crewShirtMat));

      const armR = new THREE.Group();
      armR.position.set(0.18, 1.14, 0);
      armR.add(new THREE.Mesh(armGeo, crewShirtMat));

      const mopProp = new THREE.Group();
      const mopStick = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.016, 0.016, 1.25, 6)), poleMat);
      mopStick.position.set(0, 0.62, 0.34);
      mopStick.rotation.x = 0.48;
      const mopPad = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.56, 0.05, 0.18)), mopHeadMat);
      mopPad.position.set(0, 0.03, 0.62);
      mopProp.add(mopStick, mopPad);
      mopProp.visible = spec.hasMop;

      grp.add(legL, legR, torso, head, armL, armR, mopProp);
      this.root.add(grp);

      this.ballCrew.push({
        group: grp,
        armL,
        armR,
        legL,
        legR,
        mopProp,
        homePos: new THREE.Vector3(...spec.pos),
        phase: spec.phase,
        hasMop: spec.hasMop,
      });
    }
  }

  private buildCheerleaders() {
    const uniformTeal = this.track(
      new THREE.MeshStandardMaterial({ color: 0x0891b2, emissive: 0x083344, emissiveIntensity: 0.2, roughness: 0.44 })
    );
    const uniformCoral = this.track(
      new THREE.MeshStandardMaterial({ color: 0xe11d48, emissive: 0x4c0519, emissiveIntensity: 0.2, roughness: 0.44 })
    );
    const skirtPleatWhite = this.track(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.48 }));
    const skinMat = this.track(new THREE.MeshStandardMaterial({ color: 0xdba57e, roughness: 0.56 }));
    const hairDarkMat = this.track(new THREE.MeshStandardMaterial({ color: 0x1e1624, roughness: 0.65 }));
    const hairAmberMat = this.track(new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.65 }));
    const shoeMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 }));
    const padFloorMat = this.track(new THREE.MeshStandardMaterial({ color: 0x161f33, roughness: 0.5, metalness: 0.35 }));
    const padRimTeal = this.track(new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x0891b2, emissiveIntensity: 0.4 }));
    const padRimCoral = this.track(new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xbe123c, emissiveIntensity: 0.4 }));

    // Layered Metallic Foil Ribbon Pom-Pom Materials (refined sheen without bloom washout)
    const pomFoilTeal = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x0891b2,
        emissiveIntensity: 0.22,
        roughness: 0.28,
        metalness: 0.55,
        side: THREE.DoubleSide,
      })
    );
    const pomFoilCoral = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xfb7185,
        emissive: 0xbe123c,
        emissiveIntensity: 0.22,
        roughness: 0.28,
        metalness: 0.55,
        side: THREE.DoubleSide,
      })
    );
    const pomFoilSilver = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: 0x475569,
        emissiveIntensity: 0.14,
        roughness: 0.22,
        metalness: 0.72,
        side: THREE.DoubleSide,
      })
    );

    const thighGeo = this.track(new THREE.CapsuleGeometry(0.056, 0.24, 6, 10));
    thighGeo.translate(0, -0.15, 0);
    const calfGeo = this.track(new THREE.CapsuleGeometry(0.044, 0.25, 6, 10));
    calfGeo.translate(0, -0.16, 0);
    const sockGeo = this.track(new THREE.CylinderGeometry(0.046, 0.045, 0.12, 10));
    sockGeo.translate(0, -0.24, 0);
    const shoeGeo = this.track(new THREE.BoxGeometry(0.09, 0.065, 0.17));
    shoeGeo.translate(0, -0.33, 0.03);

    const upperArmGeo = this.track(new THREE.CapsuleGeometry(0.036, 0.18, 6, 8));
    upperArmGeo.translate(0, -0.11, 0);
    const foreArmGeo = this.track(new THREE.CapsuleGeometry(0.031, 0.18, 6, 8));
    foreArmGeo.translate(0, -0.11, 0);

    const ribbonBladeGeo = this.track(new THREE.PlaneGeometry(0.16, 0.26));

    const buildRibbonPom = (primaryMat: THREE.Material) => {
      const pom = new THREE.Group();
      for (let b = 0; b < 5; b++) {
        const blade = new THREE.Mesh(ribbonBladeGeo, b % 2 === 0 ? primaryMat : pomFoilSilver);
        blade.rotation.y = (b / 5) * Math.PI;
        blade.rotation.x = (b - 2) * 0.16;
        pom.add(blade);
      }
      const core = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.045, 8, 8)), primaryMat);
      pom.add(core);
      return pom;
    };

    // Raised Promenade Cheer Pads along West & East outer corridors (x = ±9.35, clear of ±7.6 wall & ±12.25 bleachers)
    const padGeo = this.track(new THREE.BoxGeometry(1.75, 0.06, 4.4));
    const padRimGeo = this.track(new THREE.BoxGeometry(1.82, 0.03, 4.46));

    const spots: Array<{
      pos: [number, number, number];
      yaw: number;
      team: 'A' | 'B';
      phase: number;
      laneMinZ: number;
      laneMaxZ: number;
    }> = [
      { pos: [-9.35, 0.06, 6.2], yaw: Math.PI * 0.44, team: 'A', phase: 0.0, laneMinZ: 4.4, laneMaxZ: 8.0 },
      { pos: [9.35, 0.06, 6.2], yaw: -Math.PI * 0.44, team: 'A', phase: 0.9, laneMinZ: 4.4, laneMaxZ: 8.0 },
      { pos: [-9.35, 0.06, 0.0], yaw: Math.PI * 0.5, team: 'A', phase: 1.8, laneMinZ: -1.8, laneMaxZ: 1.8 },
      { pos: [9.35, 0.06, 0.0], yaw: -Math.PI * 0.5, team: 'B', phase: 2.7, laneMinZ: -1.8, laneMaxZ: 1.8 },
      { pos: [-9.35, 0.06, -6.2], yaw: Math.PI * 0.56, team: 'B', phase: 3.6, laneMinZ: -8.0, laneMaxZ: -4.4 },
      { pos: [9.35, 0.06, -6.2], yaw: -Math.PI * 0.56, team: 'B', phase: 4.5, laneMinZ: -8.0, laneMaxZ: -4.4 },
    ];

    spots.forEach((spot, idx) => {
      const pad = new THREE.Mesh(padGeo, padFloorMat);
      pad.position.set(spot.pos[0], 0.03, spot.pos[2]);
      pad.receiveShadow = true;
      const rim = new THREE.Mesh(padRimGeo, spot.team === 'A' ? padRimTeal : padRimCoral);
      rim.position.set(spot.pos[0], 0.02, spot.pos[2]);
      this.root.add(pad, rim);
      this.cheerPads.push({ pad, rim });

      const grp = new THREE.Group();
      grp.position.set(...spot.pos);
      grp.rotation.y = spot.yaw;

      const uMat = spot.team === 'A' ? uniformTeal : uniformCoral;
      const pMat = spot.team === 'A' ? pomFoilTeal : pomFoilCoral;
      const hMat = idx % 2 === 0 ? hairDarkMat : hairAmberMat;

      // Pelvis / Hips root (y = 0.76m above pad)
      const hips = new THREE.Group();
      hips.position.y = 0.76;

      const pelvisMesh = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.115, 0.125, 0.14, 12)), uMat);
      pelvisMesh.position.y = 0.04;
      hips.add(pelvisMesh);

      const skirt = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.118, 0.235, 0.24, 16)), skirtPleatWhite);
      skirt.position.y = -0.04;
      skirt.castShadow = true;
      hips.add(skirt);

      const skirtStripe = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.222, 0.238, 0.04, 16)), uMat);
      skirtStripe.position.y = -0.14;
      hips.add(skirtStripe);

      // Articulated Left & Right Legs (Hip -> Thigh -> Knee -> Calf -> Sock & Sneaker)
      const buildLeg = (side: -1 | 1) => {
        const hip = new THREE.Group();
        hip.position.set(side * 0.085, -0.02, 0);
        const thigh = new THREE.Mesh(thighGeo, skinMat);
        thigh.castShadow = true;
        hip.add(thigh);

        const knee = new THREE.Group();
        knee.position.set(0, -0.34, 0);
        const calf = new THREE.Mesh(calfGeo, skinMat);
        calf.castShadow = true;
        const sock = new THREE.Mesh(sockGeo, skirtPleatWhite);
        const shoe = new THREE.Mesh(shoeGeo, shoeMat);
        knee.add(calf, sock, shoe);
        hip.add(knee);
        hips.add(hip);
        return { hip, knee };
      };
      const legL = buildLeg(-1);
      const legR = buildLeg(1);

      // Sculpted Upper Chest & Waist
      const chest = new THREE.Group();
      chest.position.y = 0.12;
      const waistMesh = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.115, 0.095, 0.19, 12)), uMat);
      waistMesh.position.y = 0.095;
      waistMesh.castShadow = true;
      const ribMesh = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.142, 0.112, 0.23, 12)), uMat);
      ribMesh.position.y = 0.27;
      ribMesh.castShadow = true;
      const vTrim = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.16, 0.05, 0.24)), skirtPleatWhite);
      vTrim.position.y = 0.34;
      chest.add(waistMesh, ribMesh, vTrim);
      hips.add(chest);

      // Head + Neck + Headband + Articulated 2-Segment Bouncing Ponytail
      const head = new THREE.Group();
      head.position.y = 0.44;
      const neck = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.042, 0.048, 0.1, 8)), skinMat);
      neck.position.y = 0.03;
      const cranium = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.112, 14, 14)), skinMat);
      cranium.position.y = 0.15;
      cranium.castShadow = true;
      const hairCap = new THREE.Mesh(
        this.track(new THREE.SphereGeometry(0.116, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56)),
        hMat
      );
      hairCap.position.y = 0.165;
      hairCap.rotation.x = -0.18;
      const hairRibbon = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.105, 0.016, 6, 14)), uMat);
      hairRibbon.position.set(0, 0.2, -0.01);
      hairRibbon.rotation.x = Math.PI * 0.42;

      const ponytailRoot = new THREE.Group();
      ponytailRoot.position.set(0, 0.21, -0.105);
      const ponyUpper = new THREE.Mesh(this.track(new THREE.ConeGeometry(0.048, 0.16, 8)), hMat);
      ponyUpper.rotation.x = -Math.PI * 0.72;
      ponyUpper.position.set(0, -0.05, -0.05);
      ponytailRoot.add(ponyUpper);

      const ponytailTip = new THREE.Group();
      ponytailTip.position.set(0, -0.11, -0.09);
      const ponyLower = new THREE.Mesh(this.track(new THREE.ConeGeometry(0.036, 0.18, 8)), hMat);
      ponyLower.rotation.x = -Math.PI * 0.85;
      ponyLower.position.set(0, -0.07, -0.03);
      ponytailTip.add(ponyLower);
      ponytailRoot.add(ponytailTip);

      head.add(neck, cranium, hairCap, hairRibbon, ponytailRoot);
      chest.add(head);

      // Articulated Left & Right Arms (Shoulder -> UpperArm -> Elbow -> Forearm -> Foil Ribbon Pom)
      const buildArm = (side: -1 | 1) => {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.165, 0.35, 0);
        const upper = new THREE.Mesh(upperArmGeo, skinMat);
        upper.castShadow = true;
        shoulder.add(upper);

        const elbow = new THREE.Group();
        elbow.position.set(0, -0.23, 0);
        const fore = new THREE.Mesh(foreArmGeo, skinMat);
        fore.castShadow = true;
        elbow.add(fore);

        const pom = buildRibbonPom(pMat);
        pom.position.set(0, -0.24, 0.02);
        elbow.add(pom);

        shoulder.add(elbow);
        chest.add(shoulder);
        return { shoulder, elbow, pom };
      };
      const armL = buildArm(-1);
      const armR = buildArm(1);

      grp.add(hips);
      this.root.add(grp);

      this.cheerleaders.push({
        group: grp,
        hips,
        chest,
        head,
        ponytailRoot,
        ponytailTip,
        armL: armL.shoulder,
        elbowL: armL.elbow,
        armR: armR.shoulder,
        elbowR: armR.elbow,
        hipL: legL.hip,
        kneeL: legL.knee,
        hipR: legR.hip,
        kneeR: legR.knee,
        pomL: armL.pom,
        pomR: armR.pom,
        homePos: new THREE.Vector3(...spot.pos),
        homeYaw: spot.yaw,
        phase: spot.phase,
        team: spot.team,
        laneMinZ: spot.laneMinZ,
        laneMaxZ: spot.laneMaxZ,
      });
    });
  }

  public setBasketballSidelineLayout() {
    // Basketball referees stand directly at floor level on the apron (no elevated volleyball stand)
    this.ref1StandParts.forEach((m) => {
      m.visible = false;
    });
    if (this.ref1Body) {
      this.ref1Body.position.y = 0;
    }
    if (this.ref1Group) {
      this.ref1Group.position.set(-8.65, 0, -2.1);
    }
    if (this.ref2Group) {
      this.ref2Group.position.set(8.65, 0, -1.6);
    }
    const bbSpots: Array<[number, number, number]> = [
      [-8.3, 0, -6.2],
      [8.3, 0, -6.2],
      [-8.3, 0, 6.2],
      [8.3, 0, 6.2],
    ];
    this.lineJudges.forEach((lj, idx) => {
      const sp = bbSpots[idx];
      if (!sp) return;
      lj.basePos.set(sp[0], sp[1], sp[2]);
      lj.group.position.set(sp[0], sp[1], sp[2]);
      lj.flag.visible = false;
    });
    const camSpots: Array<[number, number, number]> = [
      [-8.8, 0, 6.8],
      [8.8, 0, -6.8],
    ];
    this.cameraOps.forEach((op, idx) => {
      const sp = camSpots[idx];
      if (!sp) return;
      op.basePos.set(sp[0], sp[1], sp[2]);
      op.group.position.set(sp[0], sp[1], sp[2]);
    });
    const crewSpots: Array<[number, number, number]> = [
      [-8.9, 0, -7.2],
      [8.9, 0, -7.2],
      [-8.9, 0, 7.2],
      [8.9, 0, 7.2],
    ];
    this.ballCrew.forEach((bc, idx) => {
      const sp = crewSpots[idx];
      if (!sp) return;
      bc.homePos.set(sp[0], sp[1], sp[2]);
      bc.group.position.set(sp[0], sp[1], sp[2]);
    });
    // Place cheer platforms cleanly in the outer promenade corridor outside the x=±10.2 barrier
    this.cheerleaders.forEach((ch, idx) => {
      const sideX = ch.homePos.x < 0 ? -11.45 : 11.45;
      const zPos = ch.homePos.z * 0.72;
      ch.homePos.set(sideX, 0.06, zPos);
      ch.group.position.set(sideX, 0.06, zPos);
      ch.laneMinZ = zPos - 1.4;
      ch.laneMaxZ = zPos + 1.4;
      const padPair = this.cheerPads[idx];
      if (padPair) {
        padPair.pad.position.set(sideX, 0.03, zPos);
        padPair.rim.position.set(sideX, 0.02, zPos);
      }
    });
  }

  public triggerCall(winner: 'A' | 'B', reason: 'IN' | 'OUT' | 'NET' | 'BLOCK' | 'ACE') {
    this.signalWinner = winner;
    this.signalReason = reason;
    this.signalTimer = 2.4;
  }

  public update(
    dt: number,
    elapsedSec: number,
    ballPos: THREE.Vector3,
    state: GameState,
    ballPhase: BallTransitionState
  ) {
    if (this.signalTimer > 0) {
      this.signalTimer = Math.max(0, this.signalTimer - dt);
    }

    const eq = state.audioEQ;
    const musicPlaying = Boolean(eq?.isPlaying);
    const bass = musicPlaying ? THREE.MathUtils.clamp(eq?.bassLevel ?? 0, 0, 1) : 0;
    const mid = musicPlaying ? THREE.MathUtils.clamp(eq?.midLevel ?? 0, 0, 1) : 0;
    const high = musicPlaying ? THREE.MathUtils.clamp(eq?.highLevel ?? 0, 0, 1) : 0;
    const ceremony: CeremonyPhase = state.ceremonyPhase;
    const isShowPhase = ceremony === 'OPENING_CEREMONY' || ceremony === 'INTERMISSION';

    // 1. 1st Referee: smoothly tracks ball + gestures point/in/out calls
    const lookAngleRef1 = THREE.MathUtils.clamp(Math.atan2(ballPos.z, Math.max(1, ballPos.x + 6.85)), -0.75, 0.75);
    this.ref1Head.rotation.y = THREE.MathUtils.lerp(this.ref1Head.rotation.y, -lookAngleRef1, Math.min(1, dt * 6));
    this.ref1Head.rotation.x = THREE.MathUtils.lerp(
      this.ref1Head.rotation.x,
      THREE.MathUtils.clamp((ballPos.y - 2.9) * -0.14, -0.45, 0.45),
      Math.min(1, dt * 6)
    );

    if (this.signalTimer > 0 && this.signalWinner) {
      if (this.signalWinner === 'A') {
        // Point towards +Z (Home Team A)
        this.ref1ArmR.rotation.z = THREE.MathUtils.lerp(this.ref1ArmR.rotation.z, 1.45, Math.min(1, dt * 10));
        this.ref1ArmL.rotation.z = THREE.MathUtils.lerp(
          this.ref1ArmL.rotation.z,
          this.signalReason === 'OUT' ? -2.75 : -0.3,
          Math.min(1, dt * 10)
        );
      } else {
        // Point towards -Z (Away Team B)
        this.ref1ArmL.rotation.z = THREE.MathUtils.lerp(this.ref1ArmL.rotation.z, -1.45, Math.min(1, dt * 10));
        this.ref1ArmR.rotation.z = THREE.MathUtils.lerp(
          this.ref1ArmR.rotation.z,
          this.signalReason === 'OUT' ? 2.75 : 0.3,
          Math.min(1, dt * 10)
        );
      }
    } else {
      const idleBreath = Math.sin(elapsedSec * 2.1) * 0.06;
      this.ref1ArmL.rotation.z = THREE.MathUtils.lerp(this.ref1ArmL.rotation.z, -0.12 + idleBreath, Math.min(1, dt * 5));
      this.ref1ArmR.rotation.z = THREE.MathUtils.lerp(this.ref1ArmR.rotation.z, 0.12 - idleBreath, Math.min(1, dt * 5));
    }

    // 2. 2nd Referee: net focus + hand check
    const lookAngleRef2 = THREE.MathUtils.clamp(Math.atan2(ballPos.z, Math.max(1, 5.85 - ballPos.x)), -0.75, 0.75);
    this.ref2Head.rotation.y = THREE.MathUtils.lerp(this.ref2Head.rotation.y, lookAngleRef2, Math.min(1, dt * 6));
    if (this.signalTimer > 0 && this.signalReason === 'NET') {
      this.ref2ArmL.rotation.z = THREE.MathUtils.lerp(this.ref2ArmL.rotation.z, -2.1, Math.min(1, dt * 8));
      this.ref2ArmR.rotation.z = THREE.MathUtils.lerp(this.ref2ArmR.rotation.z, 2.1, Math.min(1, dt * 8));
    } else {
      this.ref2ArmL.rotation.z = THREE.MathUtils.lerp(this.ref2ArmL.rotation.z, -0.18, Math.min(1, dt * 5));
      this.ref2ArmR.rotation.z = THREE.MathUtils.lerp(this.ref2ArmR.rotation.z, 0.18, Math.min(1, dt * 5));
    }

    // 3. Corner Line Judges: crouch focus on lines + raise/wave flags on calls
    for (let i = 0; i < this.lineJudges.length; i++) {
      const lj = this.lineJudges[i];
      const dx = ballPos.x - lj.basePos.x;
      const dz = ballPos.z - lj.basePos.z;
      const targetYaw = Math.atan2(dx, dz);
      lj.group.rotation.y = THREE.MathUtils.lerp(lj.group.rotation.y, targetYaw, Math.min(1, dt * 4));

      const isRelevant = this.signalTimer > 0;
      if (isRelevant && this.signalReason === 'OUT') {
        lj.armR.rotation.z = THREE.MathUtils.lerp(lj.armR.rotation.z, 2.85 + Math.sin(elapsedSec * 14) * 0.18, Math.min(1, dt * 10));
      } else if (isRelevant && this.signalReason === 'IN') {
        lj.armR.rotation.x = THREE.MathUtils.lerp(lj.armR.rotation.x, -0.95, Math.min(1, dt * 10));
        lj.armR.rotation.z = THREE.MathUtils.lerp(lj.armR.rotation.z, 0.25, Math.min(1, dt * 10));
      } else {
        lj.armR.rotation.x = THREE.MathUtils.lerp(lj.armR.rotation.x, -0.25, Math.min(1, dt * 5));
        lj.armR.rotation.z = THREE.MathUtils.lerp(lj.armR.rotation.z, 0.18, Math.min(1, dt * 5));
      }
    }

    // 4. Broadcast Camera Operators: smoothly pan/tilt toward ball + live red tally pulse
    for (let i = 0; i < this.cameraOps.length; i++) {
      const op = this.cameraOps[i];
      this._targetVec.set(ballPos.x, Math.max(1.2, ballPos.y), ballPos.z);
      const dx = this._targetVec.x - op.basePos.x;
      const dy = this._targetVec.y - (op.basePos.y + 1.32);
      const dz = this._targetVec.z - op.basePos.z;
      const yaw = Math.atan2(dx, dz);
      const distXZ = Math.max(0.5, Math.hypot(dx, dz));
      const pitch = -Math.atan2(dy, distXZ);

      op.group.rotation.y = THREE.MathUtils.lerp(op.group.rotation.y, yaw, Math.min(1, dt * 3.8));
      op.panHead.rotation.x = THREE.MathUtils.lerp(op.panHead.rotation.x, pitch, Math.min(1, dt * 4.5));
      const tallyBlink = 0.65 + 0.35 * Math.sin(elapsedSec * 4.0 + i * 1.5);
      op.tallyLed.scale.setScalar(tallyBlink);
    }

    // 5. Ball Retrievers & Quick-Mop Crew: patrol outer perimeter during DEAD_ROLL / INTERMISSION
    for (let i = 0; i < this.ballCrew.length; i++) {
      const bc = this.ballCrew[i];
      if (ceremony === 'INTERMISSION' && bc.hasMop) {
        // Patrol cleanly along outer apron near endlines without entering inner play zone
        const sweepX = Math.sin(elapsedSec * 1.6 + bc.phase) * 3.8;
        const targetZ = bc.homePos.z > 0 ? 9.95 : -9.95;
        bc.group.position.x = THREE.MathUtils.lerp(bc.group.position.x, sweepX, Math.min(1, dt * 2.5));
        bc.group.position.z = THREE.MathUtils.lerp(bc.group.position.z, targetZ, Math.min(1, dt * 2.5));
        const stride = Math.sin(elapsedSec * 7.0 + bc.phase);
        bc.legL.rotation.x = stride * 0.42;
        bc.legR.rotation.x = -stride * 0.42;
        bc.armL.rotation.x = -0.55 + Math.cos(elapsedSec * 3.2) * 0.15;
        bc.armR.rotation.x = -0.55 - Math.cos(elapsedSec * 3.2) * 0.15;
        bc.group.rotation.y = Math.cos(elapsedSec * 1.6 + bc.phase) > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else if (ballPhase === 'DEAD_ROLL' && !bc.hasMop && Math.sign(ballPos.z || 1) === Math.sign(bc.homePos.z)) {
        // Jog toward outer edge closest to rolling dead ball (always staying outside court)
        const clampX = THREE.MathUtils.clamp(ballPos.x, -5.8, 5.8);
        const outerZ = bc.homePos.z > 0 ? Math.max(9.75, Math.min(12.2, Math.abs(ballPos.z) + 0.75)) : -Math.max(9.75, Math.min(12.2, Math.abs(ballPos.z) + 0.75));
        bc.group.position.x = THREE.MathUtils.lerp(bc.group.position.x, clampX, Math.min(1, dt * 2.6));
        bc.group.position.z = THREE.MathUtils.lerp(bc.group.position.z, outerZ, Math.min(1, dt * 2.6));
        const stride = Math.sin(elapsedSec * 8.5 + bc.phase);
        bc.legL.rotation.x = stride * 0.5;
        bc.legR.rotation.x = -stride * 0.5;
        bc.armL.rotation.x = -stride * 0.4;
        bc.armR.rotation.x = stride * 0.4;
      } else {
        // Return calmly to station
        bc.group.position.lerp(bc.homePos, Math.min(1, dt * 2.4));
        bc.legL.rotation.x = THREE.MathUtils.lerp(bc.legL.rotation.x, 0, Math.min(1, dt * 5));
        bc.legR.rotation.x = THREE.MathUtils.lerp(bc.legR.rotation.x, 0, Math.min(1, dt * 5));
        const sway = Math.sin(elapsedSec * 1.8 + bc.phase) * 0.06;
        bc.armL.rotation.x = THREE.MathUtils.lerp(bc.armL.rotation.x, sway, Math.min(1, dt * 4));
        bc.armR.rotation.x = THREE.MathUtils.lerp(bc.armR.rotation.x, -sway, Math.min(1, dt * 4));
        bc.group.rotation.y = THREE.MathUtils.lerp(bc.group.rotation.y, bc.homePos.z > 0 ? Math.PI : 0, Math.min(1, dt * 3));
      }
    }

    // 6. Cheerleaders: Fluid Multi-Joint Choreography, Lateral Step-Touch Travel, Ball Gaze & Point Jumps
    for (let i = 0; i < this.cheerleaders.length; i++) {
      const ch = this.cheerleaders[i];
      const teamScored = this.signalTimer > 0 && this.signalWinner === ch.team;
      const danceEnergy = isShowPhase
        ? musicPlaying
          ? 0.78 + bass * 0.6 + mid * 0.32
          : 0.85
        : teamScored
        ? 0.96
        : 0.28 + bass * 0.48 + (state.crowdMood?.excitement ?? 0.25) * 0.25;

      const tempo = musicPlaying ? 5.8 + bass * 4.8 : isShowPhase ? 6.0 : teamScored ? 7.2 : 3.4;
      const beat = elapsedSec * tempo + ch.phase;
      const glideLerp = Math.min(1, dt * 7.5);

      // Gentle lateral travel along each cheerleader's dedicated promenade lane
      const travelSpan = isShowPhase ? 1.45 : teamScored ? 1.1 : 0.65;
      const travelZ = THREE.MathUtils.clamp(
        ch.homePos.z + Math.sin(elapsedSec * (isShowPhase ? 1.4 : 0.85) + ch.phase) * travelSpan,
        ch.laneMinZ,
        ch.laneMaxZ
      );
      const swayX = Math.cos(elapsedSec * 1.1 + ch.phase) * 0.14;
      ch.group.position.x = THREE.MathUtils.lerp(ch.group.position.x, ch.homePos.x + swayX, glideLerp);
      ch.group.position.z = THREE.MathUtils.lerp(ch.group.position.z, travelZ, glideLerp);

      // Smoothly turn torso/heading subtly toward active ball during rally
      const lookToBallYaw = Math.atan2(ballPos.x - ch.group.position.x, ballPos.z - ch.group.position.z);
      const targetYaw = isShowPhase
        ? ch.homeYaw + Math.sin(beat * 0.45) * 0.55
        : THREE.MathUtils.lerp(ch.homeYaw, lookToBallYaw, 0.32);
      ch.group.rotation.y = THREE.MathUtils.lerp(ch.group.rotation.y, targetYaw, glideLerp);

      if (isShowPhase || teamScored) {
        const section = teamScored ? 2 : Math.floor((elapsedSec * 0.45) % 4);
        const hopWave = Math.max(0, Math.sin(beat));
        const hopLift = hopWave * (teamScored ? 0.26 : 0.16 + bass * 0.16) * danceEnergy;
        ch.group.position.y = THREE.MathUtils.lerp(ch.group.position.y, ch.homePos.y + hopLift, Math.min(1, dt * 14));

        // Hip groove + knee bend shock absorption
        const hipGroove = Math.sin(beat * 0.5);
        ch.hips.rotation.z = hipGroove * 0.14;
        ch.chest.rotation.z = -hipGroove * 0.18;
        ch.chest.rotation.x = 0.08 + Math.sin(beat) * 0.07;

        const kneeFlex = (1 - hopWave) * 0.42;
        if (section === 0) {
          // Classic High-V & Snap Clap
          ch.armL.rotation.z = THREE.MathUtils.lerp(ch.armL.rotation.z, -2.35 - Math.sin(beat) * 0.25, glideLerp);
          ch.armR.rotation.z = THREE.MathUtils.lerp(ch.armR.rotation.z, 2.35 + Math.sin(beat) * 0.25, glideLerp);
          ch.elbowL.rotation.x = THREE.MathUtils.lerp(ch.elbowL.rotation.x, -0.35 - Math.max(0, Math.cos(beat)) * 0.65, glideLerp);
          ch.elbowR.rotation.x = THREE.MathUtils.lerp(ch.elbowR.rotation.x, -0.35 - Math.max(0, Math.cos(beat)) * 0.65, glideLerp);
        } else if (section === 1) {
          // Alternating Staggered Diagonal Punch + Hip Step
          ch.armL.rotation.z = THREE.MathUtils.lerp(ch.armL.rotation.z, -1.35 - Math.max(0, Math.sin(beat)) * 1.1, glideLerp);
          ch.armR.rotation.z = THREE.MathUtils.lerp(ch.armR.rotation.z, 1.35 + Math.max(0, -Math.sin(beat)) * 1.1, glideLerp);
          ch.elbowL.rotation.x = THREE.MathUtils.lerp(ch.elbowL.rotation.x, -0.45, glideLerp);
          ch.elbowR.rotation.x = THREE.MathUtils.lerp(ch.elbowR.rotation.x, -0.45, glideLerp);
        } else if (section === 2) {
          // Celebratory Split High-Kick Jump!
          ch.armL.rotation.z = THREE.MathUtils.lerp(ch.armL.rotation.z, -2.65 + Math.sin(beat * 1.5) * 0.3, glideLerp);
          ch.armR.rotation.z = THREE.MathUtils.lerp(ch.armR.rotation.z, 2.65 - Math.sin(beat * 1.5) * 0.3, glideLerp);
          ch.elbowL.rotation.x = THREE.MathUtils.lerp(ch.elbowL.rotation.x, -0.25, glideLerp);
          ch.elbowR.rotation.x = THREE.MathUtils.lerp(ch.elbowR.rotation.x, -0.25, glideLerp);
          ch.hipL.rotation.x = THREE.MathUtils.lerp(ch.hipL.rotation.x, -Math.max(0, Math.sin(beat)) * 0.85, glideLerp);
          ch.hipR.rotation.x = THREE.MathUtils.lerp(ch.hipR.rotation.x, -Math.max(0, -Math.sin(beat)) * 0.85, glideLerp);
        } else {
          // Low Cross-Sweep into Touchdown Lift
          ch.armL.rotation.z = THREE.MathUtils.lerp(ch.armL.rotation.z, -0.8 - hopWave * 1.8, glideLerp);
          ch.armR.rotation.z = THREE.MathUtils.lerp(ch.armR.rotation.z, 0.8 + hopWave * 1.8, glideLerp);
          ch.elbowL.rotation.x = THREE.MathUtils.lerp(ch.elbowL.rotation.x, -0.9 + hopWave * 0.7, glideLerp);
          ch.elbowR.rotation.x = THREE.MathUtils.lerp(ch.elbowR.rotation.x, -0.9 + hopWave * 0.7, glideLerp);
        }

        if (section !== 2) {
          ch.hipL.rotation.x = THREE.MathUtils.lerp(ch.hipL.rotation.x, Math.sin(beat) * 0.38 - kneeFlex * 0.45, glideLerp);
          ch.hipR.rotation.x = THREE.MathUtils.lerp(ch.hipR.rotation.x, -Math.sin(beat) * 0.38 - kneeFlex * 0.45, glideLerp);
        }
        ch.kneeL.rotation.x = THREE.MathUtils.lerp(ch.kneeL.rotation.x, kneeFlex + Math.max(0, -Math.sin(beat)) * 0.4, glideLerp);
        ch.kneeR.rotation.x = THREE.MathUtils.lerp(ch.kneeR.rotation.x, kneeFlex + Math.max(0, Math.sin(beat)) * 0.4, glideLerp);
      } else {
        // Live Match Rhythmic Sideline Groove & Step-Touch
        const bounce = Math.abs(Math.sin(beat)) * (0.03 + bass * 0.09);
        ch.group.position.y = THREE.MathUtils.lerp(ch.group.position.y, ch.homePos.y + bounce, glideLerp);

        const sway = Math.sin(beat * 0.5);
        ch.hips.rotation.z = sway * 0.08;
        ch.chest.rotation.z = -sway * 0.09;
        ch.chest.rotation.x = 0.04;

        const wave = Math.sin(beat);
        ch.armL.rotation.z = THREE.MathUtils.lerp(ch.armL.rotation.z, -0.75 - Math.abs(wave) * (0.45 + danceEnergy * 0.75), glideLerp);
        ch.armR.rotation.z = THREE.MathUtils.lerp(ch.armR.rotation.z, 0.75 + Math.abs(wave) * (0.45 + danceEnergy * 0.75), glideLerp);
        ch.elbowL.rotation.x = THREE.MathUtils.lerp(ch.elbowL.rotation.x, -0.65 - wave * 0.35, glideLerp);
        ch.elbowR.rotation.x = THREE.MathUtils.lerp(ch.elbowR.rotation.x, -0.65 + wave * 0.35, glideLerp);

        ch.hipL.rotation.x = THREE.MathUtils.lerp(ch.hipL.rotation.x, wave * 0.16 - 0.1, glideLerp);
        ch.hipR.rotation.x = THREE.MathUtils.lerp(ch.hipR.rotation.x, -wave * 0.16 - 0.1, glideLerp);
        ch.kneeL.rotation.x = THREE.MathUtils.lerp(ch.kneeL.rotation.x, 0.2 + Math.max(0, wave) * 0.22, glideLerp);
        ch.kneeR.rotation.x = THREE.MathUtils.lerp(ch.kneeR.rotation.x, 0.2 + Math.max(0, -wave) * 0.22, glideLerp);
      }

      // Expressive Head Look & Springy Ponytail Lag
      ch.head.rotation.z = -ch.chest.rotation.z * 0.65;
      ch.head.rotation.x = -0.06 + Math.sin(beat) * 0.05;
      ch.ponytailRoot.rotation.x = 0.25 + Math.sin(beat - 0.5) * 0.28 * danceEnergy;
      ch.ponytailTip.rotation.x = Math.sin(beat - 1.1) * 0.36 * danceEnergy;

      // Subtle Ribbon Pom Shake & Scale Pulse
      const pomPulse = 0.94 + high * 0.24 + (isShowPhase || teamScored ? 0.1 : 0);
      ch.pomL.scale.setScalar(pomPulse);
      ch.pomR.scale.setScalar(pomPulse);
      ch.pomL.rotation.z = Math.sin(beat * 2.2) * 0.38;
      ch.pomR.rotation.z = -Math.sin(beat * 2.2) * 0.38;
    }
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.root.parent?.remove(this.root);
  }
}
