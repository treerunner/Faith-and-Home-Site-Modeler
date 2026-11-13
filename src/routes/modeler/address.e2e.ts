import { expect, test, type Page } from '@playwright/test';
import type { ContextResponse, Suggestion } from '../../lib/modeler/address';

// Address mode with our own /api/geocode* and /api/context mocked, so this never depends on
// Photon, Census, Overture or PASDA being up. Those are covered by fixture tests in
// src/lib/server/parsers.spec.ts. Saves to the DATABASE_URL database and cleans up.

type Pt = [number, number];
const rect = (x: number, y: number, w: number, d: number): Pt[] => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];

const PLACE: Suggestion = { label: 'Grace Church, 100 Main Street, Allentown, Pennsylvania 18104', lat: 40.5988823, lng: -75.4962986, precise: true };

const CONTEXT: ContextResponse = {
	buildings: [
		{ id: 'church', polygon: rect(-12, -10, 24, 14), height: 9, tags: { building: 'church', height: '9' }, name: 'Grace Church' },
		{ id: 'hall', polygon: rect(-8, 8, 12, 8), height: 8, tags: { building: 'yes' }, name: 'Parish hall' },
		{ id: 'n1', polygon: rect(40, -20, 15, 12), height: 7, tags: { building: 'house' } },
		{ id: 'n2', polygon: rect(-60, 10, 12, 10), height: 7, tags: { building: 'house' } },
	],
	roads: [
		{ line: [[-150, -30], [150, -30]], kind: 'residential' },
		{ line: [[30, -150], [30, 150]], kind: 'tertiary' },
	],
	parcels: [
		{ id: '640700000001', address: '100 MAIN ST', polygon: rect(-20, -20, 45, 40) },
		{ id: '640700000002', address: '120 MAIN ST', polygon: rect(32, -25, 30, 30) },
	],
	sources: ['overture', 'pasda-lehigh'],
	parcelsFailed: false,
};

async function mockAddressApi(page: Page, context: ContextResponse) {
	await page.route('**/api/geocode/suggest?**', (r) => r.fulfill({ json: [PLACE] }));
	await page.route('**/api/geocode?**', (r) => r.fulfill({ json: PLACE }));
	await page.route('**/api/context?**', (r) => r.fulfill({ json: context }));
}

// Plan view is centered on the origin; site meters to page pixels at the current zoom
async function clickSite(page: Page, x: number, y: number, viewHeight: number) {
	const box = (await page.locator('.canvas-area canvas').boundingBox())!;
	const scale = box.height / viewHeight;
	await page.mouse.click(box.x + box.width / 2 + x * scale, box.y + box.height / 2 + y * scale);
}

const created: string[] = [];
test.afterAll(async ({ request, baseURL }) => {
	const sites: { id: string; name: string }[] = await (await request.get('/api/sites')).json();
	for (const s of sites.filter((s) => created.includes(s.name))) {
		const res = await request.delete(`/api/sites/${s.id}`, { headers: { origin: baseURL! } });
		expect(res.status()).toBe(204);
	}
});

