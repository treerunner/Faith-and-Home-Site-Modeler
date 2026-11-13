import { expect, test, type Page } from '@playwright/test';

// Saves to the DATABASE_URL database and cleans up.

const VIEW_HEIGHT = 100; // a new site's plan view, centered on the origin

async function toPage(page: Page, x: number, y: number) {
	const box = (await page.locator('.canvas-area canvas').boundingBox())!;
	const scale = box.height / VIEW_HEIGHT;
	return { x: box.width / 2 + x * scale, y: box.height / 2 + y * scale, box };
}

async function clickSite(page: Page, x: number, y: number) {
	const p = await toPage(page, x, y);
	await page.mouse.click(p.box.x + p.x, p.box.y + p.y);
}

async function placeSquare(page: Page, x: number, y: number) {
	const p = await toPage(page, x, y);
	await page.getByLabel('Drag to place Square').dragTo(page.locator('.canvas-area canvas'), { targetPosition: { x: p.x, y: p.y } });
}

const typePill = (page: Page, name: string) => page.getByRole('group', { name: 'Building type' }).getByRole('button', { name, exact: true });

const created: string[] = [];
test.afterAll(async ({ request, baseURL }) => {
	const sites: { id: string; name: string }[] = await (await request.get('/api/sites')).json();
	for (const s of sites.filter((s) => created.includes(s.name))) {
		expect((await request.delete(`/api/sites/${s.id}`, { headers: { origin: baseURL! } })).status()).toBe(204);
	}
});

test('cut a building into pieces: Box-Plus, with an override that persists', async ({ page }) => {
	await page.goto('/modeler');
	const name = `E2E split ${Date.now()}`;
	created.push(name);
	await page.getByLabel('Site name').fill(name);

	await placeSquare(page, 0, 0);
	await expect(typePill(page, 'Box')).toHaveAttribute('aria-pressed', 'true');

	// Cut across the square, 1 m east of center
	await page.getByRole('button', { name: 'Cut', exact: true }).click();
	await expect(page.getByText('Click two points across the part to cut off. The cut stops at your clicks. Esc to cancel.')).toBeVisible();
	await clickSite(page, 1, -10);
	await expect(page.getByText('Click the second point.')).toBeVisible();
	await clickSite(page, 1, 10);

	// Two grouped pieces: one building of two pieces
	await expect(page.locator('.struct-item')).toHaveCount(2);
	await expect(page.getByRole('button', { name: /Structure 2/ })).toBeVisible();
	await expect(page.locator('.group-badge')).toHaveCount(2);
	await expect(typePill(page, 'Box-Plus')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('Inferred from the structures')).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/split-cut.png' });

	// A missed line changes nothing
	await page.getByRole('button', { name: 'Cut', exact: true }).first().click();
	await clickSite(page, 30, -10);
	await clickSite(page, 30, 10);
	await expect(page.getByText('Nothing was cut. Draw the line fully across the part. Esc to cancel.')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('.struct-item')).toHaveCount(2);

	// Override, then save and reload: the choice is kept
	await typePill(page, 'Object').click();
	await expect(typePill(page, 'Object')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('Inferred: Box-Plus.')).toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page).toHaveURL(/\/modeler\/e2e-split-\d+\/existing-conditions$/);
	await page.reload();
	await expect(typePill(page, 'Object')).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Use inferred' }).click();
	await expect(typePill(page, 'Box-Plus')).toHaveAttribute('aria-pressed', 'true');
});

test('three separate buildings nearby are a Cluster', async ({ page }) => {
	await page.goto('/modeler');
	await placeSquare(page, 0, 0);
	await placeSquare(page, 20, 0);
	await expect(typePill(page, 'Box')).toHaveAttribute('aria-pressed', 'true'); // two buildings: the main one decides
	await placeSquare(page, 0, 20);
	await expect(typePill(page, 'Cluster')).toHaveAttribute('aria-pressed', 'true');
	await page.screenshot({ path: 'tests/screenshots/split-building-type.png' });
});
