import * as THREE from 'three';
import { Portal, PortalKind, PORTAL_COLORS } from './Portal';
import { portalRotation, transformPointThroughPortal } from './PortalMath';
import { Collider } from '../physics/CollisionSystem';
import { PortalEffects } from '../effects/PortalEffects';
import { ProceduralAudio } from '../audio/ProceduralAudio';

/** Anything that can travel through portals (player, cubes). */
export interface PortalTraveler {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  onTeleport(newPos: THREE.Vector3, newVel: THREE.Vector3, rot: THREE.Quaternion, outPortal: Portal): void;
}

export interface ShootFeedback {
  onInvalid(message: string): void;
  onPlaced(kind: PortalKind): void;
}

const MARGIN = 0.06;
const TELEPORT_COOLDOWN = 0.3;
const MIN_EXIT_SPEED = 1.4;
/** flings stay readable: deep falls are clamped to this exit speed (fling
 *  chamber geometry is tuned against this value) */
const MAX_EXIT_SPEED = 16;

export class PortalSystem {
  blue: Portal;
  amber: Portal;
  private effects: PortalEffects;
  private audio: ProceduralAudio;
  private feedback: ShootFeedback;
  private raycaster = new THREE.Raycaster();
  private time = 0;
  /** previous signed plane distance per traveler per portal — crossing detector state */
  private prevDist = new Map<string, number>();
  private cooldown = new Map<string, number>();

  constructor(scene: THREE.Scene, effects: PortalEffects, audio: ProceduralAudio, feedback: ShootFeedback) {
    this.blue = new Portal('blue', scene);
    this.amber = new Portal('amber', scene);
    this.effects = effects;
    this.audio = audio;
    this.feedback = feedback;
    this.raycaster.far = 120;
  }

  reset(): void {
    this.blue.clearPortal();
    this.amber.clearPortal();
    this.prevDist.clear();
    this.cooldown.clear();
  }

  bothActive(): boolean {
    return this.blue.active && this.amber.active;
  }

  /** Forget plane-crossing history (call after any non-portal teleport, e.g. respawn). */
  clearCrossings(): void {
    this.prevDist.clear();
  }

  shoot(kind: PortalKind, camera: THREE.Camera, shootables: THREE.Object3D[], muzzleOrigin?: THREE.Vector3): void {
    this.audio.portalFire(kind);
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    camera.getWorldPosition(origin);
    camera.getWorldDirection(dir);
    this.raycaster.set(origin, dir);

    const hits = this.raycaster.intersectObjects(shootables, false);
    if (hits.length === 0) return;
    const hit = hits[0];
    const mesh = hit.object as THREE.Mesh;

    // face normal in world space (levels use axis-aligned, unrotated boxes,
    // but transformDirection keeps this correct in general)
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);

