import * as THREE from 'three';

/**
 * Static-world AABB collision.
 *
 * Assumptions:
 *  - All level geometry is axis-aligned boxes (walls, floors, ledges, door slabs).
 *  - Dynamic bodies (player, cubes) are AABBs that never rotate.
 *  - Resolution is performed axis-by-axis (Y, then X, then Z) which is stable
 *    for box worlds and naturally produces wall sliding.
 *  - Portal traversal is achieved by *excluding* the collider a portal sits on
 *    while the body is within the portal's footprint, letting the body cross
 *    the wall plane where the teleport check fires.
 */
export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  enabled: boolean;
  tag: string;
}

export interface MoveResult {
  grounded: boolean;
  hitCeiling: boolean;
  hitWall: boolean;
  /** vertical speed at the moment ground contact was resolved (for landing feedback) */
  impactVy: number;
}

const EPS = 0.001;

export class CollisionSystem {
  private colliders: Collider[] = [];

  add(min: THREE.Vector3, max: THREE.Vector3, tag = ''): Collider {
    const c: Collider = { min: min.clone(), max: max.clone(), enabled: true, tag };
    this.colliders.push(c);
    return c;
  }

  remove(c: Collider): void {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  clear(): void {
    this.colliders.length = 0;
  }

  private overlaps(c: Collider, pos: THREE.Vector3, half: THREE.Vector3): boolean {
    return (
      pos.x + half.x > c.min.x && pos.x - half.x < c.max.x &&
      pos.y + half.y > c.min.y && pos.y - half.y < c.max.y &&
      pos.z + half.z > c.min.z && pos.z - half.z < c.max.z
    );
  }

  /** Does any enabled collider overlap this AABB? */
  testOverlap(pos: THREE.Vector3, half: THREE.Vector3, exclude?: Set<Collider>): boolean {
    for (const c of this.colliders) {
      if (!c.enabled || (exclude && exclude.has(c))) continue;
      if (this.overlaps(c, pos, half)) return true;
    }
    return false;
  }

  /**
   * Integrate one axis then push the body out of any overlapping collider.
   * Pushing direction follows the motion direction on that axis so fast bodies
   * cannot tunnel-and-stick on the wrong side (dt is clamped by the game loop).
   */
  private resolveAxis(
    axis: 'x' | 'y' | 'z',
    pos: THREE.Vector3,
    half: THREE.Vector3,
    vel: THREE.Vector3,
    dt: number,
    exclude: Set<Collider> | undefined,
    res: MoveResult
  ): void {
    const v = vel[axis];
    pos[axis] += v * dt;
    for (const c of this.colliders) {
      if (!c.enabled || (exclude && exclude.has(c))) continue;
      if (!this.overlaps(c, pos, half)) continue;
      if (v > 0) {
        pos[axis] = c.min[axis] - half[axis] - EPS;
      } else if (v < 0) {
        pos[axis] = c.max[axis] + half[axis] + EPS;
        if (axis === 'y') {
          res.grounded = true;
          res.impactVy = Math.min(res.impactVy, vel.y);
        }
      } else {
        // resting overlap (e.g. collider re-enabled inside body): push out the short way
        const upPush = c.max[axis] + half[axis] + EPS - pos[axis];
        const downPush = pos[axis] - (c.min[axis] - half[axis] - EPS);
        pos[axis] += upPush < downPush ? upPush : -downPush;
        continue;
      }
      if (axis === 'y' && v > 0) res.hitCeiling = true;
      if (axis !== 'y') res.hitWall = true;
      vel[axis] = 0;
    }
  }

  moveBody(
    pos: THREE.Vector3,
    half: THREE.Vector3,
    vel: THREE.Vector3,
    dt: number,
    exclude?: Set<Collider>
  ): MoveResult {
    const res: MoveResult = { grounded: false, hitCeiling: false, hitWall: false, impactVy: 0 };
    this.resolveAxis('y', pos, half, vel, dt, exclude, res);
    this.resolveAxis('x', pos, half, vel, dt, exclude, res);
    this.resolveAxis('z', pos, half, vel, dt, exclude, res);
    return res;
  }
}
