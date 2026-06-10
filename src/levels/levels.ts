import * as THREE from 'three';
import { LevelContext, LevelDef, LevelRuntime, respawnVolume, zone } from './LevelTypes';
import { Cube } from '../objects/Cube';
import { PressureButton } from '../objects/Button';
import { Door } from '../objects/Door';
import { yawFacing } from '../utils/math';

/**
 * All chambers are hand-placed axis-aligned geometry. Conventions:
 *  - wall thickness 0.4, floors have their walkable surface at the stated Y
 *  - bright `white` blocks are portal-compatible; `dark` blocks are not
 *  - fling trajectories were solved analytically for GRAVITY = 18:
 *    fall height h gives entry speed v = sqrt(2*18*h), preserved on exit.
 */

/** Short glowing exit corridor behind a door in a +X wall. Returns the exit zone. */
function exitCorridorX(
  ctx: LevelContext,
  wallX: number, // inner face of the wall (wall occupies wallX .. wallX+0.4)
  floorY: number,
  zc: number,
  h: number
): { min: THREE.Vector3; max: THREE.Vector3 } {
  const b = ctx.builder;
  const x0 = wallX + 0.4;
  const x1 = x0 + 2.8;
  b.block([x0, floorY - 0.4, zc - 1.3], [x1, floorY, zc + 1.3], 'floor', { portalable: false });
  b.block([x0, floorY, zc - 1.7], [x1, floorY + h, zc - 1.3], 'dark');
  b.block([x0, floorY, zc + 1.3], [x1, floorY + h, zc + 1.7], 'dark');
  b.block([x0, floorY + h, zc - 1.7], [x1, floorY + h + 0.4, zc + 1.7], 'dark');
  b.block([x1, floorY, zc - 1.7], [x1 + 0.4, floorY + h, zc + 1.7], 'dark');
  // glowing terminus panel — reads as "exit" from across the chamber
  b.lightStrip([x1 - 0.06, floorY + 0.4, zc - 0.9], [x1, floorY + h - 0.4, zc + 0.9], 0xd9f4ff, 2.4);
  b.lightStrip([x0, floorY + h - 0.12, zc - 1.3], [x1, floorY + h - 0.04, zc - 1.24], 0x9fdcff, 2.2);
  b.lightStrip([x0, floorY + h - 0.12, zc + 1.24], [x1, floorY + h - 0.04, zc + 1.3], 0x9fdcff, 2.2);
  return zone([x0 + 1.0, floorY, zc - 1], [x1 - 0.2, floorY + h - 0.3, zc + 1]);
}

