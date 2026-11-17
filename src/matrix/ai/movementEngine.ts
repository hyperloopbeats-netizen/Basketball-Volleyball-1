import * as THREE from 'three';
import {
  IndividualBehaviorPattern,
  KinematicState,
  SpriteMatrixUnitSlot,
  SpriteSpecEntry,
  SpriteSpecId,
  Unit,
} from '../../types';
import {
  buildSpriteSpecAtlasTexture,
  MOVEMENT_REACTION_SPRITE_SPECS,
} from './spriteSpecSheet';

interface UnitKinematicMem {
  state: KinematicState;
  activeSpriteId: SpriteSpecId;
  splitStepTimer: number;
  plantTimer: number;
  diveTimer: number;
  diveDirX: number;
  diveDirZ: number;
  stridePhase: number;
  prevVelX: number;
  prevVelZ: number;
  scuffCooldown: number;
  cellX: number;
  cellY: number;
  coordinationScore: number;
}

interface SpriteSlotPool {
  plateMesh: THREE.Mesh;
  plateMat: THREE.MeshBasicMaterial;
  cadenceRing: THREE.Mesh;
  cadenceMat: THREE.MeshBasicMaterial;
  uvAttr: THREE.BufferAttribute;
  lastCellX: number;
  lastCellY: number;
}

export interface MovementStepInput {
  unit: Unit;
  allUnits: Unit[];
  behavior: IndividualBehaviorPattern;
  targetX: number;
  targetZ: number;
  lookX: number;
  lookZ: number;
  huntMode: boolean;
  turbulence: number;
  floorFlow: { vx: number; vz: number; energy: number };
  ballPos: THREE.Vector3;
  isExpectedReceiver: boolean;
  isExpectedSpiker: boolean;
  sideTouches: number;
  dt: number;
  manualMoveX?: number;
  manualMoveZ?: number;
  reactiveCharge?: number;
  onFootPlantScuff?: (pos: THREE.Vector3, vx: number, vz: number) => void;
}

/**
 * MovementEngine + 4x4 Sprite Spec Sheet Matrix
 * Draws directly from MOVEMENT_REACTION_SPRITE_SPECS (16 movement, passing, reaction & celebration sprites)
 * and modulates locomotion, split-step, Voronoi separation & dive triggers using each player's IndividualBehaviorPattern.
 */
export class MovementEngine {
  private readonly scene: THREE.Scene;
  private readonly atlasTex: THREE.CanvasTexture;
  private readonly pulseTex: THREE.CanvasTexture;
  private readonly spriteGroup = new THREE.Group();
  private readonly memMap = new Map<number, UnitKinematicMem>();
  private readonly spritePool = new Map<number, SpriteSlotPool>();
  private readonly slotsSnapshot: SpriteMatrixUnitSlot[] = [];

  private visible = true;
  private readonly cols = 12;
  private readonly rows = 24;
  private readonly courtWidth = 9.0;
  private readonly courtLength = 18.0;

  // Zero-GC scratch objects
  private readonly _v1 = new THREE.Vector3();
  private readonly _m1 = new THREE.Matrix4();
  private readonly _q1 = new THREE.Quaternion();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _colCyan = new THREE.Color(0x00f0ff);
  private readonly _colCoral = new THREE.Color(0xff3d7f);
  private readonly _colGold = new THREE.Color(0xffb347);
  private readonly _colSpec = new THREE.Color();

  constructor(scene: THREE.Scene, maxAnisotropy = 4) {
    this.scene = scene;
    this.atlasTex = buildSpriteSpecAtlasTexture(maxAnisotropy);
    this.pulseTex = this.buildCadencePulseTexture(maxAnisotropy);
    this.spriteGroup.name = 'SpriteCoordinationMatrixGroup';
    this.scene.add(this.spriteGroup);
  }

