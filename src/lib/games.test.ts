import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getAllCategories,
    getAllPublishers,
    getFilteredGames,
    getGameById,
} from './games';

/** Ids of the rows created by {@link seedFilterFixture}, keyed by name. */
interface FilterFixture {
    /** Category ids keyed by category name (`Strategy`, `Puzzle`, `Arcade`). */
    categoryIds: Record<string, number>;
    /** Publisher ids keyed by publisher name (`Pub One`, `Pub Two`). */
    publisherIds: Record<string, number>;
}

/**
 * Seeds four games across two categories and two publishers, plus an unused
 * `Arcade` category for no-match cases.
 *
 * @param db - Database to seed.
 * @returns The ids of the seeded categories and publishers.
 */
async function seedFilterFixture(db: Database): Promise<FilterFixture> {
    const categoryIds: Record<string, number> = {};
    for (const name of ['Strategy', 'Puzzle', 'Arcade']) {
        const [row] = await db.insert(categories).values({ name }).returning({ id: categories.id });
        categoryIds[name] = row.id;
    }
    const publisherIds: Record<string, number> = {};
    for (const name of ['Pub One', 'Pub Two']) {
        const [row] = await db.insert(publishers).values({ name }).returning({ id: publishers.id });
        publisherIds[name] = row.id;
    }

    const rows: Array<[string, string, string]> = [
        ['Delta', 'Strategy', 'Pub One'],
        ['Alpha', 'Strategy', 'Pub Two'],
        ['Charlie', 'Puzzle', 'Pub One'],
        ['Bravo', 'Puzzle', 'Pub Two'],
    ];
    for (const [title, category, publisher] of rows) {
        await db.insert(games).values({
            title,
            description: `${title} description`,
            starRating: null,
            categoryId: categoryIds[category],
            publisherId: publisherIds[publisher],
        });
    }
    return { categoryIds, publisherIds };
}

/**
 * Seeds `count` games sharing one category and one publisher, titled
 * `Game 01`, `Game 02`, … and inserted in reverse-alphabetical order.
 *
 * @param db - Database to seed.
 * @param count - Number of games to insert.
 * @returns A promise that resolves once all rows are inserted.
 */
async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});

describe('getFilteredGames', () => {
    let db: Database;
    let fixture: FilterFixture;

    /** Maps games to their titles for concise ordering assertions. */
    const titles = (list: Array<{ title: string }>): string[] => list.map((g) => g.title);

    beforeEach(async () => {
        db = await createTestDatabase();
        fixture = await seedFilterFixture(db);
    });

    it('returns all games ordered by title when no filters are given', async () => {
        expect(titles(await getFilteredGames(db))).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        expect(titles(await getFilteredGames(db, {}))).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    });

    it('treats an empty category list as no category filter', async () => {
        expect(await getFilteredGames(db, { categoryIds: [] })).toHaveLength(4);
    });

    it('filters by a single category', async () => {
        const result = await getFilteredGames(db, { categoryIds: [fixture.categoryIds.Strategy] });
        expect(titles(result)).toEqual(['Alpha', 'Delta']);
    });

    it('matches any of several categories', async () => {
        const result = await getFilteredGames(db, {
            categoryIds: [fixture.categoryIds.Strategy, fixture.categoryIds.Puzzle],
        });
        expect(titles(result)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    });

    it('filters by publisher', async () => {
        const result = await getFilteredGames(db, { publisherId: fixture.publisherIds['Pub One'] });
        expect(titles(result)).toEqual(['Charlie', 'Delta']);
    });

    it('combines category and publisher filters', async () => {
        const result = await getFilteredGames(db, {
            categoryIds: [fixture.categoryIds.Puzzle],
            publisherId: fixture.publisherIds['Pub Two'],
        });
        expect(titles(result)).toEqual(['Bravo']);
    });

    it('returns an empty list when nothing matches', async () => {
        expect(await getFilteredGames(db, { categoryIds: [fixture.categoryIds.Arcade] })).toEqual([]);
        expect(await getFilteredGames(db, { publisherId: 99999 })).toEqual([]);
    });

    it('includes category and publisher relations on filtered games', async () => {
        const [game] = await getFilteredGames(db, { publisherId: fixture.publisherIds['Pub Two'] });
        expect(game.category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(game.publisher).toEqual({ id: fixture.publisherIds['Pub Two'], name: 'Pub Two' });
    });
});

describe('getAllCategories and getAllPublishers', () => {
    it('returns an empty list for an empty database', async () => {
        const db = await createTestDatabase();
        expect(await getAllCategories(db)).toEqual([]);
        expect(await getAllPublishers(db)).toEqual([]);
    });

    it('returns categories and publishers ordered by name', async () => {
        const db = await createTestDatabase();
        await seedFilterFixture(db);
        expect((await getAllCategories(db)).map((c) => c.name)).toEqual(['Arcade', 'Puzzle', 'Strategy']);
        expect((await getAllPublishers(db)).map((p) => p.name)).toEqual(['Pub One', 'Pub Two']);
    });
});
