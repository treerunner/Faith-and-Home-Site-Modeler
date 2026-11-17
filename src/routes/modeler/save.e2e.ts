import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Writes to the DATABASE_URL database; deletes the rows it creates.

const created: string[] = []; // site ids

interface Summary {
	id: string;
	slug: string;
}

async function siteIdBySlug(request: APIRequestContext, slug: string): Promise<string> {
	const sites: Summary[] = await (await request.get('/api/sites')).json();
	const site = sites.find((s) => s.slug === slug);
	if (!site) throw new Error(`no site with slug ${slug}`);
	return site.id;
}

// SvelteKit rejects mutating requests without a same-origin Origin header
test.afterAll(async ({ request, baseURL }) => {
	for (const id of created) {
		const res = await request.delete(`/api/sites/${id}`, { headers: { origin: baseURL! } });
		expect(res.status(), `cleanup of ${id}`).toBe(204);
	}
});

function escape(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const urlIs = (path: string) => new RegExp(`${escape(path)}$`);

async function choosePlan(page: Page, name: string) {
	await page.getByRole('button', { name: 'Choose plan' }).click();
	await page.getByRole('list', { name: 'Plans' }).getByRole('button', { name, exact: true }).click();
}

async function planAction(page: Page, action: string) {
	await page.getByRole('button', { name: 'Choose plan' }).click();
	await page.locator('.plan-menu').getByRole('button', { name: action, exact: true }).click();
}

// Existing conditions head the plan menu, apart from the plans
async function chooseSite(page: Page) {
	await page.getByRole('button', { name: 'Choose plan' }).click();
	await page.locator('.plan-item--site').click();
}

const structures = (page: Page) => page.locator('.struct-item');
const save = (page: Page) => page.keyboard.press('ControlOrMeta+s');

// Opens a structure in the panel by its place in the list
async function openStructure(page: Page, i: number) {
	const row = structures(page).nth(i).locator('.struct-row');
	if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
	return structures(page).nth(i);
}

test('sites hold existing conditions and plans with clean, rename-safe URLs', async ({ page, context, request, baseURL }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	const canvas = page.locator('.canvas-area canvas');
	const stamp = Date.now();
	const site = `/modeler/e2e-site-${stamp}`;

	// A new site opens on the site view: existing conditions, edited here only
	await page.goto('/modeler');
	await page.getByLabel('Site name').fill(`E2E site ${stamp}`);
	const crumbs = page.getByRole('navigation', { name: 'Where you are' });
	await expect(crumbs).toContainText('Unsaved sketch');
	await expect(page.locator('.plan-name-fixed')).toHaveText('Existing conditions');
	await page.getByLabel('Drag to place Square').dragTo(canvas, { targetPosition: { x: 200, y: 200 } });
	await expect(structures(page)).toHaveCount(1);
	await expect(page.getByText('Unsaved changes')).toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page).toHaveURL(urlIs(site));
	created.push(await siteIdBySlug(request, `e2e-site-${stamp}`));
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	// Saved, the breadcrumb names the committee that owns it, linked to its page
	await expect(crumbs).not.toContainText('Unsaved sketch');
	await expect(crumbs.getByRole('link')).toHaveAttribute('href', /^\/committees\/.+/);

	// A plan starts from existing conditions and adds a proposed building
	await planAction(page, 'New plan');
	await expect(page.getByLabel('Plan name')).toHaveValue('New plan');
	await expect(page).toHaveURL(urlIs(`${site}/new-plan`));
	await expect(structures(page)).toHaveCount(1);
	await page.getByLabel('Drag to place Square').dragTo(canvas, { targetPosition: { x: 400, y: 200 } });
	await expect(structures(page)).toHaveCount(2);

	// The site's building is locked in the plan: the plan only adds stories, or removes it
	const inherited = await openStructure(page, 0);
	await expect(inherited.getByText('Shape, height and uses are set on the site.')).toBeVisible();
	await expect(inherited.getByLabel('Stories', { exact: true })).toBeDisabled();
	await expect(inherited.getByRole('button', { name: 'Delete' })).toHaveCount(0);
	await inherited.getByLabel('Added stories').fill('1');
	await page.screenshot({ path: 'tests/screenshots/site-view-locked-piece.png' });
	// In 3D the added story is new construction, in orange on top
	await canvas.click({ position: { x: 300, y: 400 } }); // deselect, so the colors show
	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'tests/screenshots/site-view-added-story.png' });
	await page.getByRole('button', { name: 'Plan', exact: true }).click();

	// Changes on the site reach the plan, which keeps its added story
	await chooseSite(page);
	await expect(page).toHaveURL(urlIs(site));
	await expect(structures(page)).toHaveCount(1);
	await (await openStructure(page, 0)).getByLabel('Stories', { exact: true }).fill('3');
	await choosePlan(page, 'New plan');
	await expect(structures(page)).toHaveCount(2);
	const raised = await openStructure(page, 0);
	await expect(raised.getByLabel('Stories', { exact: true })).toHaveValue('3');
	await expect(raised.getByLabel('Added stories')).toHaveValue('1');

	// Renaming a plan moves its URL on save; the old one redirects
	await page.getByLabel('Plan name').fill('Housing on lot');
	await save(page);
	await expect(page).toHaveURL(urlIs(`${site}/housing-on-lot`));
	await page.getByRole('button', { name: 'Choose plan' }).click();
	await page.screenshot({ path: 'tests/screenshots/m5-5-plan-switcher.png' });
	await page.keyboard.press('Escape');
	await page.goto(`${site}/new-plan`);
	await expect(page).toHaveURL(urlIs(`${site}/housing-on-lot`));
	await expect(page.getByLabel('Plan name')).toHaveValue('Housing on lot');
	await expect(structures(page)).toHaveCount(2);
	await expect((await openStructure(page, 0)).getByLabel('Added stories')).toHaveValue('1');

	// Toolbar Duplicate copies the plan within the site
	await page.getByRole('button', { name: 'Duplicate' }).click();
	await expect(page.getByLabel('Plan name')).toHaveValue('Housing on lot copy');
	await expect(page).toHaveURL(urlIs(`${site}/housing-on-lot-copy`));
	await save(page);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	// The site is renamed on the site view only; that moves every plan URL, and old site URLs redirect
	// In a plan the site's name leads back to the site view, where it's edited
	await expect(page.getByLabel('Site name')).toHaveCount(0);
	await crumbs.getByRole('button', { name: `E2E site ${stamp}` }).click();
	await expect(page).toHaveURL(urlIs(site));
	await page.getByLabel('Site name').fill(`E2E site ${stamp} Grace`);
	await save(page);
	const renamed = `${site}-grace`;
	await expect(page).toHaveURL(urlIs(renamed));
	await page.goto(`${site}/housing-on-lot-copy`);
	await expect(page).toHaveURL(urlIs(`${renamed}/housing-on-lot-copy`));
	await page.goto(`${site}/housing-on-lot`);
	await expect(page).toHaveURL(urlIs(`${renamed}/housing-on-lot`));

	// A second site with the same name gets -2
	const otherId = crypto.randomUUID();
	const res = await request.put(`/api/sites/${otherId}`, {
		headers: { origin: baseURL! },
		data: { id: otherId, name: `E2E site ${stamp} Grace` },
	});
	expect(res.ok()).toBe(true);
	created.push(otherId);
	expect((await res.json()).slug).toBe(`e2e-site-${stamp}-grace-2`);

	// Share copies the plan's view-only link; view mode can switch plans but not edit
	await page.getByRole('button', { name: 'Share' }).click();
	await page.getByRole('button', { name: 'Copy view link' }).click();
	await expect(page.getByText('Link copied')).toBeVisible();
	const link = await page.evaluate(() => navigator.clipboard.readText());
	expect(link).toMatch(urlIs(`${renamed}/housing-on-lot/view`));
	await page.goto(link);
	await expect(page.getByText('View only')).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Shape palette' })).toHaveCount(0);
	await expect(page.getByLabel('Plan name')).toBeDisabled();
	await chooseSite(page);
	await expect(page).toHaveURL(urlIs(`${renamed}/view`));
	await expect(structures(page)).toHaveCount(1);
	await page.getByRole('button', { name: 'Choose plan' }).click();
	await expect(page.locator('.plan-menu').getByRole('button', { name: 'New plan' })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// Deleting a plan goes to the one before it; its old URL falls back to the site view
	await page.goto(`${renamed}/housing-on-lot-copy`);
	await planAction(page, 'Delete plan');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page).toHaveURL(urlIs(`${renamed}/housing-on-lot`));
	await save(page);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.goto(`${renamed}/housing-on-lot-copy`);
	await expect(page).toHaveURL(urlIs(renamed));

	// The sites list holds each site's plans under its existing conditions
	await page.goto('/modeler/sites');
	const plans = page.getByRole('list', { name: `Plans in E2E site ${stamp} Grace` }).first();
	await expect(plans.locator('.plan-name')).toHaveText(['Existing conditions', 'Housing on lot']);
	await expect(plans.getByRole('link', { name: 'Housing on lot', exact: true })).toHaveAttribute('href', `${renamed}/housing-on-lot`);
	await expect(plans.locator('.dev-tag')).toHaveText(['New development']);
	await page.screenshot({ path: 'tests/screenshots/m5-5-sites-list.png' });
});

// ssr is off, so the shell returns 200 and the load error renders client-side
test('unknown site shows not found', async ({ page }) => {
	await page.goto('/modeler/no-such-site');
	await expect(page.getByText('Site not found')).toBeVisible();
	await page.goto('/modeler/00000000-0000-0000-0000-000000000000/plan');
	await expect(page.getByText('Site not found')).toBeVisible();
});
