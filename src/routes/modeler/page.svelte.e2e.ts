import { expect, test } from '@playwright/test';

test('modeler page loads with palette', async ({ page }) => {
	await page.goto('/modeler');
	await expect(page.getByRole('complementary', { name: 'Shape palette' })).toBeVisible();
	await expect(page.getByLabel('Drag to place Square')).toBeVisible();
	await expect(page.getByLabel('Drag to place Circle')).toBeVisible();
	await expect(page.getByLabel('Drag to place Triangle')).toBeVisible();
});
