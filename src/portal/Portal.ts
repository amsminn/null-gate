import * as THREE from 'three';
import { Collider } from '../physics/CollisionSystem';
import { portalBasis } from './PortalMath';

export type PortalKind = 'blue' | 'amber';

export const PORTAL_COLORS: Record<PortalKind, number> = {
  blue: 0x3c8cff,
  amber: 0xffa13c,
};

const SURFACE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Swirling energy field: polar-coordinate value noise advected inward over time. */
const SURFACE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpen;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 c = (vUv - 0.5) * 2.0;
  float r = length(c);
  if (r > 1.0) discard;
  float a = atan(c.y, c.x);

  // two layers of swirling noise flowing toward the center
  float n1 = vnoise(vec2(a * 2.5 + uTime * 1.2, r * 5.0 - uTime * 2.2));
  float n2 = vnoise(vec2(a * 5.0 - uTime * 0.8 + 7.3, r * 9.0 - uTime * 3.4));
  float swirl = n1 * 0.65 + n2 * 0.35;

  // dark void core, energetic ring toward the rim
  float core = smoothstep(0.0, 0.62, r);
  float rim = smoothstep(0.62, 0.97, r);

  vec3 col = uColor * (0.12 + swirl * 0.55) * core;
  col += uColor * rim * (1.3 + 0.5 * sin(uTime * 6.0 + a * 3.0));
  col += vec3(1.0) * rim * rim * 0.35;
  col *= uOpen;

  float alpha = mix(0.92, 1.0, rim) * uOpen;
  gl_FragColor = vec4(col, alpha);
}
`;

/** Soft swirling border: radial glow band whose edge wobbles with trig noise. */
const RIM_VERT = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RIM_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  float a = atan(vPos.y, vPos.x);
  float wob = 0.045 * sin(a * 7.0 + uTime * 2.6) + 0.028 * sin(a * 13.0 - uTime * 3.7);
  float rr = r + wob;
  float band = smoothstep(0.8, 1.0, rr) * smoothstep(1.32, 1.02, rr);
  vec3 col = uColor * band * 1.9 + vec3(1.0) * band * band * 0.65;
  gl_FragColor = vec4(col, band);
}
`;

export const PORTAL_HALF_W = 0.55;
export const PORTAL_HALF_H = 0.95;

const SPIRAL_COUNT = 26;

/**
 * One portal endpoint: spatial frame + animated visuals.
 * The frame vectors (position / normal / right / up / quaternion) are the
 * single source of truth used by PortalSystem for placement, traversal
 * exclusion and teleport transforms.
 */
export class Portal {
  readonly kind: PortalKind;
  active = false;

  position = new THREE.Vector3();
  normal = new THREE.Vector3(0, 0, 1);
  right = new THREE.Vector3(1, 0, 0);
  up = new THREE.Vector3(0, 1, 0);
  quaternion = new THREE.Quaternion();
  halfW = PORTAL_HALF_W;
  halfH = PORTAL_HALF_H;
  /** the wall collider this portal sits on — excluded for travellers inside the footprint */
  surfaceCollider: Collider | null = null;

  group: THREE.Group;
  private surfaceMat: THREE.ShaderMaterial;
  private rimMat: THREE.ShaderMaterial;
  private surface: THREE.Mesh;
  private rim: THREE.Mesh;
  private glow: THREE.Mesh;
  private spawnT = 1;
  /** edge particles spiralling inward (matter being drawn through) */
  private spiral: THREE.Points;
  private spiralAngle = new Float32Array(SPIRAL_COUNT);
  private spiralRadius = new Float32Array(SPIRAL_COUNT);
  private spiralSpeed = new Float32Array(SPIRAL_COUNT);