/* ================================================================== */
/* LEVEL 1 — FIRST CONNECTION                                          */
/* ================================================================== */
const level1: LevelDef = {
  id: 'NG-01',
  name: 'FIRST CONNECTION',
  objective: 'Link the *blue* and *amber* apertures on the bright panels. Step through to reach the egress ledge.',
  build(ctx: LevelContext): LevelRuntime {
    const b = ctx.builder;
    b.hemi(0.6);

    // shell: interior x[-8,8] z[-5,5] y[0,6]
    b.block([-8.4, -0.4, -5.4], [8.4, 0, 5.4], 'floor', { portalable: false });
    b.block([-8.4, 6, -5.4], [8.4, 6.4, 5.4], 'ceil', { portalable: false });
    // west wall — fully portal-compatible
    b.block([-8.4, 0, -5.4], [-8, 6, 5.4], 'white', { portalable: true });
    // raised egress ledge (dark, non-portalable face teaches surface language)
    b.block([4, 0, -5], [8, 3, 5], 'dark');
    // east wall with door opening (y 3..5.6, z -1.1..1.1)
    b.block([8, 0, -5.4], [8.4, 3, 5.4], 'dark');
    b.block([8, 5.6, -5.4], [8.4, 6, 5.4], 'dark');
    b.block([8, 3, -5.4], [8.4, 5.6, -1.1], 'dark');
    b.block([8, 3, 1.1], [8.4, 5.6, 5.4], 'dark');
    // south wall: dark below / white panel field above the ledge
    b.block([-8, 0, -5.4], [4.5, 6, -5], 'dark');
    b.block([4.5, 0, -5.4], [8, 3, -5], 'dark');
    b.block([4.5, 3, -5.4], [8, 6, -5], 'white', { portalable: true });
    // north wall with observation window (x -3..1, y 1.4..3.4)
    b.block([-8, 0, 5], [-3, 6, 5.4], 'dark');
    b.block([1, 0, 5], [8, 6, 5.4], 'dark');
    b.block([-3, 3.4, 5], [1, 6, 5.4], 'dark');
    b.block([-3, 0, 5], [1, 1.4, 5.4], 'dark');
    b.observationRoom(-1, 2.4, 5.15, 4, 2, 2.4, 0);

    // decoration
    b.sign(['01', 'FIRST CONNECTION'], -5.5, 2.8, 4.97, Math.PI);
    b.floorLine([[-6, 0], [2, 0], [2, -3.4]]);
    b.stripes(3.3, -5, 4, 5);
    b.lightStrip([-7.8, 5.5, -5.02], [7.8, 5.66, -4.94]);
    b.lightStrip([-7.8, 5.5, 4.94], [7.8, 5.66, 5.02]);
    b.lightStrip([-8.02, 5.5, -4.9], [-7.94, 5.66, 4.9], 0x9fdcff, 2.0);
    b.vent(6.4, 5.1, 4.96, Math.PI);
    b.vent(-6.5, 0.6, -4.96, 0);
    b.pipe([-8, 4.84, -4.97], [-1, 4.98, -4.9]);
    b.ceilingLight(-3.5, 0, 5.94, 3.4, 0.9);
    b.ceilingLight(2.5, 0, 5.94, 3.4, 0.9);
    b.pointLight(-3.5, 5.1, 0, 55);
    b.pointLight(2.5, 5.1, 0, 45);
    b.pointLight(6, 4.9, 0, 12, 0xbfe8ff, false, 9);

    const door = new Door(b.root, ctx.collision, ctx.audio, {
      axis: 'x',
      center: [8.2, 3, 0],
      width: 2.2,
      height: 2.6,
      mode: 'proximity',
      radius: 3.5,
    });
    const exitZone = exitCorridorX(ctx, 8, 3, 0, 2.6);

    return {
      playerStart: new THREE.Vector3(-6.5, 0, 0),
      playerYaw: yawFacing(1, 0),
      cubes: [],
      buttons: [],
      doors: [door],
      links: [],
      exitZone,
      respawns: [],
    };
  },
};

