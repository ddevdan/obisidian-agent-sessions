/**
 * Session list ordering.
 *
 * The list is ordered by when the human last prompted a session, not by the file's
 * mtime. mtime is a poor proxy: background writes (title regeneration, file-history
 * snapshots, subagent activity) keep touching a session file long after the last
 * prompt. Measured over a 361-session corpus the two orderings agreed on only ~14%
 * of positions, with drift reaching days — a session last prompted two hours ago
 * could outrank one prompted minutes ago.
 */

/** The ordering fields a session list entry carries. */
export interface OrderableSession {
	/** ISO timestamp of the last user prompt, when the session has one. */
	lastPromptTime?: string;
	/** File modification time in epoch ms — the fallback. */
	mtime: number;
}

/**
 * Sort key: epoch ms of the last user prompt, falling back to the file mtime when a
 * session has no user record or an unparseable timestamp. Sort descending for
 * most-recently-prompted first.
 */
export function lastPromptedAt(entry: OrderableSession): number {
	if (entry.lastPromptTime) {
		const parsed = Date.parse(entry.lastPromptTime);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return entry.mtime;
}

/** Order sessions most-recently-prompted first. Sorts in place and returns the array. */
export function sortByLastPrompt<T extends OrderableSession>(entries: T[]): T[] {
	return entries.sort((a, b) => lastPromptedAt(b) - lastPromptedAt(a));
}
