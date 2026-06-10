import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { InputManager } from '../input/InputManager';
import { CollisionSystem } from '../physics/CollisionSystem';
import { PlayerController } from '../player/PlayerController';
import { PortalGun } from '../player/PortalGun';
import { PortalSystem, PortalTraveler } from '../portal/PortalSystem';
import { Portal, PortalKind, PORTAL_COLORS } from '../portal/Portal';
import { PortalEffects } from '../effects/PortalEffects';
import { PostProcessing } from '../effects/PostProcessing';
import { ProceduralAudio } from '../audio/ProceduralAudio';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { GameStateStore } from './GameState';
import { LevelManager } from './LevelManager';
import { LEVELS, COMBINED_TEST_LEVEL } from '../levels/levels';
import { LevelDef } from '../levels/LevelTypes';
import { Cube } from '../objects/Cube';
import { Interactable } from '../objects/Interactable';
import { DebugOverlay } from '../utils/debug';

type Status = 'menu' | 'playing' | 'paused' | 'transition' | 'complete';

const CENTER_NDC = new THREE.Vector2(0, 0);

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private time = 0;

  private input: InputManager;
  private collision = new CollisionSystem();
  private player: PlayerController;
  private gun: PortalGun;
  private portals: PortalSystem;
  private effects: PortalEffects;
  private post: PostProcessing;
  private audio = new ProceduralAudio();
  private hud: HUD;
  private menu: Menu;
  private state = new GameStateStore();
  private levels: LevelManager;
  private debug: DebugOverlay;

  private status: Status = 'menu';
  private isCombinedTest = false;
  private heldCube: Cube | null = null;
  private menuDrift = 0;
  private playerTraveler: PortalTraveler;
  private interactRay = new THREE.Raycaster();
  /** flat list rebuilt per level — raycasting the whole scene graph every
   *  frame allocates and traverses far more than needed */
  private interactTargets: THREE.Object3D[] = [];

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    // VSM: depth-distribution shadows are immune to the grazing-angle acne
    // (checkerboard shimmer) that plagued PCF on vertical pit faces lit from above
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d0f);
    this.scene.fog = new THREE.Fog(0x0b0d0f, 38, 110);
    // procedural IBL: glossy shells, glass and brushed metal pick up soft reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.18;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 220);
    // the camera must live in the scene graph so viewmodel children render
    this.scene.add(this.camera);

    this.input = new InputManager(this.renderer.domElement);
    this.player = new PlayerController(this.camera);
    this.gun = new PortalGun(this.camera);
    this.gun.setVisible(false);
    this.effects = new PortalEffects(this.scene);
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);
    this.hud = new HUD(document.body);
    this.debug = new DebugOverlay(document.body);
    this.levels = new LevelManager(this.scene, this.collision, this.audio);
    this.interactRay.far = 3.6;

    this.portals = new PortalSystem(this.scene, this.effects, this.audio, {
      onInvalid: (msg) => this.hud.showMessage(msg),
      onPlaced: () => this.refreshPortalHud(),
    });

    this.playerTraveler = {
      id: 'player',
      position: this.player.position,
      velocity: this.player.velocity,
      onTeleport: (pos, vel, rot, outPortal: Portal) => {
        this.player.applyPortalTransform(pos, vel, rot, outPortal);
        const css = outPortal.kind === 'blue' ? 'rgba(60,140,255,0.5)' : 'rgba(255,161,60,0.5)';
        this.hud.flash(css, 0.3);
      },
    };

    this.player.onJump = () => this.audio.jump();
    this.player.onLand = (i) => this.audio.land(i);

    this.state.load();
    this.menu = new Menu(document.body, this.state.settings, {
      onNewTest: () => this.startRun(0, false),
      onContinue: () => this.startRun(Math.min(this.state.unlocked, LEVELS.length - 1), false),
      onCombinedTest: () => this.startRun(0, true),
      onResume: () => this.input.requestLock(),
      onRestart: () => {
        this.restartLevel();
        this.menu.hideAll();
        this.input.requestLock();
        this.status = 'playing';
      },
      onQuitToMenu: () => this.quitToMenu(),
      onSettingsChanged: () => {
        this.applySettings();
        this.state.save();
      },
      onAnyClick: () => this.audio.unlock(),
    });

    this.input.onLockChange = (locked) => {
      if (!locked && this.status === 'playing') {
        this.status = 'paused';
        this.menu.showPause();
        this.hud.hide();
      } else if (locked && this.status === 'paused') {
        this.status = 'playing';
        this.menu.hideAll();
        this.hud.show();
      }
    };

    // clicking the scene while playing without pointer lock re-captures the cursor
    // (covers browsers that rejected the initial lock request or relock cooldowns)
    this.renderer.domElement.addEventListener('mousedown', () => {
      if (this.status === 'playing' && !this.input.locked) this.input.requestLock();
    });

    window.addEventListener('resize', () => this.onResize());
    this.applySettings();

    // backdrop chamber behind the main menu
    this.loadLevel(LEVELS[0], 0);
    this.menu.showMain(this.state.unlocked);
    this.hud.setFade(false);
  }

  /* ------------------------------------------------ flow ---------- */

  private currentDef(): LevelDef {
    return this.isCombinedTest ? COMBINED_TEST_LEVEL : LEVELS[this.levels.index];
  }

  private loadLevel(def: LevelDef, index: number): void {
    this.heldCube = null;
    this.portals.reset();
    this.effects.clear();
    const rt = this.levels.load(def, index);
    // closed doors must block portal shots
    if (this.levels.builder) {
      for (const d of rt.doors) this.levels.builder.shootables.push(...d.getBlockingMeshes());
      // interaction ray targets: walls/glass (for occlusion) + everything tagged interactive
      this.interactTargets = [...this.levels.builder.shootables];
      this.levels.builder.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.userData.interact && !this.interactTargets.includes(o)) {
          this.interactTargets.push(o);
        }
      });
    }
    this.player.resetTo(rt.playerStart, rt.playerYaw);
    this.hud.setLevel(def.id, def.name);
    this.hud.setObjective(def.objective);
    this.refreshPortalHud();
  }

  private startRun(index: number, combinedTest: boolean): void {
    this.audio.unlock();
    this.isCombinedTest = combinedTest;
    this.loadLevel(combinedTest ? COMBINED_TEST_LEVEL : LEVELS[index], index);
    this.menu.hideAll();
    this.hud.show();
    this.hud.setFade(false);
    this.status = 'playing';
    this.gun.setVisible(true);
    this.input.requestLock();
    this.hud.showMessage(
      combinedTest
        ? 'COMBINED PROTOCOL INITIATED'
        : 'FIRE AT BRIGHT PANELS — LMB BLUE / RMB AMBER',
      3.4,
      '#3ce0ff'
    );
  }

  private restartLevel(): void {
    this.loadLevel(this.currentDef(), this.levels.index);
  }

  private quitToMenu(): void {
    this.status = 'menu';
    this.input.releaseLock();
    this.hud.hide();
    this.gun.setVisible(false);
    this.isCombinedTest = false;
    this.loadLevel(LEVELS[0], 0);
    this.menu.showMain(this.state.unlocked);
  }

  private onLevelExit(): void {
    this.audio.levelComplete();
    const lastIndex = LEVELS.length - 1;
    if (this.isCombinedTest || this.levels.index >= lastIndex) {
      if (!this.isCombinedTest) this.state.unlock(lastIndex);
      this.status = 'complete';
      this.input.releaseLock();
      this.hud.hide();
      this.gun.setVisible(false);
      this.menu.showComplete();
      return;
    }
    const next = this.levels.index + 1;
    this.state.unlock(next);
    this.status = 'transition';
    this.hud.setFade(true);
    window.setTimeout(() => {
      this.loadLevel(LEVELS[next], next);
      this.hud.setFade(false);
      if (this.status === 'transition') this.status = 'playing';
    }, 520);
  }

  private onRespawn(): void {
    const rt = this.levels.runtime;
    if (!rt) return;
    this.audio.respawn();
    this.hud.flash('rgba(255,90,60,0.45)', 0.4);
    this.hud.showMessage('TRAJECTORY RESET — RETRY', 2.0);
    if (this.heldCube) {
      this.heldCube.setHeld(false);
      this.heldCube = null;
    }
    this.player.resetTo(rt.playerStart, rt.playerYaw);
    this.portals.clearCrossings();
  }

  /* ------------------------------------------------ settings ------ */

  private applySettings(): void {
    const s = this.state.settings;
    this.player.sensitivity = s.sensitivity;
    this.input.rawInput = s.rawInput; // applies on the next pointer lock
    this.post.setBloom(s.bloom);
    if (this.renderer.shadowMap.enabled !== s.shadows) {
      this.renderer.shadowMap.enabled = s.shadows;
      this.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.needsUpdate = true;
        }
      });
    }
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.setSize(window.innerWidth, window.innerHeight);
  }

  private refreshPortalHud(): void {
    this.hud.setPortals(this.portals.blue.active, this.portals.amber.active);
  }

  /* ------------------------------------------------ loop ---------- */

  start(): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    if (this.status === 'playing') {
      this.updatePlaying(dt);
    } else if (this.status === 'menu' || this.status === 'complete') {
      this.updateMenuCamera(dt);
      this.levels.builder?.update(dt, this.time);
      this.portals.update(dt, []);
    } else {
      // paused / transition: keep portals shimmering, world frozen
      this.portals.update(dt, []);
    }

    this.effects.update(dt);
    this.hud.update(dt);
    this.debug.update(dt, {
      pos: this.player.position,
      vel: this.player.velocity,
      level: this.levels.def ? `${this.levels.def.id} ${this.levels.def.name}` : '—',
      grounded: this.player.grounded,
    });
    this.post.render();
    this.input.endFrame();
  }

  private updateMenuCamera(dt: number): void {
    this.menuDrift += dt;
    const rt = this.levels.runtime;
    if (!rt) return;
    const base = rt.playerStart;
    this.camera.position.set(base.x, base.y + 1.9 + Math.sin(this.menuDrift * 0.23) * 0.18, base.z);
    const yaw = rt.playerYaw + Math.sin(this.menuDrift * 0.11) * 0.55;
    const pitch = -0.04 + Math.sin(this.menuDrift * 0.17) * 0.05;
    this.camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  }

  private updatePlaying(dt: number): void {
    const rt = this.levels.runtime;
    const builder = this.levels.builder;
    if (!rt || !builder) return;

    // hotkeys
    if (this.input.wasPressed('KeyR')) {
      this.restartLevel();
      this.hud.showMessage('CHAMBER RESET', 1.4);
      return;
    }
    if (this.input.wasPressed('KeyH')) this.hud.toggleControls();
    if (this.input.wasPressed('F3')) this.debug.toggle();

    // player movement (portal footprints punch temporary holes in collision)
    const playerExcl = this.portals.getExclusions(this.player.position, 'player');
    this.player.update(dt, this.input, this.collision, playerExcl);
    this.gun.update(dt, this.player, this.time);

    // held cube follows the camera anchor
    if (this.heldCube) {
      const anchor = new THREE.Vector3();
      this.camera.getWorldDirection(anchor);
      anchor.multiplyScalar(1.7).add(this.player.eyePosition()).add(new THREE.Vector3(0, -0.15, 0));
      this.heldCube.setHoldTarget(anchor);
      if (this.heldCube.distanceTo(this.player.eyePosition()) > 3.4) {
        this.heldCube.setHeld(false);
        this.heldCube = null;
        this.audio.drop();
      }
    }

    // cube physics
    for (const c of rt.cubes) {
      const excl = this.portals.getExclusions(c.body.position, `cube-${rt.cubes.indexOf(c)}`);
      c.update(dt, this.collision, excl);
    }

    // portal traversal (player + free cubes)
    const travelers: PortalTraveler[] = [this.playerTraveler];
    for (const c of rt.cubes) {
      if (c.held) continue;
      travelers.push({
        id: `cube-${rt.cubes.indexOf(c)}`,
        position: c.body.position,
        velocity: c.body.velocity,
        onTeleport: (pos, vel) => {
          c.body.position.copy(pos);
          c.body.velocity.copy(vel);
        },
      });
    }
    this.portals.update(dt, travelers);

    // shooting
    if (this.input.leftPressed) this.firePortal('blue');
    if (this.input.rightPressed) this.firePortal('amber');

    // interaction prompt + E
    this.updateInteraction(rt.cubes);

    // puzzle logic, exit, respawn
    this.levels.update(dt, this.time, this.player, {
      onExit: () => this.onLevelExit(),
      onRespawn: () => this.onRespawn(),
    });

    this.refreshPortalHud();

    // playing but the browser holds no pointer lock: clicks would be ignored,
    // so surface the recovery action instead of failing silently
    if (!this.input.locked) {
      this.hud.setPrompt('CLICK SCENE TO CAPTURE CURSOR — THEN LMB / RMB FIRES APERTURES');
    }
  }

  /** Shoot from the viewmodel muzzle: recoil, muzzle flash, then the projectile. */
  private firePortal(kind: PortalKind): void {
    const builder = this.levels.builder;
    if (!builder) return;
    const muzzle = this.gun.muzzleWorld();
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    this.gun.fire(kind);
    this.effects.burst(muzzle, fwd, PORTAL_COLORS[kind], 8, 1.1);
    this.portals.shoot(kind, this.camera, builder.shootables, muzzle);
  }

  private updateInteraction(cubes: Cube[]): void {
    this.interactRay.setFromCamera(CENTER_NDC, this.camera);
    const hits = this.interactRay.intersectObjects(this.interactTargets, false);
    const hit = hits[0];
    const interact = hit?.object.userData.interact as Interactable | undefined;

    if (this.heldCube) {
      this.hud.setPrompt('RELEASE TEST OBJECT', 'E');
      if (this.input.wasPressed('KeyE')) {
        const fwd = new THREE.Vector3();
        this.camera.getWorldDirection(fwd);
        this.heldCube.body.velocity.copy(fwd.multiplyScalar(3));
        this.heldCube.setHeld(false);
        this.heldCube = null;
        this.audio.drop();
      }
      return;
    }

    if (interact) {
      const text = interact.prompt();
      this.hud.setPrompt(text, interact.interactKind === 'cube' ? 'E' : undefined);
      if (interact.interactKind === 'cube' && this.input.wasPressed('KeyE')) {
        const cube = hit!.object.userData.cubeRef as Cube;
        if (cubes.includes(cube)) {
          this.heldCube = cube;
          cube.setHeld(true);
          this.audio.pickup();
        }
      }
    } else {
      this.hud.setPrompt(null);
    }
  }
}
