import * as THREE from 'three';
import { mainView, topBelow, type SceneView } from './scene/cameraRef';
import type { Annotation, Plan } from './types';
import { COLORS, FH } from './colors';

const PAD = 8;

// The pattern book's numbered dots, drawn onto an exported picture: each note projected through
// the camera that drew it. In 3D a note sits on whatever is under it; off the board it's left out.
// `height` is the picture's, which may sit above a list of notes on the same canvas.
function drawDots(ctx: CanvasRenderingContext2D, notes: Annotation[], camera: THREE.Camera, is3D: boolean, scale: number, height = ctx.canvas.height, view = mainView) {
	const width = ctx.canvas.width;
	const r = 14 * scale;
	for (const a of notes) {
		const y = is3D ? topBelow(a.x, a.y, view) : 0;
		if (y === null) continue;
		const v = new THREE.Vector3(a.x, y + (is3D ? 0.5 : 0), a.y).project(camera);
		if (v.z > 1) continue;
		const [px, py] = [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
		dot(ctx, px, py, r, a.n, scale);
	}
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, scale: number) {
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.note;
	ctx.fill();
	ctx.lineWidth = 2 * scale;
	ctx.strokeStyle = '#fff';
	ctx.stroke();
	ctx.fillStyle = '#fff';
	ctx.font = `800 ${Math.round(r * 1.05)}px system-ui, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(String(n), x, y + scale);
	ctx.textAlign = 'start';
}

// Wraps text to a width, word by word
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const next = line ? `${line} ${word}` : word;
		if (ctx.measureText(next).width > width && line) {
			lines.push(line);
			line = word;
		} else line = next;
	}
	if (line) lines.push(line);
	return lines;
}

// The picture with its dots, and the numbered notes beneath it as in the book
function withNotes(source: HTMLCanvasElement, notes: Annotation[], camera: THREE.Camera, is3D: boolean): HTMLCanvasElement {
	const scale = source.width / source.clientWidth || 1;
	const pad = 20 * scale;
	const size = 15 * scale;
	const lineH = size * 1.4;
	const r = 11 * scale;
	const measure = document.createElement('canvas').getContext('2d')!;
	measure.font = `${size}px system-ui, sans-serif`;
	const textW = source.width - pad * 2 - r * 2 - 10 * scale;
	const blocks = notes.map((a) => ({ a, lines: wrap(measure, a.text || ' ', textW) }));
	const listH = notes.length ? pad * 2 + blocks.reduce((h, b) => h + Math.max(b.lines.length * lineH, r * 2) + 8 * scale, 0) : 0;

	const out = document.createElement('canvas');
	out.width = source.width;
	out.height = source.height + listH;
	const ctx = out.getContext('2d')!;
	ctx.fillStyle = FH.linen;
	ctx.fillRect(0, 0, out.width, out.height);
	ctx.drawImage(source, 0, 0);
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, source.width, source.height);
	ctx.clip();
	drawDots(ctx, notes, camera, is3D, scale, source.height);
	ctx.restore();

	let y = source.height + pad;
	for (const { a, lines } of blocks) {
		dot(ctx, pad + r, y + r, r, a.n, scale * 0.8);
		ctx.font = `${size}px system-ui, sans-serif`;
		ctx.fillStyle = '#231f20';
		ctx.textBaseline = 'top';
		lines.forEach((l, i) => ctx.fillText(l, pad + r * 2 + 10 * scale, y + (r * 2 - size) / 2 + i * lineH));
		y += Math.max(lines.length * lineH, r * 2) + 8 * scale;
	}
	return out;
}

// Notes: the plan's, to draw their dots on the picture (the analysis); none for a clean one.
// View: the canvas to draw with, the editor's unless comparing.
export function capturePlanImage(plan: Plan, notes: Annotation[] = [], view: SceneView = mainView): string | null {
	const { renderer, scene, planCamera } = view;
	if (!renderer || !planCamera || !scene) return null;

	// Collect site content bounds (structures, open spaces, trees)
	const xs: number[] = [];
	const zs: number[] = [];

	for (const s of plan.structures) {
		for (const p of s.parts) {
			xs.push(p.x - p.w / 2, p.x + p.w / 2);
			zs.push(p.y - p.d / 2, p.y + p.d / 2);
		}
	}
	for (const os of plan.openSpaces) {
		for (const [ox, oz] of os.polygon) { xs.push(ox); zs.push(oz); }
	}
	for (const t of plan.trees) {
		xs.push(t.x - t.radius, t.x + t.radius);
		zs.push(t.y - t.radius, t.y + t.radius);
	}
	for (const a of notes) {
		xs.push(a.x);
		zs.push(a.y);
	}

	// Hide grid lines during capture
	const grids = scene.children.filter((c) => c instanceof THREE.GridHelper);
	grids.forEach((g) => { g.visible = false; });

	// Save frustum and position (the user may have panned) to restore after the tight-crop render.
	const { left, right, top, bottom } = planCamera;
	const position = planCamera.position.clone();

	if (xs.length > 0) {
		const minX = Math.min(...xs) - PAD, maxX = Math.max(...xs) + PAD;
		const minZ = Math.min(...zs) - PAD, maxZ = Math.max(...zs) + PAD;
		const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;

		const size = renderer.getSize(new THREE.Vector2());
		const aspect = size.x / size.y;
		let halfW = (maxX - minX) / 2;
		let halfD = (maxZ - minZ) / 2;
		if (halfW / halfD > aspect) halfD = halfW / aspect;
		else halfW = halfD * aspect;

		// Center the camera on the content rather than offsetting the frustum from a panned view
		planCamera.position.set(cx, position.y, cz);
		planCamera.left   = -halfW;
		planCamera.right  = halfW;
		planCamera.top    = halfD;
		planCamera.bottom = -halfD;
		planCamera.updateProjectionMatrix();
		planCamera.updateMatrixWorld();
	}

	renderer.render(scene, planCamera);
	let dataURL: string;
	if (notes.length) {
		const out = document.createElement('canvas');
		out.width = renderer.domElement.width;
		out.height = renderer.domElement.height;
		const ctx = out.getContext('2d')!;
		ctx.drawImage(renderer.domElement, 0, 0);
		// Sized to the picture, which the report shows small
		drawDots(ctx, notes, planCamera, false, out.width / 320);
		dataURL = out.toDataURL('image/png');
	} else dataURL = renderer.domElement.toDataURL('image/png');

	// Restore camera and grid before anything else can paint.
	// All of this is synchronous in one JS task, so the browser never
	// sees the tight-crop or grid-hidden state.
	planCamera.left = left; planCamera.right = right;
	planCamera.top = top;   planCamera.bottom = bottom;
	planCamera.position.copy(position);
	planCamera.updateProjectionMatrix();
	planCamera.updateMatrixWorld();
	grids.forEach((g) => { g.visible = true; });
	renderer.render(scene, planCamera);

	return dataURL;
}

// Data credits travel with shared images: printed small in the bottom-right corner.
function withCredits(source: HTMLCanvasElement, credit: string, bottom = source.height, scale = source.width / source.clientWidth || 1): string {
	const out = document.createElement('canvas');
	out.width = source.width;
	out.height = source.height;
	const ctx = out.getContext('2d');
	if (!ctx) return source.toDataURL('image/png');
	ctx.drawImage(source, 0, 0);
	const size = Math.round(11 * scale); // scale: device pixels per CSS pixel
	const pad = Math.round(6 * scale);
	ctx.font = `${size}px system-ui, sans-serif`;
	const width = ctx.measureText(credit).width;
	const x = out.width - width - pad * 2;
	const y = bottom - size - pad * 2; // on the picture, above any notes beneath it
	ctx.fillStyle = 'rgba(247, 247, 242, 0.85)';
	ctx.fillRect(x, y, width + pad * 2, size + pad * 2);
	ctx.fillStyle = '#595657';
	ctx.textBaseline = 'top';
	ctx.fillText(credit, x + pad, y + pad);
	return out.toDataURL('image/png');
}

// Notes: the ones on screen (the Notes drawer open), drawn as dots with their list beneath
export function exportPNG(filename = 'site-model.png', credit: string | null = null, notes: Annotation[] = []) {
	const { renderer, perspCamera: camera, scene } = mainView;
	if (!renderer || !camera || !scene) return;

	renderer.render(scene, camera);
	const picture = notes.length ? withNotes(renderer.domElement, notes, camera, true) : renderer.domElement;
	const scale = renderer.domElement.width / renderer.domElement.clientWidth || 1;
	const dataURL = credit ? withCredits(picture, credit, renderer.domElement.height, scale) : picture.toDataURL('image/png');
	const a = document.createElement('a');
	a.href = dataURL;
	a.download = filename;
	a.click();
}

const THUMB_WIDTH = 480;

// A small picture of what's on screen, saved with the plan for its pattern-page card: the
// tight plan crop in plan view, the orbit view as it stands in 3D. A JPEG data URL, ~30 KB.
export async function captureThumbnail(plan: Plan, is3D: boolean): Promise<string | null> {
	const { renderer, scene } = mainView;
	if (!renderer || !scene) return null;
	let source: string | null;
	if (is3D) {
		const camera = mainView.perspCamera;
		if (!camera) return null;
		renderer.render(scene, camera);
		source = renderer.domElement.toDataURL('image/png');
	} else {
		source = capturePlanImage(plan);
	}
	if (!source) return null;
	const img = new Image();
	img.src = source;
	await img.decode();
	const out = document.createElement('canvas');
	out.width = THUMB_WIDTH;
	out.height = Math.round((img.height / img.width) * THUMB_WIDTH);
	const ctx = out.getContext('2d');
	if (!ctx) return null;
	// Plan view renders on a clear canvas over the page's linen; JPEG has no transparency
	ctx.fillStyle = FH.linen;
	ctx.fillRect(0, 0, out.width, out.height);
	ctx.drawImage(img, 0, 0, out.width, out.height);
	return out.toDataURL('image/jpeg', 0.8);
}
