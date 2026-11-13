import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { patchShader } from './grain';

describe('paper grain', () => {
	it("hooks into three's Lambert shader", () => {
		const lambert = THREE.ShaderLib.lambert;
		const shader = { vertexShader: lambert.vertexShader, fragmentShader: lambert.fragmentShader, uniforms: {} };
		expect(patchShader(shader, 0.15)).toEqual([]);
		expect(shader.vertexShader).toContain('vGrainPos =');
		// applied to the final lit color, just before output
		expect(shader.fragmentShader.indexOf('outgoingLight *= 1.0 +')).toBeLessThan(shader.fragmentShader.indexOf('#include <opaque_fragment>'));
		expect(shader.uniforms).toHaveProperty('grainStrength.value', 0.15);
	});

	it('reports a hook it cannot find', () => {
		const shader = { vertexShader: '#include <common>', fragmentShader: '', uniforms: {} };
		expect(patchShader(shader, 0.07)).toEqual(['#include <begin_vertex>', '#include <common>', '#include <opaque_fragment>']);
	});
});
