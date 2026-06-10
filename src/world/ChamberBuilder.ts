import * as THREE from 'three';
import { CollisionSystem, Collider } from '../physics/CollisionSystem';
import { Materials, SurfaceKind } from './Materials';
import { signTexture } from './ProceduralTextures';

export type Vec3Tuple = [number, number, number];

export interface BlockOptions {
  portalable?: boolean;
  collide?: boolean;
  shootable?: boolean;
  castShadow?: boolean;
}

/**
 * Animated button->door power conduit drawn as emissive floor strips.
 * Readable from across the chamber: amber while dormant, cyan while powered.
 */
export class TraceLine {
  active = false;
  private mats: THREE.MeshStandardMaterial[] = [];
  private inactive = new THREE.Color(0xff8a3c);
  private activeColor = new THREE.Color(0x3ce0ff);

  addMat(m: THREE.MeshStandardMaterial): void {
    this.mats.push(m);
  }

  update(dt: number, time: number): void {
    const target = this.active ? this.activeColor : this.inactive;
    const pulse = this.active ? 2.4 + Math.sin(time * 7) * 0.8 : 1.1;
    for (const m of this.mats) {
      m.emissive.lerp(target, 1 - Math.exp(-8 * dt));
      m.emissiveIntensity = pulse;
    }
  }
}

/**
 * Procedural test-chamber kit: panel blocks, glass, light fixtures, signage,
 * floor guidance, hazard stripes, observation rooms and small greeble.
 * Tracks everything it creates so a level can be torn down in one call.
 */
export class ChamberBuilder {
  root: THREE.Group;
  /** meshes the portal raycast may hit (walls, glass, greeble) */
  shootables: THREE.Mesh[] = [];
  traceLines: TraceLine[] = [];
  private scene: THREE.Scene;
  private collision: CollisionSystem;
  private geometries: THREE.BufferGeometry[] = [];

  constructor(scene: THREE.Scene, collision: CollisionSystem) {
    this.scene = scene;
    this.collision = collision;
    this.root = new THREE.Group();
    scene.add(this.root);
  }

  private track<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  /** Axis-aligned box of facility surface. White panels are portal-compatible by default. */
  block(min: Vec3Tuple, max: Vec3Tuple, kind: SurfaceKind, opts: BlockOptions = {}): THREE.Mesh {
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const sorted = [...size].sort((a, b) => b - a);
    const mat = Materials.surface(kind, sorted[0], sorted[1]);
    const geo = this.track(new THREE.BoxGeometry(size[0], size[1], size[2]));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    let collider: Collider | null = null;
    if (opts.collide !== false) {
      collider = this.collision.add(new THREE.Vector3(...min), new THREE.Vector3(...max), kind);
    }
    mesh.userData.portalable = opts.portalable ?? kind === 'white';
    mesh.userData.collider = collider;
    if (opts.shootable !== false) this.shootables.push(mesh);
    return mesh;
  }

  glass(min: Vec3Tuple, max: Vec3Tuple): THREE.Mesh {
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const geo = this.track(new THREE.BoxGeometry(size[0], size[1], size[2]));
    const mesh = new THREE.Mesh(geo, Materials.glass());
    mesh.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    mesh.renderOrder = 2;
    this.root.add(mesh);
    const collider = this.collision.add(new THREE.Vector3(...min), new THREE.Vector3(...max), 'glass');
    mesh.userData.portalable = false;
    mesh.userData.collider = collider;
    this.shootables.push(mesh);
    return mesh;
  }

  /** Emissive accent strip — no collider, never blocks portal shots. */
  lightStrip(min: Vec3Tuple, max: Vec3Tuple, color = 0x9fdcff, intensity = 2.6): THREE.Mesh {
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const geo = this.track(new THREE.BoxGeometry(size[0], size[1], size[2]));
    const mesh = new THREE.Mesh(geo, Materials.emissive(color, intensity));
    mesh.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    this.root.add(mesh);
    return mesh;
  }

