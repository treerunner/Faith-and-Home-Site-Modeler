import { expect, test, type Page } from '@playwright/test';
import type { ContextResponse, Suggestion } from '../../lib/modeler/address';
import type { Terrain } from '../../lib/modeler/types';
import { decodePng } from '../../lib/server/png';

// Address mode with our own /api/geocode*, /api/context and /api/terrain mocked, so this never
// depends on Photon, Census, Overture, PASDA or USGS being up. Those are covered by fixture tests in
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
		{ id: '640700000001', address: '100 MAIN ST', polygon: rect(-20, -20, 45, 40) }, // under the address
		{ id: '640700000002', address: '120 MAIN ST', polygon: rect(32, -25, 30, 30) }, // across a gap
		{ id: '640700000003', address: '100 REAR MAIN ST', polygon: rect(-20, 20, 45, 25) }, // shares the south edge
	],
	sources: ['overture', 'pasda-lehigh'],
	buildingSources: ['Esri Community Maps', 'OpenStreetMap'],
	parcelsFailed: false,
};

// A hillside for a 150 m board at 5 m, like the Lehigh Valley's: rising 1 m every 20 m to the
// south, with a knoll to the northeast. About 24 m of relief: 2 m layers.
function hillside(half = 150): Terrain {
	const n = (2 * half) / 5 + 1;
	const heights: number[] = [];
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			const x = -half + j * 5, y = -half + i * 5;
			heights.push(Math.round((100 + y * 0.05 + 10 * Math.exp(-((x - 70) ** 2 + (y + 70) ** 2) / 1800)) * 10) / 10);
		}
	}
	return { spacing: 5, heights };
}

// Terrain defaults to none, as outside the US
async function mockAddressApi(page: Page, context: ContextResponse, terrain: Terrain | null = null) {
	await page.route('**/api/geocode/suggest?**', (r) => r.fulfill({ json: [PLACE] }));
	await page.route('**/api/geocode?**', (r) => r.fulfill({ json: PLACE }));
	await page.route('**/api/context?**', (r) => r.fulfill({ json: context }));
	await page.route('**/api/terrain?**', (r) => r.fulfill({ json: { terrain } }));
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

	// The neighborhood loads and the parcel under the address is preselected
	await expect(page.getByText('Is this your parcel? Click neighboring lots to add them.')).toBeVisible();
	await expect(page.getByLabel('Address').getByText(PLACE.label)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Data credits' })).toBeVisible();

	// A lot that doesn't touch is refused; the touching rear lot joins the property
	await clickSite(page, 47, -10, 220);
	await expect(page.getByText('That lot does not touch your parcel.')).toBeVisible();
	await clickSite(page, 0, 32, 220);
	await expect(page.getByText('2 lots selected. Click a lot to add or remove it.')).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/m6-choose-parcel.png' });
	await page.getByRole('button', { name: 'Use these lots' }).click();

	// The merged property's two buildings are offered, by name
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
	await expect(page.getByRole('button', { name: 'Data credits' })).toBeVisible(); // credits saved with the site
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
	await expect(page.getByRole('button', { name: 'Data credits' })).toHaveCount(0);
});

test('a large parcel grows the board to fit it', async ({ page }) => {
	// A long rural lot reaching 150 m east: past the 120 m edge margin of the default board
	const bigLot = rect(-20, -20, 170, 40);
	const halves: (string | null)[] = [];
	await page.route('**/api/geocode/suggest?**', (r) => r.fulfill({ json: [PLACE] }));
	await page.route('**/api/terrain?**', (r) => r.fulfill({ json: { terrain: null } }));
	await page.route('**/api/context?**', async (r) => {
		halves.push(new URL(r.request().url()).searchParams.get('half'));
		if (halves.length > 1) await new Promise((done) => setTimeout(done, 300)); // let the banner show
		await r.fulfill({ json: { ...CONTEXT, parcels: [{ id: 'big', address: 'FARM RD', polygon: bigLot }] } });
	});
	await page.goto('/modeler');
	await page.getByLabel('Find an address').fill('100 Main');
	await page.getByRole('option', { name: PLACE.label }).click();
	await page.getByRole('button', { name: 'Use this parcel' }).click();

	await expect(page.getByText('This parcel is large. Loading more of the neighborhood…')).toBeVisible();
	// The long lot also takes in the house 47 m east
	await expect(page.getByText('Add the 3 buildings on this parcel to Existing conditions?')).toBeVisible();
	// First load at the default board; one reload sized to the parcel: 150 m + 60 m margin
	expect(halves).toEqual([null, '210']);
});