  private buildCadencePulseTexture(anisotropy: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 58);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.42, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    return tex;
  }

  private ensureUnitPool(u: Unit): { mem: UnitKinematicMem; pool: SpriteSlotPool } {
    let mem = this.memMap.get(u.id);
    if (!mem) {
      mem = {
        state: 'READY',
        activeSpriteId: 'READY_COIL',
        splitStepTimer: 0,
        plantTimer: 0,
        diveTimer: 0,
        diveDirX: 0,
        diveDirZ: 0,
        stridePhase: (u.id * 0.37) % 1,
        prevVelX: 0,
        prevVelZ: 0,
        scuffCooldown: 0,
        cellX: 0,
        cellY: 0,
        coordinationScore: 98,
      };
      this.memMap.set(u.id, mem);
    }

    let pool = this.spritePool.get(u.id);
    if (!pool) {
      const geo = new THREE.PlaneGeometry(1.18, 1.18);
      geo.rotateX(-Math.PI / 2);
      const uvAttr = geo.attributes.uv as THREE.BufferAttribute;

      const baseCol = u.isLibero ? this._colGold : u.team === 'A' ? this._colCyan : this._colCoral;
      const plateMat = new THREE.MeshBasicMaterial({
        map: this.atlasTex,
        color: baseCol.clone(),
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });

      const plateMesh = new THREE.Mesh(geo, plateMat);
      plateMesh.position.set(u.mesh.position.x, 0.024 + u.id * 0.0004, u.mesh.position.z);
      plateMesh.renderOrder = 3;
      this.spriteGroup.add(plateMesh);

      const ringGeo = new THREE.RingGeometry(0.18, 0.28, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const cadenceMat = new THREE.MeshBasicMaterial({
        color: baseCol.clone(),
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const cadenceRing = new THREE.Mesh(ringGeo, cadenceMat);
      cadenceRing.position.set(u.mesh.position.x, 0.02, u.mesh.position.z);
      cadenceRing.renderOrder = 3;
      this.spriteGroup.add(cadenceRing);

      pool = {
        plateMesh,
        plateMat,
        cadenceRing,
        cadenceMat,
        uvAttr,
        lastCellX: -1,
        lastCellY: -1,
      };
      this.setSpriteUVCell(pool, 0, 0);
      this.spritePool.set(u.id, pool);
    }

    return { mem, pool };
  }

  /**
   * Maps a 4x4 Sprite Spec Sheet cell (col 0..3, row 0..3) onto the unit ground plate UVs.
   */
  private setSpriteUVCell(pool: SpriteSlotPool, cellX: number, cellY: number) {
    if (pool.lastCellX === cellX && pool.lastCellY === cellY) return;
    pool.lastCellX = cellX;
    pool.lastCellY = cellY;

    const u0 = cellX * 0.25 + 0.004;
    const u1 = (cellX + 1) * 0.25 - 0.004;
    const vTop = 1.0 - cellY * 0.25 - 0.004;
    const vBot = 1.0 - (cellY + 1) * 0.25 + 0.004;

    const arr = pool.uvAttr.array as Float32Array;
    arr[0] = u0;
    arr[1] = vTop;
    arr[2] = u1;
    arr[3] = vTop;
    arr[4] = u0;
    arr[5] = vBot;
    arr[6] = u1;
    arr[7] = vBot;
    pool.uvAttr.needsUpdate = true;
  }

  public notifyOpponentContact(receivingTeam: 'A' | 'B') {
    for (const [id, mem] of this.memMap.entries()) {
      const isTeamA = id <= 6;
      if ((receivingTeam === 'A' && isTeamA) || (receivingTeam === 'B' && !isTeamA)) {
        if (mem.diveTimer <= 0) {
          mem.splitStepTimer = 0.17;
        }
      }
    }
  }

  public triggerManualDive(u: Unit, dirX: number, dirZ: number) {
    const { mem } = this.ensureUnitPool(u);
    const len = Math.hypot(dirX, dirZ) || 1;
    mem.diveTimer = 0.36;
    mem.diveDirX = dirX / len;
    mem.diveDirZ = dirZ / len;
    mem.splitStepTimer = 0;
    u.isJumping = false;
    u.isLongJump = false;
    u.yVel = 0;
    u.mesh.position.y = 0;
    u.velocity.x = mem.diveDirX * u.speed * 1.38;
    u.velocity.z = mem.diveDirZ * u.speed * 1.38;
    u.animState = 'DIVE_PANCAKE';
    u.animTimer = 0;
    u.isDowned = true;
    u.fallRecoveryTimer = 0.72;
  }

  public triggerLongJump(u: Unit, dirX: number, dirZ: number, charge = 0.7) {
    const { mem } = this.ensureUnitPool(u);
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    mem.diveTimer = 0;
    mem.splitStepTimer = 0;
    u.isDowned = false;
    u.isJumping = true;
    u.isLongJump = true;
    u.yVel = u.stats.vertical * (0.82 + THREE.MathUtils.clamp(charge, 0, 1) * 0.16);
    const leapSpd = u.speed * (1.28 + THREE.MathUtils.clamp(charge, 0, 1) * 0.42);
    u.velocity.x = nx * leapSpd;
    u.velocity.z = nz * leapSpd;
    u.animState = 'LONG_JUMP_LEAP';
    u.animTimer = 0;
    if (len > 0.01) {
      u.mesh.rotation.y = Math.atan2(nx, nz);
    }
  }

  public setSpritesVisible(visible: boolean) {
    this.visible = visible;
    this.spriteGroup.visible = visible;
  }

  public isSpritesVisible(): boolean {
    return this.visible;
  }

  private resolveSpriteSpecForUnit(
    u: Unit,
    mem: UnitKinematicMem,
    kState: KinematicState
  ): SpriteSpecEntry {
    let specId: SpriteSpecId = 'READY_COIL';

    if (u.animState === 'CELEBRATION') {
      specId =
        u.celebrationStyle === 'KNEE_SLIDE_ROAR' || u.celebrationStyle === 'AEROPLANE_GLIDE'
          ? 'CELEB_SLIDE_GLIDE'
          : 'CELEB_ROAR_JUMP';
    } else if (u.defeatSlump) {
      specId = 'DEFEAT_RECOVERY_BREATH';
    } else if (u.animState === 'FALLEN_FLOOR' || u.animState === 'GETTING_UP') {
      specId = 'GETUP_RECOVER';
    } else if (u.animState === 'DIVE_PANCAKE' || kState === 'DIVE_SLIDE') {
      specId = 'PASS_PANCAKE_DIVE';
    } else if (u.animState === 'SPIKE_SWING' || u.animState === 'SERVE_JUMP') {
      specId = 'STRIKE_THUNDER_SPIKE';
    } else if (u.animState === 'BLOCK_ROOF') {
      specId = 'BLOCK_NET_WALL';
    } else if (u.animState === 'SET_HIGH_ARC' || u.animState === 'SET_QUICK' || u.animState === 'SET_BACK') {
      specId = 'SET_TEMPO_RELEASE';
    } else if (u.animState === 'PASS_BUMP' || u.animState === 'PASS_OVERHEAD') {
      specId = 'PASS_FOREARM_PLATFORM';
    } else if (u.animState === 'LONG_JUMP_LEAP' || kState === 'AIRBORNE') {
      specId = 'AERIAL_APEX_FLOAT';
    } else if (kState === 'DECEL_PLANT') {
      specId = 'DECEL_BRAKE_PLANT';
    } else if (kState === 'SPLIT_STEP') {
      specId = 'SPLIT_STEP_REACT';
    } else if (kState === 'APPROACH_3STEP') {
      specId = 'RUNWAY_3STEP_APPROACH';
    } else if (kState === 'SPRINT') {
      specId = 'SPRINT_PURSUIT';
    } else if (kState === 'ACCELERATE') {
      specId = 'LATERAL_SHUFFLE';
    }

    mem.activeSpriteId = specId;
    return MOVEMENT_REACTION_SPRITE_SPECS[specId];
  }

  public stepUnitMovement(input: MovementStepInput): {
    dist: number;
    kinematicState: KinematicState;
    activeSpriteId: SpriteSpecId;
  } {
    const {
      unit: u,
      allUnits,
      behavior,
      targetX,
      targetZ,
      lookX,
      lookZ,
      huntMode,
      turbulence,
      floorFlow,
      ballPos,
      isExpectedReceiver,
      isExpectedSpiker,
      sideTouches,
      dt,
      manualMoveX = 0,
      manualMoveZ = 0,
      reactiveCharge = 0,
      onFootPlantScuff,
    } = input;

    const { mem, pool } = this.ensureUnitPool(u);
    if (mem.scuffCooldown > 0) mem.scuffCooldown = Math.max(0, mem.scuffCooldown - dt);
    if (mem.splitStepTimer > 0) mem.splitStepTimer = Math.max(0, mem.splitStepTimer - dt);
    if (mem.plantTimer > 0) mem.plantTimer = Math.max(0, mem.plantTimer - dt);
    if (mem.diveTimer > 0) {
      mem.diveTimer = Math.max(0, mem.diveTimer - dt);
      if (mem.diveTimer <= 0 && u.animState === 'DIVE_PANCAKE') {
        u.animState = 'FALLEN_FLOOR';
        u.animTimer = 0;
        u.isDowned = true;
        u.fallRecoveryTimer = 0.64;
      }
    }

    const dx = targetX - u.mesh.position.x;
    const dz = targetZ - u.mesh.position.z;
    const dist = Math.hypot(dx, dz);

    // Individual Passing-Matrix Dive Trigger Check
    if (
      isExpectedReceiver &&
      !u.isJumping &&
      !u.isDowned &&
      mem.diveTimer <= 0 &&
      ballPos.y < behavior.diveMinBallY &&
      ballPos.y > 0.16 &&
      dist > 1.0 &&
      dist < behavior.diveCommitRadius
    ) {
      const inv = 1 / Math.max(0.01, dist);
      mem.diveTimer = 0.34;
      mem.diveDirX = dx * inv;
      mem.diveDirZ = dz * inv;
      u.animState = 'DIVE_PANCAKE';
      u.animTimer = 0;
      u.isDowned = true;
      u.fallRecoveryTimer = 0.68;
      onFootPlantScuff?.(u.mesh.position, mem.diveDirX * 2.5, mem.diveDirZ * 2.5);
    }

    const huntBoost = huntMode ? 1.14 * (0.96 + turbulence * 0.08) : 1.0;
    const approachBoost = isExpectedSpiker && sideTouches >= 1 ? 1.16 : 1.0;
    const chargeDash = reactiveCharge > 0.15 && !u.isJumping ? 1.08 : 1.0;
    const maxSpeed =
      u.speed *
      (0.92 + (behavior.accelMult - 1) * 0.55) *
      huntBoost *
      approachBoost *
      chargeDash;

    let desiredVx = 0;
    let desiredVz = 0;
    const hasManualInput = Math.abs(manualMoveX) > 0.05 || Math.abs(manualMoveZ) > 0.05;
    const isRecoveringOnFloor =
      u.animState === 'FALLEN_FLOOR' || u.animState === 'GETTING_UP';

    if (mem.diveTimer > 0) {
      const diveDecay = mem.diveTimer / 0.36;
      const diveSpeed = maxSpeed * (0.55 + 1.05 * diveDecay);
      desiredVx = mem.diveDirX * diveSpeed;
      desiredVz = mem.diveDirZ * diveSpeed;
    } else if (u.isJumping && u.isLongJump) {
      // Preserve long-jump airborne horizontal trajectory with gentle aerodynamic drag
      const airDamp = Math.pow(0.92, dt * 60);
      u.velocity.x *= airDamp;
      u.velocity.z *= airDamp;
      desiredVx = u.velocity.x;
      desiredVz = u.velocity.z;
    } else if (isRecoveringOnFloor) {
      desiredVx = 0;
      desiredVz = 0;
    } else if (hasManualInput && !u.isJumping) {
      const mLen = Math.hypot(manualMoveX, manualMoveZ) || 1;
      desiredVx = (manualMoveX / mLen) * maxSpeed * 1.12;
      desiredVz = (manualMoveZ / mLen) * maxSpeed * 1.12;
    } else if (dist > 0.06) {
      const arrivalRamp = Math.min(1, dist / 0.95);
      const desiredSpeed = Math.max(0.45, maxSpeed * Math.sqrt(arrivalRamp));
      const flowGain = THREE.MathUtils.clamp(floorFlow.energy * 0.14, 0, 0.14);
      desiredVx = (dx / dist) * desiredSpeed + floorFlow.vx * flowGain;
      desiredVz = (dz / dist) * desiredSpeed + floorFlow.vz * flowGain;
    }

    const prevSpd = Math.hypot(mem.prevVelX, mem.prevVelZ);
    const desSpd = Math.hypot(desiredVx, desiredVz);
    if (prevSpd > 2.2 && desSpd > 1.1 && !u.isJumping && !isRecoveringOnFloor && mem.diveTimer <= 0) {
      const dot = (mem.prevVelX * desiredVx + mem.prevVelZ * desiredVz) / (prevSpd * desSpd);
      if (dot < -0.22 && mem.plantTimer <= 0) {
        mem.plantTimer = 0.14;
        if (mem.scuffCooldown <= 0) {
          mem.scuffCooldown = 0.35;
          onFootPlantScuff?.(u.mesh.position, mem.prevVelX * 0.35, mem.prevVelZ * 0.35);
        }
      }
    }

    if (!(u.isJumping && u.isLongJump)) {
      const baseAccel = isRecoveringOnFloor
        ? 9.5
        : mem.splitStepTimer > 0
        ? 8.2
        : desSpd > prevSpd
        ? 19.5 * behavior.accelMult
        : 24.5 * behavior.accelMult;
      const blend = 1 - Math.exp(-baseAccel * dt);
      u.velocity.x = THREE.MathUtils.lerp(u.velocity.x, desiredVx, blend);
      u.velocity.z = THREE.MathUtils.lerp(u.velocity.z, desiredVz, blend);
    }

    u.mesh.position.x += u.velocity.x * dt;
    u.mesh.position.z += u.velocity.z * dt;

    if (!u.isJumping) {
      if (mem.diveTimer > 0 || isRecoveringOnFloor) {
        u.mesh.position.y = 0;
      } else if (mem.splitStepTimer > 0) {
        const sp = 1 - mem.splitStepTimer / 0.17;
        u.mesh.position.y = Math.sin(sp * Math.PI) * behavior.splitStepHeight;
      } else if (u.mesh.position.y > 0) {
        u.mesh.position.y = Math.max(0, u.mesh.position.y - dt * 3.5);
      }
    }

    mem.prevVelX = u.velocity.x;
    mem.prevVelZ = u.velocity.z;
    u.actualSpeed = Math.hypot(u.velocity.x, u.velocity.z);

    // Individual Stride Cadence calibrated against strideLengthMult & active SpriteSpec cadence
    const strideLen = 1.08 * behavior.strideLengthMult;
    const strideInc = ((u.actualSpeed * dt) / strideLen) * Math.PI * 2;
    u.stepCycle += strideInc;
    mem.stridePhase = (mem.stridePhase + (u.actualSpeed * dt) / strideLen) % 1;

    // Individual Inertial Banking scaled by sprintBankMult
    const leanAlpha = 1 - Math.exp(-13 * dt);
    const plantLean = mem.plantTimer > 0 ? -0.16 : 0;
    const targetPitch = THREE.MathUtils.clamp(
      u.actualSpeed * 0.038 * behavior.sprintBankMult + plantLean,
      -0.16,
      0.3
    );
    const targetRoll = THREE.MathUtils.clamp(
      -u.velocity.x * 0.036 * behavior.sprintBankMult,
      -0.22,
      0.22
    );
    u.currentLeanPitch = THREE.MathUtils.lerp(u.currentLeanPitch, targetPitch, leanAlpha);
    u.currentLeanRoll = THREE.MathUtils.lerp(u.currentLeanRoll, targetRoll, leanAlpha);

    // Individual Voronoi Anti-Overlap Spacing Repulsion
    let minOther = 9.0;
    const cushion = behavior.voronoiCushionM;
    for (const other of allUnits) {
      if (other === u || other.team !== u.team) continue;
      const ox = u.mesh.position.x - other.mesh.position.x;
      const oz = u.mesh.position.z - other.mesh.position.z;
      const od = Math.hypot(ox, oz);
      if (od < minOther) minOther = od;
      if (od < cushion && od > 0.001) {
        const push = (cushion - od) * 0.45;
        u.mesh.position.x += (ox / od) * push;
        u.mesh.position.z += (oz / od) * push;
      }
    }

    const lookFocusX =
      mem.diveTimer > 0 || (u.actualSpeed > 3.6 && !isExpectedReceiver)
        ? u.mesh.position.x + u.velocity.x * 0.6 + (lookX - u.mesh.position.x) * 0.4
        : lookX;
    const lookFocusZ =
      mem.diveTimer > 0 || (u.actualSpeed > 3.6 && !isExpectedReceiver)
        ? u.mesh.position.z + u.velocity.z * 0.6 + (lookZ - u.mesh.position.z) * 0.4
        : lookZ;
    this._v1.set(lookFocusX, u.mesh.position.y, lookFocusZ);
    if (this._v1.distanceToSquared(u.mesh.position) > 0.02) {
      this._m1.lookAt(this._v1, u.mesh.position, this._up);
      this._q1.setFromRotationMatrix(this._m1);
      u.mesh.quaternion.slerp(this._q1, Math.min(1, dt * 12.5));
    }

    // Derive Kinematic State
    let kState: KinematicState = 'READY';
    if (u.isJumping) {
      kState = 'AIRBORNE';
    } else if (mem.diveTimer > 0 || u.animState === 'DIVE_PANCAKE') {
      kState = 'DIVE_SLIDE';
    } else if (u.animState === 'FALLEN_FLOOR' || u.animState === 'GETTING_UP') {
      kState = 'RECOVER';
    } else if (mem.plantTimer > 0) {
      kState = 'DECEL_PLANT';
    } else if (mem.splitStepTimer > 0 && u.actualSpeed < 2.2) {
      kState = 'SPLIT_STEP';
    } else if (isExpectedSpiker && sideTouches >= 1 && u.actualSpeed >= 1.8) {
      kState = 'APPROACH_3STEP';
    } else if (u.actualSpeed >= 3.3) {
      kState = 'SPRINT';
    } else if (u.actualSpeed >= 0.35) {
      kState = 'ACCELERATE';
    }

    // Resolve Exact 16-Spec Sheet Entry
    const spec = this.resolveSpriteSpecForUnit(u, mem, kState);
    mem.state = kState;
    mem.cellX = spec.atlasCol;
    mem.cellY = spec.atlasRow;
    mem.coordinationScore = Math.round(THREE.MathUtils.clamp((minOther / cushion) * 100, 58, 100));

    this.updateUnitSpriteVisuals(u, mem, pool, spec);

    return { dist, kinematicState: kState, activeSpriteId: spec.id };
  }

  private updateUnitSpriteVisuals(
    u: Unit,
    mem: UnitKinematicMem,
    pool: SpriteSlotPool,
    spec: SpriteSpecEntry
  ) {
    if (!this.visible) return;

    this.setSpriteUVCell(pool, spec.atlasCol, spec.atlasRow);
    pool.plateMesh.position.set(u.mesh.position.x, 0.024 + u.id * 0.0004, u.mesh.position.z);

    const heading =
      u.actualSpeed > 0.3 ? Math.atan2(u.velocity.x, u.velocity.z) : u.mesh.rotation.y;
    pool.plateMesh.rotation.y = heading;

    const pulse = 1.0 + Math.sin(mem.stridePhase * Math.PI * 2 * spec.strideCadenceMult) * 0.06;
    const airFactor = mem.state === 'AIRBORNE' ? Math.max(0.65, 1.0 - u.mesh.position.y * 0.12) : 1.0;
    pool.plateMesh.scale.setScalar(spec.baseScale * airFactor * pulse);

    // Blend spec palette color with team identity
    this._colSpec.setHex(spec.colorHex);
    const teamBase = u.isLibero ? this._colGold : u.team === 'A' ? this._colCyan : this._colCoral;
    pool.plateMat.color.copy(teamBase).lerp(this._colSpec, 0.55);
    pool.plateMat.opacity = THREE.MathUtils.clamp(
      spec.baseOpacity + (u.actualSpeed / 7.5) * 0.16,
      0.22,
      0.86
    );

    const stepPulse = Math.max(0, Math.abs(Math.sin(u.stepCycle)));
    pool.cadenceRing.position.set(u.mesh.position.x, 0.02, u.mesh.position.z);
    pool.cadenceMat.color.copy(pool.plateMat.color);
    pool.cadenceMat.opacity =
      u.actualSpeed > 0.45 || mem.splitStepTimer > 0 || mem.plantTimer > 0 || u.animState === 'CELEBRATION'
        ? THREE.MathUtils.clamp(0.16 + stepPulse * 0.28, 0.14, 0.46)
        : 0.06;
    const cScale = 0.85 + stepPulse * 0.38;
    pool.cadenceRing.scale.setScalar(cScale);
  }

  public getUnitSpriteCell(unitId: number): {
    state: KinematicState;
    activeSpriteId: SpriteSpecId;
    cellX: number;
    cellY: number;
    stridePhase: number;
    coordinationScore: number;
  } {
    const mem = this.memMap.get(unitId);
    return {
      state: mem?.state ?? 'READY',
      activeSpriteId: mem?.activeSpriteId ?? 'READY_COIL',
      cellX: mem?.cellX ?? 0,
      cellY: mem?.cellY ?? 0,
      stridePhase: Number((mem?.stridePhase ?? 0).toFixed(2)),
      coordinationScore: mem?.coordinationScore ?? 98,
    };
  }

  public getMatrixSnapshot(units: Unit[]): SpriteMatrixUnitSlot[] {
    this.slotsSnapshot.length = 0;
    for (const u of units) {
      const mem = this.memMap.get(u.id);
      const nx = THREE.MathUtils.clamp((u.mesh.position.x + this.courtWidth * 0.5) / this.courtWidth, 0, 0.999);
      const nz = THREE.MathUtils.clamp((u.mesh.position.z + this.courtLength * 0.5) / this.courtLength, 0, 0.999);
      this.slotsSnapshot.push({
        unitId: u.id,
        playerName: u.name,
        jerseyNumber: u.jerseyNumber,
        team: u.team,
        kinematicState: mem?.state ?? 'READY',
        activeSpriteId: mem?.activeSpriteId ?? 'READY_COIL',
        matrixCol: Math.floor(nx * this.cols),
        matrixRow: Math.floor(nz * this.rows),
        spriteCellX: mem?.cellX ?? 0,
        spriteCellY: mem?.cellY ?? 0,
        stridePhase: Number((mem?.stridePhase ?? 0).toFixed(2)),
        coordinationScore: mem?.coordinationScore ?? 98,
      });
    }
    return this.slotsSnapshot;
  }

  public dispose() {
    for (const pool of this.spritePool.values()) {
      pool.plateMesh.geometry.dispose();
      pool.plateMat.dispose();
      pool.cadenceRing.geometry.dispose();
      pool.cadenceMat.dispose();
    }
    this.spritePool.clear();
    this.atlasTex.dispose();
    this.pulseTex.dispose();
    this.scene.remove(this.spriteGroup);
  }
}
