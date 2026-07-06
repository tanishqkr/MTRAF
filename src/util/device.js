// Small runtime device hints used for the performance/mobile pass (Phase 6).

// "Mobile-ish": a narrow viewport or a coarse (touch) pointer. Used to trade
// fidelity for memory/perf on phones without affecting desktop.
export function isMobile() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return coarse || window.innerWidth < 780;
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Downsample a loaded image texture to a max width via a canvas. The 8K Mars
// map is ~128MB of GPU memory at full size — far too much for phones — so on
// mobile we redraw it to 2K (~8MB) before it's uploaded. Desktop keeps 8K.
export function downsampleTexture(THREE, texture, maxWidth) {
  const img = texture.image;
  if (!img || !img.width || img.width <= maxWidth) return texture;

  const scale = maxWidth / img.width;
  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = texture.colorSpace;
  t.wrapS = texture.wrapS;
  t.wrapT = texture.wrapT;
  t.anisotropy = texture.anisotropy;
  texture.dispose();
  return t;
}
