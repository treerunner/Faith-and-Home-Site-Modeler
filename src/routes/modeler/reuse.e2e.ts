import { expect, test, type Page } from '@playwright/test';

// Saves to the DATABASE_URL database and cleans up.

const created: string[] = []; // site ids
test.afterAll(async ({ request, baseURL }) => {
	for (const id of created) {
		expect((await request.delete(`/api/sites/${id}`, { headers: { origin: baseURL! } })).status()).toBe(204);
	}
});

// A new site's plan view: 100 m tall, centered on the origin
async function clickSite(page: Page, x: number, y: number) {
	const box = (await page.locator('.canvas-area canvas').boundingBox())!;
	const s = box.height / 100;
	await page.mouse.click(box.x + box.width / 2 + x * s, box.y + box.height / 2 + y * s);
}

const statusPills = (page: Page) => page.getByRole('group', { name: 'Status' }).getByRole('button');
const zoneUnits = (page: Page) => page.locator('.zone-props').getByLabel('Housing units');

test('reuse part of an existing building: zones, floors, housing units', async ({ page }) => {
	await page.goto('/modeler');
	const canvas = page.locator('.canvas-area canvas');
	await page.getByLabel('Drag to place Square').dragTo(canvas);
	await page.getByLabel('Stories').fill('3');

	// Status is what stands; reuse is its own section
	await expect(statusPills(page)).toHaveText(['Existing', 'New', 'Removed']);

	// Whole building
	await page.getByRole('button', { name: 'Reuse whole building' }).click();
	await expect(page.locator('.zone-row')).toHaveText(/Floors 1–3\s*Housing/);
	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'tests/screenshots/reuse-zone-3d.png' });
	await page.getByRole('button', { name: 'Plan', exact: true }).click();

	// Replace it with a drawn area: the west half (the 6 m square spans -3..3)
	await page.locator('.zone-row').click();
	await page.getByRole('button', { name: 'Delete zone' }).click();
	await expect(page.locator('.zone-row')).toHaveCount(0);
	await page.getByRole('button', { name: 'Draw reuse area' }).click();
	await expect(page.getByText('Click to outline the reuse area. Esc to cancel.')).toBeVisible();
	for (const [x, y] of [[-6, -6], [0, -6], [0, 6], [-6, 6], [-6, -6]]) await clickSite(page, x, y);

	// Housing on the 2nd floor only: 18 m² = 194 sq ft, under one 900 sq ft unit
	await page.locator('.zone-row').click();
	await page.locator('.zone-props select').nth(0).selectOption('2');
	await page.locator('.zone-props select').nth(1).selectOption('2');
	await expect(page.locator('.zone-row')).toHaveText(/Floor 2\s*Housing\s*194 sq ft/);
	await expect(zoneUnits(page)).toHaveAttribute('placeholder', '0');
	await zoneUnits(page).fill('2');
	await page.screenshot({ path: 'tests/screenshots/reuse-zone-panel.png' });

	// The analysis counts the zone and its units as adaptive reuse
	await page.getByRole('button', { name: 'Analysis' }).click();
	await expect(page.getByText('1 reuse zone')).toBeVisible();
	await expect(page.getByText('2 adaptive reuse')).toBeVisible();
	await page.keyboard.press('Escape');

	// Changing the building to New asks first, because its zone would go
	await statusPills(page).filter({ hasText: 'New' }).click();
	await expect(page.getByText('Reuse happens in existing buildings. This drops its 1 reuse zone.')).toBeVisible();
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.locator('.zone-row')).toHaveCount(1);
});

test('a site saved with the old Reuse status opens as Existing with a reuse zone', async ({ page, request, baseURL }) => {
	const id = crypto.randomUUID();
	created.push(id);
	const legacy = {
		id,
		name: `E2E legacy reuse ${Date.now()}`,
		plans: [{
			id: 'p', name: 'Existing conditions', slug: 'existing-conditions',
			structures: [{
				id: 's1', label: 'Old school', status: 'adaptive_reuse', uses: ['housing'], stories: 2, dwellings: 8,
				parts: [{ id: 'a', shape: 'rect', x: 0, y: 0, w: 20, d: 10, rotation: 0 }],
			}],
		}],
	};
	const res = await request.put(`/api/sites/${id}`, { headers: { origin: baseURL! }, data: legacy });
	expect(res.ok()).toBe(true);
	const { slug } = await res.json();

	await page.goto(`/modeler/${slug}`);
	await page.getByRole('button', { name: 'Expand Old school' }).click();
	await expect(statusPills(page).filter({ hasText: 'Existing' })).toHaveClass(/pill--active/);
	await expect(page.locator('.zone-row')).toHaveText(/Floors 1–2\s*Housing/);
	await page.locator('.zone-row').click();
	await expect(zoneUnits(page)).toHaveValue('8');
});
