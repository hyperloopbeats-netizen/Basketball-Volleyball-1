import * as THREE from 'three';
import { SoccerGoalieTelemetry } from './basketballTypes';

export class BasketballSoccerGoalie {
  public readonly root = new THREE.Group();
  public readonly clickableMeshes: THREE.Object3D[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];

  // Turf & Goal constants (local coordinates inside root at y = 0 ground level)
  private readonly GOAL_Z = -2.0;
  private readonly GOAL_HALF_W = 1.7;
  private readonly GOAL_HEIGHT = 2.0;
  private readonly KEEPER_HOME_Z = -1.84;
  private readonly PENALTY_SPOT_Z = 1.85;
  private readonly SOCCER_BALL_R = 0.11;

  // Goalie Rig Parts
  private goalieRoot = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private shoulderL = new THREE.Group();
  private elbowL = new THREE.Group();
  private gloveL = new THREE.Mesh();
  private shoulderR = new THREE.Group();
  private elbowR = new THREE.Group();
  private gloveR = new THREE.Mesh();
  private hipL = new THREE.Group();
  private kneeL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeR = new THREE.Group();

  // Optical Hitbox Wireframes for Goalie
  private gloveBoxL!: THREE.LineSegments;
  private gloveBoxR!: THREE.LineSegments;
  private torsoBox!: THREE.LineSegments;
  private opticalVisible = false;
  private gloveFlashTimer = 0;

  // Goal Net Deformer
  private netMesh!: THREE.Mesh;
  private netOrigPos!: Float32Array;
  private netRippleTimer = -1;
  private netImpactLocal = new THREE.Vector3();

  // Soccer Ball Physics
  private soccerBall = new THREE.Mesh();
  private soccerSpotRing!: THREE.Mesh;
  private ballPos = new THREE.Vector3(0, 0.11, 1.85);
  private ballVel = new THREE.Vector3();
  private shotInFlight = false;
  private shotCooldown = 0;
  private shotResolved = false;

  // Keeper State Machine
  private stance: SoccerGoalieTelemetry['stance'] = 'READY';
  private diveTimer = 0;
  private diveTargetX = 0;
  private diveTargetY = 0;
  private saves = 0;
  private goalsConceded = 0;
  private shotsFaced = 0;
  private lastOutcome = 'COAL HARBOUR PK STATION READY';
  private autoChallengeTimer = 9.5;

  // Scratch vectors
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private readonly _v3 = new THREE.Vector3();

  constructor(private scene: THREE.Scene, maxAniso = 4, isSoftwareGl = false) {
    this.root.name = 'CoalHarbourSoccerGoalieStation';
    // Positioned cleanly in North-East Stadium Concourse Bay, zero clip with bleachers/parapet/court
    this.root.position.set(18.0, 0.0, -18.0);
    this.root.rotation.y = -0.36;

    this.buildTurfPitch(maxAniso);
    this.buildGoalFrameAndNet(isSoftwareGl);
    this.buildSoccerGoalieRig(maxAniso, isSoftwareGl);
    this.buildSoccerBall(maxAniso, isSoftwareGl);
    this.buildOpticalWireframes();

    this.scene.add(this.root);
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private buildTurfPitch(maxAniso: number) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    // Striped FIFA emerald pitch turf
    const stripes = 8;
    const sh = 512 / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#166534';
      ctx.fillRect(0, i * sh, 512, sh);
    }
    for (let i = 0; i < 3200; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(5,46,22,0.12)';
      ctx.fillRect((i * 197) % 512, (i * 389) % 512, 2, 2);
    }
    // Stencil badge
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AIM PENALTY ZONE', 256, 360);

    const turfTex = this.track(new THREE.CanvasTexture(c));
    turfTex.colorSpace = THREE.SRGBColorSpace;
    turfTex.anisotropy = maxAniso;

    // Slab thickness = 0.036 sitting on outer concrete (-0.036) => exact y = 0.000 top surface!
    const turfMat = this.track(
      new THREE.MeshStandardMaterial({ map: turfTex, roughness: 0.86, metalness: 0.03 })
    );
    const turfSlab = new THREE.Mesh(this.track(new THREE.BoxGeometry(6.0, 0.036, 5.2)), turfMat);
    turfSlab.position.set(0, -0.018, 0);
    turfSlab.receiveShadow = true;
    this.root.add(turfSlab);
    this.clickableMeshes.push(turfSlab);

