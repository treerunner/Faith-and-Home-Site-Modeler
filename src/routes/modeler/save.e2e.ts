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
	await page.getByRole('button', { name: action, exact: true }).click();
}

const structures = (page: Page) => page.locator('.struct-item');
const save = (page: Page) => page.keyboard.press('ControlOrMeta+s');

test('sites hold plans with clean, rename-safe URLs', async ({ page, context, request, baseURL }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	const canvas = page.locator('.canvas-area canvas');
	const stamp = Date.now();
	const site = `/modeler/e2e-site-${stamp}`;

	// New site: first save moves to /modeler/<site>/existing-conditions
	await page.goto('/modeler');
	await page.getByLabel('Site name').fill(`E2E site ${stamp}`);
	await expect(page.getByLabel('Plan name')).toHaveValue('Existing conditions');
	await page.getByLabel('Drag to place Square').dragTo(canvas, { targetPosition: { x: 200, y: 200 } });
	await page.getByLabel('Drag to place Square').dragTo(canvas, { targetPosition: { x: 400, y: 200 } });
	// The second square is a proposed building
	await page.getByRole('button', { name: 'New', exact: true }).click();
	await expect(structures(page)).toHaveCount(2);
	await expect(page.getByText('Unsaved changes')).toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page).toHaveURL(urlIs(`${site}/existing-conditions`));
	created.push(await siteIdBySlug(request, `e2e-site-${stamp}`));
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	// The bare site URL opens the first plan
	await page.goto(site);
	await expect(page).toHaveURL(urlIs(`${site}/existing-conditions`));

	// New plan keeps only the existing building
	await planAction(page, 'New plan');
	await expect(page.getByLabel('Plan name')).toHaveValue('New plan');
	await expect(page).toHaveURL(urlIs(`${site}/new-plan`));
	await expect(structures(page)).toHaveCount(1);

	// Unsaved work survives switching plans, with no leave prompt
	await choosePlan(page, 'Existing conditions');
	await expect(structures(page)).toHaveCount(2);
	await expect(page).toHaveURL(urlIs(`${site}/existing-conditions`));
	await choosePlan(page, 'New plan');
	await expect(structures(page)).toHaveCount(1);

	// Renaming a plan moves its URL on save; the old one redirects
	await page.getByLabel('Plan name').fill('Housing on lot');
	await save(page);
	await expect(page).toHaveURL(urlIs(`${site}/housing-on-lot`));
	await page.screenshot({ path: 'tests/screenshots/m5-5-plan-switcher.png' });
	await page.goto(`${site}/new-plan`);
	await expect(page).toHaveURL(urlIs(`${site}/housing-on-lot`));
	await expect(page.getByLabel('Plan name')).toHaveValue('Housing on lot');
	await expect(structures(page)).toHaveCount(1);

	// Toolbar Duplicate copies the plan within the site
	await page.getByRole('button', { name: 'Duplicate' }).click();
	await expect(page.getByLabel('Plan name')).toHaveValue('Housing on lot copy');
	await expect(page).toHaveURL(urlIs(`${site}/housing-on-lot-copy`));
	await save(page);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	// Renaming the site moves every plan URL; old site URLs redirect
	await page.getByLabel('Site name').fill(`E2E site ${stamp} Grace`);
	await save(page);
	const renamed = `${site}-grace`;
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
	await expect(page.getByText('Link copied')).toBeVisible();
	const link = await page.evaluate(() => navigator.clipboard.readText());
	expect(link).toMatch(urlIs(`${renamed}/housing-on-lot/view`));
	await page.goto(link);
	await expect(page.getByText('View only')).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Shape palette' })).toHaveCount(0);
	await expect(page.getByLabel('Plan name')).toBeDisabled();
	await choosePlan(page, 'Existing conditions');
	await expect(page).toHaveURL(urlIs(`${renamed}/existing-conditions/view`));
	await expect(structures(page)).toHaveCount(2);
	await page.getByRole('button', { name: 'Choose plan' }).click();
	await expect(page.getByRole('button', { name: 'New plan' })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// Deleting a plan: its URL falls back to the first plan
	await page.goto(`${renamed}/housing-on-lot-copy`);
	await planAction(page, 'Delete plan');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page).toHaveURL(urlIs(`${renamed}/housing-on-lot`));
	await save(page);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.goto(`${renamed}/housing-on-lot-copy`);
	await expect(page).toHaveURL(urlIs(`${renamed}/existing-conditions`));

	// Sites list links each plan
	await page.goto('/modeler/sites');
	const plans = page.getByRole('list', { name: `Plans in E2E site ${stamp} Grace` }).first();
	await expect(plans.getByRole('link')).toHaveText(['Existing conditions', 'Housing on lot']);
	await expect(plans.getByRole('link', { name: 'Housing on lot' })).toHaveAttribute('href', `${renamed}/housing-on-lot`);
	await page.screenshot({ path: 'tests/screenshots/m5-5-sites-list.png' });
});

// ssr is off, so the shell returns 200 and the load error renders client-side
test('unknown site shows not found', async ({ page }) => {
	await page.goto('/modeler/no-such-site');
	await expect(page.getByText('Site not found')).toBeVisible();
	await page.goto('/modeler/00000000-0000-0000-0000-000000000000/plan');
	await expect(page.getByText('Site not found')).toBeVisible();
});
