import { expect, test } from '@playwright/test';
import { assignFrom, declareVariable, dragRef, editValue } from './helpers';

/**
 * MVP acceptance scenario: manually reverse a linked list entirely through the UI.
 * Every step is an explicit user action; the app must not perform any of it.
 */
test('manual linked list reversal, history navigation, save and reopen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('mode-badge')).toHaveText('Sandbox');
  // 1. New empty project: nothing on the canvas.
  await expect(page.locator('.react-flow__node')).toHaveCount(0);

  // 2. Create four nodes manually.
  await page.getByTestId('tool-node').click();
  for (let i = 0; i < 4; i++) await page.mouse.click(200 + i * 200, 140);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid^="object-"]')).toHaveCount(4);

  // 3. Assign values 10, 20, 30, 40.
  for (let i = 1; i <= 4; i++) await editValue(page, `value-${i}-val`, String(i * 10));
  await expect(page.getByTestId('value-3-val')).toHaveText('30');

  // 4. Connect the nodes; the last next is explicitly null.
  for (let i = 1; i <= 3; i++) await dragRef(page, `handle-${i}-next`, `object-${i + 1}`);
  await editValue(page, 'value-4-next', 'null');
  await expect(page.getByTestId('value-1-next')).toContainText('@2');
  await expect(page.getByTestId('value-4-next')).toContainText('null');

  // 5–6. head variable, manually pointed at the first node.
  await declareVariable(page, 'head', { x: 200, y: 300 });
  await expect(page.getByTestId('varvalue-head')).toContainText('?');
  await dragRef(page, 'handle-var-head', 'object-1');
  await expect(page.getByTestId('varvalue-head')).toContainText('@1');

  // 7–8. Additional variables, manually initialized.
  await declareVariable(page, 'prev', { x: 200, y: 380 });
  await declareVariable(page, 'current', { x: 440, y: 300 });
  await declareVariable(page, 'next', { x: 440, y: 380 });
  await expect(page.getByTestId('varvalue-prev')).toContainText('?');
  await editValue(page, 'varvalue-prev', 'null');
  await dragRef(page, 'handle-var-current', 'variable-head'); // current = head (copy reference)
  await expect(page.getByTestId('varvalue-current')).toContainText('@1');
  await expect(page.getByTestId('varvalue-next')).toContainText('?');

  // 9. Loop context.
  await page.keyboard.press('l');
  await page.mouse.click(720, 300);
  await page.getByTestId('form-dialog').locator('input[name="name"]').fill('reverse');
  await page.getByTestId('form-submit').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('context-reverse')).toBeVisible();

  // 10. Condition: current != null.
  await page.getByTestId('context-reverse').click();
  await page.getByTestId('tab-inspect').click();
  await page.getByTestId('cond-left').selectOption({ label: 'current (global)' });
  await page.getByTestId('cond-op').selectOption('!=');
  await page.getByTestId('cond-right').selectOption({ label: 'null' });
  await page.getByTestId('cond-save').click();
  await expect(page.getByTestId('loop-condition-text')).toHaveText('current != null');

  await page.getByTestId('enter-context').click();
  await expect(page.getByTestId('breadcrumb')).toContainText('reverse');

  for (let k = 1; k <= 4; k++) {
    // 11. Enter the condition phase: nothing is evaluated or changed.
    const before = await page.getByTestId('varvalue-current').textContent();
    await page.getByTestId('phase-condition').click();
    await expect(page.getByTestId('cond-true')).toBeEnabled();
    expect(await page.getByTestId('varvalue-current').textContent()).toBe(before);
    // 12. The user decides.
    await page.getByTestId('cond-true').click();
    // 13. Body.
    await page.getByTestId('phase-body').click();
    // 14. Manual reference manipulation.
    await assignFrom(page, 'next', 'current.next'); // next = current.next
    await dragRef(page, `handle-${k}-next`, 'variable-prev'); // current.next = prev
    await dragRef(page, 'handle-var-prev', 'variable-current'); // prev = current
    await dragRef(page, 'handle-var-current', 'variable-next'); // current = next
    await expect(page.getByTestId('varvalue-prev')).toContainText(`@${k}`);
    // 15. Complete the iteration (metadata only).
    await page.getByTestId('complete-iteration').click();
    await expect(page.getByTestId('iterations-completed')).toHaveText(String(k));
  }

  // 16–17. Final condition check is false; exit the loop.
  await page.getByTestId('phase-condition').click();
  await page.getByTestId('cond-false').click();
  await page.getByTestId('phase-exit').click();
  await page.getByTestId('exit-context').click();
  await expect(page.getByTestId('breadcrumb')).not.toContainText('reverse');
  // Exiting did not touch head: it still points at the old first node.
  await expect(page.getByTestId('varvalue-head')).toContainText('@1');

  // 18. Explicitly identify the result: head = prev, then mark head as result.
  await dragRef(page, 'handle-var-head', 'variable-prev');
  await expect(page.getByTestId('varvalue-head')).toContainText('@4');
  await page.getByTestId('variable-head').click({ button: 'right' });
  await page.getByTestId('ctx-mark-result').click();
  await expect(page.getByTestId('object-4')).toContainText('result');

  // The list is reversed — by the user.
  await expect(page.getByTestId('value-4-next')).toContainText('@3');
  await expect(page.getByTestId('value-3-next')).toContainText('@2');
  await expect(page.getByTestId('value-2-next')).toContainText('@1');
  await expect(page.getByTestId('value-1-next')).toContainText('null');
  await page.screenshot({ path: 'test-results/acceptance-reversed.png' });

  // Operation counter: 4 allocations, moves never counted.
  await page.getByTestId('tab-stats').click();
  await expect(page.getByTestId('stat-allocations')).toHaveText('4');

  // 19–20. Inspect history and navigate to a previous state.
  await expect(page.getByTestId('timeline-entry-3')).toBeVisible();
  await page.getByTestId('timeline-entry-3').click();
  await expect(page.getByTestId('past-banner')).toBeVisible();
  await expect(page.locator('[data-testid^="object-"]')).toHaveCount(3);
  await page.getByTestId('goto-latest').click();
  await expect(page.getByTestId('past-banner')).toHaveCount(0);
  await expect(page.locator('[data-testid^="object-"]')).toHaveCount(4);

  // 21. Save and reopen.
  await page.getByTestId('save').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('object-4')).toBeVisible();
  await expect(page.getByTestId('value-4-next')).toContainText('@3');
  await expect(page.getByTestId('value-1-next')).toContainText('null');
  await expect(page.getByTestId('varvalue-head')).toContainText('@4');
  await page.getByTestId('open-projects').click();
  await expect(page.getByTestId('project-row')).toHaveCount(1);
});

