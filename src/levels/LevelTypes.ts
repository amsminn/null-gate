import * as THREE from 'three';
import { ChamberBuilder, TraceLine } from '../world/ChamberBuilder';
import { CollisionSystem } from '../physics/CollisionSystem';
import { ProceduralAudio } from '../audio/ProceduralAudio';
import { Cube } from '../objects/Cube';
import { PressureButton } from '../objects/Button';
import { Door } from '../objects/Door';

export interface LevelContext {
  builder: ChamberBuilder;
  collision: CollisionSystem;
  audio: ProceduralAudio;
}

/** Powered conduit visual driven by a button's state. */
export interface LevelLink {
  line: TraceLine;
  button: PressureButton;
}

/** Volume that respawns the player after `delay` seconds of continuous presence. */
export interface RespawnVolume {
  min: THREE.Vector3;
  max: THREE.Vector3;
  delay: number;
  timer: number;
}

export interface LevelRuntime {
  playerStart: THREE.Vector3;
  playerYaw: number;
  cubes: Cube[];
  buttons: PressureButton[];
  doors: Door[];
  links: LevelLink[];
  exitZone: { min: THREE.Vector3; max: THREE.Vector3 };
  respawns: RespawnVolume[];
}

export interface LevelDef {
  id: string;
  name: string;
  objective: string;
  build(ctx: LevelContext): LevelRuntime;
}

export const respawnVolume = (
  min: [number, number, number],
  max: [number, number, number],
  delay: number
): RespawnVolume => ({
  min: new THREE.Vector3(...min),
  max: new THREE.Vector3(...max),
  delay,
  timer: 0,
});

export const zone = (
  min: [number, number, number],
  max: [number, number, number]
): { min: THREE.Vector3; max: THREE.Vector3 } => ({
  min: new THREE.Vector3(...min),
  max: new THREE.Vector3(...max),
});