    // Surround perimeter rubber curb
    const curbMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 }));
    const curb = new THREE.Mesh(this.track(new THREE.BoxGeometry(6.24, 0.032, 5.44)), curbMat);
    curb.position.set(0, -0.02, 0);
    this.root.add(curb);

    // Chalk white field lines at y = 0.005
    const chalkMat = this.track(new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
    const addLine = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(this.track(new THREE.PlaneGeometry(w, d)), chalkMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.005, z);
      m.renderOrder = 2;
      this.root.add(m);
    };

    // Touchlines & Goal line
    addLine(5.4, 0.05, 0, this.GOAL_Z);
    addLine(5.4, 0.05, 0, 2.35);
    addLine(0.05, 4.4, -2.7, 0.175);
    addLine(0.05, 4.4, 2.7, 0.175);
    // 6-yard penalty box
    addLine(4.2, 0.045, 0, 0.55);
    addLine(0.045, 2.55, -2.1, -0.725);
    addLine(0.045, 2.55, 2.1, -0.725);

    // Penalty Spot
    const spot = new THREE.Mesh(this.track(new THREE.CircleGeometry(0.075, 16)), chalkMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.006, this.PENALTY_SPOT_Z);
    this.root.add(spot);

    // Interactive Cyan Pulsing Penalty Target Ring around soccer ball
    const spotRingMat = this.track(
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
    );
    this.soccerSpotRing = new THREE.Mesh(this.track(new THREE.RingGeometry(0.19, 0.24, 24)), spotRingMat);
    this.soccerSpotRing.rotation.x = -Math.PI / 2;
    this.soccerSpotRing.position.set(0, 0.008, this.PENALTY_SPOT_Z);
    this.root.add(this.soccerSpotRing);
  }

  private buildGoalFrameAndNet(isSoftwareGl: boolean) {
    const postMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28, metalness: 0.35 })
    );
    const supportMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.65 })
    );
    const postR = 0.052;
    const goalDepth = 1.05;

    // Left & Right Vertical Goalposts anchored at exact y = 0 on GOAL_Z
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(postR, postR, this.GOAL_HEIGHT, 12)),
        postMat
      );
      post.position.set(side * this.GOAL_HALF_W, this.GOAL_HEIGHT * 0.5, this.GOAL_Z);
      post.castShadow = !isSoftwareGl;
      this.root.add(post);

      // Ground side rail to back base
      const sideGround = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.032, 0.032, goalDepth, 8)),
        supportMat
      );
      sideGround.rotation.x = Math.PI / 2;
      sideGround.position.set(side * this.GOAL_HALF_W, 0.032, this.GOAL_Z - goalDepth * 0.5);
      this.root.add(sideGround);

      // Top back-depth stanchion arm
      const topArm = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.03, 0.03, goalDepth * 0.78, 8)),
        supportMat
      );
      topArm.rotation.x = Math.PI / 2;
      topArm.position.set(side * this.GOAL_HALF_W, this.GOAL_HEIGHT, this.GOAL_Z - goalDepth * 0.39);
      this.root.add(topArm);

      // Slanted back post down to ground rail
      const backStay = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.028, 0.028, this.GOAL_HEIGHT * 1.03, 8)),
        supportMat
      );
      backStay.position.set(side * this.GOAL_HALF_W, this.GOAL_HEIGHT * 0.5, this.GOAL_Z - goalDepth * 0.89);
      backStay.rotation.x = -0.14;
      this.root.add(backStay);
    }

    // Horizontal Crossbar
    const crossbar = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(postR, postR, this.GOAL_HALF_W * 2 + postR * 2, 12)),
      postMat
    );
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, this.GOAL_HEIGHT, this.GOAL_Z);
    crossbar.castShadow = !isSoftwareGl;
    this.root.add(crossbar);

    // Ground back crossbar
    const backGroundBar = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.032, 0.032, this.GOAL_HALF_W * 2, 8)),
      supportMat
    );
    backGroundBar.rotation.z = Math.PI / 2;
    backGroundBar.position.set(0, 0.032, this.GOAL_Z - goalDepth);
    this.root.add(backGroundBar);

    // Hexagonal Nylon Net Texture
    const nc = document.createElement('canvas');
    nc.width = 256;
    nc.height = 256;
    const nctx = nc.getContext('2d')!;
    nctx.clearRect(0, 0, 256, 256);
    nctx.strokeStyle = 'rgba(241, 245, 249, 0.85)';
    nctx.lineWidth = 4;
    for (let i = -256; i < 512; i += 24) {
      nctx.beginPath();
      nctx.moveTo(i, 0);
      nctx.lineTo(i + 256, 256);
      nctx.stroke();
      nctx.beginPath();
      nctx.moveTo(i, 256);
      nctx.lineTo(i + 256, 0);
      nctx.stroke();
    }
    const netTex = this.track(new THREE.CanvasTexture(nc));
    netTex.wrapS = THREE.RepeatWrapping;
    netTex.wrapT = THREE.RepeatWrapping;
    netTex.repeat.set(6, 3);
    netTex.colorSpace = THREE.SRGBColorSpace;

    const netMat = this.track(
      new THREE.MeshBasicMaterial({
        map: netTex,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );

    // Back net curtain (subdivided for ripple physics)
    const backNetGeo = this.track(new THREE.PlaneGeometry(this.GOAL_HALF_W * 2, this.GOAL_HEIGHT, 16, 10));
    this.netMesh = new THREE.Mesh(backNetGeo, netMat);
    this.netMesh.position.set(0, this.GOAL_HEIGHT * 0.5, this.GOAL_Z - goalDepth * 0.92);
    this.netOrigPos = new Float32Array(backNetGeo.attributes.position.array);
    this.root.add(this.netMesh);

    // Side & Roof net panels
    for (const side of [-1, 1]) {
      const sideNet = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(goalDepth * 0.92, this.GOAL_HEIGHT)),
        netMat
      );
      sideNet.rotation.y = Math.PI / 2;
      sideNet.position.set(side * this.GOAL_HALF_W, this.GOAL_HEIGHT * 0.5, this.GOAL_Z - goalDepth * 0.46);
      this.root.add(sideNet);
    }
    const roofNet = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(this.GOAL_HALF_W * 2, goalDepth * 0.92)),
      netMat
    );
    roofNet.rotation.x = Math.PI / 2;
    roofNet.position.set(0, this.GOAL_HEIGHT, this.GOAL_Z - goalDepth * 0.46);
    this.root.add(roofNet);
  }

  private buildSoccerGoalieRig(maxAniso: number, isSoftwareGl: boolean) {
    // High-Vis Emerald Keeper Jersey #1 CanvasTexture
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(1, '#047857');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#090612';
    ctx.fillRect(0, 0, 256, 24);
    ctx.fillRect(0, 224, 256, 32);
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('KEEPER', 128, 66);
    ctx.font = 'bold 104px sans-serif';
    ctx.fillText('1', 128, 178);

    const kitTex = this.track(new THREE.CanvasTexture(c));
    kitTex.colorSpace = THREE.SRGBColorSpace;
    kitTex.anisotropy = maxAniso;

    const jerseyMat = this.track(
      new THREE.MeshStandardMaterial({ map: kitTex, roughness: 0.45, metalness: 0.1 })
    );
    const shortsMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.58, metalness: 0.12 })
    );
    const skinMat = this.track(new THREE.MeshStandardMaterial({ color: 0xd99e77, roughness: 0.52 }));
    const gloveMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x006688,
        emissiveIntensity: 0.35,
        roughness: 0.35,
      })
    );
    const bootMat = this.track(new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.4 }));
    const hairMat = this.track(new THREE.MeshStandardMaterial({ color: 0x1e1b18, roughness: 0.8 }));

    this.goalieRoot.position.set(0, 0, this.KEEPER_HOME_Z);
    this.hips.position.set(0, 0.88, 0);
    this.goalieRoot.add(this.hips);

    const shortsMesh = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.165, 0.185, 0.28, 14)), shortsMat);
    shortsMesh.castShadow = !isSoftwareGl;
    this.hips.add(shortsMesh);

    this.torso.position.y = 0.11;
    this.hips.add(this.torso);

    const chest = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.2, 0.16, 0.47, 16)), jerseyMat);
    chest.position.y = 0.25;
    chest.castShadow = !isSoftwareGl;
    this.torso.add(chest);
    this.clickableMeshes.push(chest);

    const shoulderBar = new THREE.Mesh(this.track(new THREE.CapsuleGeometry(0.14, 0.18, 6, 12)), jerseyMat);
    shoulderBar.rotation.z = Math.PI / 2;
    shoulderBar.position.y = 0.45;
    this.torso.add(shoulderBar);

    this.head.position.y = 0.64;
    this.torso.add(this.head);

    const cranium = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.12, 16, 16)), skinMat);
    cranium.castShadow = !isSoftwareGl;
    this.head.add(cranium);

    const capCrown = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.54)),
      shortsMat
    );
    capCrown.position.y = 0.03;
    const capBrim = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.17, 0.015, 0.11)), gloveMat);
    capBrim.position.set(0, 0.035, 0.14);
    this.head.add(capCrown, capBrim);

    // Arms + Oversized Padded Keeper Gloves
    const buildArm = (side: -1 | 1) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.22, 0.45, 0);
      this.torso.add(sh);

      const uGeo = this.track(new THREE.CapsuleGeometry(0.046, 0.21, 6, 10));
      uGeo.translate(0, -0.11, 0);
      sh.add(new THREE.Mesh(uGeo, jerseyMat));

      const el = new THREE.Group();
      el.position.set(0, -0.23, 0);
      sh.add(el);

      const lGeo = this.track(new THREE.CapsuleGeometry(0.042, 0.21, 6, 10));
      lGeo.translate(0, -0.105, 0);
      el.add(new THREE.Mesh(lGeo, jerseyMat));

      const glove = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.10, 0.13, 0.065)), gloveMat);
      glove.position.set(0, -0.25, 0.02);
      el.add(glove);
      this.clickableMeshes.push(glove);
      return { sh, el, glove };
    };
    const lA = buildArm(1);
    const rA = buildArm(-1);
    this.shoulderL = lA.sh;
    this.elbowL = lA.el;
    this.gloveL = lA.glove;
    this.shoulderR = rA.sh;
    this.elbowR = rA.el;
    this.gloveR = rA.glove;

    // Legs + Football Socks + Cleats sitting flush at exact y = 0
    const buildLeg = (side: -1 | 1) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.105, -0.02, 0);
      this.hips.add(hip);
      const tGeo = this.track(new THREE.CapsuleGeometry(0.068, 0.27, 6, 10));
      tGeo.translate(0, -0.16, 0);
      hip.add(new THREE.Mesh(tGeo, skinMat));

      const knee = new THREE.Group();
      knee.position.set(0, -0.38, 0);
      hip.add(knee);
      const sGeo = this.track(new THREE.CapsuleGeometry(0.054, 0.27, 6, 10));
      sGeo.translate(0, -0.165, 0);
      knee.add(new THREE.Mesh(sGeo, shortsMat));

      const cleat = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.11, 0.08, 0.24)), bootMat);
      cleat.position.set(0, -0.44, 0.04); // 0.88 - 0.02 - 0.38 - 0.44 = +0.04 center, halfH 0.04 => sole exact y=0.00!
      knee.add(cleat);
      return { hip, knee };
    };
    const lL = buildLeg(1);
    const rL = buildLeg(-1);
    this.hipL = lL.hip;
    this.kneeL = lL.knee;
    this.hipR = rL.hip;
    this.kneeR = rL.knee;

    // Hair tuft for silhouette back
    const hair = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.12, 0.05, 0.07)), hairMat);
    hair.position.set(0, 0.02, -0.10);
    this.head.add(hair);

    this.root.add(this.goalieRoot);
  }

  private buildSoccerBall(maxAniso: number, isSoftwareGl: boolean) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#0f172a';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        if ((row + col) % 2 === 0) {
          ctx.beginPath();
          ctx.arc(22 + col * 42, 22 + row * 42, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    const tex = this.track(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;

    const mat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.06 }));
    this.soccerBall = new THREE.Mesh(this.track(new THREE.SphereGeometry(this.SOCCER_BALL_R, 20, 20)), mat);
    this.soccerBall.position.copy(this.ballPos);
    this.soccerBall.castShadow = !isSoftwareGl;
    this.root.add(this.soccerBall);
    this.clickableMeshes.push(this.soccerBall);
  }

  private buildOpticalWireframes() {
    const boxGeo = this.track(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.24, 0.24, 0.24)));
    const torsoGeo = this.track(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.48, 0.62, 0.36)));
    const gMatL = this.track(new THREE.LineBasicMaterial({ color: 0x00f0ff }));
    const gMatR = this.track(new THREE.LineBasicMaterial({ color: 0x00f0ff }));
    const tMat = this.track(new THREE.LineBasicMaterial({ color: 0x34d399 }));

    this.gloveBoxL = new THREE.LineSegments(boxGeo, gMatL);
    this.gloveBoxR = new THREE.LineSegments(boxGeo, gMatR);
    this.torsoBox = new THREE.LineSegments(torsoGeo, tMat);
    this.gloveBoxL.visible = false;
    this.gloveBoxR.visible = false;
    this.torsoBox.visible = false;
    this.scene.add(this.gloveBoxL, this.gloveBoxR, this.torsoBox);
  }

  public setOpticalOverlay(enabled: boolean) {
    this.opticalVisible = enabled;
    this.gloveBoxL.visible = enabled;
    this.gloveBoxR.visible = enabled;
    this.torsoBox.visible = enabled;
  }

  public getStationFocusTarget(outCamPos: THREE.Vector3, outLookAt: THREE.Vector3) {
    // Camera positioned in front of penalty spot looking past the soccer ball at the Goalie & Coal Harbour Goal!
    const localCam = this._v1.set(0.65, 2.35, 5.4);
    const localLook = this._v2.set(0, 1.0, -1.2);
    this.root.updateMatrixWorld(true);
    outCamPos.copy(localCam).applyMatrix4(this.root.matrixWorld);
    outLookAt.copy(localLook).applyMatrix4(this.root.matrixWorld);
  }

  /**
   * Fires an interactive penalty kick from the Coal Harbour penalty spot toward the Goalie!
   */
  public triggerPenaltyShot(): boolean {
    if (this.shotInFlight) return false;
    this.shotInFlight = true;
    this.shotResolved = false;
    this.shotsFaced += 1;
    this.ballPos.set(0, this.SOCCER_BALL_R, this.PENALTY_SPOT_Z);

    // Choose target corner inside the 3.4m x 2.0m goal
    const corner = Math.random();
    const targetX = corner < 0.38 ? -1.18 - Math.random() * 0.3 : corner < 0.76 ? 1.18 + Math.random() * 0.3 : (Math.random() - 0.5) * 0.7;
    const targetY = 0.32 + Math.random() * 1.25;
    const flightTime = 0.42;

    this.ballVel.set(
      (targetX - this.ballPos.x) / flightTime,
      (targetY - this.ballPos.y - 0.5 * -9.8 * flightTime * flightTime) / flightTime,
      (this.GOAL_Z - this.ballPos.z) / flightTime
    );

    // Keeper commits dynamically based on athletic reaction
    const willGuessRight = Math.random() < 0.72;
    const diveX = willGuessRight ? targetX * 0.86 : -targetX * 0.65;
    this.diveTargetX = THREE.MathUtils.clamp(diveX, -1.35, 1.35);
    this.diveTargetY = THREE.MathUtils.clamp(targetY * 0.45, 0, 0.52);
    this.diveTimer = 0;
    this.stance = targetX < -0.25 ? (willGuessRight ? 'DIVE_LEFT' : 'DIVE_RIGHT') : targetX > 0.25 ? (willGuessRight ? 'DIVE_RIGHT' : 'DIVE_LEFT') : 'HIGH_TIP';
    this.lastOutcome = 'PENALTY SHOT INCOMING!';
    return true;
  }

  public update(
    dt: number,
    elapsedSec: number,
    onEvent?: (kind: 'KICK' | 'SAVE' | 'GOAL', worldPos: THREE.Vector3) => void
  ) {
    this.root.updateMatrixWorld(true);

    // Subtle spot beacon pulse
    const spotScale = 1 + 0.12 * Math.sin(elapsedSec * 4.5);
    this.soccerSpotRing.scale.setScalar(this.shotInFlight ? 0.6 : spotScale);

    // Occasional ambient penalty challenge showcase if untouched
    if (!this.shotInFlight) {
      this.autoChallengeTimer -= dt;
      if (this.autoChallengeTimer <= 0) {
        this.autoChallengeTimer = 14 + Math.random() * 8;
        this.triggerPenaltyShot();
        onEvent?.('KICK', this.getWorldPoint(this.ballPos));
      }
    }

    if (this.gloveFlashTimer > 0) {
      this.gloveFlashTimer = Math.max(0, this.gloveFlashTimer - dt);
    }

    // 1. Update Goalie Pose & Dive Kinematics (anchored strictly to goal line y >= 0!)
    if (this.stance === 'READY' || this.stance === 'TRACKING') {
      const idleSway = Math.sin(elapsedSec * 3.1) * 0.14;
      const bounceY = Math.abs(Math.sin(elapsedSec * 6.2)) * 0.03;
      this.goalieRoot.position.x = THREE.MathUtils.damp(this.goalieRoot.position.x, idleSway, 7, dt);
      this.goalieRoot.position.y = bounceY;
      this.goalieRoot.position.z = this.KEEPER_HOME_Z;
      this.goalieRoot.rotation.z = THREE.MathUtils.damp(this.goalieRoot.rotation.z, 0, 9, dt);

      this.hips.position.y = 0.84;
      this.hipL.rotation.x = -0.22;
      this.hipR.rotation.x = -0.22;
      this.kneeL.rotation.x = 0.36;
      this.kneeR.rotation.x = 0.36;
      this.shoulderL.rotation.set(-0.95, 0, 0.38);
      this.shoulderR.rotation.set(-0.95, 0, -0.38);
      this.elbowL.rotation.x = -0.55;
      this.elbowR.rotation.x = -0.55;
    } else if (this.stance === 'DIVE_LEFT' || this.stance === 'DIVE_RIGHT' || this.stance === 'HIGH_TIP') {
      this.diveTimer += dt;
      const divePhase = Math.min(1, this.diveTimer / 0.34);
      const ease = Math.sin(divePhase * Math.PI * 0.5);
      this.goalieRoot.position.x = THREE.MathUtils.lerp(0, this.diveTargetX, ease);
      this.goalieRoot.position.y = Math.sin(Math.min(1, this.diveTimer / 0.68) * Math.PI) * (this.stance === 'HIGH_TIP' ? 0.62 : 0.42);
      const tiltDir = this.diveTargetX < 0 ? 1 : -1;
      this.goalieRoot.rotation.z = this.stance === 'HIGH_TIP' ? tiltDir * 0.24 : tiltDir * ease * 1.12;

      this.shoulderL.rotation.set(-2.65, 0, 0.25);
      this.shoulderR.rotation.set(-2.65, 0, -0.25);
      this.elbowL.rotation.x = -0.1;
      this.elbowR.rotation.x = -0.1;

      if (this.diveTimer > 1.1) {
        this.stance = 'READY';
      }
    } else if (this.stance === 'CELEBRATE') {
      this.diveTimer += dt;
      this.goalieRoot.position.x = THREE.MathUtils.damp(this.goalieRoot.position.x, 0, 6, dt);
      this.goalieRoot.position.y = Math.abs(Math.sin(elapsedSec * 9)) * 0.14;
      this.goalieRoot.rotation.z = THREE.MathUtils.damp(this.goalieRoot.rotation.z, 0, 10, dt);
      this.shoulderR.rotation.set(-2.75, 0, -0.25);
      this.shoulderL.rotation.set(-0.6, 0, 0.2);
      if (this.diveTimer > 1.35) {
        this.stance = 'READY';
      }
    }

    // 2. Soccer Ball Flight & Optical Glove/Torso Contact Check
    if (this.shotInFlight) {
      this.ballVel.y += -9.8 * dt;
      this.ballPos.addScaledVector(this.ballVel, dt);
      this.soccerBall.rotation.x += dt * 16;
      this.soccerBall.rotation.z -= dt * 11;

      if (!this.shotResolved) {
        // Test optical glove & torso hitboxes in world space!
        const ballWorld = this.getWorldPoint(this.ballPos);
        const lGloveWorld = this.gloveL.getWorldPosition(this._v2);
        const rGloveWorld = this.gloveR.getWorldPosition(this._v3);
        const torsoWorld = this.torso.getWorldPosition(this._v1);
        torsoWorld.y += 0.24;

        const dL = ballWorld.distanceTo(lGloveWorld);
        const dR = ballWorld.distanceTo(rGloveWorld);
        const dT = ballWorld.distanceTo(torsoWorld);

        if (dL < 0.34 || dR < 0.34 || dT < 0.38) {
          this.shotResolved = true;
          this.saves += 1;
          this.gloveFlashTimer = 0.65;
          this.stance = 'CELEBRATE';
          this.diveTimer = 0;
          this.ballVel.z = Math.abs(this.ballVel.z) * 0.55 + 2.4;
          this.ballVel.x += (Math.random() - 0.5) * 3.0;
          this.ballVel.y = 3.2;
          this.lastOutcome = dT < 0.38 ? 'CHEST SAVE BY #1 KEEPER!' : 'FINGERTIP GLOVE PARRY!';
          onEvent?.('SAVE', ballWorld.clone());
        } else if (
          this.ballPos.z <= this.GOAL_Z - 0.1 &&
          Math.abs(this.ballPos.x) < this.GOAL_HALF_W &&
          this.ballPos.y < this.GOAL_HEIGHT
        ) {
          this.shotResolved = true;
          this.goalsConceded += 1;
          this.netRippleTimer = 0;
          this.netImpactLocal.copy(this.ballPos);
          this.ballVel.multiplyScalar(0.28);
          this.lastOutcome = 'UPPER-CORNER PENALTY GOAL!';
          onEvent?.('GOAL', ballWorld.clone());
        }
      }

      if (this.ballPos.y <= this.SOCCER_BALL_R) {
        this.ballPos.y = this.SOCCER_BALL_R;
        if (Math.abs(this.ballVel.y) > 0.8) {
          this.ballVel.y = Math.abs(this.ballVel.y) * 0.58;
          this.ballVel.x *= 0.82;
          this.ballVel.z *= 0.82;
        } else {
          this.ballVel.y = 0;
          this.ballVel.multiplyScalar(0.92);
        }
      }

      this.shotCooldown += dt;
      if (this.shotCooldown > 2.2) {
        this.shotInFlight = false;
        this.shotCooldown = 0;
        this.ballPos.set(0, this.SOCCER_BALL_R, this.PENALTY_SPOT_Z);
        this.ballVel.set(0, 0, 0);
      }
      this.soccerBall.position.copy(this.ballPos);
    } else {
      this.soccerBall.position.set(0, this.SOCCER_BALL_R, this.PENALTY_SPOT_Z);
    }

    // 3. Net Bulge Deformer after goal
    if (this.netRippleTimer >= 0) {
      this.netRippleTimer += dt;
      const posAttr = this.netMesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const decay = Math.exp(-this.netRippleTimer * 2.8);
      for (let i = 0; i < arr.length; i += 3) {
        const ox = this.netOrigPos[i];
        const oy = this.netOrigPos[i + 1];
        const oz = this.netOrigPos[i + 2];
        const d = Math.hypot(ox - this.netImpactLocal.x, oy + 1.0 - this.netImpactLocal.y);
        const bulge = Math.max(0, 1 - d / 1.4) * Math.sin(this.netRippleTimer * 16) * 0.36 * decay;
        arr[i] = ox;
        arr[i + 1] = oy;
        arr[i + 2] = oz - bulge;
      }
      posAttr.needsUpdate = true;
      if (this.netRippleTimer > 1.3) {
        this.netRippleTimer = -1;
        arr.set(this.netOrigPos);
        posAttr.needsUpdate = true;
      }
    }

    // 4. Sync Optical Wireframes around Goalie Gloves & Torso (strictly hidden unless debug overlay is toggled on)
    this.gloveBoxL.visible = this.opticalVisible;
    this.gloveBoxR.visible = this.opticalVisible;
    this.torsoBox.visible = this.opticalVisible;
    if (this.opticalVisible) {
      this.gloveL.getWorldPosition(this.gloveBoxL.position);
      this.gloveR.getWorldPosition(this.gloveBoxR.position);
      this.torso.getWorldPosition(this.torsoBox.position);
      this.torsoBox.position.y += 0.24;
      const hitColor = this.gloveFlashTimer > 0 ? 0xffb347 : 0x00f0ff;
      (this.gloveBoxL.material as THREE.LineBasicMaterial).color.setHex(hitColor);
      (this.gloveBoxR.material as THREE.LineBasicMaterial).color.setHex(hitColor);
    }
  }

  private getWorldPoint(localPt: THREE.Vector3): THREE.Vector3 {
    return this._v1.copy(localPt).applyMatrix4(this.root.matrixWorld);
  }

  public getTelemetry(): SoccerGoalieTelemetry {
    return {
      stance: this.stance,
      saves: this.saves,
      goalsConceded: this.goalsConceded,
      shotsFaced: this.shotsFaced,
      lastOutcome: this.lastOutcome,
      shotInFlight: this.shotInFlight,
    };
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.scene.remove(this.gloveBoxL, this.gloveBoxR, this.torsoBox);
    this.scene.remove(this.root);
  }
}
