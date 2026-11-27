import { expect, type Page } from '@playwright/test';

export async function center(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`No bounding box for ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags from a reference handle onto a canvas element, like a user would. */
export async function dragRef(page: Page, handleTestId: string, targetTestId: string) {
  const from = await center(page, handleTestId);
  const to = await center(page, targetTestId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

export async function editValue(page: Page, testId: string, text: string) {
  await page.getByTestId(testId).dblclick();
  const input = page.getByTestId(`${testId}-input`);
  await input.fill(text);
  await input.press('Enter');
}

export async function declareVariable(page: Page, name: string, at: { x: number; y: number }, initial = '') {
  await page.keyboard.press('x');
  await page.mouse.click(at.x, at.y);
  const dialog = page.getByTestId('form-dialog');
  await dialog.locator('input[name="name"]').fill(name);
  if (initial) await dialog.locator('input[name="initial"]').fill(initial);
  await page.getByTestId('form-submit').click();
  await expect(page.getByTestId(`variable-${name}`)).toBeVisible();
  await page.keyboard.press('Escape');
}

/** `target = source.field` through the explicit "copy from" dialog. */
export async function assignFrom(page: Page, variable: string, optionLabel: string) {
  await page.getByTestId(`variable-${variable}`).click({ button: 'right' });
  await page.getByTestId('ctx-assign-from').click();
  await page.getByTestId('form-dialog').locator('select[name="from"]').selectOption({ label: optionLabel });
  await page.getByTestId('form-submit').click();
}
