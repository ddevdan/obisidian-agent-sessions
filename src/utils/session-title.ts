/**
 * Session display-name resolution.
 *
 * Three things can name a session, in descending order of authority:
 *   1. `customTitle` — set deliberately by the user via /rename
 *   2. `aiTitle`     — Claude Code's auto-generated name, the label its own
 *                      /resume picker shows. Present on roughly half of sessions
 *                      and regenerated as the session evolves
 *   3. `project`     — the derived project name, always present
 *
 * Kept in one place so every surface (pickers, search, summary panel, exporters,
 * distill) agrees on the answer.
 */

/** The naming fields every session-shaped record carries. */
export interface TitledSession {
	customTitle?: string;
	aiTitle?: string;
	project: string;
}

/** Resolve the name to show for a session. Never empty — falls back to `project`. */
export function sessionDisplayName(session: TitledSession): string {
	return sessionTitle(session) ?? session.project;
}

/**
 * The session's explicit title, or undefined when it has none.
 *
 * Use this for a "Title:" row or a frontmatter `title:` key, which sit next to a
 * separate "Project" field — falling back to `project` there would just print the
 * same value twice.
 */
export function sessionTitle(session: TitledSession): string | undefined {
	return firstNonBlank(session.customTitle, session.aiTitle);
}

/**
 * The name fields worth matching a search query against, `project` included.
 * Deduplicated, blanks dropped — so a query matches a session by any of its
 * names, not just the one currently on display.
 */
export function sessionSearchableNames(session: TitledSession): string[] {
	const names = [session.customTitle, session.aiTitle, session.project]
		.map(n => n?.trim())
		.filter((n): n is string => !!n);
	return [...new Set(names)];
}

function firstNonBlank(...values: (string | undefined)[]): string | undefined {
	for (const value of values) {
		const trimmed = value?.trim();
		if (trimmed) return trimmed;
	}
	return undefined;
}