test('data credits: a button on the map, a line in the analysis, and on PNG exports', async ({ page }) => {
	await mockAddressApi(page, CONTEXT);
	await page.goto('/modeler');
	await page.getByLabel('Find an address').fill('100 Main');
	await page.getByRole('option', { name: PLACE.label }).click();
	await page.getByRole('button', { name: 'Use this parcel' }).click();
	await page.getByRole('button', { name: 'Skip' }).click();

	// Map: one small button; the card lists exactly this site's sources
	const button = page.getByRole('button', { name: 'Data credits' });
	await expect(page.getByRole('dialog', { name: 'Data credits' })).toHaveCount(0);
	await button.click();
	const card = page.getByRole('dialog', { name: 'Data credits' });
	await expect(card).toContainText('Esri Community Maps (CC BY 4.0)');
	await expect(card).toContainText('Data from TomTom');
	await expect(card).toContainText('Lehigh County, via PASDA');
	await page.screenshot({ path: 'tests/screenshots/credits-card.png' });
	await page.mouse.click(600, 400); // clicking the model closes it
	await expect(card).toHaveCount(0);

	// Analysis: one line at the end of the report
	await page.getByRole('button', { name: 'Analysis' }).click();
	await expect(page.getByText('Data: Esri Community Maps, OpenStreetMap contributors, Overture Maps Foundation, TomTom, Lehigh County via PASDA')).toBeVisible();
	await page.keyboard.press('Escape');

	// PNG export: the image carries the credit line
	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(500);
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByTitle('Export PNG').click()]);
	await download.saveAs('tests/screenshots/credits-export.png');
	expect(download.suggestedFilename()).toBe('site-model.png');
});

test('terrain: board layers in 3D, contours in plan, credited', async ({ page }) => {
	await mockAddressApi(page, CONTEXT, hillside());
	await page.goto('/modeler');
	await page.getByLabel('Find an address').fill('100 Main');
	await page.getByRole('option', { name: PLACE.label }).click();
	await page.getByRole('button', { name: 'Use these lots' }).or(page.getByRole('button', { name: 'Use this parcel' })).click();
	await page.getByRole('button', { name: 'Add buildings' }).click();
	await expect(page.getByText('Loading terrain…')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add terrain' })).toHaveCount(0);
	for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
	await page.screenshot({ path: 'tests/screenshots/terrain-plan-contours.png' });

	await page.getByRole('button', { name: 'Data credits' }).click();
	await expect(page.getByRole('dialog', { name: 'Data credits' })).toContainText('USGS 3D Elevation Program');
	await page.mouse.click(600, 400);

	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'tests/screenshots/terrain-3d.png' });

	// Terrain can be turned off for a flat board, and back on
	const toggle = page.getByRole('button', { name: 'Terrain', exact: true });
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await page.waitForTimeout(500);
	await page.screenshot({ path: 'tests/screenshots/terrain-off.png' });
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');

	// Dragging the view all the way down stops near level, above the board: the backdrop's
	// darker top still shows, rather than the board seen from underneath
	const canvas = page.locator('canvas').first();
	const box = (await canvas.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y - 400, { steps: 30 });
	await page.mouse.up();
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'tests/screenshots/view-level.png' });
	expect(await topPixel(page)).toEqual(expect.objectContaining({ r: near(0xb9), g: near(0xb4), b: near(0xab) }));

	// Plan view keeps its flat linen drawing, not the backdrop
	await page.getByRole('button', { name: 'Plan', exact: true }).click();
	await page.waitForTimeout(500);
	expect((await topPixel(page)).r).toBeGreaterThan(0xd0);
});

