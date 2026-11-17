import * as THREE from 'three';
import { GameState } from '../../types';

interface VipConciergeRig {
  group: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  homeX: number;
  homeZ: number;
  patrolAxis: 'X' | 'Z';
  patrolSpan: number;
  phase: number;
}

interface VipGuestRig {
  group: THREE.Group;
  head: THREE.Mesh;
  armR: THREE.Group;
  baseY: number;
  phase: number;
}

/**
 * VIPSuitesSystem
 * Luxury Stadium Hospitality Suites along the 4th South Upper Mezzanine (+Z)
 * and East/West Executive Balcony Boxes:
 *  - Obsidian architectural steel frames, tempered glass balcony balustrades, warm gold LED soffits
 *  - Plush curved leather lounge sofas, marble cocktail tables & high barstools
 *  - Private service counters with backlit beverage shelves, chafing food warmers,
 *    colorful gourmet hors d'oeuvre/fruit platters, champagne glasses & animated bartenders/servers
 *  - Wall-mounted Flat-Screen Broadcast TVs driven by a live score/telemetry CanvasTexture
 */
export class VIPSuitesSystem {
  private readonly root = new THREE.Group();
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly tvCanvas: HTMLCanvasElement;
  private readonly tvCtx: CanvasRenderingContext2D;
  private readonly tvTex: THREE.CanvasTexture;

  private readonly concierges: VipConciergeRig[] = [];
  private readonly guests: VipGuestRig[] = [];
  private lastTvRedraw = 0;

