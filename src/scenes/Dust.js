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

    // Downward force is set to -normal once the site is known (setSite).
    this.force = new ApplyForce(new QVector3(0, -1, 0), new ConstantValue(3.0));

    this.system = new ParticleSystem({
      duration: 1.6,
      looping: false,
      worldSpace: true,
      maxParticle: 800,
      startLife: new IntervalValue(1.0, 2.0),
      startSpeed: new IntervalValue(2.0, 7.5),
      startSize: new IntervalValue(0.5, 1.5),
      startRotation: new IntervalValue(0, Math.PI * 2),
      startColor: new ConstantColor(new QVector4(0.9, 0.55, 0.34, 1)),
      emissionOverTime: new ConstantValue(0),
      emissionBursts: [
        {
          time: 0,
          count: new ConstantValue(450),
          cycle: 1,
          interval: 0.01,
          probability: 1,
        },
      ],
      // Wide, shallow cone: mostly outward with some lift.
      shape: new ConeEmitter({ radius: 0.35, angle: 1.15, thickness: 1 }),
      material,
      renderMode: RenderMode.BillBoard,
      renderOrder: 2,
    });

    // Grow as they drift.
    this.system.addBehavior(
      new SizeOverLife(new PiecewiseBezier([[new Bezier(0.4, 0.8, 1.1, 1.3), 0]])),
    );
    // Rusty dust that fades in fast then dissipates.
    this.system.addBehavior(
      new ColorOverLife(
        new Gradient(
          [
            [new QVector3(0.85, 0.5, 0.3), 0],
            [new QVector3(0.72, 0.42, 0.28), 1],
          ],
          [
            [0.0, 0],
            [0.8, 0.12],
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
    this.system.emitter.position.copy(site);
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
  g.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
