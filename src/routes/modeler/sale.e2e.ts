import { expect, test, type Page } from '@playwright/test';

// A new site's plan view: 100 m tall, centered on the origin
async function sitePoint(page: Page, x: number, y: number) {
	const box = (await page.locator('.canvas-area canvas').boundingBox())!;
	const s = box.height / 100;
	return { x: box.width / 2 + x * s, y: box.height / 2 + y * s, abs: { x: box.x + box.width / 2 + x * s, y: box.y + box.height / 2 + y * s } };
}

test('a plan marks land to sell: the building on it goes, and the plan is Downsize / sell', async ({ page }) => {
	await page.goto('/modeler');
	const canvas = page.locator('.canvas-area canvas');
	const square = page.getByLabel('Drag to place Square');
	await square.dragTo(canvas, { targetPosition: await sitePoint(page, -12, 0) });
	await page.getByLabel('Label').fill('Church');
	await square.dragTo(canvas, { targetPosition: await sitePoint(page, 18, 0) });
	await page.getByLabel('Label').fill('Parish hall');

	// Existing conditions are the property as it stands: land is sold in a plan
	const mark = page.getByRole('button', { name: 'Mark land to sell' });
	await expect(mark).toBeDisabled();
	await expect(page.getByText('Marked in a plan.')).toBeVisible();
	await page.getByRole('button', { name: 'New plan' }).click();
	await page.keyboard.press('Escape');
	await expect(mark).toBeEnabled();

	// Outline the east side, around the hall
	await mark.click();
	await expect(page.getByText('Click to outline the land to sell. Esc to cancel.')).toBeVisible();
	for (const [x, y] of [[8, -12], [30, -12], [30, 12], [8, 12], [8, -12]] as const) {
		const p = await sitePoint(page, x, y);
		await page.mouse.click(p.abs.x, p.abs.y);
	}
	const label = page.locator('.os-label').filter({ hasText: 'Land to sell' });
	await expect(label).toContainText(/5,\d{3} sq ft/); // 22 × 24 m, give or take a pixel
	await label.click();
	await expect(page.getByRole('heading', { name: 'Land to sell' })).toBeVisible();
	await expect(page.locator('.sale-note')).toContainText('Sold with the land: Parish hall.');
	await expect(page.getByRole('button', { name: /Parish hall/ }).getByTitle('Sold with the land in this plan')).toBeVisible();
	await expect(page.getByRole('button', { name: /Church/ }).getByTitle('Sold with the land in this plan')).toHaveCount(0);
	await page.waitForTimeout(300);
	await page.screenshot({ path: 'tests/screenshots/sale-plan.png' });
	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'tests/screenshots/sale-3d.png' });
	await page.getByRole('button', { name: 'Plan', exact: true }).click();

	// Selling with nothing else proposed is downsizing
	await page.getByRole('button', { name: 'Analysis' }).click();
	const report = page.getByRole('dialog', { name: 'Site analysis' });
	await expect(report.getByRole('row', { name: /Land to sell\s+5,\d{3} sq ft/ })).toBeVisible();
	await expect(report.getByText('Sold with it: Parish hall')).toBeVisible();
	// Only the church's 6 m square is the congregation's now
	await expect(report.getByRole('row', { name: /Gross floor area\s+388 sq ft/ })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Downsize / sell' })).toHaveClass(/active/);

	// A new building on the land kept makes it New development
	await square.dragTo(canvas, { targetPosition: await sitePoint(page, -12, 20) });
	await expect(page.getByRole('button', { name: 'New development' })).toHaveClass(/active/);
});
