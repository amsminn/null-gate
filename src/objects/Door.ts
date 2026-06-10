import * as THREE from 'three';
import { CollisionSystem, Collider } from '../physics/CollisionSystem';
import { Materials } from '../world/Materials';
import { PressureButton } from './Button';
import { Interactable } from './Interactable';
import { ProceduralAudio } from '../audio/ProceduralAudio';
import { damp } from '../utils/math';

const LOCKED_COLOR = new THREE.Color(0xff8a3c);
const OPEN_COLOR = new THREE.Color(0x3ce0ff);

export type DoorMode = 'buttons' | 'proximity' | 'open';

export interface DoorOptions {
  /** wall plane normal axis: 'x' means the doorway is in a wall facing ±x */
  axis: 'x' | 'z';
  /** center of the opening at FLOOR level of the opening */
  center: [number, number, number];
  width?: number;
  height?: number;
  mode?: DoorMode;
  buttons?: PressureButton[];
  /** proximity trigger radius for mode 'proximity' */
  radius?: number;
  /** once opened, stays open — for exit doors whose trigger is the player's
   *  own weight (stepping off must not seal the route) and for one-way
   *  progression doors that would otherwise soft-lock */
  latch?: boolean;
}

/**
 * Sliding two-leaf chamber door. Owns the collider that seals the wall
 * opening; level geometry must leave a hole of (width x height) at `center`.
 */
export class Door implements Interactable {
  readonly interactKind = 'door' as const;
  open = false;
  private latched = false;
  private openT = 0;
  private opts: Required<Pick<DoorOptions, 'axis' | 'width' | 'height' | 'mode' | 'radius'>> & DoorOptions;
  private center: THREE.Vector3;
  private leafA: THREE.Mesh;
  private leafB: THREE.Mesh;
  private collider: Collider;
  private indicatorMats: THREE.MeshStandardMaterial[] = [];
  private audio: ProceduralAudio;
  private lateral: THREE.Vector3;

  constructor(root: THREE.Group, collision: CollisionSystem, audio: ProceduralAudio, options: DoorOptions) {
    this.audio = audio;
    this.opts = {
      width: 2.2,
      height: 3,
      mode: 'buttons',
      radius: 4,
      buttons: [],
      ...options,
    };
    const [cx, cy, cz] = this.opts.center;
    this.center = new THREE.Vector3(cx, cy, cz);
    const w = this.opts.width;
    const h = this.opts.height;
    const depth = 0.42;
    this.lateral = this.opts.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);

    const g = new THREE.Group();
    g.position.copy(this.center);
    if (this.opts.axis === 'z') g.rotation.y = Math.PI / 2;
    root.add(g);

    // --- frame: jambs + lintel, dark machined metal
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f2227, roughness: 0.38, metalness: 0.72 });
    const jambGeo = new THREE.BoxGeometry(depth + 0.25, h + 0.4, 0.34);
    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(jambGeo, frameMat);
      jamb.position.set(0, (h + 0.4) / 2, side * (w / 2 + 0.17));
      jamb.castShadow = true;
      jamb.receiveShadow = true;
      jamb.userData.interact = this;
      g.add(jamb);
      // vertical indicator strip on each jamb
      const stripMat = Materials.emissive(LOCKED_COLOR.getHex(), 2.2);
      this.indicatorMats.push(stripMat);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.27, h * 0.7, 0.06), stripMat);
      strip.position.set(0, (h + 0.4) / 2, side * (w / 2 + 0.17));
      g.add(strip);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.25, 0.36, w + 1.0), frameMat);
    lintel.position.set(0, h + 0.18, 0);
    lintel.castShadow = true;
    lintel.userData.interact = this;
    g.add(lintel);
    // status bar over the lintel
    const barMat = Materials.emissive(LOCKED_COLOR.getHex(), 2.6);
    this.indicatorMats.push(barMat);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.27, 0.12, w * 0.7), barMat);
    bar.position.set(0, h + 0.18, 0);
    g.add(bar);

    // --- sliding leaves
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5, metalness: 0.55 });
    const leafGeo = new THREE.BoxGeometry(depth, h, w / 2 + 0.06);
    this.leafA = new THREE.Mesh(leafGeo, leafMat);
    this.leafB = new THREE.Mesh(leafGeo, leafMat);
    for (const leaf of [this.leafA, this.leafB]) {
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      leaf.userData.interact = this;
      g.add(leaf);
      // chevron edge light on each leaf's meeting edge
      const edgeMat = Materials.emissive(LOCKED_COLOR.getHex(), 1.8);
      this.indicatorMats.push(edgeMat);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.02, h * 0.92, 0.05), edgeMat);
      edge.position.z = leaf === this.leafA ? -(w / 4 + 0.03) + 0.05 : w / 4 + 0.03 - 0.05;
      leaf.add(edge);
    }
    this.positionLeaves(0);

    // --- collider seals the opening while closed
    const min = new THREE.Vector3();
    const max = new THREE.Vector3();
    if (this.opts.axis === 'x') {
      min.set(cx - depth / 2, cy, cz - w / 2);
      max.set(cx + depth / 2, cy + h, cz + w / 2);
    } else {
      min.set(cx - w / 2, cy, cz - depth / 2);
      max.set(cx + w / 2, cy + h, cz + depth / 2);
    }
    this.collider = collision.add(min, max, 'door');
  }

  /** local-space leaf placement; t=0 closed, t=1 fully pocketed into the walls */
  private positionLeaves(t: number): void {
    const w = this.opts.width;
    const slide = t * (w / 2 + 0.12);
    this.leafA.position.set(0, this.opts.height / 2, w / 4 + 0.03 + slide);
    this.leafB.position.set(0, this.opts.height / 2, -(w / 4 + 0.03) - slide);
  }

  /** Leaf meshes block portal shots while the door is closed. */
  getBlockingMeshes(): THREE.Mesh[] {
    return [this.leafA, this.leafB];
  }

  prompt(): string | null {
    if (this.open) return null;
    if (this.opts.mode === 'buttons') return 'SEALED — ACTIVATE PRESSURE NODE';
    return 'SEALED';
  }

  shouldOpen(playerPos: THREE.Vector3): boolean {
    let want: boolean;
    switch (this.opts.mode) {
      case 'open':
        want = true;
        break;
      case 'proximity':
        want =
          playerPos.distanceTo(new THREE.Vector3(this.center.x, playerPos.y, this.center.z)) <
          this.opts.radius;
        break;
      case 'buttons':
        want = (this.opts.buttons ?? []).length > 0 && this.opts.buttons!.every((b) => b.pressed);
        break;
    }
    if (want && this.opts.latch) this.latched = true;
    return this.latched || want;
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    const want = this.shouldOpen(playerPos);
    if (want !== this.open) {
      this.open = want;
      if (want) this.audio.doorOpen();
      else this.audio.doorClose();
    }
    this.openT = damp(this.openT, this.open ? 1 : 0, 6, dt);
    this.positionLeaves(this.openT);
    this.collider.enabled = this.openT < 0.55;

    const target = this.open ? OPEN_COLOR : LOCKED_COLOR;
    for (const m of this.indicatorMats) m.emissive.lerp(target, 1 - Math.exp(-8 * dt));
  }
}