    // projectile starts at the viewmodel muzzle so the shot visibly leaves the device
    const muzzle =
      muzzleOrigin?.clone() ??
      origin.clone().add(dir.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, -0.18, 0));
    const color = PORTAL_COLORS[kind];

    const ud = mesh.userData as { portalable?: boolean; collider?: Collider };
    if (!ud.portalable) {
      this.effects.fireTracer(muzzle, hit.point, color, () => {
        this.effects.burst(hit.point, normal, 0x9aa3aa, 14, 2.0);
        this.audio.invalidShot();
        this.feedback.onInvalid('SURFACE REJECTED APERTURE');
      });
      return;
    }

    const placement = this.computePlacement(hit.point, normal, dir, ud.collider ?? null, kind);
    if (!placement.ok) {
      this.effects.fireTracer(muzzle, hit.point, color, () => {
        this.effects.burst(hit.point, normal, 0x9aa3aa, 14, 2.0);
        this.audio.invalidShot();
        this.feedback.onInvalid(placement.reason);
      });
      return;
    }

    const point = placement.point;
    // Floor-portal "up" = shooter's horizontal facing. Consequence for flings:
    // forward entry speed maps to *upward* exit speed, lengthening the arc —
    // walking into a pit portal can only help, never sabotage, the fling.
    const upHint = dir.clone();
    this.effects.fireTracer(muzzle, point, color, () => {
      const portal = kind === 'blue' ? this.blue : this.amber;
      portal.place(point, normal, upHint, ud.collider ?? null);
      this.invalidatePrevFor(portal);
      this.effects.burst(point.clone().addScaledVector(normal, 0.05), normal, color, 30, 3.6);
      this.audio.portalOpen(kind);
      this.feedback.onPlaced(kind);
    });
  }

  /**
   * Validate + clamp portal placement on an axis-aligned face.
   * The ellipse footprint must fit inside the face rectangle (with margin) and
   * must not overlap the other portal on the same plane.
   */
  private computePlacement(
    hitPoint: THREE.Vector3,
    normal: THREE.Vector3,
    shootDir: THREE.Vector3,
    collider: Collider | null,
    kind: PortalKind
  ): { ok: true; point: THREE.Vector3 } | { ok: false; reason: string } {
    if (!collider) return { ok: false, reason: 'SURFACE REJECTED APERTURE' };

    const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
    let nAxis: 'x' | 'y' | 'z' = 'y';
    for (const a of axes) if (Math.abs(normal[a]) > 0.9) nAxis = a;
    const free = axes.filter((a) => a !== nAxis);

    // portal in-plane axes for footprint extents (same up convention as placement)
    const upHint = shootDir.clone();
    const { right, up } = basisFor(normal, upHint);
    const point = hitPoint.clone();
    // snap exactly onto the face plane
    point[nAxis] = normal[nAxis] > 0 ? collider.max[nAxis] : collider.min[nAxis];

    const isFloor = Math.abs(normal.y) > 0.9;
    const hw = isFloor ? 0.75 : 0.55;
    const hh = isFloor ? 1.2 : 0.95;
    for (const a of free) {
      const ext = Math.hypot(hw * right[a], hh * up[a]);
      const lo = collider.min[a] + ext + MARGIN;
      const hi = collider.max[a] - ext - MARGIN;
      if (lo > hi) return { ok: false, reason: 'SURFACE TOO SMALL FOR APERTURE' };
      point[a] = Math.min(hi, Math.max(lo, point[a]));
    }

    const other = kind === 'blue' ? this.amber : this.blue;
    if (other.active) {
      const samePlane =
        Math.abs(other.normal.dot(normal)) > 0.9 && Math.abs(other.signedDistance(point)) < 0.2;
      if (samePlane && other.position.distanceTo(point) < 1.7) {
        return { ok: false, reason: 'APERTURE OBSTRUCTED' };
      }
    }
    return { ok: true, point };
  }

  private invalidatePrevFor(portal: Portal): void {
    for (const key of [...this.prevDist.keys()]) {
      if (key.endsWith(portal.kind)) this.prevDist.delete(key);
    }
  }

  /**
   * Colliders to ignore for a body standing inside a portal footprint.
   * Only when both portals exist — a lone portal is an inert visual and must
   * not open a hole in the world.
   *
   * Two invariants prevent walking through the map:
   *  - during a traveler's post-teleport cooldown the walls stay SOLID for it
   *    (crossing a plane while teleports are suppressed would skip the swap)
   *  - the exclusion footprint (1.2) is strictly tighter than the teleport
   *    acceptance (1.3), so any plane crossing through the hole teleports
   */
  getExclusions(pos: THREE.Vector3, travelerId?: string, out?: Set<Collider>): Set<Collider> {
    const set = out ?? new Set<Collider>();
    if (!this.bothActive()) return set;
    if (travelerId && this.cooldown.has(travelerId)) return set;
    for (const portal of [this.blue, this.amber]) {
      if (!portal.surfaceCollider) continue;
      const d = portal.signedDistance(pos);
      if (d > -0.9 && d < 1.2 && portal.containsProjected(pos, 1.2)) {
        set.add(portal.surfaceCollider);
      }
    }
    return set;
  }

  update(dt: number, travelers: PortalTraveler[]): void {
    this.time += dt;
    this.blue.update(dt, this.time);
    this.amber.update(dt, this.time);

    for (const [k, v] of this.cooldown) {
      const nv = v - dt;
      if (nv <= 0) this.cooldown.delete(k);
      else this.cooldown.set(k, nv);
    }

    if (!this.bothActive()) {
      this.prevDist.clear();
      return;
    }

    for (const t of travelers) {
      // Portal funneling: a body falling toward an upward-facing portal is
      // gently steered onto it, so flings don't fail from small lateral drift.
      for (const portal of [this.blue, this.amber]) {
        if (portal.normal.y < 0.9) continue;
        const d = portal.signedDistance(t.position);
        if (d <= 0.2 || d > 7 || t.velocity.y > -2) continue;
        const lx = t.position.x - portal.position.x;
        const lz = t.position.z - portal.position.z;
        if (Math.hypot(lx, lz) > 3) continue;
        const k = 1 - Math.exp(-6 * dt);
        t.velocity.x += (-lx * 3.2 - t.velocity.x) * k;
        t.velocity.z += (-lz * 3.2 - t.velocity.z) * k;
      }

      if (this.cooldown.has(t.id)) {
        // keep distances fresh during cooldown so we don't fire on stale state
        this.storeDist(t);
        continue;
      }
      for (const [inP, outP] of [
        [this.blue, this.amber],
        [this.amber, this.blue],
      ] as Array<[Portal, Portal]>) {
        const key = `${t.id}|${inP.kind}`;
        const d = inP.signedDistance(t.position);
        const prev = this.prevDist.get(key);
        this.prevDist.set(key, d);
        if (prev === undefined) continue;
        // crossed the plane front -> back inside the ellipse: teleport
        if (prev > 0 && d <= 0 && inP.containsProjected(t.position, 1.3)) {
          this.teleport(t, inP, outP);
          break;
        }
      }
    }
  }

  private storeDist(t: PortalTraveler): void {
    this.prevDist.set(`${t.id}|blue`, this.blue.signedDistance(t.position));
    this.prevDist.set(`${t.id}|amber`, this.amber.signedDistance(t.position));
  }

  private teleport(t: PortalTraveler, inP: Portal, outP: Portal): void {
    const rot = portalRotation(inP.quaternion, outP.quaternion);
    const newPos = transformPointThroughPortal(t.position, inP.position, outP.position, rot);
    // step out along the exit normal so the body is clear of the exit wall
    newPos.addScaledVector(outP.normal, 0.55);

    const newVel = t.velocity.clone().applyQuaternion(rot);
    // clamp the exit magnitude so long drops don't launch at unreadable speed
    const speed = newVel.length();
    if (speed > MAX_EXIT_SPEED) newVel.multiplyScalar(MAX_EXIT_SPEED / speed);
    // guarantee outward motion so a slow walk-through doesn't leave you embedded
    const outSpeed = newVel.dot(outP.normal);
    if (outSpeed < MIN_EXIT_SPEED) newVel.addScaledVector(outP.normal, MIN_EXIT_SPEED - outSpeed);

    this.cooldown.set(t.id, TELEPORT_COOLDOWN);
    // forget crossing state for this traveler on both portals
    this.prevDist.delete(`${t.id}|blue`);
    this.prevDist.delete(`${t.id}|amber`);

    this.audio.teleport();
    this.effects.burst(
      outP.position.clone().addScaledVector(outP.normal, 0.3),
      outP.normal,
      PORTAL_COLORS[outP.kind],
      18,
      2.6
    );
    t.onTeleport(newPos, newVel, rot, outP);
  }
}

/** Inline portal basis (mirrors PortalMath.portalBasis without quaternion alloc). */
function basisFor(
  normal: THREE.Vector3,
  upHint: THREE.Vector3
): { right: THREE.Vector3; up: THREE.Vector3 } {
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
  return { right, up: orthoUp };
}
