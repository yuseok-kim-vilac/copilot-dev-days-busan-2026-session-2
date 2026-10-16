import { test, expect, type Locator, type Page } from '@playwright/test';
import { getDatabase } from '../src/lib/db';
import { getAllCategories, getAllPublishers, getFilteredGames } from '../src/lib/games';
import type { GameFilters } from '../src/lib/games';

const db = getDatabase();

/**
 * Titles the listing should show for the given filters, per the data layer.
 *
 * @param filters - Category/publisher filters to apply.
 * @returns Matching game titles, ordered by title.
 */
async function expectedTitles(filters: GameFilters): Promise<string[]> {
  return (await getFilteredGames(db, filters)).map((game) => game.title);
}

/**
 * Locator for the titles of cards that are currently shown (filtered-out cards get `hidden`).
 *
 * @param page - Page showing the game listing.
 * @returns Locator matching the visible game card titles.
 */
function visibleTitles(page: Page): Locator {
  return page.locator('[data-testid="game-card"]:not([hidden]) [data-testid="game-title"]');
}

test.describe('Game filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Filters - lists every game with no filter selected', async ({ page }) => {
    const all = await expectedTitles({});

    await expect(page.getByTestId('game-filters')).toBeVisible();
    await expect(visibleTitles(page)).toHaveText(all);
    await expect(page.getByTestId('filter-count')).toHaveText(`Showing ${all.length} of ${all.length} games`);
  });

  test('Filters - filters by a single category', async ({ page }) => {
    const [category] = await getAllCategories(db);
    const expected = await expectedTitles({ categoryIds: [category.id] });

    await page.getByRole('checkbox', { name: category.name, exact: true }).check();

    await expect(visibleTitles(page)).toHaveText(expected);
  });

  test('Filters - matches any of several selected categories', async ({ page }) => {
    const [first, second] = await getAllCategories(db);
    const expected = await expectedTitles({ categoryIds: [first.id, second.id] });

    await page.getByRole('checkbox', { name: first.name, exact: true }).check();
    await page.getByRole('checkbox', { name: second.name, exact: true }).check();

    await expect(visibleTitles(page)).toHaveText(expected);
    await expect(page.getByTestId('filter-count')).toHaveText(
      `Showing ${expected.length} of ${(await expectedTitles({})).length} games`,
    );
  });

  test('Filters - filters by publisher', async ({ page }) => {
    const [publisher] = await getAllPublishers(db);
    const expected = await expectedTitles({ publisherId: publisher.id });

    await page.getByRole('combobox', { name: 'Publisher' }).selectOption({ label: publisher.name });

    await expect(visibleTitles(page)).toHaveText(expected);
  });

  test('Filters - combines category and publisher filters', async ({ page }) => {
    const [category] = await getAllCategories(db);
    const [game] = await getFilteredGames(db, { categoryIds: [category.id] });
    const publisher = game.publisher!;
    const expected = await expectedTitles({ categoryIds: [category.id], publisherId: publisher.id });
    const categoryOnly = await expectedTitles({ categoryIds: [category.id] });
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThanOrEqual(categoryOnly.length);

    await page.getByRole('checkbox', { name: category.name, exact: true }).check();
    await page.getByRole('combobox', { name: 'Publisher' }).selectOption({ label: publisher.name });

    await expect(visibleTitles(page)).toHaveText(expected);
  });

  test('Filters - clear filters restores every game', async ({ page }) => {
    const [category] = await getAllCategories(db);
    const all = await expectedTitles({});

    await page.getByRole('checkbox', { name: category.name, exact: true }).check();
    await expect(page).toHaveURL(/category=/);

    await page.getByTestId('filter-clear').click();

    await expect(visibleTitles(page)).toHaveText(all);
    await expect(page.getByRole('checkbox', { name: category.name, exact: true })).not.toBeChecked();
    await expect(page).not.toHaveURL(/category=/);
  });

  test('Filters - restores the selection from the URL', async ({ page }) => {
    const [category] = await getAllCategories(db);
    const [publisher] = await getAllPublishers(db);
    const expected = await expectedTitles({ categoryIds: [category.id], publisherId: publisher.id });

    await page.goto(`/?category=${category.id}&publisher=${publisher.id}`);

    await expect(page.getByRole('checkbox', { name: category.name, exact: true })).toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Publisher' })).toHaveValue(String(publisher.id));
    await expect(visibleTitles(page)).toHaveText(expected);
  });

  test('Filters - can be operated with the keyboard', async ({ page }) => {
    const [category] = await getAllCategories(db);
    const expected = await expectedTitles({ categoryIds: [category.id] });
    const checkbox = page.getByRole('checkbox', { name: category.name, exact: true });

    await checkbox.focus();
    await expect(checkbox).toBeFocused();
    await page.keyboard.press('Space');

    await expect(checkbox).toBeChecked();
    await expect(visibleTitles(page)).toHaveText(expected);
  });

  test('Filters - controls expose accessible names', async ({ page }) => {
    await expect(page.getByRole('form', { name: 'Filter games' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Categories' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Publisher' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  });
});
