/**
 * Per-format record-shape matchers for the discovery scan.
 *
 * Discovery previously hard-coded one format's record shape as the definition of "has
 * content", which silently excluded every session in any other format. A probe per
 * format keeps that knowledge in one place, so a third format has somewhere to go
 * instead of adding another branch to the scan loop.
 *
 * Probes come in two tiers, because the scan has two very different budgets:
 *
 *  - **Record tier** — runs inside the loop that already `JSON.parse`s the first lines
 *    of a transcript, so it can read fields directly. Anything that must be *correct*
 *    belongs here. A line-head test cannot do this job: Claude Code writes its
 *    top-level `type` after a long preamble, at a median offset of 1146 characters and
 *    up to 48KB in, so 62% of its conversation records have no `type` within any
 *    sensible head budget.
 *
 *  - **Line tier** — runs over every line of every transcript with no parse, for the
 *    whole-file sweep that dates a session by its last prompt. Substring work only. A
 *    miss here degrades to the file mtime, so it is allowed to be approximate.
 */

import type { SessionFormat } from '../types';
import {
	USER_TYPE_PATTERN,
	PI_LINE_PREFIX_MESSAGE, PI_LINE_PREFIX_SESSION, RE_PI_ROLE,
	PI_RT_MESSAGE, PI_RT_SESSION,
	PI_ROLE_USER, PI_ROLE_ASSISTANT,
	RT_USER, RT_ASSISTANT,
} from '../constants';

/** How much of a line the line tier is allowed to see. Matches the scan's budget. */
export const HEAD_CHARS = 200;

/** Take the slice of a line the line tier operates on. */
export function lineHead(trimmedLine: string): string {
	return trimmedLine.length > HEAD_CHARS ? trimmedLine.slice(0, HEAD_CHARS) : trimmedLine;
}

export interface FormatProbe {
	format: SessionFormat;
	/**
	 * Record tier: is this a user or assistant exchange — the thing that makes a
	 * transcript a conversation rather than a pile of metadata?
	 */
	isConversationRecord(record: Record<string, unknown>): boolean;
	/** Record tier: the session id this record carries, if it carries one. */
	sessionIdFrom(record: Record<string, unknown>): string | undefined;
	/** Line tier: line looks like a prompt from the human. Approximate by design. */
	isUserPromptLine(head: string): boolean;
}

/** Claude Code: the conversation role *is* the record's top-level `type`. */
const claudeProbe: FormatProbe = {
	format: 'claude',
	isConversationRecord(record) {
		return record['type'] === RT_USER || record['type'] === RT_ASSISTANT;
	},
	sessionIdFrom(record) {
		const id = record['sessionId'];
		return typeof id === 'string' && id ? id : undefined;
	},
	isUserPromptLine(head) {
		return head.includes(USER_TYPE_PATTERN);
	},
};

/** pi: the conversation role sits one level down, at `message.role`. */
const piProbe: FormatProbe = {
	format: 'pi',
	isConversationRecord(record) {
		if (record['type'] !== PI_RT_MESSAGE) return false;
		const role = (record['message'] as Record<string, unknown> | undefined)?.['role'];
		return role === PI_ROLE_USER || role === PI_ROLE_ASSISTANT;
	},
	sessionIdFrom(record) {
		// Only the `session` record's `id` is the session id — a `message` record's
		// top-level `id` identifies the message.
		if (record['type'] !== PI_RT_SESSION) return undefined;
		const id = record['id'];
		return typeof id === 'string' && id ? id : undefined;
	},
	isUserPromptLine(head) {
		if (!head.startsWith(PI_LINE_PREFIX_MESSAGE)) return false;
		return RE_PI_ROLE.exec(head)?.[1] === PI_ROLE_USER;
	},
};

/**
 * All known probes. Discovery consults every one rather than detecting the format
 * first: the formats' record shapes are mutually exclusive, so asking all of them is
 * both correct and cheaper than a separate detection pass.
 */
export const FORMAT_PROBES: FormatProbe[] = [claudeProbe, piProbe];

/** Any format considers this record a user or assistant exchange. */
export function isConversationRecord(record: Record<string, unknown>): boolean {
	return formatFromRecord(record) !== undefined;
}

/**
 * Which format claims this record as a conversation record, if any.
 *
 * Lets discovery label an entry without running a parser: the record shapes are mutually
 * exclusive, so the probe that recognises the record identifies the format. Without this
 * the session list has to guess, and a hard-coded guess makes every session look like it
 * came from the same agent.
 */
export function formatFromRecord(record: Record<string, unknown>): SessionFormat | undefined {
	for (const probe of FORMAT_PROBES) {
		if (probe.isConversationRecord(record)) return probe.format;
	}
	return undefined;
}

/** First session id any format can read off this record. */
export function sessionIdFromRecord(record: Record<string, unknown>): string | undefined {
	for (const probe of FORMAT_PROBES) {
		const id = probe.sessionIdFrom(record);
		if (id) return id;
	}
	return undefined;
}

/** Any format considers this line a prompt from the human. */
export function isUserPromptLine(head: string): boolean {
	return FORMAT_PROBES.some(p => p.isUserPromptLine(head));
}

/** Session-scoped line check used to decide whether a line is worth parsing at all. */
export function isSessionRecordLine(head: string): boolean {
	return head.startsWith(PI_LINE_PREFIX_SESSION);
}
