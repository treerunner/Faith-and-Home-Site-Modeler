import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../lib/server/png';
import { sql } from '../../../tests/e2e/auth';

// Saves to the DATABASE_URL database and cleans up.

const created: string[] = []; // site ids
test.afterAll(async ({ request, baseURL }) => {
	for (const id of created) {
		expect((await request.delete(`/api/sites/${id}`, { headers: { origin: baseURL! } })).status()).toBe(204);
	}
});

const views = (page: Page) => page.getByRole('application');
const metric = (page: Page, label: string) => page.locator('.metric').filter({ has: page.getByText(label, { exact: true }) });

async function openPlanMenu(page: Page) {
	await page.getByRole('button', { name: 'Choose plan' }).click();
}

// A church on the site, and a plan that adds cottages
async function siteWithPlan(page: Page, name: string) {
	const id = crypto.randomUUID();
	created.push(id);
	const site = {
		id,
		name,
		context: { buildings: [], roads: [], sources: ['overture'] }, // so the data credits show
		existing: {
			id: 'existing',
			name: 'Existing conditions',
			slug: '',
			structures: [{ id: 'church', label: 'Church', status: 'existing', uses: ['worship'], stories: 1, provenance: 'user', parts: [{ id: 'c', shape: 'rect', x: 0, y: 0, w: 20, d: 12, rotation: 0 }] }],
			openSpaces: [],
			trees: [],
		},
		plans: [{
			id: 'cottages',
			name: 'Cottages',
			slug: 'cottages',
			structures: [{ id: 'cottage', label: 'Cottage', status: 'new', uses: ['housing'], dwellings: 2, stories: 2, provenance: 'user', parts: [{ id: 'k', shape: 'rect', x: 25, y: 0, w: 8, d: 8, rotation: 0 }] }],
			openSpaces: [],
			trees: [],
			annotations: [{ n: 1, x: 25, y: 0, text: 'Cottages along the lane.' }],
		}],
	};
	const res = await page.request.put(`/api/sites/${id}`, { headers: { origin: 'http://localhost:4173' }, data: site });
	expect(res.ok()).toBe(true);
	return (await res.json()) as { id: string; slug: string };
}

test('compare two plans side by side: synced views, what changed, the compare analysis', async ({ page }) => {
	const { slug } = await siteWithPlan(page, `E2E compare ${Date.now()}`);
	await page.goto(`/modeler/${slug}/cottages`);
	// An unsaved edit, to find again after comparing
	await page.getByRole('button', { name: 'Expand Cottage' }).click();
	await page.getByLabel('Label').fill('Cottage row');
	await expect(page.getByText('Unsaved changes')).toBeVisible();

	await openPlanMenu(page);
	await page.locator('.plan-menu').getByRole('button', { name: 'Compare', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/modeler/${slug}/cottages\\?compare=$`));
	await expect(views(page)).toHaveCount(2);
	await expect(page.getByLabel('Plan A', { exact: true }).locator('option:checked')).toHaveText('Existing conditions');
	await expect(page.getByLabel('Plan B', { exact: true }).locator('option:checked')).toHaveText('Cottages');

	// The data credits sit in B's bottom-left corner, clear of its label
	const label = (await page.locator('.view-label').nth(1).boundingBox())!;
	const credits = (await page.getByRole('button', { name: 'Data credits' }).boundingBox())!;
	const viewB = (await views(page).nth(1).boundingBox())!;
	expect(credits.y).toBeGreaterThan(label.y + label.height);
	expect(credits.y + credits.height).toBeGreaterThan(viewB.y + viewB.height - 40);

	// What changed, in the strip
	await expect(metric(page, 'Development type')).toContainText('Existing conditions → New development');
	await expect(metric(page, 'Housing units')).toContainText('0 → 2');
	await expect(metric(page, 'Housing units')).toContainText('+2');
	await page.waitForTimeout(500);
	await page.screenshot({ path: 'tests/screenshots/compare-plan.png' });

	// Zooming one plan view zooms the other
	const a = views(page).nth(0), b = views(page).nth(1);
	const pixels = async () => {
		const buf = await a.screenshot();
		return (await decodePng(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)).data;
	};
	const before = await pixels();
	const box = (await b.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -200);
	await page.waitForTimeout(400);
	const after = await pixels();
	let differ = 0;
	for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i]) differ++;
	expect(differ).toBeGreaterThan(1000);

	// 3D: both orbit together
	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'tests/screenshots/compare-3d.png' });
	await page.getByRole('button', { name: 'Plan', exact: true }).click();

	// The compare analysis: both plans, their notes, one table of changes
	await page.getByRole('button', { name: 'Compare analysis' }).click();
	const report = page.getByRole('dialog', { name: 'Compare analysis' });
	await expect(report.getByRole('img', { name: 'Plan A: Existing conditions' })).toBeVisible();
	await expect(report.getByRole('img', { name: 'Plan B: Cottages' })).toBeVisible();
	await expect(report.getByText('Cottages along the lane.')).toBeVisible();
	await expect(report.getByRole('row', { name: /Housing units\s+0\s+2\s+\+2/ })).toBeVisible();
	await expect(report.getByRole('row', { name: /Development type\s+Existing conditions\s+New development/ })).toBeVisible();
	await page.waitForTimeout(300);
	await page.screenshot({ path: 'tests/screenshots/compare-analysis.png' });
	await page.keyboard.press('Escape');
	await expect(report).toHaveCount(0);

	// Swap, then pick: the URL follows (B is the plan in the path, A the compare param)
	await page.getByRole('button', { name: 'Swap A and B' }).click();
	await expect(page).toHaveURL(new RegExp(`/modeler/${slug}\\?compare=cottages$`));
	await expect(metric(page, 'Development type')).toContainText('New development → Existing conditions');
	await page.getByLabel('Plan B', { exact: true }).selectOption({ label: 'Cottages' });
	await expect(page).toHaveURL(new RegExp(`/modeler/${slug}/cottages\\?compare=$`));

	// Exit: back on the plan, the unsaved edit still there
	await page.getByRole('button', { name: 'Exit compare' }).click();
	await expect(page).toHaveURL(new RegExp(`/modeler/${slug}/cottages$`));
	await expect(views(page)).toHaveCount(1);
	await expect(page.getByText('Unsaved changes')).toBeVisible();
	await expect(page.getByRole('button', { name: /Cottage row/ })).toBeVisible();
});

test('a compare link opens for anyone who can view the site', async ({ page, browser }) => {
	const { id, slug } = await siteWithPlan(page, `E2E compare link ${Date.now()}`);
	const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const p = await anon.newPage();
	await p.goto(`/modeler/${slug}/cottages/view?compare=`);
	await expect(views(p)).toHaveCount(2);
	await expect(p.getByLabel('Plan A', { exact: true }).locator('option:checked')).toHaveText('Existing conditions');

	// A private site stays not found
	await sql`UPDATE sites SET visibility = 'members' WHERE id = ${id}`;
	await p.goto(`/modeler/${slug}/cottages/view?compare=`);
	await expect(p).toHaveURL(/\/signin\?next=.*compare/);
	await anon.close();
});
