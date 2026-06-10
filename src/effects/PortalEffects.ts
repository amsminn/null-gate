import * as THREE from 'three';

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
}

interface Tracer {
  head: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  t: number;
  speed: number;
  phase: number;
  ghostClock: number;
  color: number;
  onArrive: () => void;
}

interface Ghost {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

// Balance point: 70 read as an instant hitscan, 26 felt laggy on long shots.
// 40 keeps the charge + trail readable while a cross-room shot lands in ~0.4s.
const TRACER_SPEED = 40;

/**
 * Portal-shot projectiles (corkscrewing energy charge + fading light trail),
 * creation bursts and invalid-shot fizzles. Everything additive-blended.
 */
export class PortalEffects {
  private scene: THREE.Scene;
  private bursts: Burst[] = [];
  private tracers: Tracer[] = [];
  private ghosts: Ghost[] = [];
  private headGeo = new THREE.SphereGeometry(0.085, 12, 12);
  private coreGeo = new THREE.SphereGeometry(0.045, 10, 10);
  private ghostGeo = new THREE.SphereGeometry(0.06, 8, 8);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Corkscrewing energy charge from muzzle to hit point; callback on arrival. */
  fireTracer(from: THREE.Vector3, to: THREE.Vector3, color: number, onArrive: () => void): void {
    const head = new THREE.Group();
    const shellMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(this.headGeo, shellMat);
    const core = new THREE.Mesh(
      this.coreGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    head.add(shell);
    head.add(core);
    head.add(new THREE.PointLight(color, 7, 7, 2));
    head.position.copy(from);
    this.scene.add(head);

    // path frame for the helix wobble
    const dir = to.clone().sub(from).normalize();
    const up0 = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up0).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();

    this.tracers.push({
      head,
      from: from.clone(),
      to: to.clone(),
      right,
      up,
      t: 0,
      speed: TRACER_SPEED,
      phase: Math.random() * Math.PI * 2,
      ghostClock: 0,
      color,
      onArrive,
    });
  }

  private spawnGhost(at: THREE.Vector3, color: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.ghostGeo, mat);
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.ghosts.push({ mesh, mat, life: 0, maxLife: 0.35 });
  }

  /** Radial spark burst, used for portal creation, muzzle flash and fizzles. */
  burst(at: THREE.Vector3, normal: THREE.Vector3, color: number, count = 26, speed = 3.2): void {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const tangentA = new THREE.Vector3();
    const tangentB = new THREE.Vector3();
    if (Math.abs(normal.y) > 0.9) tangentA.set(1, 0, 0);
    else tangentA.set(0, 1, 0);
    tangentB.crossVectors(normal, tangentA).normalize();
    tangentA.crossVectors(tangentB, normal).normalize();

    for (let i = 0; i < count; i++) {
      positions[i * 3] = at.x;
      positions[i * 3 + 1] = at.y;
      positions[i * 3 + 2] = at.z;
      const ang = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 0.7) * speed;
      const out = 0.4 + Math.random() * 1.4;
      velocities[i * 3] = tangentA.x * Math.cos(ang) * r + tangentB.x * Math.sin(ang) * r + normal.x * out;
      velocities[i * 3 + 1] = tangentA.y * Math.cos(ang) * r + tangentB.y * Math.sin(ang) * r + normal.y * out;
      velocities[i * 3 + 2] = tangentA.z * Math.cos(ang) * r + tangentB.z * Math.sin(ang) * r + normal.z * out;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.06,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.bursts.push({ points, velocities, life: 0, maxLife: 0.55 });
  }

  update(dt: number): void {
    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      const dist = tr.from.distanceTo(tr.to);
      tr.t += (tr.speed * dt) / Math.max(0.01, dist);

      if (tr.t >= 1) {
        this.scene.remove(tr.head);
        this.tracers.splice(i, 1);
        tr.onArrive();
        continue;
      }

      // helix around the straight path; amplitude fades in/out at the ends
      const lin = new THREE.Vector3().lerpVectors(tr.from, tr.to, tr.t);
      const swirlAmp = 0.06 * Math.sin(Math.min(tr.t, 1) * Math.PI);
      const phase = tr.phase + tr.t * dist * 5;
      lin.addScaledVector(tr.right, Math.cos(phase) * swirlAmp);
      lin.addScaledVector(tr.up, Math.sin(phase) * swirlAmp);
      tr.head.position.copy(lin);

      // light trail
      tr.ghostClock += dt;
      while (tr.ghostClock > 0.016) {
        tr.ghostClock -= 0.016;
        this.spawnGhost(tr.head.position, tr.color);
      }
    }

    // trail ghosts fade and shrink
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      gh.life += dt;
      const k = gh.life / gh.maxLife;
      if (k >= 1) {
        this.scene.remove(gh.mesh);
        gh.mat.dispose();
        this.ghosts.splice(i, 1);
        continue;
      }
      gh.mat.opacity = 0.4 * (1 - k);
      gh.mesh.scale.setScalar(1 - k * 0.6);
    }

    // bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life += dt;
      if (b.life >= b.maxLife) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      const pos = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] += b.velocities[j] * dt;
        arr[j + 1] += (b.velocities[j + 1] - 4 * b.life) * dt;
        arr[j + 2] += b.velocities[j + 2] * dt;
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = 1 - b.life / b.maxLife;
    }
  }

  clear(): void {
    for (const tr of this.tracers) this.scene.remove(tr.head);
    for (const b of this.bursts) this.scene.remove(b.points);
    for (const gh of this.ghosts) this.scene.remove(gh.mesh);
    this.tracers.length = 0;
    this.bursts.length = 0;
    this.ghosts.length = 0;
  }
}
