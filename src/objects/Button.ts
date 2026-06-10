import * as THREE from 'three';
import { Materials } from '../world/Materials';
import { Interactable } from './Interactable';
import { ProceduralAudio } from '../audio/ProceduralAudio';
import { damp } from '../utils/math';

export interface WeightBody {
  position: THREE.Vector3;
  half: THREE.Vector3;
}

const LOCKED_COLOR = new THREE.Color(0xff8a3c);
const ACTIVE_COLOR = new THREE.Color(0x3ce0ff);

/**
 * Floor pressure actuator. Activates while any weight body (player or cube)
 * rests on it; the cap depresses and the state color flips amber -> cyan.
 * Intentionally has no collider: it is only 12cm tall, so bodies stand "on"
 * the floor while visually on the button — this avoids AABB step-up issues.
 */
export class PressureButton implements Interactable {
  readonly interactKind = 'button' as const;
  pressed = false;
  position: THREE.Vector3;

  private cap: THREE.Mesh;
  private capMat: THREE.MeshStandardMaterial;
  private ringMat: THREE.MeshStandardMaterial;
  private capY = 0;
  private audio: ProceduralAudio;

  constructor(root: THREE.Group, audio: ProceduralAudio, x: number, floorY: number, z: number) {
    this.audio = audio;
    this.position = new THREE.Vector3(x, floorY, z);

    const g = new THREE.Group();
    g.position.set(x, floorY, z);
    root.add(g);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.65 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.72, 0.1, 36), baseMat);
    base.position.y = 0.05;
    base.receiveShadow = true;
    base.castShadow = true;
    base.userData.interact = this;
    g.add(base);

    this.capMat = Materials.emissive(LOCKED_COLOR.getHex(), 1.8);
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.12, 36), this.capMat);
    this.cap.position.y = 0.15;
    this.cap.castShadow = true;
    this.cap.userData.interact = this;
    g.add(this.cap);

    // glowing floor ring so the actuator reads from across the room
    this.ringMat = Materials.emissive(LOCKED_COLOR.getHex(), 1.2);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.92, 48), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    g.add(ring);
  }

  prompt(): string | null {
    return this.pressed ? null : 'PRESSURE NODE — REQUIRES MASS';
  }

  update(dt: number, bodies: WeightBody[]): void {
    let nowPressed = false;
    for (const b of bodies) {
      const dx = b.position.x - this.position.x;
      const dz = b.position.z - this.position.z;
      const bottom = b.position.y - b.half.y;
      if (dx * dx + dz * dz < 0.78 * 0.78 && bottom > this.position.y - 0.1 && bottom < this.position.y + 0.5) {
        nowPressed = true;
        break;
      }
    }
    if (nowPressed !== this.pressed) {
      this.pressed = nowPressed;
      if (nowPressed) this.audio.buttonDown();
      else this.audio.buttonUp();
    }

    this.capY = damp(this.capY, this.pressed ? -0.07 : 0, 14, dt);
    this.cap.position.y = 0.15 + this.capY;
    const target = this.pressed ? ACTIVE_COLOR : LOCKED_COLOR;
    this.capMat.emissive.lerp(target, 1 - Math.exp(-10 * dt));
    this.ringMat.emissive.lerp(target, 1 - Math.exp(-10 * dt));
    this.ringMat.emissiveIntensity = this.pressed ? 2.4 : 1.2;
  }
}
