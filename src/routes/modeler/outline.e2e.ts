import { expect, test, type Page } from '@playwright/test';

// A new site's plan view: 100 m tall, centered on the origin
async function siteToPage(page: Page) {
	const box = (await page.locator('.canvas-area canvas').boundingBox())!;
	const m = box.height / 100;
	return (x: number, y: number) => ({ x: box.x + box.width / 2 + x * m, y: box.y + box.height / 2 + y * m });
}

async function footprint(page: Page): Promise<string> {
	await page.getByRole('button', { name: 'Analysis' }).click();
	const text = await page.locator('tr', { hasText: 'Structure footprint' }).locator('.met-value').textContent();
	await page.keyboard.press('Escape');
	return text ?? '';
}

test('draw a structure point by point, snapped to its neighbor, then move its points', async ({ page }) => {
	await page.goto('/modeler');
	const at = await siteToPage(page);
	await page.getByLabel('Drag to place Square').dragTo(page.locator('.canvas-area canvas')); // -3..3

	// An addition drawn against the square's east wall: the first point lands near a corner and snaps to it
	await page.getByRole('button', { name: 'Draw outline' }).click();
	await expect(page.getByText('Click to place points. Points snap to corners and edges; hold Alt to place freely. Esc to cancel.')).toBeVisible();
	for (const [x, y] of [[3.4, -3.3], [12, -3], [12, 3], [3, 3]]) await page.mouse.click(at(x, y).x, at(x, y).y);
	await expect(page.getByText('Click the first point, or press Enter, to finish. Esc to cancel.')).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(page.locator('.struct-item')).toHaveCount(2);
	await expect(page.locator('.group-badge')).toHaveCount(2); // it touches the square: one building
	const before = await footprint(page); // 36 + 54 m²
	expect(before).toBe('969 sq ft');

	// Select it, then drag its far corner out 4 m: points move, the area grows
	await page.mouse.click(at(8, 0).x, at(8, 0).y);
	await page.mouse.move(at(12, -3).x, at(12, -3).y);
	await page.mouse.down();
	await page.mouse.move(at(16, -3).x, at(16, -3).y, { steps: 5 });
	await page.mouse.up();
	expect(await footprint(page)).not.toBe(before);

	// Near the square's corner a point snaps back onto it; with Alt held it can overhang
	const drag = async (from: [number, number], to: [number, number], free = false) => {
		await page.mouse.click(at(8, 0).x, at(8, 0).y); // select the addition
		await page.waitForTimeout(150); // its point handles appear
		await page.mouse.move(at(...from).x, at(...from).y);
		if (free) await page.keyboard.down('Alt');
		await page.mouse.down();
		await page.mouse.move(at(...to).x, at(...to).y, { steps: 5 });
		await page.mouse.up();
		if (free) await page.keyboard.up('Alt');
	};
	const grown = await footprint(page);
	await drag([3, 3], [3.3, 3.2]);
	expect(await footprint(page)).toBe(grown);
	await drag([3, 3], [2.4, 3.6], true);
	expect(await footprint(page)).not.toBe(grown);

	await expect(page.locator('.struct-item')).toHaveCount(2);
	await expect(page.getByLabel('Sits on')).toHaveCount(0); // still on the ground, beside the square

	// Double-click a point to remove it
	const overhang = await footprint(page);
	await page.mouse.click(at(8, 0).x, at(8, 0).y);
	await page.waitForTimeout(150);
	await page.mouse.dblclick(at(12, 3).x, at(12, 3).y);
	expect(await footprint(page)).not.toBe(overhang);

	// The square's corners can be moved too, once it's an outline
	await page.getByRole('button', { name: 'Expand Structure' }).first().click();
	await page.getByRole('button', { name: 'Edit points' }).click();
	await expect(page.getByRole('button', { name: 'Edit points' })).toHaveCount(0);

	// Zoomed in, with the addition's point handles showing
	await page.mouse.click(at(8, 0).x, at(8, 0).y);
	for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
	await page.waitForTimeout(300);
	await page.screenshot({ path: 'tests/screenshots/draw-outline.png' });
});
