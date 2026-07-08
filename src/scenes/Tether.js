import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _top = new THREE.Vector3();
const _bot = new THREE.Vector3();
const _q = new THREE.Quaternion();

// The skycrane bridle: three nylon cords + one comms umbilical, from the descent
// stage's underside to the rover deck (per the real maneuver — CLAUDE.md). Built
// from thin cylinders (GL line width is unreliable across platforms).
export class Tether {
  constructor() {
    this.group = new THREE.Group();

    // 3 bridles fanned around a small circle + 1 umbilical near center.
    this.cords = [];
    const cordMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c4 });
    const umbMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });

    const geo = new THREE.CylinderGeometry(1, 1, 1, 5);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const mesh = new THREE.Mesh(geo, cordMat);
      this.cords.push({ mesh, offset: new THREE.Vector3(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22), radius: 0.015 });
      this.group.add(mesh);
    }
    const umb = new THREE.Mesh(geo, umbMat);
    this.cords.push({ mesh: umb, offset: new THREE.Vector3(0.1, 0, -0.05), radius: 0.022 });
    this.group.add(umb);
  }

  // Stretch the cords from the stage (topWorld) down to the rover deck
  // (bottomWorld). Both are world-space points. Each cord fans out at BOTH
  // ends (attaching to distinct points on the belly and the deck) so the
  // bundle reads as parallel bridles, not a single V converging to a point.
  update(topWorld, bottomWorld) {
    for (const cord of this.cords) {
      _top.copy(topWorld).add(cord.offset);
      _bot.copy(bottomWorld).addScaledVector(cord.offset, 0.55);
      _dir.subVectors(_bot, _top);
      const len = _dir.length();
      if (len < 1e-4) {
        cord.mesh.visible = false;
        continue;
      }
      cord.mesh.visible = true;
      _dir.normalize();
      _q.setFromUnitVectors(UP, _dir);
      _mid.copy(_top).addScaledVector(_dir, len * 0.5);
      cord.mesh.position.copy(_mid);
      cord.mesh.quaternion.copy(_q);
      cord.mesh.scale.set(cord.radius, len, cord.radius);
    }
  }

  setVisible(v) {
    this.group.visible = v;
  }
}
