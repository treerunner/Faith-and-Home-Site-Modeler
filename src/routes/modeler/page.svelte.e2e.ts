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
