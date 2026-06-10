import * as THREE from 'three';
import {
  panelTexture,
  darkPanelTexture,
  floorTexture,
  stripeTexture,
  ventTexture,
  PANEL_TEX_METERS,
} from './ProceduralTextures';

export type SurfaceKind = 'white' | 'dark' | 'floor' | 'ceil';

/**
 * Shared material factory. Base canvas textures are generated once; per-size
 * material variants clone the texture only to change its repeat so panel seams
 * always map 1 panel : 1 meter regardless of wall dimensions.
 */
class MaterialLibrary {
  private baseTex: Record<SurfaceKind, THREE.CanvasTexture> | null = null;
  private stripeTex: THREE.CanvasTexture | null = null;
  private ventTex: THREE.CanvasTexture | null = null;
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  private glassMat: THREE.MeshPhysicalMaterial | null = null;

  private ensure(): void {
    if (this.baseTex) return;
    this.baseTex = {
      white: panelTexture(),
      dark: darkPanelTexture(),
      floor: floorTexture(),
      ceil: panelTexture(),
    };
  }

  /** Standard material for a box whose two dominant face dimensions are (u, v) meters. */
  surface(kind: SurfaceKind, u: number, v: number): THREE.MeshStandardMaterial {
    this.ensure();
    const ru = Math.max(0.5, Math.round((u / PANEL_TEX_METERS) * 2) / 2);
    const rv = Math.max(0.5, Math.round((v / PANEL_TEX_METERS) * 2) / 2);
    const key = `${kind}:${ru}x${rv}`;
    let mat = this.cache.get(key);
    if (mat) return mat;

    const tex = this.baseTex![kind].clone();
    tex.repeat.set(ru, rv);
    tex.needsUpdate = true;

    if (kind === 'white') {
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.02 });
    } else if (kind === 'dark') {
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.68 });
    } else if (kind === 'floor') {
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.06 });
    } else {
      mat = new THREE.MeshStandardMaterial({
        map: tex,
        color: 0xb8bcc0,
        roughness: 0.85,
        metalness: 0.04,
      });
    }
    this.cache.set(key, mat);
    return mat;
  }

  stripes(u: number, v: number): THREE.MeshStandardMaterial {
    if (!this.stripeTex) this.stripeTex = stripeTexture();
    const key = `stripe:${Math.round(u * 2)}x${Math.round(v * 2)}`;
    let mat = this.cache.get(key);
    if (mat) return mat;
    const tex = this.stripeTex.clone();
    tex.repeat.set(Math.max(0.5, u), Math.max(0.5, v));
    tex.needsUpdate = true;
    mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.1 });
    this.cache.set(key, mat);
    return mat;
  }

  vent(): THREE.MeshStandardMaterial {
    if (!this.ventTex) this.ventTex = ventTexture();
    const key = 'vent';
    let mat = this.cache.get(key);
    if (mat) return mat;
    mat = new THREE.MeshStandardMaterial({ map: this.ventTex, roughness: 0.5, metalness: 0.6 });
    this.cache.set(key, mat);
    return mat;
  }

  glass(): THREE.MeshPhysicalMaterial {
    if (!this.glassMat) {
      this.glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xbfe2ee,
        transparent: true,
        opacity: 0.16,
        roughness: 0.06,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }
    return this.glassMat;
  }

  /** Emissive accent material (light strips, indicators). Each call returns a fresh instance
   *  so individual fixtures can animate their color without affecting siblings. */
  emissive(color: number, intensity = 2.4): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x0a0c0e,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
      metalness: 0.1,
    });
  }
}

export const Materials = new MaterialLibrary();
