// Temporary helper so probe scripts can pull a Vite-resolved THREE + loader into
// the page context. Safe to delete once terrain work is done.
import * as THREE from 'three';
import { createGLTFLoader } from './gltf.js';

export { THREE, createGLTFLoader };
