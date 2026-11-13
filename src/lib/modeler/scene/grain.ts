// Paper grain: a faint kraft-paper texture on the model's materials, so it reads as a physical
// study model rather than flat color. ambientCG Paper006 (CC0), made gray, in static/textures.
// The grain is laid by world position on each axis plane (blended by which way a surface
// faces), so it stays the same size on every wall, roof and footprint; it scales the material's
// final color, so self-lit (emissive) boards take it too. 3D only: plan view is a drawing.

import * as THREE from 'three';

export const GRAIN_SRC = '/textures/paper-grain.jpg';
export const GRAIN_TILE = 2; // meters per repeat
export const GRAIN_BUILDING = 0.15; // strength: how far one spread of the grain moves the color
export const GRAIN_BOARD = 0.07;
// The texture's average brightness and spread (0 to 1), measured once as WebGL reads it: raw,
// with no color conversion (NoColorSpace). The file carries no color profile, so a browser
// canvas reads the same values; remeasure if the image changes.
const GRAIN_MEAN = 0.48;
const GRAIN_STD = 0.0155;

// Shared by every grained material: the texture, and the switch (off in plan view and until
// the texture has loaded)
const shared = {
	grainMap: { value: null as THREE.Texture | null },
	grainOn: { value: 0 },
};
let wantOn = false;

// Loads the texture once; `ready` asks the canvas to redraw when it arrives
let loading = false;
export function loadGrain(ready: () => void): void {
	if (loading) return;
	loading = true;
	new THREE.TextureLoader().load(GRAIN_SRC, (tex) => {
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
		tex.colorSpace = THREE.NoColorSpace; // data, not color
		tex.anisotropy = 8;
		shared.grainMap.value = tex;
		shared.grainOn.value = wantOn ? 1 : 0;
		ready();
	});
}

export function setGrainOn(on: boolean): void {
	wantOn = on;
	shared.grainOn.value = on && shared.grainMap.value ? 1 : 0;
}

const VERTEX_DECL = 'varying vec3 vGrainPos;\nvarying vec3 vGrainNormal;';
const FRAGMENT_DECL = `${VERTEX_DECL}
uniform sampler2D grainMap;
uniform float grainOn, grainStrength;
float grainAt(vec2 p) { return texture2D(grainMap, p / ${GRAIN_TILE.toFixed(1)}).r; }`;
const GRAIN_FACTOR = `if (grainOn > 0.5) {
	vec3 w = abs(normalize(vGrainNormal));
	w /= w.x + w.y + w.z;
	float g = grainAt(vGrainPos.zy) * w.x + grainAt(vGrainPos.xz) * w.y + grainAt(vGrainPos.xy) * w.z;
	outgoingLight *= 1.0 + clamp((g - ${GRAIN_MEAN}) / ${GRAIN_STD}, -3.0, 3.0) * grainStrength;
}`;

// The shader pieces we hook into, and what goes after each. A three.js upgrade that renames one
// would silently drop the grain, so patchShader reports any it can't find (tested).
const HOOKS: [stage: 'vertexShader' | 'fragmentShader', chunk: string, after: string, before?: boolean][] = [
	['vertexShader', '#include <common>', VERTEX_DECL],
	['vertexShader', '#include <begin_vertex>', 'vGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGrainNormal = mat3(modelMatrix) * objectNormal;'],
	['fragmentShader', '#include <common>', FRAGMENT_DECL],
	['fragmentShader', '#include <opaque_fragment>', GRAIN_FACTOR, true],
];

type Shader = { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> };

// Adds the grain to a Lambert shader; returns the hooks it couldn't find
export function patchShader(shader: Shader, strength: number): string[] {
	const missing: string[] = [];
	for (const [stage, chunk, code, before] of HOOKS) {
		if (!shader[stage].includes(chunk)) missing.push(chunk);
		shader[stage] = shader[stage].replace(chunk, before ? `${code}\n${chunk}` : `${chunk}\n${code}`);
	}
	Object.assign(shader.uniforms, shared, { grainStrength: { value: strength } });
	return missing;
}

export function applyGrain(material: THREE.Material, strength: number): void {
	material.customProgramCacheKey = () => `grain-${strength}`;
	material.onBeforeCompile = (shader) => {
		const missing = patchShader(shader, strength);
		if (missing.length) console.warn('Paper grain: shader hooks not found', missing);
	};
}
