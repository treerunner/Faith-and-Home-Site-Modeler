import { expect, test } from '@playwright/test';

// Writes to the DATABASE_URL database; deletes the rows it creates.

const UUID = '[0-9a-f-]{36}';
const created: string[] = [];

test.afterAll(async ({ request }) => {
	for (const id of created) await request.delete(`/api/sites/${id}`);
});

function idFrom(url: string): string {
	const m = url.match(new RegExp(`/modeler/(${UUID})`));
	if (!m) throw new Error(`no site id in ${url}`);
	return m[1];
}

test('save, reload, view only, and duplicate a site', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/modeler');
	const name = `E2E site ${Date.now()}`;
	await page.getByLabel('Site name').fill(name);
	await page.getByLabel('Drag to place Square').dragTo(page.locator('.canvas-area canvas'));
	await expect(page.getByText('Unsaved changes')).toBeVisible();

	// First save moves the URL to /modeler/<id>
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/modeler/${UUID}$`));
	const id = idFrom(page.url());
	created.push(id);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/m5-toolbar.png' });

	// Persists across a reload
	await page.reload();
	await expect(page.getByLabel('Site name')).toHaveValue(name);
	await expect(page.getByRole('button', { name: 'Expand Structure' })).toHaveCount(1);
	await expect(page.getByText('Saved', { exact: true })).toBeVisible();

	// Share copies the view-only link
	await page.getByRole('button', { name: 'Share' }).click();
	await expect(page.getByText('Link copied')).toBeVisible();
	const link = await page.evaluate(() => navigator.clipboard.readText());
	expect(link).toMatch(new RegExp(`/modeler/${id}/view$`));

	// View only: no palette, inputs disabled, no save controls
	await page.goto(link);
	await expect(page.getByText('View only')).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Shape palette' })).toHaveCount(0);
	await expect(page.getByLabel('Site name')).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Expand Structure' }).click();
	await expect(page.getByLabel('Label', { exact: true })).toBeDisabled();
	await page.screenshot({ path: 'tests/screenshots/m5-view-only.png' });

	// Duplicate opens the copy in the editor
	await page.getByRole('link', { name: 'Open in editor' }).click();
	await expect(page).toHaveURL(new RegExp(`/modeler/${id}$`));
	await page.getByRole('button', { name: 'Duplicate' }).click();
	await expect(page).not.toHaveURL(new RegExp(id));
	await expect(page).toHaveURL(new RegExp(`/modeler/${UUID}$`));
	const copyId = idFrom(page.url());
	created.push(copyId);
	await expect(page.getByLabel('Site name')).toHaveValue(`${name} copy`);
	await expect(page.getByRole('button', { name: 'Expand Structure' })).toHaveCount(1);

	// Sites list shows both, with the copy linked to its source
	await page.getByRole('link', { name: 'Sites' }).click();
	const list = page.getByRole('list', { name: 'Saved sites' });
	await expect(list.getByRole('link', { name, exact: true })).toBeVisible();
	await expect(list.getByText(`Copy of ${name}`)).toBeVisible();
	await page.screenshot({ path: 'tests/screenshots/m5-sites-list.png' });
});

// ssr is off, so the shell returns 200 and the load error renders client-side
test('unknown site id shows not found', async ({ page }) => {
	await page.goto('/modeler/00000000-0000-0000-0000-000000000000');
	await expect(page.getByText('Site not found')).toBeVisible();
});
