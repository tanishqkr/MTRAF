import * as THREE from 'three';
import { createGLTFLoader } from './gltf.js';

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

// NASA Perseverance rover (public domain). Loaded, normalized so its wheels sit
// on the surface point, and revealed after touchdown as the dust clears.
export class Rover {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.ready = false;
    this._targetHeight = 0.9; // world units (Mars R = 10)
    this._materials = [];
  }

  async load() {
    const loader = createGLTFLoader();
    const gltf = await loader.loadAsync('/assets/models/perseverance.glb');
    const model = gltf.scene;

    // Normalize scale, then shift so the model's BOTTOM sits at the group origin
    // (group origin is placed exactly on the surface point).
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = this._targetHeight / maxDim;
    model.scale.setScalar(scale);

    const box2 = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box2.min.y; // rest wheels on y=0

    model.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.transparent = true;
        this._materials.push(o.material);
      }
    });

    this.model = model;
    this.group.add(model);
    this.ready = true;
    return this;
  }

  // Stand the rover up at `site` along the surface normal `normal` (world-space).
  placeAt(site, normal) {
    this.group.position.copy(site);
    _q.setFromUnitVectors(UP, normal);
    this.group.quaternion.copy(_q);
  }

  // reveal: 0..1 — fade in as the dust clears.
  setReveal(reveal) {
    if (!this.ready) return;
    this.group.visible = reveal > 0.001;
    for (const m of this._materials) m.opacity = reveal;
  }
}
