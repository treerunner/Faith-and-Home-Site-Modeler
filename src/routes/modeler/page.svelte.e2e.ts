import { expect, test } from '@playwright/test';

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
