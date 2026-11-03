import { expect, test } from '@playwright/test';

test('modeler page loads with palette', async ({ page }) => {
	await page.goto('/modeler');
	await expect(page.getByRole('complementary', { name: 'Shape palette' })).toBeVisible();
	await expect(page.getByText('Rectangle')).toBeVisible();
	await expect(page.getByText('Square')).toBeVisible();
	await expect(page.getByText('Triangle')).toBeVisible();
});
