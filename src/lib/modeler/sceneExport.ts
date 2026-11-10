import { getRenderer, getPerspCamera, planCamera, mainScene } from './scene/cameraRef';

export function capturePlanImage(): string | null {
	const renderer = getRenderer();
	const scene = mainScene;
	if (!renderer || !planCamera || !scene) return null;
	renderer.render(scene, planCamera);
	return renderer.domElement.toDataURL('image/png');
}

export function exportPNG(filename = 'site-model.png') {
	const renderer = getRenderer();
	const camera = getPerspCamera();
	const scene = mainScene;
	if (!renderer || !camera || !scene) return;

	renderer.render(scene, camera);
	const dataURL = renderer.domElement.toDataURL('image/png');
	const a = document.createElement('a');
	a.href = dataURL;
	a.download = filename;
	a.click();
}