  constructor(kind: PortalKind, scene: THREE.Scene) {
    this.kind = kind;
    const color = new THREE.Color(PORTAL_COLORS[kind]);

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.surfaceMat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: color.clone() },
        uOpen: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.surface = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.surfaceMat);
    this.surface.scale.set(this.halfW, this.halfH, 1);
    this.surface.renderOrder = 5;
    this.group.add(this.surface);

    this.rimMat = new THREE.ShaderMaterial({
      vertexShader: RIM_VERT,
      fragmentShader: RIM_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: color.clone() },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.rim = new THREE.Mesh(new THREE.RingGeometry(0.66, 1.38, 96), this.rimMat);
    this.rim.scale.set(this.halfW, this.halfH, 1);
    this.rim.renderOrder = 6;
    this.group.add(this.rim);

    // inward-spiralling edge particles
    const spiralPos = new Float32Array(SPIRAL_COUNT * 3);
    for (let i = 0; i < SPIRAL_COUNT; i++) {
      this.spiralAngle[i] = Math.random() * Math.PI * 2;
      this.spiralRadius[i] = 0.3 + Math.random() * 1.05;
      this.spiralSpeed[i] = 1.6 + Math.random() * 1.6;
    }
    const spiralGeo = new THREE.BufferGeometry();
    spiralGeo.setAttribute('position', new THREE.BufferAttribute(spiralPos, 3));
    this.spiral = new THREE.Points(
      spiralGeo,
      new THREE.PointsMaterial({
        color: color.clone().multiplyScalar(1.4),
        size: 0.045,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.spiral.renderOrder = 7;
    this.group.add(this.spiral);

    // soft halo cast onto the wall around the portal
    const glowMat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.6, 48), glowMat);
    this.glow.scale.set(this.halfW * 1.25, this.halfH * 1.25, 1);
    this.glow.renderOrder = 4;
    this.group.add(this.glow);

    const light = new THREE.PointLight(PORTAL_COLORS[kind], 6, 7, 1.8);
    light.position.set(0, 0, 0.35);
    this.group.add(light);
  }

  place(point: THREE.Vector3, normal: THREE.Vector3, upHint: THREE.Vector3, collider: Collider | null): void {
    const basis = portalBasis(normal, upHint);
    // floor portals are larger ovals: forgiving to fall into, readable from height
    const isFloor = Math.abs(normal.y) > 0.9;
    this.halfW = isFloor ? 0.75 : PORTAL_HALF_W;
    this.halfH = isFloor ? 1.2 : PORTAL_HALF_H;
    this.surface.scale.set(this.halfW, this.halfH, 1);
    this.rim.scale.set(this.halfW, this.halfH, 1);
    this.glow.scale.set(this.halfW * 1.25, this.halfH * 1.25, 1);
    this.position.copy(point);
    this.normal.copy(normal).normalize();
    this.right.copy(basis.right);
    this.up.copy(basis.up);
    this.quaternion.copy(basis.quaternion);
    this.surfaceCollider = collider;
    this.active = true;
    this.spawnT = 0;

    this.group.position.copy(point).addScaledVector(this.normal, 0.025);
    this.group.quaternion.copy(this.quaternion);
    this.group.visible = true;
  }

  clearPortal(): void {
    this.active = false;
    this.group.visible = false;
    this.surfaceCollider = null;
  }

  /** Signed distance of a point from the portal plane (positive = room side). */
  signedDistance(p: THREE.Vector3): number {
    return (
      (p.x - this.position.x) * this.normal.x +
      (p.y - this.position.y) * this.normal.y +
      (p.z - this.position.z) * this.normal.z
    );
  }

  /** Is the point laterally inside the portal ellipse (projected onto the plane)? */
  containsProjected(p: THREE.Vector3, tolerance = 1.0): boolean {
    const dx = p.x - this.position.x;
    const dy = p.y - this.position.y;
    const dz = p.z - this.position.z;
    const lx = (dx * this.right.x + dy * this.right.y + dz * this.right.z) / this.halfW;
    const ly = (dx * this.up.x + dy * this.up.y + dz * this.up.z) / this.halfH;
    return lx * lx + ly * ly <= tolerance * tolerance;
  }

  update(dt: number, time: number): void {
    if (!this.active) return;
    const phase = this.kind === 'blue' ? 0 : 31.7;
    this.surfaceMat.uniforms.uTime.value = time + phase;
    this.rimMat.uniforms.uTime.value = time + phase;

    // elastic opening animation
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 4);
      const t = this.spawnT;
      const e = 1 - Math.pow(1 - t, 3) * Math.cos(t * 9);
      this.group.scale.setScalar(Math.max(0.01, e));
      this.surfaceMat.uniforms.uOpen.value = Math.min(1, t * 1.6);
    } else {
      this.group.scale.setScalar(1);
    }

    // gentle rim breathing
    const pulse = 1 + Math.sin(time * 3.1 + (this.kind === 'blue' ? 0 : 2)) * 0.02;
    this.rim.scale.set(this.halfW * pulse, this.halfH * pulse, 1);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.13 + Math.sin(time * 2.3) * 0.04;

    // edge particles spiral inward and respawn at the rim
    const pos = this.spiral.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < SPIRAL_COUNT; i++) {
      this.spiralRadius[i] -= dt * 0.55;
      this.spiralAngle[i] += dt * this.spiralSpeed[i];
      if (this.spiralRadius[i] < 0.15) {
        this.spiralRadius[i] = 1.15 + Math.random() * 0.2;
        this.spiralAngle[i] = Math.random() * Math.PI * 2;
      }
      arr[i * 3] = Math.cos(this.spiralAngle[i]) * this.spiralRadius[i] * this.halfW;
      arr[i * 3 + 1] = Math.sin(this.spiralAngle[i]) * this.spiralRadius[i] * this.halfH;
      arr[i * 3 + 2] = 0.04;
    }
    pos.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
  }
}
