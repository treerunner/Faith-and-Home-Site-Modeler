<script lang="ts">
	import { T } from '@threlte/core';
	import * as THREE from 'three';
	import type { Part, Roof, Status } from '../types';
	import { statusColor } from '../colors';
	import { roofHeight, gableRidgeAxis } from '../geometry';

	interface Props {
		part: Part;
		roof: Roof;
		status: Status;
		totalHeight: number;
	}

	let { part, roof, status, totalHeight }: Props = $props();

	const EDGE_COLOR = '#4a3f30';

	function makeGableGeometry(p: Part): THREE.BufferGeometry {
		const rH = roofHeight(p);
		const axis = gableRidgeAxis(p);

		if (axis === 'x') {
			// Ridge along X: cross-section in ZY plane, extrude along X
			const halfD = p.d / 2;
			const shape = new THREE.Shape();
			shape.moveTo(-halfD, 0);
			shape.lineTo(halfD, 0);
			shape.lineTo(0, rH);
			shape.closePath();
			const geo = new THREE.ExtrudeGeometry(shape, { depth: p.w, bevelEnabled: false });
			// rotateY(π/2): newX = oldZ, newY = oldY, newZ = -oldX
			// Extrusion (old Z: 0→w) becomes new X: 0→w; translate -w/2 to center at 0
			geo.rotateY(Math.PI / 2);
			geo.translate(-p.w / 2, 0, 0);
			return geo;
		} else {
			// Ridge along Z: cross-section in XY plane, extrude along Z
			const halfW = p.w / 2;
			const shape = new THREE.Shape();
			shape.moveTo(-halfW, 0);
			shape.lineTo(halfW, 0);
			shape.lineTo(0, rH);
			shape.closePath();
			const geo = new THREE.ExtrudeGeometry(shape, { depth: p.d, bevelEnabled: false });
			geo.translate(0, 0, -p.d / 2);
			return geo;
		}
	}

	function makePyramidGeometry(p: Part): THREE.BufferGeometry {
		const hw = p.w / 2;
		const hd = p.d / 2;
		const rH = roofHeight(p);
		const geo = new THREE.BufferGeometry();
		const vertices = new Float32Array([
			-hw, 0, -hd, // 0 front-left
			hw, 0, -hd, // 1 front-right
			hw, 0, hd, // 2 back-right
			-hw, 0, hd, // 3 back-left
			0, rH, 0, // 4 apex
		]);
		const indices = new Uint16Array([
			0, 1, 4, // front slope
			1, 2, 4, // right slope
			2, 3, 4, // back slope
			3, 0, 4, // left slope
		]);
		geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
		geo.setIndex(new THREE.BufferAttribute(indices, 1));
		const flatGeo = geo.toNonIndexed();
		flatGeo.computeVertexNormals();
		return flatGeo;
	}

	function makeTriPyramidGeometry(p: Part): THREE.BufferGeometry {
		const hw = p.w / 2;
		const hd = p.d / 2;
		const rH = roofHeight(p);
		const geo = new THREE.BufferGeometry();
		const vertices = new Float32Array([
			-hw, 0, -hd, // 0 left base (flat side, matches body)
			hw, 0, -hd,  // 1 right base (flat side, matches body)
			0, 0, hd,    // 2 apex base (matches body triangle apex at +Z)
			0, rH, 0,    // 3 roof peak
		]);
		const indices = new Uint16Array([0, 1, 3, 1, 2, 3, 2, 0, 3]);
		geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
		geo.setIndex(new THREE.BufferAttribute(indices, 1));
		const flatGeo = geo.toNonIndexed();
		flatGeo.computeVertexNormals();
		return flatGeo;
	}

	let roofGeo = $derived.by(() => {
		if (roof === 'gable') return makeGableGeometry(part);
		if (part.shape === 'tri') return makeTriPyramidGeometry(part);
		return makePyramidGeometry(part);
	});

	let edgeGeo = $derived(new THREE.EdgesGeometry(roofGeo));
	let color = $derived(statusColor(status));
	let yaw = $derived(-(part.rotation * Math.PI) / 180);
</script>

<!-- Face mesh -->
<T.Mesh
	geometry={roofGeo}
	position={[part.x, totalHeight, part.y]}
	rotation={[0, yaw, 0]}
	castShadow
	receiveShadow
>
	<T.MeshLambertMaterial {color} side={THREE.DoubleSide} />
</T.Mesh>

<!-- Ridge / rake edge lines -->
<T.LineSegments
	geometry={edgeGeo}
	position={[part.x, totalHeight, part.y]}
	rotation={[0, yaw, 0]}
>
	<T.LineBasicMaterial color={EDGE_COLOR} />
</T.LineSegments>
