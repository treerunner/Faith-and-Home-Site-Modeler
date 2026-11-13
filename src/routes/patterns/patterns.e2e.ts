import { expect, test, type Page } from '@playwright/test';

// A new site's plan view: 100 m tall, centered on the origin
async function clickSite(page: Page, x: number, y: number) {
	const box = (await page.locator('.canvas-area canvas').boundingBox())!;
	const s = box.height / 100;
	await page.mouse.click(box.x + box.width / 2 + x * s, box.y + box.height / 2 + y * s);
}

test('the analysis names the cell, its pattern and variant, and opens the pattern page', async ({ page, context }) => {
	await page.goto('/modeler');

	// An urban Box-Plus: a square cut into two touching pieces, one reused for housing
	await page.getByLabel('Drag to place Square').dragTo(page.locator('.canvas-area canvas'));
	await page.getByRole('button', { name: 'Cut', exact: true }).click();
	await clickSite(page, 1, -10);
	await clickSite(page, 1, 10);
	await page.getByRole('button', { name: 'Reuse whole building' }).click();
	await page.getByRole('group', { name: 'Site type' }).getByRole('button', { name: 'Urban', exact: true }).click();

	// Open to partners picks the housing partner variant
	await page.getByRole('tab', { name: 'Social' }).click();
	await page.getByRole('group', { name: 'Would you partner with a housing or community organization?' }).getByRole('button', { name: 'Open' }).click();

	await page.getByRole('button', { name: 'Analysis' }).click();
	const yours = page.getByRole('region', { name: 'Your pattern' });
	await expect(yours.locator('.pattern-cell')).toHaveText('Urban · Box-Plus · Adaptive reuse');
	const name = yours.locator('.pattern-item .pattern-name');
	await expect(name).toHaveText('Urban box-plus, adaptive reuse');
	await expect(yours.locator('.pattern-variant')).toContainText('With a housing partner');
	await page.screenshot({ path: 'tests/screenshots/matrix-analysis.png' });

	// The pattern page opens in a new tab, so the model stays put
	const [tab] = await Promise.all([context.waitForEvent('page'), name.click()]);
	await tab.waitForLoadState();
	await expect(tab).toHaveURL(/\/patterns\/urban-box-plus-adaptive-reuse$/);
	await expect(tab.getByRole('note')).toHaveText('Placeholder pattern. The team will replace this content.');
	await expect(tab.getByRole('heading', { name: 'Urban box-plus, adaptive reuse' })).toBeVisible();
	await expect(tab.getByRole('table', { name: 'Urban sites' }).getByLabel('Covered', { exact: true })).toHaveCount(2); // reuse and reuse + new
	await expect(tab.getByRole('table', { name: 'Suburban sites' }).getByLabel('Covered', { exact: true })).toHaveCount(0);
	const variants = tab.getByRole('region', { name: 'Variants' });
	await expect(variants).toContainText('With a housing partner');
	await expect(variants).toContainText('When open to partners');
	await tab.screenshot({ path: 'tests/screenshots/matrix-pattern-page.png', fullPage: true });
	await expect(name).toBeVisible(); // the first tab still has the model and its analysis open
});

test('an uncovered cell shows the closest written pattern and what differs', async ({ page }) => {
	await page.goto('/modeler');
	const yours = page.getByRole('region', { name: 'Your pattern' });

	// A new triangular church on a suburban site: an Object, which no new-development pattern covers
	await page.getByLabel('Drag to place Triangle').dragTo(page.locator('.canvas-area canvas'));
	await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'New', exact: true }).click();
	await page.getByRole('button', { name: 'Analysis' }).click();
	await expect(yours).toContainText('Choose a site type to place the site in the pattern matrix.');
	await page.keyboard.press('Escape');

	await page.getByRole('group', { name: 'Site type' }).getByRole('button', { name: 'Suburban', exact: true }).click();
	await page.getByRole('button', { name: 'Analysis' }).click();
	await expect(yours.locator('.pattern-cell')).toHaveText('Suburban · Object · New development');
	await expect(yours).toContainText('No pattern written for this combination yet.');
	await expect(yours).toContainText('Closest written pattern Suburban box and box-plus, new development on the lot (differs in building type)');
	await page.keyboard.press('Escape');

	// Selling is invisible to the model: the plan says so with the override
	await page.getByRole('group', { name: 'Development type' }).getByRole('button', { name: 'Downsize / sell' }).click();
	await page.getByRole('button', { name: 'Analysis' }).click();
	await expect(yours.locator('.pattern-cell')).toHaveText('Suburban · Object · Downsize / sell');
	await expect(yours.locator('.pattern-item .pattern-name')).toHaveText('Right-sizing the property');
});

test('the matrix shows every cell and the pattern written for it', async ({ page }) => {
	await page.goto('/patterns');
	await page.getByRole('link', { name: 'Pattern matrix' }).click();
	await expect(page).toHaveURL(/\/patterns\/matrix$/);
	await expect(page.getByText('of 60 cells have a written pattern')).toBeVisible();
	await expect(page.locator('td.cell')).toHaveCount(60);
	const rural = page.getByRole('table', { name: 'Rural sites' });
	await expect(rural.getByRole('link', { name: 'Rural cluster, cottage housing' })).toHaveCount(1);
	await expect(rural.getByRole('link', { name: 'Stewarding what you have' })).toHaveCount(4);
	await page.screenshot({ path: 'tests/screenshots/matrix-coverage.png', fullPage: true });
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
