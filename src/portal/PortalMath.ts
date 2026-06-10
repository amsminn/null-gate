import * as THREE from 'three';

/**
 * Portal transform math.
 *
 * Each portal owns an orthonormal frame:
 *   local +Z = surface normal (pointing OUT of the wall into the room)
 *   local +Y = portal "up" (world up on walls; shooter-derived horizontal on floors)
 *   local +X = right = up x normal
 *
 * Travelling through a portal means: express the traveller relative to the IN
 * portal, rotate 180° around the IN portal's local up (because you enter the
 * front of one portal and exit the front of the other — without the flip you
 * would exit *into* the wall), then re-express in the OUT portal's frame.
 *
 * The single quaternion `portalRotation` below carries positions (relative),
 * velocities and view directions — which is what makes momentum flings work:
 * straight-down velocity entering a floor portal maps exactly onto the exit
 * portal's outward normal.
 */
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export function portalRotation(inQuat: THREE.Quaternion, outQuat: THREE.Quaternion): THREE.Quaternion {
  // out * flip * in^-1  (right-to-left: undo IN frame, flip through, apply OUT frame)
  return new THREE.Quaternion().copy(outQuat).multiply(FLIP).multiply(inQuat.clone().invert());
}

export function transformPointThroughPortal(
  p: THREE.Vector3,
  inPos: THREE.Vector3,
  outPos: THREE.Vector3,
  rot: THREE.Quaternion
): THREE.Vector3 {
  return p.clone().sub(inPos).applyQuaternion(rot).add(outPos);
}

export function transformDirectionThroughPortal(d: THREE.Vector3, rot: THREE.Quaternion): THREE.Vector3 {
  return d.clone().applyQuaternion(rot);
}

/**
 * Build the portal frame for a surface normal.
 * `upHint` matters only for horizontal surfaces (floors/ceilings) where world
 * up is parallel to the normal; we use the shooter's horizontal facing so the
 * portal's notion of "up" is stable and exits feel natural.
 */
export function portalBasis(
  normal: THREE.Vector3,
  upHint: THREE.Vector3
): { right: THREE.Vector3; up: THREE.Vector3; quaternion: THREE.Quaternion } {
  let up: THREE.Vector3;
  if (Math.abs(normal.y) > 0.9) {
    up = upHint.clone();
    up.y = 0;
    if (up.lengthSq() < 1e-6) up.set(0, 0, -1);
    up.normalize();
  } else {
    up = new THREE.Vector3(0, 1, 0);
  }
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const orthoUp = new THREE.Vector3().crossVectors(normal, right).normalize();
  const m = new THREE.Matrix4().makeBasis(right, orthoUp, normal.clone().normalize());
  return { right, up: orthoUp, quaternion: new THREE.Quaternion().setFromRotationMatrix(m) };
}
