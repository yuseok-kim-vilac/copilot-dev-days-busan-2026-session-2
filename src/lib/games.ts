import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Category, Game, Publisher } from '../types/game';

/**
 * Optional filters for the game list.
 *
 * Omitted or empty filters match everything.
 */
export interface GameFilters {
    /** Match games in any of these categories. */
    categoryIds?: number[];
    /** Match games from this publisher. */
    publisherId?: number;
}

/**
 * Column selection shared by game queries, flattening the joined category
 * and publisher columns into a single row shape.
 */
const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

/**
 * Row shape produced by {@link gameSelection}. Category and publisher
 * columns are nullable because they come from left joins.
 */
type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

/**
 * Maps a flat joined row into a {@link Game} with nested category and publisher.
 *
 * @param row - The joined game row to map.
 * @returns The game, with `category`/`publisher` set to `null` when the join found no match.
 */
function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

/**
 * Builds the base game query, left-joining categories and publishers.
 *
 * @param db - The database to query.
 * @returns An unexecuted query selecting {@link gameSelection}, ready for further filtering and ordering.
 */
function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/**
 * Gets all games ordered by title.
 *
 * @param db - The database to query.
 * @returns All games, ordered by title.
 */
export async function getAllGames(db: Database): Promise<Game[]> {
    const rows = await baseGamesQuery(db).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/**
 * Gets the games matching the filters, ordered by title.
 *
 * Categories are OR-ed together; the category and publisher filters are AND-ed.
 * Empty or undefined filters match all games.
 *
 * @param db - The database to query.
 * @param filters - The category and publisher filters to apply. Defaults to no filtering.
 * @returns The matching games, ordered by title.
 */
export async function getFilteredGames(db: Database, filters: GameFilters = {}): Promise<Game[]> {
    const conditions = [];
    if (filters.categoryIds && filters.categoryIds.length > 0) {
        conditions.push(inArray(games.categoryId, filters.categoryIds));
    }
    if (filters.publisherId !== undefined) {
        conditions.push(eq(games.publisherId, filters.publisherId));
    }

    const rows = await baseGamesQuery(db)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(games.title));
    return rows.map(mapGame);
}

/**
 * Gets all categories ordered by name.
 *
 * @param db - The database to query.
 * @returns All categories, ordered by name.
 */
export async function getAllCategories(db: Database): Promise<Category[]> {
    return db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .orderBy(asc(categories.name));
}

/**
 * Gets all publishers ordered by name.
 *
 * @param db - The database to query.
 * @returns All publishers, ordered by name.
 */
export async function getAllPublishers(db: Database): Promise<Publisher[]> {
    return db
        .select({ id: publishers.id, name: publishers.name })
        .from(publishers)
        .orderBy(asc(publishers.name));
}

/**
 * Gets all game ids ordered by game title.
 *
 * @param db - The database to query.
 * @returns All game ids, ordered by game title.
 */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/**
 * Gets a single game by id.
 *
 * @param db - The database to query.
 * @param id - The id of the game to find.
 * @returns The game, or `null` when it does not exist.
 */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