  /** Ceiling light bar: emissive diffuser in a dark housing. */
  ceilingLight(cx: number, cz: number, y: number, w = 3, d = 0.9): void {
    const housing = this.track(new THREE.BoxGeometry(w + 0.24, 0.12, d + 0.24));
    const hMesh = new THREE.Mesh(
      housing,
      new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.4, metalness: 0.6 })
    );
    hMesh.position.set(cx, y + 0.05, cz);
    this.root.add(hMesh);
    const panel = this.track(new THREE.BoxGeometry(w, 0.07, d));
    const pMesh = new THREE.Mesh(panel, Materials.emissive(0xf2f8ff, 3.0));
    pMesh.position.set(cx, y, cz);
    this.root.add(pMesh);
  }

  /**
   * Chamber light. Shadow casters are downward spotlights (ONE 2048 shadow
   * map instead of a point light's six cube faces — far cheaper per frame and
   * stable at long range, e.g. pit floors), paired with a soft shadowless
   * point fill so upper walls stay lit. Accent lights stay plain points.
   * Global 0.75 scale + physical decay keep near-light panels from clipping.
   */
  pointLight(
    x: number,
    y: number,
    z: number,
    intensity = 55,
    color = 0xeaf4ff,
    shadow = true,
    distance = 0
  ): THREE.Light {
    if (shadow) {
      const spot = new THREE.SpotLight(color, intensity * 0.75, distance, 1.15, 0.65, 2);
      spot.position.set(x, y, z);
      spot.target.position.set(x, y - 5, z);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024); // VSM blurs anyway — smaller map, softer look
      spot.shadow.bias = -0.0001;
      spot.shadow.radius = 4;
      spot.shadow.blurSamples = 8;
      spot.shadow.camera.near = 0.5;
      spot.shadow.camera.far = 45;
      this.root.add(spot);
      this.root.add(spot.target);

      const fill = new THREE.PointLight(color, intensity * 0.28, distance, 2);
      fill.position.set(x, y, z);
      this.root.add(fill);
      return spot;
    }
    const light = new THREE.PointLight(color, intensity * 0.75, distance, 2);
    light.position.set(x, y, z);
    this.root.add(light);
    return light;
  }

  hemi(intensity = 0.6): void {
    const h = new THREE.HemisphereLight(0xdfe8f0, 0x2c3034, intensity);
    this.root.add(h);
  }

  /** Original facility signage (procedural canvas typography). */
  sign(lines: string[], x: number, y: number, z: number, rotY: number, w = 2.2): void {
    const geo = this.track(new THREE.PlaneGeometry(w, w / 2));
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(lines) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.root.add(mesh);
  }

  /** Static guidance strip along axis-aligned floor waypoints. */
  floorLine(points: Array<[number, number]>, color = 0x35e0ff, y = 0.012, width = 0.14): void {
    for (let i = 0; i < points.length - 1; i++) {
      this.lineSegment(points[i], points[i + 1], Materials.emissive(color, 1.5), y, width);
    }
  }

  private lineSegment(
    a: [number, number],
    b: [number, number],
    mat: THREE.MeshStandardMaterial,
    y: number,
    width: number
  ): void {
    const minX = Math.min(a[0], b[0]) - width / 2;
    const maxX = Math.max(a[0], b[0]) + width / 2;
    const minZ = Math.min(a[1], b[1]) - width / 2;
    const maxZ = Math.max(a[1], b[1]) + width / 2;
    const geo = this.track(new THREE.BoxGeometry(maxX - minX, 0.012, maxZ - minZ));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
    this.root.add(mesh);
  }

  /** Powered button->door conduit; returns the handle levels link to a button. */
  traceLine(points: Array<[number, number]>, y = 0.014): TraceLine {
    const line = new TraceLine();
    for (let i = 0; i < points.length - 1; i++) {
      const mat = Materials.emissive(0xff8a3c, 1.1);
      line.addMat(mat);
      this.lineSegment(points[i], points[i + 1], mat, y, 0.18);
    }
    this.traceLines.push(line);
    return line;
  }

  /** Hazard stripes plane laid on the floor. */
  stripes(minX: number, minZ: number, maxX: number, maxZ: number, y = 0.011): void {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const geo = this.track(new THREE.PlaneGeometry(w, d));
    const mesh = new THREE.Mesh(geo, Materials.stripes(w / 0.8, d / 0.8));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
    // decal: receiving shadows on a plane 1cm above the floor only invites
    // acne flicker — the floor below carries the real shadow
    mesh.receiveShadow = false;
    this.root.add(mesh);
  }

  /**
   * Observation room embedded in a wall: glass front, dimly lit interior with
   * console silhouettes. `rotY` must be a multiple of PI/2 (AABB collider).
   * Local convention: glass plane at local z=0 facing -z (toward the chamber),
   * the room extends to local +z.
   */
  observationRoom(cx: number, cy: number, cz: number, w = 4, h = 2, depth = 2.4, rotY = 0): void {
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    g.rotation.y = rotY;
    this.root.add(g);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.45, metalness: 0.6 });
    // frame border around the glass
    const frameGeoH = this.track(new THREE.BoxGeometry(w + 0.4, 0.2, 0.3));
    const frameGeoV = this.track(new THREE.BoxGeometry(0.2, h + 0.4, 0.3));
    for (const sy of [-1, 1]) {
      const fr = new THREE.Mesh(frameGeoH, frameMat);
      fr.position.set(0, sy * (h / 2 + 0.1), 0);
      g.add(fr);
    }
    for (const sx of [-1, 1]) {
      const fr = new THREE.Mesh(frameGeoV, frameMat);
      fr.position.set(sx * (w / 2 + 0.1), 0, 0);
      g.add(fr);
    }

    // glass pane
    const glassGeo = this.track(new THREE.BoxGeometry(w, h, 0.1));
    const glass = new THREE.Mesh(glassGeo, Materials.glass());
    glass.renderOrder = 2;
    g.add(glass);
    glass.userData.portalable = false;

    // interior shell
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x202329, roughness: 0.7, metalness: 0.3 });
    const mkPanel = (sx: number, sy: number, sz: number, px: number, py: number, pz: number) => {
      const geo = this.track(new THREE.BoxGeometry(sx, sy, sz));
      const m = new THREE.Mesh(geo, shellMat);
      m.position.set(px, py, pz);
      g.add(m);
    };
    mkPanel(w, h, 0.15, 0, 0, depth); // back
    mkPanel(0.15, h, depth, -w / 2, 0, depth / 2);
    mkPanel(0.15, h, depth, w / 2, 0, depth / 2);
    mkPanel(w, 0.15, depth, 0, -h / 2, depth / 2);
    mkPanel(w, 0.15, depth, 0, h / 2, depth / 2);

    // console silhouettes + glowing screen
    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x0e1013, roughness: 0.8, metalness: 0.2 });
    const deskGeo = this.track(new THREE.BoxGeometry(w * 0.6, h * 0.22, 0.5));
    const desk = new THREE.Mesh(deskGeo, consoleMat);
    desk.position.set(0, -h / 2 + h * 0.13, depth * 0.45);
    g.add(desk);
    const monGeo = this.track(new THREE.BoxGeometry(w * 0.22, h * 0.3, 0.08));
    for (const sx of [-0.18, 0.16]) {
      const mon = new THREE.Mesh(monGeo, consoleMat);
      mon.position.set(sx * w, -h * 0.1, depth * 0.5);
      mon.rotation.y = -sx * 1.2;
      g.add(mon);
      const scrGeo = this.track(new THREE.PlaneGeometry(w * 0.18, h * 0.22));
      const scr = new THREE.Mesh(scrGeo, Materials.emissive(0x2fae9c, 1.4));
      scr.position.set(sx * w, -h * 0.1, depth * 0.5 - 0.05);
      scr.rotation.y = Math.PI - sx * 1.2;
      g.add(scr);
    }

    // cool interior light
    const inner = new THREE.PointLight(0xbfe8ff, 4, depth * 4, 2);
    inner.position.set(0, h * 0.3, depth * 0.5);
    g.add(inner);

    // collider for the glass (world AABB — valid for cardinal rotations)
    g.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(glass);
    const collider = this.collision.add(box.min, box.max, 'glass');
    glass.userData.collider = collider;
    this.shootables.push(glass);
  }

  /** Wall vent greeble. */
  vent(x: number, y: number, z: number, rotY: number, w = 0.9, h = 0.55): void {
    const geo = this.track(new THREE.BoxGeometry(w, h, 0.08));
    const mesh = new THREE.Mesh(geo, Materials.vent());
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.root.add(mesh);
  }

  /** Dark conduit/cable run along a wall. */
  pipe(min: Vec3Tuple, max: Vec3Tuple): void {
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const geo = this.track(new THREE.BoxGeometry(size[0], size[1], size[2]));
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.5, metalness: 0.6 })
    );
    mesh.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    mesh.castShadow = true;
    this.root.add(mesh);
  }

  update(dt: number, time: number): void {
    for (const line of this.traceLines) line.update(dt, time);
  }

  dispose(): void {
    this.scene.remove(this.root);
    for (const g of this.geometries) g.dispose();
    this.geometries.length = 0;
    this.shootables.length = 0;
    this.traceLines.length = 0;
  }
}
