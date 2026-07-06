// Soft atmospheric rim glow for Mars.
//
// Approach (per CLAUDE.md + mtraf.md research): a SECOND sphere slightly larger
// than the planet, rendered on its BACK faces with additive blending. The
// fragment intensity is a Fresnel term — bright at the limb (grazing angle),
// fading to nothing toward the center of the disc. Tuned with a gentle power so
// it reads as haze, not a hard outline ring.

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    // Normal in world space. Uniform scale on the shell keeps this valid.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uColorInner;   // warmer, near the surface
  uniform vec3 uColorOuter;   // cooler/dimmer, at the limb
  uniform vec3 uSunDirection; // world-space direction TO the sun
  uniform float uPower;       // falloff exponent — higher = tighter to the limb
  uniform float uIntensity;   // overall brightness multiplier
  uniform vec3 uCameraPos;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    // We render back faces, so the geometric normal points inward (toward the
    // planet). Flip it to get the outward surface normal.
    vec3 normal = normalize(-vWorldNormal);
    vec3 viewDir = normalize(uCameraPos - vWorldPosition);

    // Fresnel: 0 looking straight at the surface, 1 at the grazing limb.
    float fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
    fresnel = pow(fresnel, uPower);

    // Day/night: fade the glow on the side of the planet facing away from the
    // sun so the haze only lights up where the atmosphere is actually lit.
    float sunlit = dot(normal, normalize(uSunDirection));
    float dayFactor = smoothstep(-0.35, 0.55, sunlit);

    // Mix haze color from warm (inner) to cool (outer) across the falloff.
    vec3 color = mix(uColorOuter, uColorInner, fresnel);

    float alpha = fresnel * uIntensity * dayFactor;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;
