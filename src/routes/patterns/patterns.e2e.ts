import { expect, test, type Page } from '@playwright/test';

// A new site's plan view: 100 m tall, centered on the origin
async function clickSite(page: Page, x: number, y: number) {
	const box = (await page.locator('.canvas-area canvas').boundingBox())!;
	const s = box.height / 100;
	await page.mouse.click(box.x + box.width / 2 + x * s, box.y + box.height / 2 + y * s);
}

test('the analysis shows one pattern when it fits closely, and opens its page', async ({ page, context }) => {
	await page.goto('/modeler');

	// An urban Box-Plus: a square cut into two touching pieces, one reused for housing
	await page.getByLabel('Drag to place Square').dragTo(page.locator('.canvas-area canvas'));
	await page.getByRole('button', { name: 'Cut', exact: true }).click();
	await clickSite(page, 1, -10);
	await clickSite(page, 1, 10);
	await page.getByRole('button', { name: 'Reuse whole building' }).click();
	await page.getByRole('group', { name: 'Site type' }).getByRole('button', { name: 'Urban', exact: true }).click();

	// Two culture answers
	await page.getByRole('tab', { name: 'Social' }).click();
	await page.getByRole('group', { name: 'Would you partner with a housing or community organization?' }).getByRole('button', { name: 'Open' }).click();
	await page.getByRole('group', { name: 'Who would steward a project?' }).getByRole('button', { name: 'Some staff' }).click();

	await page.getByRole('button', { name: 'Analysis' }).click();
	const yours = page.getByRole('region', { name: 'Your pattern' });
	await expect(yours.locator('.pattern-item')).toHaveCount(1);
	const first = yours.locator('.pattern-item');
	await expect(first.locator('.pattern-name')).toHaveText('Urban box-plus, adaptive reuse');
	await expect(first).toContainText('83% fit');
	await expect(first).toContainText('Matches Box-Plus, urban site, adaptive reuse, open to partners, some staff');
	await page.screenshot({ path: 'tests/screenshots/patterns-analysis.png' });

	// The pattern page opens in a new tab, so the model stays put
	const [tab] = await Promise.all([context.waitForEvent('page'), first.locator('.pattern-name').click()]);
	await tab.waitForLoadState();
	await expect(tab).toHaveURL(/\/patterns\/urban-box-plus-adaptive-reuse$/);
	await expect(tab.getByRole('note')).toHaveText('Placeholder pattern. The team will replace this content.');
	await expect(tab.getByRole('heading', { name: 'Urban box-plus, adaptive reuse' })).toBeVisible();
	await tab.screenshot({ path: 'tests/screenshots/patterns-page.png' });
	await expect(first.locator('.pattern-name')).toBeVisible(); // the first tab still has the model and its analysis open
});

test('the analysis shows no pattern when none fits closely', async ({ page }) => {
	await page.goto('/modeler');
	// A new triangular church on a rural site: no placeholder pattern reaches 75%
	await page.getByLabel('Drag to place Triangle').dragTo(page.locator('.canvas-area canvas'));
	await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'New', exact: true }).click();
	await page.getByRole('group', { name: 'Site type' }).getByRole('button', { name: 'Rural', exact: true }).click();
	await page.getByRole('button', { name: 'Analysis' }).click();
	await expect(page.getByRole('heading', { name: 'Spatial Metrics' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Your pattern' })).toHaveCount(0);
});

test('the pattern library lists every pattern and the masthead links to it', async ({ page }) => {
	await page.goto('/modeler');
	await page.getByRole('link', { name: 'browse' }).click();
	await expect(page).toHaveURL(/\/patterns$/);
	await expect(page.getByRole('list', { name: 'Patterns' }).locator('> li')).toHaveCount(8);
	await page.getByRole('link', { name: 'Rural cluster, cottage housing' }).click();
	await expect(page.getByRole('heading', { name: 'Rural cluster, cottage housing' })).toBeVisible();
	await page.goto('/patterns/no-such-pattern');
	await expect(page.getByText('Pattern not found')).toBeVisible();
});
