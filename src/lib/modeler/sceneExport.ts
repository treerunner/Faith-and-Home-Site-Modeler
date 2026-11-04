import { getRenderer, getPerspCamera, mainScene } from './scene/cameraRef';

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