/* ================================================================== */
/* LEVEL 2 — WEIGHTED TRIGGER                                          */
/* ================================================================== */
const level2: LevelDef = {
  id: 'NG-02',
  name: 'WEIGHTED TRIGGER',
  objective: 'Place the *test object* on the pressure node to unseal the egress door.',
  build(ctx: LevelContext): LevelRuntime {
    const b = ctx.builder;
    b.hemi(0.6);

    // shell: interior x[-7,7] z[-6,6] y[0,5]
    b.block([-7.4, -0.4, -6.4], [7.4, 0, 6.4], 'floor', { portalable: false });
    b.block([-7.4, 5, -6.4], [7.4, 5.4, 6.4], 'ceil', { portalable: false });
    b.block([-7.4, 0, -6.4], [-7, 5, 6.4], 'white', { portalable: true });
    // south wall: half dark, half white
    b.block([-7, 0, -6.4], [-2, 5, -6], 'dark');
    b.block([-2, 0, -6.4], [7, 5, -6], 'white', { portalable: true });
    // north wall with observation window (x -2..2, y 1.4..3.4)
    b.block([-7, 0, 6], [-2, 5, 6.4], 'dark');
    b.block([2, 0, 6], [7, 5, 6.4], 'dark');
    b.block([-2, 3.4, 6], [2, 5, 6.4], 'dark');
    b.block([-2, 0, 6], [2, 1.4, 6.4], 'dark');
    b.observationRoom(0, 2.4, 6.15, 4, 2, 2.4, 0);
    // east wall with floor-level door opening (z -1.1..1.1, y 0..3)
    b.block([7, 3, -6.4], [7.4, 5, 6.4], 'dark');
    b.block([7, 0, -6.4], [7.4, 3, -1.1], 'dark');
    b.block([7, 0, 1.1], [7.4, 3, 6.4], 'dark');

    // decoration
    b.sign(['02', 'WEIGHTED TRIGGER'], -4.5, 2.8, 5.97, Math.PI);
    b.floorLine([[-5, 0], [-4.5, 0], [-4.5, -2.6]]);
    b.stripes(6.2, -1.3, 7, 1.3);
    b.lightStrip([-6.8, 4.5, -6.02], [6.8, 4.66, -5.94]);
    b.lightStrip([-6.8, 4.5, 5.94], [6.8, 4.66, 6.02]);
    b.vent(5.5, 4.2, 5.96, Math.PI);
    b.pipe([-7, 4.2, 5.9], [3, 4.34, 5.97]);
    // cube dais
    b.stripes(-5.3, -4.3, -3.7, -2.7);
    b.lightStrip([-6.98, 0.3, -4.2], [-6.92, 3.4, -4.06], 0x36d8e8, 2.0);
    b.ceilingLight(-3, 0, 4.94, 3.2, 0.9);
    b.ceilingLight(3, 0, 4.94, 3.2, 0.9);
    b.pointLight(-3, 4.3, 0, 50);
    b.pointLight(3.4, 4.3, 0.6, 45);

    const cube = new Cube(b.root, -4.5, 0, -3.5);
    const button = new PressureButton(b.root, ctx.audio, 2.5, 0, 3);
    const line = b.traceLine([[2.5, 3], [2.5, 0], [6.9, 0]]);
    const door = new Door(b.root, ctx.collision, ctx.audio, {
      axis: 'x',
      center: [7.2, 0, 0],
      width: 2.2,
      height: 3,
      mode: 'buttons',
      buttons: [button],
    });
    const exitZone = exitCorridorX(ctx, 7, 0, 0, 3);

    return {
      playerStart: new THREE.Vector3(-5.5, 0, 2),
      playerYaw: yawFacing(1, -0.4),
      cubes: [cube],
      buttons: [button],
      doors: [door],
      links: [{ line, button }],
      exitZone,
      respawns: [],
    };
  },
};

