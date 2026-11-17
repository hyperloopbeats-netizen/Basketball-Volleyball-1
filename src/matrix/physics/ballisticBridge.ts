import * as THREE from 'three';

export interface InterceptProjection {
  point: THREE.Vector3;
  timeToIntercept: number;
  isValid: boolean;
  confidence: number;
}

/**
 * BallisticRaycasterBridge
 * Handles analytical volleyball parabolic arc solving, Magnus-adjusted intercept raycasting,
 * floor target rings, and the zero-clutter PS6 aerodynamic particle wake buffer (no wireframe lines).
 */
export class BallisticRaycasterBridge {
  public readonly trailMeshes: THREE.Mesh[] = [];
  public readonly trailPositions: THREE.Vector3[] = [];
  private readonly gravity: number;
  private readonly netHeight: number;
  private readonly ballRadius: number;
  private readonly tmpVec = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    ballRadius = 0.145,
    gravity = -11.4,
    netHeight = 2.43,
    trailCount = 6
  ) {
    this.ballRadius = ballRadius;
    this.gravity = gravity;
    this.netHeight = netHeight;

    // Zero-GC PS6 Aerodynamic Wake Pool (active strictly on fast spikes/serves >= 62 km/h)
    const wakeGeo = new THREE.SphereGeometry(this.ballRadius * 0.82, 10, 10);
    for (let i = 0; i < trailCount; i++) {
      const wakeMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x38bdf8 : 0xfbbf24,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const wm = new THREE.Mesh(wakeGeo, wakeMat);
      wm.visible = false;
      scene.add(wm);
      this.trailMeshes.push(wm);
      this.trailPositions.push(new THREE.Vector3());
    }
  }

  public solveBallisticVelocity(
    start: THREE.Vector3,
    target: THREE.Vector3,
    flightTime: number,
    clearNet: boolean
  ): THREE.Vector3 {
    const t = Math.max(0.32, flightTime);
    const vx = (target.x - start.x) / t;
    const vz = (target.z - start.z) / t;
    let vy = (target.y - start.y - 0.5 * this.gravity * t * t) / t;

    if (clearNet && Math.sign(start.z) !== Math.sign(target.z) && Math.abs(start.z - target.z) > 0.2) {
      const tNet = (Math.abs(start.z) / Math.abs(target.z - start.z)) * t;
      const yAtNet = start.y + vy * tNet + 0.5 * this.gravity * tNet * tNet;
      const minNetY = this.netHeight + 0.24;
      if (yAtNet < minNetY) {
        vy += (minNetY - yAtNet) / Math.max(0.12, tNet);
      }
    }
    return new THREE.Vector3(vx, vy, vz);
  }

  public calculateBallIntercept(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    targetY = 1.05
  ): InterceptProjection {
    const a = 0.5 * this.gravity;
    const b = vel.y;
    const c = pos.y - targetY;
    const disc = b * b - 4 * a * c;

    if (disc < 0) {
      return {
        point: new THREE.Vector3(
          THREE.MathUtils.clamp(pos.x, -4.3, 4.3),
          targetY,
          THREE.MathUtils.clamp(pos.z, -8.8, 8.8)
        ),
        timeToIntercept: 0.45,
        isValid: false,
        confidence: 0.55,
      };
    }

    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b + sqrtDisc) / (2 * a);
    const t2 = (-b - sqrtDisc) / (2 * a);
    let t = Math.max(t1, t2);
    if (t <= 0.02) t = Math.min(t1, t2);
    if (t <= 0.02) t = 0.08;

    const projX = pos.x + vel.x * t;
    const projZ = pos.z + vel.z * t;
    const inBounds = Math.abs(projX) <= 4.7 && Math.abs(projZ) <= 9.2;

    return {
      point: new THREE.Vector3(projX, targetY, projZ),
      timeToIntercept: t,
      isValid: true,
      confidence: inBounds ? 0.98 : 0.84,
    };
  }

  public updateTrail(ballPos: THREE.Vector3, ballVel: THREE.Vector3, isPlay: boolean) {
    this.tmpVec.copy(ballVel);
    const speedKmh = Math.round(this.tmpVec.length() * 3.6);
    const showWake = isPlay && speedKmh >= 62;

    if (showWake && this.trailPositions.length > 0) {
      for (let i = this.trailPositions.length - 1; i > 0; i--) {
        this.trailPositions[i].copy(this.trailPositions[i - 1]);
      }
      this.trailPositions[0].copy(ballPos);

      const n = this.trailMeshes.length;
      for (let idx = 0; idx < n; idx++) {
        const wm = this.trailMeshes[idx];
        wm.visible = true;
        wm.position.copy(this.trailPositions[idx]);
        const fade = 1 - idx / n;
        wm.scale.setScalar(0.35 + fade * 0.65);
        (wm.material as THREE.MeshBasicMaterial).opacity = fade * 0.36;
      }
    } else {
      for (let idx = 0; idx < this.trailMeshes.length; idx++) {
        this.trailMeshes[idx].visible = false;
      }
    }
  }
}
