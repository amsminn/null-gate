import * as THREE from 'three';
import { ChamberBuilder } from '../world/ChamberBuilder';
import { CollisionSystem } from '../physics/CollisionSystem';
import { ProceduralAudio } from '../audio/ProceduralAudio';
import { LevelDef, LevelRuntime } from '../levels/LevelTypes';
import { PlayerController } from '../player/PlayerController';
import { aabbContains, aabbOverlapsCenterHalf } from '../utils/math';

export interface LevelEvents {
  onExit(): void;
  onRespawn(): void;
}

/**
 * Owns the lifetime of one chamber: build, per-frame puzzle logic
 * (buttons/doors/conduits/exit/respawn volumes), teardown.
 */
export class LevelManager {
  builder: ChamberBuilder | null = null;
  runtime: LevelRuntime | null = null;
  def: LevelDef | null = null;
  index = 0;
  private scene: THREE.Scene;
  private collision: CollisionSystem;
  private audio: ProceduralAudio;
  private exitFired = false;

  constructor(scene: THREE.Scene, collision: CollisionSystem, audio: ProceduralAudio) {
    this.scene = scene;
    this.collision = collision;
    this.audio = audio;
  }

  load(def: LevelDef, index: number): LevelRuntime {
    this.unload();
    this.def = def;
    this.index = index;
    this.builder = new ChamberBuilder(this.scene, this.collision);
    this.runtime = def.build({ builder: this.builder, collision: this.collision, audio: this.audio });
    this.exitFired = false;
    return this.runtime;
  }

  unload(): void {
    // colliders include door colliders created during build — clear everything
    this.collision.clear();
    this.builder?.dispose();
    this.builder = null;
    this.runtime = null;
  }

  update(dt: number, time: number, player: PlayerController, events: LevelEvents): void {
    const rt = this.runtime;
    if (!rt || !this.builder) return;

    // weight bodies = player + all cubes
    const bodies = [
      { position: player.position, half: player.half },
      ...rt.cubes.map((c) => ({ position: c.body.position, half: c.body.half })),
    ];
    for (const b of rt.buttons) b.update(dt, bodies);
    for (const d of rt.doors) d.update(dt, player.position);
    for (const link of rt.links) link.line.active = link.button.pressed;
    this.builder.update(dt, time);

    // cube housekeeping: energize while powering a node, recover if lost
    for (const c of rt.cubes) {
      const powering = rt.buttons.some(
        (b) =>
          b.pressed &&
          Math.hypot(c.body.position.x - b.position.x, c.body.position.z - b.position.z) < 0.85
      );
      c.setEnergized(powering);
      if (c.body.position.y < -40) c.resetToSpawn();
    }

    // exit volume
    if (!this.exitFired && aabbOverlapsCenterHalf(rt.exitZone, player.position, player.half)) {
      this.exitFired = true;
      events.onExit();
    }

    // respawn volumes (timed, so high-speed pass-throughs never trigger)
    for (const r of rt.respawns) {
      if (aabbContains(r, player.position)) {
        r.timer += dt;
        if (r.timer >= r.delay) {
          r.timer = 0;
          events.onRespawn();
          break;
        }
      } else {
        r.timer = 0;
      }
    }
  }
}