/* ================================================================== */
/* LEVEL 3 — MOMENTUM TRANSFER                                         */
/*  start platform top y=8 -> pit floor y=-5 gives ~21.6 m/s entry;    */
/*  launch panel (west wall, y 8..13.5) converts it to +X velocity     */
/*  landing on the y=3 platform at x ≈ 2..16.                          */
/* ================================================================== */
const level3: LevelDef = {
  id: 'NG-03',
  name: 'MOMENTUM TRANSFER',
  objective: 'Aperture on the *pit floor*, aperture on the *high wall* behind you. Drop in — momentum does the rest.',
  build(ctx: LevelContext): LevelRuntime {
    const b = ctx.builder;
    b.hemi(0.55);

    // hall shell: interior x[-16,16] z[-6,6] y[0..14]
    b.block([-16.4, 14, -6.4], [16.4, 14.4, 6.4], 'ceil', { portalable: false });
    // start platform (solid block, top y=8)
    b.block([-16.4, -0.4, -6.4], [-12, 8, 6.4], 'dark');
    // floor with pit opening x[-11,-5] z[-2,2]
    b.block([-12, -0.4, -6.4], [-11, 0, 6.4], 'floor', { portalable: false });
    b.block([-4, -0.4, -6.4], [16.4, 0, 6.4], 'floor', { portalable: false });
    b.block([-11, -0.4, -6.4], [-4, 0, -2], 'floor', { portalable: false });
    b.block([-11, -0.4, 2], [-4, 0, 6.4], 'floor', { portalable: false });
    // pit shaft (depth 5, 7m long so sprint walk-offs still drop in) + white pit floor.
    // Shaft walls stop at the floor's UNDERSIDE (-0.4): extending them to y=0 would
    // render coplanar with the floor's cut faces and z-fight (view-angle grid flicker).
    b.block([-11.4, -5, -2.4], [-11, -0.4, 2.4], 'dark');
    b.block([-4, -5, -2.4], [-3.6, -0.4, 2.4], 'dark');
    b.block([-11.4, -5, -2.4], [-3.6, -0.4, -2], 'dark');
    b.block([-11.4, -5, 2], [-3.6, -0.4, 2.4], 'dark');
    b.block([-11.4, -5.4, -2.4], [-3.6, -5, 2.4], 'white', { portalable: true });
    // pit shaft light ring so the white floor reads from above
    b.lightStrip([-11, -0.5, -2.04], [-4, -0.34, -1.96], 0x9fdcff, 2.2);
    b.lightStrip([-11, -0.5, 1.96], [-4, -0.34, 2.04], 0x9fdcff, 2.2);
    // west wall: launch panel field above the platform
    b.block([-16.4, 8, -4], [-16, 13.5, 4], 'white', { portalable: true });
    b.block([-16.4, 8, -6.4], [-16, 14, -4], 'dark');
    b.block([-16.4, 8, 4], [-16, 14, 6.4], 'dark');
    b.block([-16.4, 13.5, -4], [-16, 14, 4], 'dark');
    // landing platform (top y=3) flush with the pit's east rim so capped-speed
    // flings (16 m/s) land on it across the whole valid launch-portal range
    b.block([-3.6, 0, -6], [16, 3, 6], 'dark');
    // east wall with door opening at platform level (y 3..5.6)
    b.block([16, 5.6, -6.4], [16.4, 14, 6.4], 'dark');
    b.block([16, 0, -6.4], [16.4, 3, 6.4], 'dark');
    b.block([16, 3, -6.4], [16.4, 5.6, -1.1], 'dark');
    b.block([16, 3, 1.1], [16.4, 5.6, 6.4], 'dark');
    // south wall plain dark; north wall with high observation room (x -2..4, y 9..11.5)
    b.block([-16, 0, -6.4], [16, 14, -6], 'dark');
    b.block([-16, 0, 6], [-2, 14, 6.4], 'dark');
    b.block([4, 0, 6], [16, 14, 6.4], 'dark');
    b.block([-2, 0, 6], [4, 9, 6.4], 'dark');
    b.block([-2, 11.5, 6], [4, 14, 6.4], 'dark');
    b.observationRoom(1, 10.25, 6.15, 6, 2.5, 2.6, 0);

    // decoration
    b.sign(['03', 'MOMENTUM TRANSFER'], -13.5, 9.8, -5.97, 0);
    b.stripes(-12, -6, -11.2, 6, 8.011); // platform edge
    // hazard bands tile around the pit without overlapping (coplanar overlap z-fights)
    b.stripes(-11.8, -2.8, -11, 2.8);
    b.stripes(-4, -2.8, -3.2, 2.8);
    b.stripes(-11, -2.8, -4, -2);
    b.stripes(-11, 2, -4, 2.8);
    b.stripes(-3.6, -6, -2.8, 6, 3.011); // landing platform edge
    b.floorLine([[-15, 0], [-12.4, 0]], 0x35e0ff, 8.013);
    b.lightStrip([-15.8, 13.2, -5.9], [15.8, 13.36, -5.82], 0x9fdcff, 2.0);
    b.pipe([-16, 12.9, -5.96], [10, 13.04, -5.9]);
    b.vent(8, 12.6, -5.96, 0);
    b.ceilingLight(-8, 0, 13.94, 4, 1);
    b.ceilingLight(8, 0, 13.94, 4, 1);
    b.pointLight(-8, 12.4, 0, 95);
    b.pointLight(8, 12.4, 0, 95);
    b.pointLight(-8, -3.4, 0, 26, 0x9fdcff, false, 10); // pit fill light

    const door = new Door(b.root, ctx.collision, ctx.audio, {
      axis: 'x',
      center: [16.2, 3, 0],
      width: 2.2,
      height: 2.6,
      mode: 'proximity',
      radius: 3.5,
    });
    const exitZone = exitCorridorX(ctx, 16, 3, 0, 2.6);

    return {
      playerStart: new THREE.Vector3(-14.5, 8, 0),
      playerYaw: yawFacing(1, 0),
      cubes: [],
      buttons: [],
      doors: [door],
      links: [],
      exitZone,
      respawns: [
        // missed fling: low ground around the pit
        respawnVolume([-12, 0, -6.5], [-3.6, 1.4, 6.5], 1.4),
        // resting at the bottom of the pit without an exit aperture
        respawnVolume([-11.4, -5, -2.4], [-3.6, -3.6, 2.4], 0.8),
      ],
    };
  },
};

