import { expect, test } from '@playwright/test';
import { decodePng } from '../../lib/server/png';

test('modeler page loads with palette', async ({ page }) => {
	await page.goto('/modeler');
	await expect(page.getByRole('complementary', { name: 'Shape palette' })).toBeVisible();
	await expect(page.getByLabel('Drag to place Square')).toBeVisible();
	await expect(page.getByLabel('Drag to place Circle')).toBeVisible();
	await expect(page.getByLabel('Drag to place Triangle')).toBeVisible();
});

test('mouse wheel zooms the plan view', async ({ page }) => {
	await page.goto('/modeler');
	const canvas = page.locator('.canvas-area canvas');
	await page.getByLabel('Drag to place Square').dragTo(canvas);
	await page.keyboard.press('Escape');
	const box = (await canvas.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	const before = await canvas.screenshot();
	for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 300);
	await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
});

test('dragging empty space pans and keeps the selection; a click still deselects', async ({ page }) => {
	await page.goto('/modeler');
	const canvas = page.locator('.canvas-area canvas');
	await page.getByLabel('Drag to place Square').dragTo(canvas);
	await expect(page.locator('.struct-item')).toHaveCount(1);
	const box = (await canvas.boundingBox())!;
	const empty = { x: box.x + box.width / 2 + 150, y: box.y + box.height / 2 + 120 };

	// Drag on empty ground: the view moves, the square stays selected
	const before = await canvas.screenshot();
	await page.mouse.move(empty.x, empty.y);
	await page.mouse.down();
	await page.mouse.move(empty.x - 120, empty.y - 60, { steps: 6 });
	await page.mouse.up();
	await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
	await page.keyboard.press('Delete');
	await expect(page.locator('.struct-item')).toHaveCount(0);

	// A plain click on empty ground deselects, so Delete does nothing
	await page.keyboard.press('ControlOrMeta+z');
	await expect(page.locator('.struct-item')).toHaveCount(1);
	await page.getByRole('button', { name: 'Fit' }).click();
	await page.locator('.struct-item button').first().click(); // select via the panel
	await page.mouse.click(box.x + 20, box.y + 20);
	await page.keyboard.press('Delete');
	await expect(page.locator('.struct-item')).toHaveCount(1);
});

test('zoom buttons and Fit change the plan view', async ({ page }) => {
	await page.goto('/modeler');
	const canvas = page.locator('.canvas-area canvas');
	await page.getByLabel('Drag to place Square').dragTo(canvas);
	await page.keyboard.press('Escape');
	const start = await canvas.screenshot();
	await page.getByRole('button', { name: 'Zoom in' }).click();
	await expect.poll(async () => (await canvas.screenshot()).equals(start)).toBe(false);
	const zoomed = await canvas.screenshot();
	await page.getByRole('button', { name: 'Fit' }).click();
	await expect.poll(async () => (await canvas.screenshot()).equals(zoomed)).toBe(false);
});

test('the scale bar follows the zoom', async ({ page }) => {
	await page.goto('/modeler');
	const label = page.locator('.scale-bar__label');
	await expect(label).toHaveText('25 ft'); // default 100 m view
	for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
	await expect(label).not.toHaveText('25 ft');
	// The bar's drawn length matches its label at the new zoom
	const canvas = (await page.locator('.canvas-area canvas').boundingBox())!;
	const bar = (await page.locator('.scale-bar__line').boundingBox())!;
	const feet = Number((await label.textContent())!.replace(' ft', ''));
	const viewMeters = 100 * 1.25 ** 2; // within the board on a wide canvas
	expect(bar.width).toBeCloseTo(((feet / 3.28084) / viewMeters) * canvas.height, 0);
});

