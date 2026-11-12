import { expect, test, type APIRequestContext } from '@playwright/test';

// Writes to the DATABASE_URL database; deletes the rows it creates.

const SHORT_ID = '[a-z0-9]{6}';
const created: string[] = []; // short ids

interface Summary {
	id: string;
	shortId: string;
}

async function listSites(request: APIRequestContext): Promise<Summary[]> {
	return (await request.get('/api/sites')).json();
}

// SvelteKit rejects mutating requests without a same-origin Origin header
test.afterAll(async ({ request, baseURL }) => {
	for (const site of await listSites(request)) {
		if (!created.includes(site.shortId)) continue;
		const res = await request.delete(`/api/sites/${site.id}`, { headers: { origin: baseURL! } });
		expect(res.status(), `cleanup of ${site.shortId}`).toBe(204);
	}
});

function shortIdFrom(url: string): string {
	const m = url.match(new RegExp(`/modeler/[a-z0-9-]+-(${SHORT_ID})(/view)?$`));
	if (!m) throw new Error(`no short id in ${url}`);
	return m[1];
}

test('save, rename, view only, and duplicate a site', async ({ page, context, request }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/modeler');
	const stamp = Date.now();
	await page.getByLabel('Site name').fill(`E2E site ${stamp}`);
	await page.getByLabel('Drag to place Square').dragTo(page.locator('.canvas-area canvas'));
	await expect(page.getByText('Unsaved changes')).toBeVisible();

	// First save moves the URL to /modeler/<title>-<short id>
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/modeler/e2e-site-${stamp}-${SHORT_ID}$`));
	const shortId = shortIdFrom(page.url());
	created.push(shortId);
	const firstUrl = page.url();
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/m5-toolbar.png' });

	// Persists across a reload
	await page.reload();
	await expect(page.getByLabel('Site name')).toHaveValue(`E2E site ${stamp}`);
	await expect(page.getByRole('button', { name: 'Expand Structure' })).toHaveCount(1);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	// Renaming updates the slug; the short id stays, and old links redirect
	const name = `E2E site ${stamp} Grace`;
	await page.getByLabel('Site name').fill(name);
	await page.keyboard.press('ControlOrMeta+s');
	const slugUrl = new RegExp(`/modeler/e2e-site-${stamp}-grace-${shortId}$`);
	await expect(page).toHaveURL(slugUrl);
	await page.goto(firstUrl);
	await expect(page).toHaveURL(slugUrl);
	await expect(page.getByLabel('Site name')).toHaveValue(name);

	// Links from before slugs (bare uuid) still resolve
	const site = (await listSites(request)).find((s) => s.shortId === shortId)!;
	await page.goto(`/modeler/${site.id}`);
	await expect(page).toHaveURL(slugUrl);

	// Share copies the view-only link
	await page.getByRole('button', { name: 'Share' }).click();
	await expect(page.getByText('Link copied')).toBeVisible();
	const link = await page.evaluate(() => navigator.clipboard.readText());
	expect(link).toMatch(new RegExp(`/modeler/e2e-site-${stamp}-grace-${shortId}/view$`));

	// View only: no palette, inputs disabled, no save controls
	await page.goto(link);
	await expect(page.getByText('View only')).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Shape palette' })).toHaveCount(0);
	await expect(page.getByLabel('Site name')).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Expand Structure' }).click();
	await expect(page.getByLabel('Label', { exact: true })).toBeDisabled();
	await page.screenshot({ path: 'tests/screenshots/m5-view-only.png' });

	// Duplicate opens the copy in the editor under its own short id
	await page.getByRole('link', { name: 'Open in editor' }).click();
	await expect(page).toHaveURL(slugUrl);
	await page.getByRole('button', { name: 'Duplicate' }).click();
	await expect(page).toHaveURL(new RegExp(`/modeler/e2e-site-${stamp}-grace-copy-${SHORT_ID}$`));
	const copyId = shortIdFrom(page.url());
	created.push(copyId);
	expect(copyId).not.toBe(shortId);
	await expect(page.getByLabel('Site name')).toHaveValue(`${name} copy`);
	await expect(page.getByRole('button', { name: 'Expand Structure' })).toHaveCount(1);

	// Sites list shows both, with the copy linked to its source
	await page.getByRole('link', { name: 'Sites' }).click();
	const list = page.getByRole('list', { name: 'Saved sites' });
	await expect(list.getByRole('link', { name, exact: true })).toHaveAttribute('href', slugUrl);
	await expect(list.getByText(`Copy of ${name}`)).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/m5-sites-list.png' });
});

// ssr is off, so the shell returns 200 and the load error renders client-side
test('unknown site shows not found', async ({ page }) => {
	await page.goto('/modeler/no-such-site-zzzzzz');
	await expect(page.getByText('Site not found')).toBeVisible();
	await page.goto('/modeler/00000000-0000-0000-0000-000000000000');
	await expect(page.getByText('Site not found')).toBeVisible();
});