  constructor(parent: THREE.Object3D, maxAnisotropy = 4) {
    this.root.name = 'VIPHospitalitySuitesGroup';
    parent.add(this.root);

    this.tvCanvas = document.createElement('canvas');
    this.tvCanvas.width = 512;
    this.tvCanvas.height = 256;
    this.tvCtx = this.tvCanvas.getContext('2d')!;
    this.tvTex = new THREE.CanvasTexture(this.tvCanvas);
    this.tvTex.colorSpace = THREE.SRGBColorSpace;
    this.tvTex.anisotropy = maxAnisotropy;
    this.disposables.push(this.tvTex);

    this.buildSuites();
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private buildSuites() {
    const steelMat = this.track(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.65 }));
    const wallMat = this.track(new THREE.MeshStandardMaterial({ color: 0x161d2e, roughness: 0.65, metalness: 0.18 }));
    const marbleFloorMat = this.track(new THREE.MeshStandardMaterial({ color: 0x262e42, roughness: 0.28, metalness: 0.18 }));
    const goldTrimMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x92400e, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.6 }));
    const glassMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.24,
        roughness: 0.12,
        metalness: 0.15,
        depthWrite: false,
      })
    );
    const leatherMat = this.track(new THREE.MeshStandardMaterial({ color: 0x3b1f2b, roughness: 0.55 }));
    const creamCushionMat = this.track(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.62 }));
    const barCounterMat = this.track(new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.25, metalness: 0.35 }));
    const silverTrayMat = this.track(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 }));
    const foodWarmMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5, emissive: 0x7c2d12, emissiveIntensity: 0.2 }));
    const foodGreenMat = this.track(new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.55 }));
    const bottleTealMat = this.track(new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x0088aa, emissiveIntensity: 0.35, roughness: 0.2 }));
    const bottleGoldMat = this.track(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x78350f, emissiveIntensity: 0.3, roughness: 0.2 }));
    const tvScreenMat = this.track(new THREE.MeshBasicMaterial({ map: this.tvTex }));
    const tvBezelMat = this.track(new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.3, metalness: 0.6 }));
    const ceilingGlowMat = this.track(new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));

    const shirtWhiteMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 }));
    const vestBlackMat = this.track(new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.65 }));
    const skinMat = this.track(new THREE.MeshStandardMaterial({ color: 0xd69f78, roughness: 0.58 }));
    const guestCoatA = this.track(new THREE.MeshStandardMaterial({ color: 0x0e7490, roughness: 0.55 }));
    const guestCoatB = this.track(new THREE.MeshStandardMaterial({ color: 0xbe185d, roughness: 0.55 }));

    const populateSuiteRoom = (
      x: number,
      y: number,
      z: number,
      width: number,
      depth: number,
      height: number,
      facingRotY: number,
      suiteIndex: number
    ) => {
      const suite = new THREE.Group();
      suite.position.set(x, y, z);
      suite.rotation.y = facingRotY;

      // Floor deck & warm lounge ceiling
      const floor = new THREE.Mesh(this.track(new THREE.BoxGeometry(width, 0.24, depth)), marbleFloorMat);
      floor.position.y = -0.12;
      suite.add(floor);

      const roof = new THREE.Mesh(this.track(new THREE.BoxGeometry(width + 0.3, 0.22, depth + 0.3)), wallMat);
      roof.position.y = height;
      suite.add(roof);

      // Recessed warm hospitality ceiling light strip
      const lightStrip = new THREE.Mesh(this.track(new THREE.BoxGeometry(width - 1.2, 0.05, 0.45)), ceilingGlowMat);
      lightStrip.position.set(0, height - 0.12, -depth * 0.12);
      suite.add(lightStrip);

      // Gold architectural fascia trim along front lip
      const fascia = new THREE.Mesh(this.track(new THREE.BoxGeometry(width + 0.15, 0.12, 0.16)), goldTrimMat);
      fascia.position.set(0, height - 0.06, depth * 0.5);
      suite.add(fascia);

      // Back wall + left/right divider piers
      const backWall = new THREE.Mesh(this.track(new THREE.BoxGeometry(width, height, 0.2)), wallMat);
      backWall.position.set(0, height * 0.5, -depth * 0.5 + 0.1);
      suite.add(backWall);

      for (const s of [-1, 1]) {
        const pillar = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.24, height, depth)), steelMat);
        pillar.position.set(s * (width * 0.5 - 0.12), height * 0.5, 0);
        suite.add(pillar);
      }

      // Panoramic glass balustrade along court-facing balcony (+Z in local suite frame)
      const glassRail = new THREE.Mesh(this.track(new THREE.BoxGeometry(width - 0.5, 1.05, 0.06)), glassMat);
      glassRail.position.set(0, 0.525, depth * 0.5 - 0.08);
      suite.add(glassRail);
      const topRail = new THREE.Mesh(this.track(new THREE.BoxGeometry(width - 0.3, 0.06, 0.12)), goldTrimMat);
      topRail.position.set(0, 1.06, depth * 0.5 - 0.08);
      suite.add(topRail);

      // 2 Wall-Mounted Live Broadcast TVs inside each suite (+ front corner angled monitor)
      for (const tvX of [-width * 0.28, width * 0.28]) {
        const tvGroup = new THREE.Group();
        tvGroup.position.set(tvX, height * 0.62, -depth * 0.5 + 0.25);
        const bezel = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.1, 1.12, 0.09)), tvBezelMat);
        const screen = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1.96, 0.98)), tvScreenMat);
        screen.position.z = 0.052;
        tvGroup.add(bezel, screen);
        suite.add(tvGroup);
      }

      // Plush Lounge Sofas & Cocktail Table facing the court
      const sofaBase = new THREE.Mesh(this.track(new THREE.BoxGeometry(width * 0.42, 0.42, 0.92)), leatherMat);
      sofaBase.position.set(-width * 0.2, 0.21, depth * 0.12);
      const sofaBack = new THREE.Mesh(this.track(new THREE.BoxGeometry(width * 0.42, 0.44, 0.22)), creamCushionMat);
      sofaBack.position.set(-width * 0.2, 0.55, depth * 0.12 - 0.34);
      suite.add(sofaBase, sofaBack);

      const loungeTable = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.58, 0.52, 0.56, 14)), barCounterMat);
      loungeTable.position.set(-width * 0.2, 0.28, depth * 0.32);
      suite.add(loungeTable);

      // Gourmet Hors d'Oeuvre / Dessert Platter & Champagne Flutes on Lounge Table
      const tablePlatter = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.28, 0.24, 0.04, 12)), silverTrayMat);
      tablePlatter.position.set(-width * 0.2, 0.58, depth * 0.32);
      const platterFruit = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.08, 8, 8)), foodWarmMat);
      platterFruit.position.set(-width * 0.2 - 0.08, 0.63, depth * 0.32);
      const platterSalad = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.08, 8, 8)), foodGreenMat);
      platterSalad.position.set(-width * 0.2 + 0.08, 0.63, depth * 0.32 + 0.04);
      const flute1 = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.035, 0.025, 0.16, 8)), bottleGoldMat);
      flute1.position.set(-width * 0.2 + 0.24, 0.64, depth * 0.32 - 0.14);
      suite.add(tablePlatter, platterFruit, platterSalad, flute1);

      // Private Service Bar & Food Buffet Station on right side of suite
      const barX = width * 0.22;
      const barCounter = new THREE.Mesh(this.track(new THREE.BoxGeometry(width * 0.38, 0.96, 0.72)), barCounterMat);
      barCounter.position.set(barX, 0.48, -depth * 0.05);
      const barMarbleTop = new THREE.Mesh(this.track(new THREE.BoxGeometry(width * 0.39, 0.06, 0.78)), creamCushionMat);
      barMarbleTop.position.set(barX, 0.98, -depth * 0.05);
      const barTrim = new THREE.Mesh(this.track(new THREE.BoxGeometry(width * 0.38, 0.06, 0.04)), goldTrimMat);
      barTrim.position.set(barX, 0.74, -depth * 0.05 + 0.37);
      suite.add(barCounter, barMarbleTop, barTrim);

      // Hot Buffet Chafing Dishes & Gourmet Food Platters on Bar Top
      for (let d = -1; d <= 1; d++) {
        const dish = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.46, 0.16, 0.32)), silverTrayMat);
        dish.position.set(barX + d * 0.68, 1.09, -depth * 0.05);
        const dome = new THREE.Mesh(
          this.track(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
          d === 0 ? foodWarmMat : silverTrayMat
        );
        dome.position.set(barX + d * 0.68, 1.17, -depth * 0.05);
        suite.add(dish, dome);
      }

      // Backlit Beverage & Spirit Bottles along Back Bar Shelf
      const shelf = new THREE.Mesh(this.track(new THREE.BoxGeometry(width * 0.34, 0.06, 0.28)), wallMat);
      shelf.position.set(barX, 1.25, -depth * 0.5 + 0.45);
      suite.add(shelf);
      for (let b = 0; b < 5; b++) {
        const bx = barX - width * 0.13 + b * (width * 0.065);
        const bottle = new THREE.Mesh(
          this.track(new THREE.CylinderGeometry(0.038, 0.046, 0.24, 8)),
          b % 2 === 0 ? bottleTealMat : bottleGoldMat
        );
        bottle.position.set(bx, 1.40, -depth * 0.5 + 0.45);
        suite.add(bottle);
      }

      // 2 Barstools along front of private service bar
      for (let s = 0; s < 2; s++) {
        const sx = barX - 0.55 + s * 1.1;
        const post = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.04, 0.05, 0.65, 8)), steelMat);
        post.position.set(sx, 0.325, -depth * 0.05 + 0.68);
        const seat = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.2, 0.18, 0.09, 12)), leatherMat);
        seat.position.set(sx, 0.67, -depth * 0.05 + 0.68);
        suite.add(post, seat);
      }

      // VIP Server / Bartender patrolling service bar & lounge
      const serverGrp = new THREE.Group();
      serverGrp.position.set(barX, 0, -depth * 0.28);
      const sLegs = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.11, 0.10, 0.78, 8)), vestBlackMat);
      sLegs.position.y = 0.39;
      const sTorso = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.15, 0.13, 0.50, 8)), shirtWhiteMat);
      sTorso.position.y = 1.02;
      const sHead = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.11, 10, 10)), skinMat);
      sHead.position.y = 1.38;
      const sArmL = new THREE.Group();
      sArmL.position.set(-0.18, 1.22, 0);
      const sArmMesh = this.track(new THREE.CylinderGeometry(0.036, 0.032, 0.42, 6));
      sArmMesh.translate(0, -0.2, 0);
      sArmL.add(new THREE.Mesh(sArmMesh, shirtWhiteMat));
      const sArmR = new THREE.Group();
      sArmR.position.set(0.18, 1.22, 0);
      sArmR.add(new THREE.Mesh(sArmMesh, shirtWhiteMat));
      const servingTray = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.19, 0.17, 0.03, 12)), silverTrayMat);
      servingTray.position.set(0, -0.38, 0.12);
      sArmR.add(servingTray);
      serverGrp.add(sLegs, sTorso, sHead, sArmL, sArmR);
      suite.add(serverGrp);

      this.concierges.push({
        group: serverGrp,
        armL: sArmL,
        armR: sArmR,
        homeX: barX,
        homeZ: -depth * 0.28,
        patrolAxis: 'X',
        patrolSpan: 0.95,
        phase: suiteIndex * 1.4,
      });

      // 2 Animated VIP Guests seated/standing near balcony rail enjoying the match
      for (let g = 0; g < 2; g++) {
        const gGrp = new THREE.Group();
        const gx = -width * 0.28 + g * 1.4;
        const gz = depth * 0.12;
        gGrp.position.set(gx, 0.18, gz);
        const gTorso = new THREE.Mesh(
          this.track(new THREE.CylinderGeometry(0.15, 0.13, 0.52, 8)),
          (suiteIndex + g) % 2 === 0 ? guestCoatA : guestCoatB
        );
        gTorso.position.y = 0.72;
        const gHead = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.115, 10, 10)), skinMat);
        gHead.position.y = 1.09;
        const gArmR = new THREE.Group();
        gArmR.position.set(0.18, 0.92, 0);
        gArmR.add(new THREE.Mesh(sArmMesh, (suiteIndex + g) % 2 === 0 ? guestCoatA : guestCoatB));
        gGrp.add(gTorso, gHead, gArmR);
        suite.add(gGrp);

        this.guests.push({
          group: gGrp,
          head: gHead,
          armR: gArmR,
          baseY: 0.18,
          phase: suiteIndex * 1.1 + g * 1.9,
        });
      }

      this.root.add(suite);
    };

    // 4th Side (South +Z) Upper Panoramic VIP Skybox Suites (3 adjoining boxes across -10m..+10m)
    populateSuiteRoom(-7.0, 5.2, 22.8, 6.6, 4.2, 3.1, Math.PI, 0);
    populateSuiteRoom(0.0, 5.2, 22.8, 6.8, 4.2, 3.1, Math.PI, 1);
    populateSuiteRoom(7.0, 5.2, 22.8, 6.6, 4.2, 3.1, Math.PI, 2);

    // West & East Executive VIP Club Boxes flanking the upper stadium tiers
    populateSuiteRoom(-18.8, 5.4, 0.0, 8.2, 4.0, 3.0, Math.PI / 2, 3);
    populateSuiteRoom(18.8, 5.4, 0.0, 8.2, 4.0, 3.0, -Math.PI / 2, 4);
  }

  private redrawBroadcastTVs(state: GameState, elapsedSec: number) {
    const ctx = this.tvCtx;
    ctx.fillStyle = '#070b18';
    ctx.fillRect(0, 0, 512, 256);

    // Header gradient bar
    const hdr = ctx.createLinearGradient(0, 0, 512, 0);
    hdr.addColorStop(0, '#0891b2');
    hdr.addColorStop(0.5, '#1e293b');
    hdr.addColorStop(1, '#e11d48');
    ctx.fillStyle = hdr;
    ctx.fillRect(0, 0, 512, 48);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`AIM VANCOUVER VIP • SET ${state.currentSet} LIVE`, 256, 24);

    // Team scores
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 68px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(state.scoreA), 220, 128);

    ctx.fillStyle = '#ff3d7f';
    ctx.textAlign = 'left';
    ctx.fillText(String(state.scoreB), 292, 128);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('-', 256, 126);

    // Radar velocity + crowd energy footer
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(28, 184, 456, 52);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 184, 456, 52);

    const pulse = 0.5 + 0.5 * Math.sin(elapsedSec * 5.0);
    ctx.fillStyle = `rgba(0, 240, 255, ${0.65 + pulse * 0.35})`;
    ctx.beginPath();
    ctx.arc(54, 210, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`RADAR ${Math.round(state.ballSpeedKmh)} KM/H`, 74, 210);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`RALLY ${state.rallyCount} • SETS ${state.setsA}-${state.setsB}`, 466, 210);

    this.tvTex.needsUpdate = true;
  }

  public update(elapsedSec: number, state: GameState, visible: boolean) {
    this.root.visible = visible;
    if (!visible) return;

    if (elapsedSec - this.lastTvRedraw > 0.45) {
      this.lastTvRedraw = elapsedSec;
      this.redrawBroadcastTVs(state, elapsedSec);
    }

    const eq = state.audioEQ;
    const groove = eq?.isPlaying ? THREE.MathUtils.clamp(eq.bassLevel, 0, 1) : 0.15;

    for (const c of this.concierges) {
      const patrol = Math.sin(elapsedSec * 0.75 + c.phase) * c.patrolSpan;
      c.group.position.x = c.homeX + patrol;
      c.armL.rotation.x = Math.sin(elapsedSec * 2.2 + c.phase) * 0.15;
      c.armR.rotation.x = -0.35 + Math.cos(elapsedSec * 1.4 + c.phase) * 0.08;
    }

    const excite = state.crowdMood?.excitement ?? 0.3;
    for (const g of this.guests) {
      const cheerWave = Math.max(0, Math.sin(elapsedSec * (3.2 + excite * 4.5 + groove * 2.5) + g.phase));
      g.group.position.y = g.baseY + cheerWave * (0.04 + excite * 0.12);
      g.armR.rotation.z = 0.25 + cheerWave * (0.4 + excite * 1.2);
      g.head.rotation.y = Math.sin(elapsedSec * 1.1 + g.phase) * 0.22;
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