/* ================================================================== */
/* LEVEL 4 — FINAL CHAMBER                                             */
/* ================================================================== */
const level4: LevelDef = {
  id: 'NG-04',
  name: 'FINAL CHAMBER',
  objective: 'Retrieve the object from the alcove, power the node, then ride momentum to the egress ledge.',
  build(ctx: LevelContext): LevelRuntime {
    const b = ctx.builder;
    b.hemi(0.58);

    /* ---- ROOM A: interior x[-10,0] z[-5,5] y[0,6] ---- */
    b.block([-10.4, -0.4, -5.4], [0, 0, 5.4], 'floor', { portalable: false });
    b.block([-10.4, 6, -5.4], [0.2, 6.4, 5.4], 'ceil', { portalable: false });
    // west wall: white field above the cube alcove
    b.block([-10.4, 3, -5.4], [-10, 6, -1.5], 'white', { portalable: true });
    b.block([-10.4, 0, -5.4], [-10, 3, 5.4], 'dark');
    b.block([-10.4, 3, -1.5], [-10, 6, 5.4], 'dark');
    // cube alcove ledge (top y=3)
    b.block([-10, 0, -5], [-8.5, 3, -2], 'dark');
    // south wall: ground-level white field for the alcove hop
    b.block([-10, 0, -5.4], [-7, 6, -5], 'dark');
    b.block([-7, 0, -5.4], [-2, 6, -5], 'white', { portalable: true });
    b.block([-2, 0, -5.4], [0, 6, -5], 'dark');
    // north wall with observation window (x -7..-3, y 1.4..3.4)
    b.block([-10, 0, 5], [-7, 6, 5.4], 'dark');
    b.block([-3, 0, 5], [0, 6, 5.4], 'dark');
    b.block([-7, 3.4, 5], [-3, 6, 5.4], 'dark');
    b.block([-7, 0, 5], [-3, 1.4, 5.4], 'dark');
    b.observationRoom(-5, 2.4, 5.15, 4, 2, 2.4, 0);

    /* ---- divider wall x[0,0.4] (Room B face carries the launch panel) ---- */
    b.block([0, 0, -5.4], [0.4, 3, -1.1], 'dark');
    b.block([0, 0, 1.1], [0.4, 3, 5.4], 'dark');
    b.block([0, 3, -5.4], [0.4, 5.5, 5.4], 'dark');
    b.block([0, 5.5, -3.5], [0.4, 10.5, 3.5], 'white', { portalable: true });
    b.block([0, 5.5, -5.4], [0.4, 10.5, -3.5], 'dark');
    b.block([0, 5.5, 3.5], [0.4, 10.5, 5.4], 'dark');
    b.block([0, 10.5, -5.4], [0.4, 11, 5.4], 'dark');

    /* ---- ROOM B: interior x[0.4,12] z[-5,5] y[0,11] ---- */
    b.block([0.2, 11, -5.4], [12.4, 11.4, 5.4], 'ceil', { portalable: false });
    // floor with pit opening x[2,6] z[-2,2]
    b.block([0.4, -0.4, -5.4], [2, 0, 5.4], 'floor', { portalable: false });
    b.block([6, -0.4, -5.4], [12.4, 0, 5.4], 'floor', { portalable: false });
    b.block([2, -0.4, -5.4], [6, 0, -2], 'floor', { portalable: false });
    b.block([2, -0.4, 2], [6, 0, 5.4], 'floor', { portalable: false });
    // pit shaft (depth 8) + portal-compatible pit floor
    // (shaft tops at -0.4 — flush with the floor underside, never coplanar with its cut faces)
    b.block([1.6, -8, -2.4], [2, -0.4, 2.4], 'dark');
    b.block([6, -8, -2.4], [6.4, -0.4, 2.4], 'dark');
    b.block([1.6, -8, -2.4], [6.4, -0.4, -2], 'dark');
    b.block([1.6, -8, 2], [6.4, -0.4, 2.4], 'dark');
    b.block([1.6, -8.4, -2.4], [6.4, -8, 2.4], 'white', { portalable: true });
    b.lightStrip([2, -0.5, -2.04], [6, -0.34, -1.96], 0x9fdcff, 2.2);
    b.lightStrip([2, -0.5, 1.96], [6, -0.34, 2.04], 0x9fdcff, 2.2);
    // egress ledge (top y=4) — front edge tuned for 16 m/s capped flings
    b.block([8.5, 0, -5.4], [12, 4, 5.4], 'dark');
    // east wall with door opening at ledge level (y 4..6.6)
    b.block([12, 0, -5.4], [12.4, 4, 5.4], 'dark');
    b.block([12, 6.6, -5.4], [12.4, 11, 5.4], 'dark');
    b.block([12, 4, -5.4], [12.4, 6.6, -1.1], 'dark');
    b.block([12, 4, 1.1], [12.4, 6.6, 5.4], 'dark');
    // side walls
    b.block([0.4, 0, -5.4], [12, 11, -5], 'dark');
    b.block([0.4, 0, 5], [12, 11, 5.4], 'dark');

    // decoration
    b.sign(['04', 'FINAL CHAMBER'], -8.5, 2.8, 4.97, Math.PI);
    b.sign(['04-B', 'VELOCITY ROOM'], 8, 7.5, -4.97, 0);
    b.floorLine([[-5, 2.5], [-5, 0], [-3.5, 0]]);
    b.stripes(2, -2.8, 6, -2);
    b.stripes(2, 2, 6, 2.8);
    b.stripes(1.2, -2.8, 2, 2.8);
    b.stripes(6, -2.8, 6.8, 2.8);
    b.stripes(7.7, -5, 8.5, 5, 0.011);
    b.lightStrip([-9.8, 5.4, -5.02], [-0.2, 5.56, -4.94]);
    b.lightStrip([-9.8, 5.4, 4.94], [-0.2, 5.56, 5.02]);
    b.lightStrip([0.6, 10.4, -5.02], [11.8, 10.56, -4.94]);
    b.lightStrip([0.6, 10.4, 4.94], [11.8, 10.56, 5.02]);
    b.vent(-1.2, 5.2, -4.96, 0);
    b.vent(10.5, 9.4, 4.96, Math.PI);
    b.pipe([0.6, 10.1, -4.97], [9, 10.24, -4.9]);
    b.ceilingLight(-5, 0, 5.94, 3.2, 0.9);
    b.ceilingLight(6, 0, 10.94, 4, 1);
    b.pointLight(-5, 5.2, 0, 55);
    b.pointLight(6, 9.6, 0, 90);
    b.pointLight(-9.2, 4.6, -3.5, 10, 0xbfe8ff, false, 6); // alcove accent
    b.pointLight(4, -6.4, 0, 22, 0x9fdcff, false, 10); // pit fill

    const cube = new Cube(b.root, -9.2, 3, -3.5);
    const button1 = new PressureButton(b.root, ctx.audio, -3.5, 0, 3);
    const line1 = b.traceLine([[-3.5, 3], [-3.5, 0], [-0.3, 0]]);
    // momentary by design: the cube must STAY on the node — picking it back up
    // reseals the door (carrying it through is not a solution)
    const door1 = new Door(b.root, ctx.collision, ctx.audio, {
      axis: 'x',
      center: [0.2, 0, 0],
      width: 2.2,
      height: 3,
      mode: 'buttons',
      buttons: [button1],
    });

    const button2 = new PressureButton(b.root, ctx.audio, 10.5, 4, 2.5);
    const line2 = b.traceLine([[10.5, 2.5], [10.5, 0], [11.9, 0]], 4.014);
    const door2 = new Door(b.root, ctx.collision, ctx.audio, {
      axis: 'x',
      center: [12.2, 4, 0],
      width: 2.2,
      height: 2.6,
      mode: 'buttons',
      buttons: [button2],
      latch: true, // the player IS the weight — stepping off must not reseal the exit
    });
    const exitZone = exitCorridorX(ctx, 12, 4, 0, 2.6);

    return {
      playerStart: new THREE.Vector3(-5, 0, 2.5),
      playerYaw: yawFacing(-1, -0.6),
      cubes: [cube],
      buttons: [button1, button2],
      doors: [door1, door2],
      links: [
        { line: line1, button: button1 },
        { line: line2, button: button2 },
      ],
      exitZone,
      respawns: [respawnVolume([1.6, -8, -2.4], [6.4, -6.4, 2.4], 0.8)],
    };
  },
};

