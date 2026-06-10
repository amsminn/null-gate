import * as THREE from 'three';
import { CollisionSystem, Collider, MoveResult } from './CollisionSystem';

export const GRAVITY = 18;
const TERMINAL_FALL = 40;

/**
 * Minimal dynamic body: an axis-aligned box under gravity with ground friction.
 * Used by the weighted cube (and conceptually by the player, which has its own
 * controller for game-feel reasons but shares the same collision resolution).
 */
export class RigidBody {
  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  half: THREE.Vector3;
  grounded = false;
  gravityEnabled = true;

  constructor(halfExtents: THREE.Vector3) {
    this.half = halfExtents.clone();
  }

  update(dt: number, collision: CollisionSystem, exclude?: Set<Collider>): MoveResult {
    if (this.gravityEnabled) {
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -TERMINAL_FALL) this.velocity.y = -TERMINAL_FALL;
    }
    if (this.grounded) {
      // ground friction
      const f = Math.exp(-8 * dt);
      this.velocity.x *= f;
      this.velocity.z *= f;
    }
    const res = collision.moveBody(this.position, this.half, this.velocity, dt, exclude);
    this.grounded = res.grounded;
    return res;
  }
}
