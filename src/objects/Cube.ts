import * as THREE from 'three';
import { CollisionSystem, Collider } from '../physics/CollisionSystem';
import { RigidBody } from '../physics/RigidBody';
import { Materials } from '../world/Materials';
import { Interactable } from './Interactable';

const SIZE = 0.54;
const HALF = SIZE / 2;

/**
 * Weighted test object — original design: ceramic body, dark corner frame,
 * cyan-lit face nodes. Physically an AABB that can ride pressure buttons and
 * travel through portals.
 */
export class Cube implements Interactable {
  readonly interactKind = 'cube' as const;
  group: THREE.Group;
  body: RigidBody;
  held = false;
  private spawn: THREE.Vector3;
  private faceMats: THREE.MeshStandardMaterial[] = [];
  private holdTarget = new THREE.Vector3();

  constructor(root: THREE.Group, x: number, y: number, z: number) {
    this.body = new RigidBody(new THREE.Vector3(HALF, HALF, HALF));
    this.body.position.set(x, y + HALF + 0.02, z);
    this.spawn = this.body.position.clone();

    this.group = new THREE.Group();
    root.add(this.group);

    // ceramic body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.55, metalness: 0.08 });
    const core = new THREE.Mesh(new THREE.BoxGeometry(SIZE * 0.94, SIZE * 0.94, SIZE * 0.94), bodyMat);
    core.castShadow = true;
    core.receiveShadow = true;
    this.tag(core);
    this.group.add(core);

    // dark metal corner caps
    const capMat = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.4, metalness: 0.7 });
    const capGeo = new THREE.BoxGeometry(SIZE * 0.3, SIZE * 0.3, SIZE * 0.3);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const cap = new THREE.Mesh(capGeo, capMat);
          cap.position.set(sx * HALF * 0.78, sy * HALF * 0.78, sz * HALF * 0.78);
          cap.castShadow = true;
          this.tag(cap);
          this.group.add(cap);
        }
      }
    }

    // slim edge rails (vertical)
    const railGeo = new THREE.BoxGeometry(SIZE * 0.1, SIZE * 0.96, SIZE * 0.1);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const rail = new THREE.Mesh(railGeo, capMat);
        rail.position.set(sx * HALF * 0.88, 0, sz * HALF * 0.88);
        this.tag(rail);
        this.group.add(rail);
      }
    }

    // cyan emissive face nodes
    const dotGeo = new THREE.CircleGeometry(SIZE * 0.16, 24);
    const faceDirs: Array<[THREE.Vector3, THREE.Euler]> = [
      [new THREE.Vector3(0, 0, 1), new THREE.Euler(0, 0, 0)],
      [new THREE.Vector3(0, 0, -1), new THREE.Euler(0, Math.PI, 0)],
      [new THREE.Vector3(1, 0, 0), new THREE.Euler(0, Math.PI / 2, 0)],
      [new THREE.Vector3(-1, 0, 0), new THREE.Euler(0, -Math.PI / 2, 0)],
      [new THREE.Vector3(0, 1, 0), new THREE.Euler(-Math.PI / 2, 0, 0)],
      [new THREE.Vector3(0, -1, 0), new THREE.Euler(Math.PI / 2, 0, 0)],
    ];
    for (const [dir, rot] of faceDirs) {
      const mat = Materials.emissive(0x36d8e8, 1.6);
      this.faceMats.push(mat);
      const dot = new THREE.Mesh(dotGeo, mat);
      dot.position.copy(dir).multiplyScalar(HALF * 0.95);
      dot.rotation.copy(rot);
      this.tag(dot);
      this.group.add(dot);
    }

    this.group.position.copy(this.body.position);
  }

  private tag(mesh: THREE.Mesh): void {
    mesh.userData.interact = this;
    mesh.userData.cubeRef = this;
  }

  prompt(): string | null {
    return this.held ? 'RELEASE TEST OBJECT' : 'LIFT TEST OBJECT';
  }

  setHeld(held: boolean): void {
    this.held = held;
    this.body.gravityEnabled = !held;
    if (!held) this.body.velocity.multiplyScalar(0.4);
  }

  setHoldTarget(target: THREE.Vector3): void {
    this.holdTarget.copy(target);
  }

  /** Energize face nodes (e.g. while powering a button). */
  setEnergized(on: boolean): void {
    for (const m of this.faceMats) m.emissiveIntensity = on ? 3.2 : 1.6;
  }

  update(dt: number, collision: CollisionSystem, exclude?: Set<Collider>): void {
    if (this.held) {
      // critically-damped pull toward the carry anchor; still collides so the
      // cube can never be pushed through a wall by camera motion
      const toTarget = this.holdTarget.clone().sub(this.body.position);
      this.body.velocity.copy(toTarget.multiplyScalar(14));
      const maxSpeed = 16;
      if (this.body.velocity.length() > maxSpeed) this.body.velocity.setLength(maxSpeed);
      collision.moveBody(this.body.position, this.body.half, this.body.velocity, dt, exclude);
    } else {
      this.body.update(dt, collision, exclude);
    }
    this.group.position.copy(this.body.position);
  }

  resetToSpawn(): void {
    this.body.position.copy(this.spawn);
    this.body.velocity.set(0, 0, 0);
    this.held = false;
    this.body.gravityEnabled = true;
  }

  distanceTo(p: THREE.Vector3): number {
    return this.body.position.distanceTo(p);
  }
}
