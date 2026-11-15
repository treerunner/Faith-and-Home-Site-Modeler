import { expect, test, type Page } from '@playwright/test';

const canvas = (page: Page) => page.locator('.canvas-area canvas');
const structures = (page: Page) => page.locator('.struct-item');

async function openStructure(page: Page, i: number) {
	const row = structures(page).nth(i).locator('.struct-row');
	if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
	return structures(page).nth(i);
}

test('a piece dropped on a building sits on its roof, on the site and in a plan', async ({ page }) => {
	await page.goto('/modeler');

	// Existing conditions: a building, and a drum on its roof
	const box = (await canvas(page).boundingBox())!;
	const m = box.height / 100; // a new site's plan view is 100 m tall, centered on the origin
	const at = (x: number, y: number) => ({ x: box.x + box.width / 2 + x * m, y: box.y + box.height / 2 + y * m });
	await page.getByLabel('Drag to place Square').dragTo(canvas(page)); // 6 x 6 m at the origin
	// Stretch it east to 12 m by its corner handle: it spans x -3 to 9
	await page.mouse.move(at(3, 3).x, at(3, 3).y);
	await page.mouse.down();
	await page.mouse.move(at(9, 3).x, at(9, 3).y, { steps: 5 });
	await page.mouse.up();
	await page.getByLabel('Stories', { exact: true }).fill('3');
	await page.getByLabel('Label').fill('Church');
	await page.getByLabel('Drag to place Circle').dragTo(canvas(page));
	const drum = await openStructure(page, 1);
	await expect(drum.getByLabel('Sits on')).toHaveValue(/.+/);
	await expect(drum.getByLabel('Sits on').locator('option:checked')).toHaveText('Roof of Church');
	await expect(drum.getByText('On the roof of Church; it doesn\'t add to lot coverage.')).toBeVisible();
	await expect(page.getByRole('group', { name: 'Building type' }).getByRole('button', { name: 'Box', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'tests/screenshots/rooftop-existing.png' });
	await expect(page.getByRole('group', { name: 'Building type' }).getByRole('button', { name: 'Box', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Plan', exact: true }).click();

	// A plan adds a rooftop piece beside the drum: new construction on the church's roof
	await page.getByRole('button', { name: 'New plan' }).click();
	await page.getByLabel('Drag to place Square').dragTo(canvas(page), { targetPosition: { x: box.width / 2 + 6 * m, y: box.height / 2 } });
	await expect(structures(page)).toHaveCount(3);
	const added = await openStructure(page, 2);
	await expect(added.getByLabel('Sits on').locator('option:checked')).toHaveText('Roof of Church');
	await canvas(page).click({ position: { x: 40, y: 40 } }); // deselect, so the colors show
	await expect(page.getByRole('group', { name: 'Development type' }).getByRole('button', { name: 'New development' })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: '3D', exact: true }).click();
	await page.waitForTimeout(800);
	await page.screenshot({ path: 'tests/screenshots/rooftop-plan.png' });
});
