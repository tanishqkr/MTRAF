import * as THREE from 'three';
import {
  BatchedRenderer,
  ParticleSystem,
  ConstantValue,
  IntervalValue,
  ConstantColor,
  ConeEmitter,
  SizeOverLife,
  ColorOverLife,
  ApplyForce,
  Gradient,
  PiecewiseBezier,
  Bezier,
  RenderMode,
  Vector3 as QVector3,
  Vector4 as QVector4,
} from 'three.quarks';

// Touchdown dust burst, built with three.quarks (per CLAUDE.md — no hand-rolled
// Points system). Soft ALPHA-blended sprites (not additive) with size-over-life
// growth + color/alpha fade, an upward-and-outward cone, and a downward force
// so the plume settles — the layered look the prototype's "few circles" lacked.
export class Dust {
  constructor(scene) {
    this.batch = new BatchedRenderer();
    scene.add(this.batch);

    const material = new THREE.MeshBasicMaterial({
      map: makeDustTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    // Gentle settle only. The dust barely moves (see startSpeed) so it can't
    // fountain upward — this force just eases it down to rest.
    this.force = new ApplyForce(new QVector3(0, -1, 0), new ConstantValue(1.2));

    this.system = new ParticleSystem({
      duration: 2.2,
      looping: false,
      worldSpace: true,
      maxParticle: 1100,
      startLife: new IntervalValue(0.9, 1.8),
      // NEAR-STATIONARY. The whole point: particles are pre-spread across a wide
      // flat disk (below), so they must NOT launch — with almost no velocity the
      // cloud simply APPEARS spread around the rover and fades. No upward speed
      // ⇒ physically cannot form a column; solid disk ⇒ not a ring from centre.
      startSpeed: new IntervalValue(0.15, 0.8),
      startSize: new IntervalValue(1.1, 2.2),
      startRotation: new IntervalValue(0, Math.PI * 2),
      // Reddish-brown Martian dust.
      startColor: new ConstantColor(new QVector4(0.72, 0.31, 0.17, 1)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [
        {
          time: 0,
          count: new ConstantValue(700),
          cycle: 1,
          interval: 0.01,
          probability: 1,
        },
      ],
      // SOLID disk (thickness 1) wider than the rover, nearly FLAT cone (small
      // angle) so what little velocity exists stays near-horizontal. Dust fills
      // the whole footprint around + under the rover from frame one.
      shape: new ConeEmitter({ radius: 2.3, angle: 0.35, thickness: 1 }),
      material,
      renderMode: RenderMode.BillBoard,
      renderOrder: 2,
    });

    // Grow as they drift.
    this.system.addBehavior(
      new SizeOverLife(new PiecewiseBezier([[new Bezier(0.4, 0.8, 1.1, 1.3), 0]])),
    );
    // Reddish-brown dust — a TRANSLUCENT haze, not a solid mass: the alpha
    // peaks low (~0.3) so hundreds of overlapping sprites stack into a soft
    // reddish cloud you can see the ground through, then dissipate.
    this.system.addBehavior(
      new ColorOverLife(
        new Gradient(
          [
            [new QVector3(0.78, 0.34, 0.19), 0],
            [new QVector3(0.55, 0.26, 0.16), 1],
          ],
          [
            [0.0, 0],
            [0.3, 0.12],
            [0.0, 1.0],
          ],
        ),
      ),
    );
    this.system.addBehavior(this.force);

    this.batch.addSystem(this.system);
    scene.add(this.system.emitter);

    // Don't emit until explicitly fired.
    this.system.emitter.visible = false;
    this.system.pause();
  }

  // Anchor the burst to the (fixed, deterministic) landing site and orient the
  // cone to lift off along the surface normal; gravity points back down (-N).
  setSite(site, normal) {
    // Emit a touch above the ground so horizontally-launched particles arc out
    // over the surface instead of spawning inside it.
    this.system.emitter.position.copy(site).addScaledVector(normal, 0.4);
    this.system.emitter.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normal,
    );
    this.force.direction.set(-normal.x, -normal.y, -normal.z);
  }

  fire() {
    this.system.emitter.visible = true;
    this.system.restart();
    this.system.play();
  }

  update(dt) {
    this.batch.update(dt);
  }
}

function makeDustTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.18)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