test('start from an address: choose the parcel and add its buildings', async ({ page }) => {
	await mockAddressApi(page, CONTEXT);
	await page.goto('/modeler');
	const name = `E2E address ${Date.now()}`;
	created.push(name);
	await page.getByLabel('Site name').fill(name);

	await page.getByLabel('Find an address').fill('100 Main');
	const option = page.getByRole('option', { name: PLACE.label });
	await expect(option).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/m6-address-search.png' });
	await option.click();

	// The neighborhood loads and parcels are offered
	await expect(page.getByText('Click your parcel.')).toBeVisible();
	await expect(page.getByLabel('Address').getByText(PLACE.label)).toBeVisible();
	await expect(page.getByText('© OpenStreetMap contributors, Overture Maps Foundation · Parcels: Lehigh County via PASDA')).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/m6-choose-parcel.png' });

	// Click inside the first parcel: its two buildings are offered, by name
	await clickSite(page, 0, 0, 220);
	await expect(page.getByText('Add the 2 buildings on this parcel to Existing conditions?')).toBeVisible();
	await expect(page.getByText('Grace Church and Parish hall')).toBeVisible();
	await page.getByRole('button', { name: 'Add buildings' }).click();

	// They become existing structures, with height provenance shown
	await page.getByRole('button', { name: 'Expand Grace Church' }).click();
	await expect(page.getByText('Height from map data')).toBeVisible();
	await page.getByRole('button', { name: 'Collapse Grace Church' }).click();
	await page.getByRole('button', { name: 'Expand Parish hall' }).click();
	await expect(page.getByText('Default height. Confirm the stories.')).toBeVisible();
	await page.getByLabel('Stories').fill('2');
	await expect(page.getByText('Default height. Confirm the stories.')).toHaveCount(0);

	// Site type is suggested from the neighborhood and preselected
	const suggested = await page.getByText(/Suggested from the neighborhood: /).textContent();
	const type = suggested!.split(': ')[1];
	await expect(page.getByRole('button', { name: type[0].toUpperCase() + type.slice(1), exact: true })).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: '3D' }).click();
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'tests/screenshots/m6-3d-context.png' });
	await page.getByRole('button', { name: 'Plan', exact: true }).click();

	// Everything persists
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	// "Saved" shows when the write finishes; the URL moves to the site just after. Wait for it.
	await expect(page).toHaveURL(/\/modeler\/e2e-address-\d+\/existing-conditions$/);
	await page.reload();
	await expect(page.getByLabel('Address').getByText(PLACE.label)).toBeVisible();
	await expect(page.locator('.struct-item')).toHaveCount(2);
	await expect(page.getByText(/© OpenStreetMap contributors/)).toBeVisible();
	await expect(page.getByText('Click your parcel.')).toHaveCount(0);
});

test('where there is no parcel data, trace the lot', async ({ page }) => {
	await mockAddressApi(page, { ...CONTEXT, parcels: [], sources: ['overture'] });
	await page.goto('/modeler');

	await page.getByLabel('Find an address').fill('100 Main');
	await page.getByRole('option', { name: PLACE.label }).click();
	await expect(page.getByText('No parcel data here. Click to trace your lot.')).toBeVisible();

	for (const [x, y] of [[-20, -20], [25, -20], [25, 20], [-20, 20]] as Pt[]) await clickSite(page, x, y, 220);
	await expect(page.getByText('4 points. Click the first point to close.')).toBeVisible();
	await clickSite(page, -20, -20, 220);
	await expect(page.getByText('Add the 2 buildings on this parcel to Existing conditions?')).toBeVisible();
	await page.getByRole('button', { name: 'Skip' }).click();
	await expect(page.locator('.struct-item')).toHaveCount(0);

	// Changing the address clears it after a confirm; structures would stay
	await page.getByRole('button', { name: 'Change' }).click();
	await page.getByRole('button', { name: 'Clear' }).click();
	await expect(page.getByLabel('Find an address')).toBeVisible();
	await expect(page.getByText(/© OpenStreetMap contributors/)).toHaveCount(0);
});

test('a large parcel grows the board to fit it', async ({ page }) => {
	// A long rural lot reaching 150 m east: past the 120 m edge margin of the default board
	const bigLot = rect(-20, -20, 170, 40);
	const halves: (string | null)[] = [];
	await page.route('**/api/geocode/suggest?**', (r) => r.fulfill({ json: [PLACE] }));
	await page.route('**/api/context?**', async (r) => {
		halves.push(new URL(r.request().url()).searchParams.get('half'));
		if (halves.length > 1) await new Promise((done) => setTimeout(done, 300)); // let the banner show
		await r.fulfill({ json: { ...CONTEXT, parcels: [{ id: 'big', address: 'FARM RD', polygon: bigLot }] } });
	});
	await page.goto('/modeler');
	await page.getByLabel('Find an address').fill('100 Main');
	await page.getByRole('option', { name: PLACE.label }).click();
	await expect(page.getByText('Click your parcel.')).toBeVisible();
	await clickSite(page, 0, 0, 220);

	await expect(page.getByText('This parcel is large. Loading more of the neighborhood…')).toBeVisible();
	// The long lot also takes in the house 47 m east
	await expect(page.getByText('Add the 3 buildings on this parcel to Existing conditions?')).toBeVisible();
	// First load at the default board; one reload sized to the parcel: 150 m + 60 m margin
	expect(halves).toEqual([null, '210']);
});