test('3D: the wheel zooms toward what is under the cursor', async ({ page }) => {
	await mockAddressApi(page, CONTEXT, hillside());
	await page.goto('/modeler');
	await page.getByLabel('Find an address').fill('100 Main');
	await page.getByRole('option', { name: PLACE.label }).click();
	await page.getByRole('button', { name: 'Use these lots' }).or(page.getByRole('button', { name: 'Use this parcel' })).click();
	await page.getByRole('button', { name: 'Add buildings' }).click();
	await expect(page.getByText('Loading terrain…')).toHaveCount(0);
	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(800);

	// The church is near the middle of the view; a neighbor's foam block is off to the right
	const box = (await page.locator('canvas').first().boundingBox())!;
	const center: Pt = [box.width * 0.52, box.height * 0.5];
	const cursor: Pt = [box.width * 0.8, box.height * 0.6];
	const foam = await canvasPixel(page, ...cursor);
	expect((await canvasPixel(page, ...center)).r).toBeLessThan(0x70);
	expect(foam.r).toBeGreaterThan(0xc0);

	await page.mouse.move(box.x + cursor[0], box.y + cursor[1]);
	for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
	await page.waitForTimeout(1500);
	await page.screenshot({ path: 'tests/screenshots/zoom-to-cursor.png' });

	// The foam block stays under the cursor and the church slides away from the center
	expect((await canvasPixel(page, ...cursor)).r).toBeGreaterThan(0xc0);
	expect((await canvasPixel(page, ...center)).r).toBeGreaterThan(0x90);
});

// A pixel of the canvas, at CSS pixels from its top left
async function canvasPixel(page: Page, x: number, y: number): Promise<{ r: number; g: number; b: number }> {
	const buf = await page.locator('canvas').first().screenshot();
	const png = await decodePng(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
	const at = (Math.round(y) * png.width + Math.round(x)) * png.channels;
	return { r: png.data[at], g: png.data[at + 1], b: png.data[at + 2] };
}

// A pixel at the canvas's top, behind everything else (clear of the credits button in the corner)
const topPixel = (page: Page) => canvasPixel(page, 60, 2);
const near = (v: number) => ({ asymmetricMatch: (n: number) => Math.abs(n - v) <= 12 });

test('terrain: outside coverage the board stays flat; older sites can add it', async ({ page }) => {
	const name = `E2E terrain ${Date.now()}`;
	created.push(name);
	let terrain: Terrain | null = null;
	await mockAddressApi(page, CONTEXT);
	await page.unroute('**/api/terrain?**');
	await page.route('**/api/terrain?**', (r) =>
		terrain ? r.fulfill({ json: { terrain } }) : r.fulfill({ status: 502, json: { message: 'No elevation data here.' } }),
	);
	await page.goto('/modeler');
	await page.getByLabel('Site name').fill(name);
	await page.getByLabel('Find an address').fill('100 Main');
	await page.getByRole('option', { name: PLACE.label }).click();
	await page.getByRole('button', { name: 'Use this parcel' }).click();
	await page.getByRole('button', { name: 'Skip' }).click();

	// The service failed: setup still finished, on a flat board, with nothing to toggle
	await expect(page.getByText('No elevation data here. The board stays flat.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Terrain', exact: true })).toHaveCount(0);

	// Saved without terrain, as sites set up before terrain were
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page).toHaveURL(/\/modeler\/e2e-terrain-\d+\/existing-conditions$/);
	await page.reload();
	const add = page.getByRole('button', { name: 'Add terrain' });
	await expect(add).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/terrain-add-button.png' });

	terrain = hillside();
	await add.click();
	await expect(add).toHaveCount(0);
	await page.getByRole('button', { name: 'Data credits' }).click();
	await expect(page.getByRole('dialog', { name: 'Data credits' })).toContainText('USGS 3D Elevation Program');
	await page.mouse.click(600, 400);

	// Saved with the site: no refetch on load
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	terrain = null;
	await page.reload();
	await expect(page.getByLabel('Address').getByText(PLACE.label)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add terrain' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Data credits' }).click();
	await expect(page.getByRole('dialog', { name: 'Data credits' })).toContainText('USGS 3D Elevation Program');
});
