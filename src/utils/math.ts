import * as THREE from 'three';

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential approach. `rate` ≈ how fast (per second). */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

export const dampV3 = (current: THREE.Vector3, target: THREE.Vector3, rate: number, dt: number): void => {
  const t = 1 - Math.exp(-rate * dt);
  current.lerp(target, t);
};

/** Yaw angle (three.js YXZ convention) that makes the camera face direction (dx, dz). */
export const yawFacing = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

/** Forward unit vector for given yaw/pitch (YXZ euler order, -Z forward). */
export const forwardFromYawPitch = (yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 => {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
};

/** Recover yaw/pitch from a forward vector. Falls back to `fallbackYaw` when looking straight up/down. */
export const yawPitchFromForward = (
  f: THREE.Vector3,
  fallbackYaw = 0
): { yaw: number; pitch: number } => {
  const pitch = clamp(Math.asin(clamp(f.y, -1, 1)), -1.45, 1.45);
  const hLen = Math.hypot(f.x, f.z);
  const yaw = hLen < 1e-4 ? fallbackYaw : Math.atan2(-f.x, -f.z);
  return { yaw, pitch };
};

export const randRange = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export interface AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export const aabbContains = (box: AABB, p: THREE.Vector3): boolean =>
  p.x >= box.min.x && p.x <= box.max.x &&
  p.y >= box.min.y && p.y <= box.max.y &&
  p.z >= box.min.z && p.z <= box.max.z;

export const aabbOverlapsCenterHalf = (
  box: AABB,
  center: THREE.Vector3,
  half: THREE.Vector3
): boolean =>
  center.x + half.x > box.min.x && center.x - half.x < box.max.x &&
  center.y + half.y > box.min.y && center.y - half.y < box.max.y &&
  center.z + half.z > box.min.z && center.z - half.z < box.max.z;