test('the same tools allow an incorrect solution (lost references are not fixed)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-node').click();
  await page.mouse.click(200, 140);
  await page.mouse.click(420, 140);
  await page.keyboard.press('Escape');
  await dragRef(page, 'handle-1-next', 'object-2');
  await declareVariable(page, 'head', { x: 200, y: 300 });
  await dragRef(page, 'handle-var-head', 'object-1');
  // Mistake: overwrite head.next before saving it elsewhere → @2 becomes unreachable.
  await editValue(page, 'value-1-next', 'null');
  await expect(page.getByTestId('object-2')).toBeVisible();
  await page.getByTestId('tab-diagnostics').click();
  await page.getByTestId('run-diagnostics').click();
  await expect(page.getByTestId('diagnostics-panel')).toContainText('not reachable');
  // Diagnostics did not delete or fix anything.
  await expect(page.getByTestId('object-2')).toBeVisible();
  await expect(page.getByTestId('value-1-next')).toContainText('null');
});

test('challenge mode: capture input, reverse manually, check result read-only', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-projects').click();
  await page.getByTestId('new-challenge').click();
  await expect(page.getByTestId('mode-badge')).toHaveText('Challenge');
  await expect(page.getByTestId('challenge-panel')).toContainText('Reverse Linked List');
  // No variables are created for the user.
  await expect(page.locator('.react-flow__node')).toHaveCount(0);

  await page.getByTestId('tool-node').click();
  await page.mouse.click(200, 140);
  await page.mouse.click(420, 140);
  await page.keyboard.press('Escape');
  await editValue(page, 'value-1-val', '1');
  await editValue(page, 'value-2-val', '2');
  await dragRef(page, 'handle-1-next', 'object-2');
  await editValue(page, 'value-2-next', 'null');
  await declareVariable(page, 'head', { x: 200, y: 300 });
  await dragRef(page, 'handle-var-head', 'object-1');

  await page.getByTestId('capture-head').selectOption({ label: 'head (global)' });
  await page.getByTestId('capture-input').click();
  await expect(page.getByTestId('captured-input')).toContainText('[1, 2]');

  // Check before identifying a result: incomplete, and nothing changes.
  await page.getByTestId('check-result').click();
  await expect(page.getByTestId('check-status')).toContainText('Incomplete');

  // Manual reversal.
  await editValue(page, 'value-2-next', '@1');
  await editValue(page, 'value-1-next', 'null');
  await dragRef(page, 'handle-var-head', 'object-2');
  await page.getByTestId('variable-head').click({ button: 'right' });
  await page.getByTestId('ctx-mark-result').click();
  await page.getByTestId('tab-challenge').click();
  await page.getByTestId('check-result').click();
  await expect(page.getByTestId('check-status')).toContainText('Passed');
  await expect(page.getByTestId('value-2-next')).toContainText('@1');
});