test('the Social tab scrolls to the end, and long notes show in full', async ({ page }) => {
	await page.goto('/modeler');
	await page.getByRole('tab', { name: 'Social' }).click();
	const notes = page.locator('#profile-notes'); // the congregation's Context field (not the Notes tab)
	await notes.fill(Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of the congregation notes, long enough to wrap.`).join('\n'));
	await page.locator('.drawer').evaluate((el) => (el.scrollTop = el.scrollHeight));
	// The box grows with its text, and the drawer scrolls to its bottom edge
	expect(await notes.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
	const [box, panel] = [await notes.boundingBox(), await page.locator('.drawer').boundingBox()];
	expect(box!.y + box!.height).toBeLessThanOrEqual(panel!.y + panel!.height);
});

test('the right drawer slides over the canvas, reopens on a selection, and is remembered', async ({ page }) => {
	await page.goto('/modeler');
	const canvas = page.locator('.canvas-area canvas');
	const spatial = page.getByRole('tab', { name: 'Spatial' });
	await expect(page.locator('.drawer')).toBeVisible();
	const open = (await canvas.boundingBox())!.width;

	// Clicking the open tab slides the drawer away; the canvas keeps its size
	await spatial.click();
	await expect(page.locator('.drawer')).toBeHidden();
	await expect(spatial).toHaveAttribute('aria-selected', 'false');
	expect((await canvas.boundingBox())!.width).toBe(open);
	await page.waitForTimeout(400);
	await page.screenshot({ path: 'tests/screenshots/drawer-closed.png' });

	// Remembered across a reload
	await page.reload();
	await expect(page.getByRole('tab', { name: 'Social' })).toBeVisible();
	await expect(page.locator('.drawer')).toBeHidden();

	// Placing (and so selecting) a building opens it to Spatial
	await page.getByLabel('Drag to place Square').dragTo(canvas);
	await expect(page.locator('.drawer')).toBeVisible();
	await expect(spatial).toHaveAttribute('aria-selected', 'true');

	// The panel button in the breadcrumb bar closes and opens it too
	await page.getByRole('button', { name: 'Close panel' }).click();
	await expect(page.locator('.drawer')).toBeHidden();
	await page.getByRole('button', { name: 'Open panel' }).click();
	await expect(page.locator('.drawer')).toBeVisible();

	// The other tab switches the drawer's content
	await page.getByRole('tab', { name: 'Social' }).click();
	await expect(page.getByRole('heading', { name: 'Congregation' })).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/drawer-social.png' });
});

test('the palette scrolls on a short screen, so trees are reachable', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 600 });
	await page.goto('/modeler');
	const palette = page.getByRole('complementary', { name: 'Shape palette' });
	await palette.evaluate((el) => (el.scrollTop = el.scrollHeight));
	const tree = page.getByRole('button', { name: 'Place tree' });
	await expect(tree).toBeInViewport();
	await tree.click();
	await expect(tree).toHaveAttribute('aria-pressed', 'true');
});

test('palette sections collapse, and stay collapsed', async ({ page }) => {
	await page.goto('/modeler');
	const toggle = page.getByRole('button', { name: 'Open Spaces' });
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByLabel('Draw Parking')).toBeVisible();
	await toggle.click();
	await expect(page.getByLabel('Draw Parking')).toHaveCount(0);
	await page.screenshot({ path: 'tests/screenshots/palette-collapsed.png' });
	await page.reload();
	await expect(page.getByRole('button', { name: 'Open Spaces' })).toHaveAttribute('aria-expanded', 'false');
	await page.getByRole('button', { name: 'Open Spaces' }).click();
	await expect(page.getByLabel('Draw Parking')).toBeVisible();
});

test("dragging the plan view stops at the board's edge, side to side as well as up and down", async ({ page }) => {
	await page.goto('/modeler');
	const canvas = page.locator('.canvas-area canvas');
	const box = (await canvas.boundingBox())!;
	// A square at the middle of the ground (the view starts centered on it, 100 m tall)
	await page.getByLabel('Drag to place Square').dragTo(canvas, { targetPosition: { x: box.width / 2, y: box.height / 2 } });
	await canvas.click({ position: { x: box.width / 2, y: 20 } }); // deselect

	// Drag far to the left: the view stops when its right edge meets the ground's (200 m out)
	for (let i = 0; i < 3; i++) {
		await page.mouse.move(box.x + box.width - 300, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 5 });
		await page.mouse.up();
	}
	// The view is 100 m tall and width / height wide, so its center stops at 200 - 50 × aspect.
	// The square sits that far left of the canvas's middle, still on screen
	const pxPerM = box.height / 100;
	const stop = 200 - 50 * (box.width / box.height);
	const squareX = box.x + box.width / 2 - stop * pxPerM;
	expect(squareX).toBeGreaterThan(box.x);
	const buf = await page.screenshot({ clip: { x: squareX - 2, y: box.y + box.height / 2 - 2, width: 4, height: 4 } });
	const png = await decodePng(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
	expect(png.data[0]).toBeLessThan(0xb0); // the square's dark chipboard, not the near-white grid
});

test('notes: numbered dots placed on the plan, written in the Notes drawer, as in the pattern book', async ({ page }) => {
	await page.goto('/modeler');
	const canvas = page.locator('.canvas-area canvas');
	const box = (await canvas.boundingBox())!;
	const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	await page.getByLabel('Drag to place Square').dragTo(canvas, { targetPosition: { x: box.width / 2, y: box.height / 2 } });

	// Place two notes; each opens its text box, ready to type
	await page.getByRole('tab', { name: 'Notes' }).click();
	await page.getByRole('button', { name: 'Place note' }).click();
	await expect(page.getByText('Click the spot to number. Esc to cancel.')).toBeVisible();
	await page.mouse.click(mid.x, mid.y);
	await expect(page.getByRole('textbox', { name: 'Note 1' })).toBeFocused();
	await page.keyboard.type('The nave and fellowship halls remain active for worship.');
	await page.getByRole('button', { name: 'Place note' }).click();
	await page.mouse.click(mid.x - 150, mid.y + 60);
	await page.keyboard.type('New cottages along the lane.');
	const dots = page.locator('.note-dot');
	await expect(dots).toHaveText(['1', '2']);

	// A dot drags to a new spot in plan view
	const before = (await dots.nth(1).boundingBox())!;
	await dots.nth(1).hover();
	await page.mouse.down();
	await page.mouse.move(before.x + 60, before.y - 40, { steps: 5 });
	await page.mouse.up();
	expect((await dots.nth(1).boundingBox())!.x).toBeGreaterThan(before.x + 40);
	await page.screenshot({ path: 'tests/screenshots/notes-plan.png' });

	// The analysis lists them beside the plan
	await page.getByRole('button', { name: 'Analysis' }).click();
	await expect(page.getByRole('list', { name: 'Notes' })).toContainText('New cottages along the lane.');
	await page.keyboard.press('Escape');

	// In 3D the dots stand on the model
	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(800);
	await expect(dots).toHaveCount(2);
	await page.screenshot({ path: 'tests/screenshots/notes-3d.png' });
	await page.getByRole('button', { name: 'Plan', exact: true }).click();

	// Deleting note 1 renumbers the rest
	await page.getByRole('button', { name: 'Delete note 1' }).click();
	await expect(dots).toHaveText(['1']);
	await expect(page.getByRole('textbox', { name: 'Note 1' })).toHaveValue('New cottages along the lane.');

	// The dots show only while the Notes drawer is open
	await page.getByRole('tab', { name: 'Spatial' }).click();
	await expect(dots).toHaveCount(0);
});
