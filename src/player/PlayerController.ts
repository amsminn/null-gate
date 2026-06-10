import * as THREE from 'three';
import { CollisionSystem, Collider } from '../physics/CollisionSystem';
import { InputManager } from '../input/InputManager';
import { GRAVITY } from '../physics/RigidBody';
import { clamp, damp, forwardFromYawPitch, yawPitchFromForward } from '../utils/math';
import { Portal } from '../portal/Portal';

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8.0;
const JUMP_SPEED = 7.6;
const GROUND_ACCEL_RATE = 14; // exponential approach rate on ground
const AIR_ACCEL = 5; // gentle additive steering in air — leaves fling momentum intact
const TERMINAL_FALL = 40;
const COYOTE_TIME = 0.1;

/**
 * First-person character: AABB body + YXZ-euler camera with head bob,
 * landing dip, subtle strafe roll and a teleport FOV kick.
 *
 * Air control is intentionally additive (not target-seeking) so that the
 * large horizontal velocities produced by portal flings are preserved.
 */
export class PlayerController {
  position = new THREE.Vector3(); // AABB center
  velocity = new THREE.Vector3();
  readonly half = new THREE.Vector3(0.35, 0.9, 0.35);
  yaw = 0;
  pitch = 0;
  grounded = false;
  sensitivity = 1;
  camera: THREE.PerspectiveCamera;

  private bobPhase = 0;
  private bobAmp = 0;
  private landDip = 0;
  private fovKick = 0;
  private strafeRoll = 0;
  private coyote = 0;
  private baseFov = 75;
  // hot-path scratch objects — per-frame allocations cause GC hitches that
  // read as mouse stutter
  private tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private tmpEye = new THREE.Vector3();
  onJump: (() => void) | null = null;
  onLand: ((intensity: number) => void) | null = null;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.baseFov = camera.fov;
  }

  resetTo(pos: THREE.Vector3, yaw: number): void {
    this.position.copy(pos);
    this.position.y += this.half.y + 0.02;
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.grounded = false;
    this.bobAmp = 0;
    this.landDip = 0;
    this.updateCamera(0);
  }

  /** Eye position in world space (camera anchor before bob offsets). */
  eyePosition(out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(this.position);
    out.y += 0.72;
    return out;
  }

  update(dt: number, input: InputManager, collision: CollisionSystem, exclude: Set<Collider>): void {
    // ---- look ----
    const md = input.consumeMouseDelta();
    this.yaw -= md.x * 0.0021 * this.sensitivity;
    this.pitch = clamp(this.pitch - md.y * 0.0021 * this.sensitivity, -1.52, 1.52);

    // ---- wish direction in the horizontal plane ----
    let f = 0;
    let s = 0;
    if (input.isDown('KeyW')) f += 1;
    if (input.isDown('KeyS')) f -= 1;
    if (input.isDown('KeyD')) s += 1;
    if (input.isDown('KeyA')) s -= 1;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin) for YXZ yaw
    let wx = -sin * f + cos * s;
    let wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-5) {
      wx /= wl;
      wz /= wl;
    }
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;

    if (this.grounded) {
      this.velocity.x = damp(this.velocity.x, wx * speed, GROUND_ACCEL_RATE, dt);
      this.velocity.z = damp(this.velocity.z, wz * speed, GROUND_ACCEL_RATE, dt);
      this.coyote = COYOTE_TIME;
    } else {
      this.velocity.x += wx * AIR_ACCEL * dt;
      this.velocity.z += wz * AIR_ACCEL * dt;
      this.coyote = Math.max(0, this.coyote - dt);
    }

    if (input.wasPressed('Space') && (this.grounded || this.coyote > 0)) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
      this.coyote = 0;
      this.onJump?.();
    }

    // ---- gravity + integrate with collision ----
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -TERMINAL_FALL) this.velocity.y = -TERMINAL_FALL;

    const wasGrounded = this.grounded;
    const res = collision.moveBody(this.position, this.half, this.velocity, dt, exclude);
    this.grounded = res.grounded;

    if (!wasGrounded && res.grounded && res.impactVy < -3) {
      const intensity = Math.min(1, (-res.impactVy - 3) / 18);
      this.landDip = Math.max(this.landDip, 0.06 + intensity * 0.2);
      this.onLand?.(intensity);
    }

    // ---- camera feel ----
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = this.grounded && hSpeed > 0.8;
    this.bobAmp = damp(this.bobAmp, moving ? 1 : 0, 8, dt);
    if (moving) this.bobPhase += dt * (6 + hSpeed * 0.9);
    this.landDip = damp(this.landDip, 0, 9, dt);
    this.strafeRoll = damp(this.strafeRoll, -s * 0.012, 10, dt);
    this.fovKick = damp(this.fovKick, 0, 7, dt);

    this.updateCamera(dt);
  }

  private updateCamera(_dt: number): void {
    const bobY = Math.sin(this.bobPhase * 2) * 0.032 * this.bobAmp;
    const bobX = Math.cos(this.bobPhase) * 0.018 * this.bobAmp;
    const eye = this.eyePosition(this.tmpEye);
    eye.y += bobY - this.landDip;
    eye.x += Math.cos(this.yaw) * bobX;
    eye.z += -Math.sin(this.yaw) * bobX;
    this.camera.position.copy(eye);
    this.camera.quaternion.setFromEuler(
      this.tmpEuler.set(this.pitch - this.landDip * 0.5, this.yaw, this.strafeRoll)
    );
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Carry view orientation and momentum through a portal transform. */
  applyPortalTransform(newPos: THREE.Vector3, newVel: THREE.Vector3, rot: THREE.Quaternion, _outPortal: Portal): void {
    this.position.copy(newPos);
    this.velocity.copy(newVel);
    const fwd = forwardFromYawPitch(this.yaw, this.pitch).applyQuaternion(rot);
    const yp = yawPitchFromForward(fwd, this.yaw);
    this.yaw = yp.yaw;
    this.pitch = yp.pitch;
    this.grounded = false;
    this.fovKick = 6; // brief speed-feel kick
    this.updateCamera(0);
  }
}