/* ================================================================== */
/* COMBINED TEST — one continuous chamber exercising every system      */
/* (menu-only; also serves as the 60-second benchmark recording route) */
/* ================================================================== */
const combinedTest: LevelDef = {
  id: 'NG-X',
  name: 'COMBINED PROTOCOL',
  objective: 'All protocols, one chamber: apertures → test object → pressure node → momentum fling → egress.',
  build(ctx: LevelContext): LevelRuntime {
    const b = ctx.builder;
    b.hemi(0.6);

    // grand hall: interior x[-12,18] z[-6,6] y[0,12]
    b.block([-12.4, 12, -6.4], [18.4, 12.4, 6.4], 'ceil', { portalable: false });
    b.block([-12.4, -0.4, -6.4], [2.4, 0, 6.4], 'floor', { portalable: false });
    // west wall fully white
    b.block([-12.4, 0, -6.4], [-12, 12, 6.4], 'white', { portalable: true });
    // south wall with white field
    b.block([-12, 0, -6.4], [-6, 12, -6], 'dark');
    b.block([-6, 0, -6.4], [1, 6, -6], 'white', { portalable: true });
    b.block([-6, 6, -6.4], [1, 12, -6], 'dark');
    b.block([1, 0, -6.4], [18, 12, -6], 'dark');
    // north wall with observation window (x -8..-4, y 1.4..3.4)
    b.block([-12, 0, 6], [-8, 12, 6.4], 'dark');
    b.block([-8, 3.4, 6], [-4, 12, 6.4], 'dark');
    b.block([-8, 0, 6], [-4, 1.4, 6.4], 'dark');
    b.block([-4, 0, 6], [18, 12, 6.4], 'dark');
    b.observationRoom(-6, 2.4, 6.15, 4, 2, 2.4, 0);

    // divider wall x[2,2.4] with door + launch panel on the east face
    b.block([2, 0, -6.4], [2.4, 3, -1.1], 'dark');
    b.block([2, 0, 1.1], [2.4, 3, 6.4], 'dark');
    b.block([2, 3, -6.4], [2.4, 6, 6.4], 'dark');
    b.block([2, 6, -3.5], [2.4, 11, 3.5], 'white', { portalable: true });
    b.block([2, 6, -6.4], [2.4, 11, -3.5], 'dark');
    b.block([2, 6, 3.5], [2.4, 11, 6.4], 'dark');
    b.block([2, 11, -6.4], [2.4, 12, 6.4], 'dark');

    // east section floor with pit x[5,9] z[-2,2]
    b.block([2.4, -0.4, -6.4], [5, 0, 6.4], 'floor', { portalable: false });
    b.block([9, -0.4, -6.4], [18.4, 0, 6.4], 'floor', { portalable: false });
    b.block([5, -0.4, -6.4], [9, 0, -2], 'floor', { portalable: false });
    b.block([5, -0.4, 2], [9, 0, 6.4], 'floor', { portalable: false });
    // pit shaft (depth 10) + white pit floor
    // (shaft tops at -0.4 — flush with the floor underside, never coplanar with its cut faces)
    b.block([4.6, -10, -2.4], [5, -0.4, 2.4], 'dark');
    b.block([9, -10, -2.4], [9.4, -0.4, 2.4], 'dark');
    b.block([4.6, -10, -2.4], [9.4, -0.4, -2], 'dark');
    b.block([4.6, -10, 2], [9.4, -0.4, 2.4], 'dark');
    b.block([4.6, -10.4, -2.4], [9.4, -10, 2.4], 'white', { portalable: true });
    b.lightStrip([5, -0.5, -2.04], [9, -0.34, -1.96], 0x9fdcff, 2.2);
    b.lightStrip([5, -0.5, 1.96], [9, -0.34, 2.04], 0x9fdcff, 2.2);
    // finale ledge (top y=4, front edge tuned for 16 m/s capped flings)
    b.block([11.5, 0, -6.4], [18, 4, 6.4], 'dark');
    b.block([18, 0, -6.4], [18.4, 4, 6.4], 'dark');
    b.block([18, 6.6, -6.4], [18.4, 12, 6.4], 'dark');
    b.block([18, 4, -6.4], [18.4, 6.6, -1.1], 'dark');
    b.block([18, 4, 1.1], [18.4, 6.6, 6.4], 'dark');

    // decoration
    b.sign(['X', 'COMBINED PROTOCOL'], -9.5, 2.8, 5.97, Math.PI);
    b.sign(['X-2', 'VELOCITY TEST'], 11, 7.5, -5.97, 0);
    b.floorLine([[-10, 0], [-2, 0], [-2, 2.2]]);
    b.stripes(5, -2.8, 9, -2);
    b.stripes(5, 2, 9, 2.8);
    b.stripes(4.2, -2.8, 5, 2.8);
    b.stripes(9, -2.8, 9.8, 2.8);
    b.stripes(10.7, -6, 11.5, 6, 0.011);
    b.lightStrip([-11.8, 11.4, -6.02], [17.8, 11.56, -5.94]);
    b.lightStrip([-11.8, 11.4, 5.94], [17.8, 11.56, 6.02]);
    b.vent(-3, 5.4, 5.96, Math.PI);
    b.vent(15, 10, -5.96, 0);
    b.pipe([-12, 11.1, -5.97], [12, 11.24, -5.9]);
    b.ceilingLight(-7, 0, 11.94, 4, 1);
    b.ceilingLight(0, 0, 11.94, 3, 0.9);
    b.ceilingLight(8, 0, 11.94, 4, 1);
    b.ceilingLight(15, 0, 11.94, 4, 1);
    b.pointLight(-6, 10.4, 0, 95);
    b.pointLight(8, 10.4, 0, 95);
    b.pointLight(15, 8.5, 0, 40, 0xeaf4ff, false);
    b.pointLight(7, -8.4, 0, 22, 0x9fdcff, false, 10);

    const cube = new Cube(b.root, -2, 0, -4);
    const button1 = new PressureButton(b.root, ctx.audio, -2, 0, 3);
    const line1 = b.traceLine([[-2, 3], [-2, 0], [1.7, 0]]);
    // momentary: the cube has to stay on the node to hold this door open
    const door1 = new Door(b.root, ctx.collision, ctx.audio, {
      axis: 'x',
      center: [2.2, 0, 0],
      width: 2.2,
      height: 3,
      mode: 'buttons',
      buttons: [button1],
    });
    const button2 = new PressureButton(b.root, ctx.audio, 16, 4, 2.5);
    const line2 = b.traceLine([[16, 2.5], [16, 0], [17.9, 0]], 4.014);
    const door2 = new Door(b.root, ctx.collision, ctx.audio, {
      axis: 'x',
      center: [18.2, 4, 0],
      width: 2.2,
      height: 2.6,
      mode: 'buttons',
      buttons: [button2],
      latch: true,
    });
    const exitZone = exitCorridorX(ctx, 18, 4, 0, 2.6);

    return {
      playerStart: new THREE.Vector3(-10, 0, 0),
      playerYaw: yawFacing(1, 0),
      cubes: [cube],
      buttons: [button1, button2],
      doors: [door1, door2],
      links: [
        { line: line1, button: button1 },
        { line: line2, button: button2 },
      ],
      exitZone,
      respawns: [respawnVolume([4.6, -10, -2.4], [9.4, -8.4, 2.4], 0.8)],
    };
  },
};

export const LEVELS: LevelDef[] = [level1, level2, level3, level4];
export const COMBINED_TEST_LEVEL: LevelDef = combinedTest;
