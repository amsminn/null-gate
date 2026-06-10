import * as THREE from 'three';
import { PORTAL_COLORS, PortalKind } from '../portal/Portal';
import { damp, clamp } from '../utils/math';
import { PlayerController } from './PlayerController';

/**
 * First-person "aperture projector" viewmodel — an original design in the
 * genre's visual language: glossy white curved shell, dark emitter throat,
 * slim forward prongs, and an exposed energy conduit along the top that
 * glows with the color of the last-fired aperture.
 *
 * Built entirely from primitives (spheres/cylinders/tori); the group is a
 * child of the camera (Game adds the camera to the scene).
 */
export class PortalGun {
  group: THREE.Group;
  private coreMats: THREE.MeshStandardMaterial[] = [];
  private coreColor = new THREE.Color(PORTAL_COLORS.blue);
  private targetColor = new THREE.Color(PORTAL_COLORS.blue);
  private muzzle = new THREE.Object3D();
  private recoil = 0;
  private flash = 0;
  private swayX = 0;
  private swayY = 0;
  private bobPhase = 0;
  private prevYaw: number | null = null;
  private prevPitch = 0;
  private core: THREE.Mesh;

  private static readonly BASE_POS = new THREE.Vector3(0.3, -0.26, -0.46);
  private static readonly BASE_YAW = -0.35; // angled toward screen center so the front end reads

  constructor(camera: THREE.Camera) {
    this.group = new THREE.Group();
    this.group.position.copy(PortalGun.BASE_POS);
    this.group.rotation.y = PortalGun.BASE_YAW;
    this.group.scale.setScalar(1.05);
    camera.add(this.group);

    // matte ceramic + gunmetal: kept deliberately below bloom threshold —
    // a viewmodel must never glow brighter than the world it sits in
    const white = new THREE.MeshStandardMaterial({
      color: 0xb9bec3,
      roughness: 0.5,
      metalness: 0.12,
      envMapIntensity: 0.35,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x202327,
      roughness: 0.42,
      metalness: 0.7,
      envMapIntensity: 0.5,
    });

    const add = (m: THREE.Mesh): THREE.Mesh => {
      m.castShadow = false;
      m.receiveShadow = false;
      this.group.add(m);
      return m;
    };

    // ---- rear body: elongated capsule shell
    const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.1, 6, 18), white));
    body.rotation.x = Math.PI / 2;
    body.scale.set(1.18, 0.95, 1);
    body.position.set(0, 0, 0.03);

    // ---- dark mid band separating rear body from front shroud
    const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.035, 24), dark));
    band.rotation.x = Math.PI / 2;
    band.scale.set(1.12, 1, 0.92);
    band.position.set(0, 0, -0.05);

    // ---- front shroud tapering to the aperture
    const shroud = add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.054, 0.13, 24), white));
    shroud.rotation.x = Math.PI / 2;
    shroud.scale.set(1.1, 1, 1);
    shroud.position.set(0, 0, -0.125);

    // ---- aperture: dark face ring + recessed glowing iris
    const face = add(new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.011, 12, 32), dark));
    face.position.set(0, 0, -0.19);
    const irisMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c0e,
      emissive: PORTAL_COLORS.blue,
      emissiveIntensity: 1.3,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.coreMats.push(irisMat);
    this.core = add(new THREE.Mesh(new THREE.CircleGeometry(0.028, 24), irisMat));
    this.core.position.set(0, 0, -0.188);
    this.core.rotation.y = Math.PI; // faces forward, its glow rims the aperture from the side

    // ---- top spine rail with inset conduit (reads the armed color from behind)
    const spine = add(new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, 0.21), dark));
    spine.position.set(0, 0.052, -0.04);
    const conduitMat = irisMat.clone();
    this.coreMats.push(conduitMat);
    const conduit = add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.007, 0.17), conduitMat));
    conduit.position.set(0, 0.061, -0.04);

    // ---- under-barrel mass + rear cap for a tool-like profile
    const under = add(new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.032, 0.11), dark));
    under.position.set(0, -0.046, -0.1);
    const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.044, 0.035, 18), dark));
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, 0, 0.115);

    // ---- two slim tapered prongs converging ahead of the aperture
    const prong = (sideX: number): void => {
      const from = new THREE.Vector3(sideX, -0.006, -0.13);
      const to = new THREE.Vector3(sideX * 0.22, -0.004, -0.26);
      const dir = to.clone().sub(from);
      const len = dir.length();
      const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, len, 8), dark));
      m.position.copy(from).add(to).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    };
    prong(0.052);
    prong(-0.052);

    // ---- rear status pips (subtle, player-facing)
    const pipMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c0e,
      emissive: 0x36d8e8,
      emissiveIntensity: 1.1,
      roughness: 0.4,
      metalness: 0.1,
    });
    for (const y of [0.018, -0.004]) {
      const pip = add(new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 8), pipMat));
      pip.position.set(-0.05, y, 0.09);
    }

    // ---- grip stub under the rear (mostly off-screen)
    const grip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.12, 14), dark));
    grip.rotation.x = 0.5;
    grip.position.set(0, -0.08, 0.1);

    this.muzzle.position.set(0, 0, -0.27);
    this.group.add(this.muzzle);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  /** Fire feedback: recoil kick + core flash + color shift toward the fired kind. */
  fire(kind: PortalKind): void {
    this.targetColor.set(PORTAL_COLORS[kind]);
    this.recoil = 1;
    this.flash = 1;
  }

  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.muzzle.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.muzzle.matrixWorld);
  }

  update(dt: number, player: PlayerController, time: number): void {
    // look sway: lag behind camera rotation
    if (this.prevYaw === null) {
      this.prevYaw = player.yaw;
      this.prevPitch = player.pitch;
    }
    const dYaw = player.yaw - this.prevYaw;
    const dPitch = player.pitch - this.prevPitch;
    this.prevYaw = player.yaw;
    this.prevPitch = player.pitch;
    this.swayX = damp(this.swayX, clamp(-dYaw * 1.6, -0.05, 0.05), 9, dt);
    this.swayY = damp(this.swayY, clamp(dPitch * 1.2, -0.04, 0.04), 9, dt);

    // walk bob (own phase, roughly synced to the camera's cadence)
    const hSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = player.grounded && hSpeed > 0.8;
    if (moving) this.bobPhase += dt * (6 + hSpeed * 0.9);
    const bobAmp = moving ? 1 : 0;
    const bobY = Math.sin(this.bobPhase * 2) * 0.008 * bobAmp;
    const bobX = Math.cos(this.bobPhase) * 0.006 * bobAmp;

    // recoil spring-back + idle float
    this.recoil = damp(this.recoil, 0, 9, dt);
    this.flash = damp(this.flash, 0, 7, dt);
    const idleY = Math.sin(time * 1.4) * 0.0035;

    this.group.position.set(
      PortalGun.BASE_POS.x + this.swayX + bobX,
      PortalGun.BASE_POS.y + this.swayY + bobY + idleY,
      PortalGun.BASE_POS.z + this.recoil * 0.07
    );
    this.group.rotation.set(
      this.recoil * 0.22 + this.swayY * 0.6,
      PortalGun.BASE_YAW + this.swayX * 0.8,
      0
    );

    // core color + flash (kept modest so the viewmodel never blooms)
    this.coreColor.lerp(this.targetColor, 1 - Math.exp(-10 * dt));
    for (const m of this.coreMats) {
      m.emissive.copy(this.coreColor);
      m.emissiveIntensity = 1.3 + this.flash * 3.5;
    }
    const s = 1 + this.flash * 0.4;
    this.core.scale.setScalar(s);
  }
}
