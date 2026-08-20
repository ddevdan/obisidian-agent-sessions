/**
 * Inline JSONL fixture builders for parser tests.
 * Each function returns a multi-line string of JSONL records.
 *
 * ## Claude Code Version Tracking
 *
 * When adding fixtures for new JSONL features, document the CC version:
 * - Add a JSDoc comment with "CC X.Y.Z+" indicating minimum version
 * - Update COMPATIBILITY.md with the feature mapping
 * - See COMPATIBILITY.md for the full version compatibility table
 */

/** Helper: build a JSONL string from an array of record objects. */
export function jsonl(...records: Record<string, unknown>[]): string {
	return records.map(r => JSON.stringify(r)).join('\n');
}

/** Minimal assistant record with a text block. */
export function assistantText(text: string, opts?: {
	uuid?: string;
	timestamp?: string;
	model?: string;
	msgId?: string;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
		cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
	};
}): Record<string, unknown> {
	return {
		type: 'assistant',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:00:00.000Z',
		message: {
			role: 'assistant',
			model: opts?.model ?? 'claude-sonnet-4-20250514',
			id: opts?.msgId ?? `msg_${Math.random().toString(36).slice(2, 10)}`,
			content: [{ type: 'text', text }],
			...(opts?.usage ? { usage: opts.usage } : {}),
		},
	};
}

/** Assistant record with a thinking block. */
export function assistantThinking(thinking: string, opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'assistant',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:00:00.000Z',
		message: {
			role: 'assistant',
			model: 'claude-sonnet-4-20250514',
			content: [{ type: 'thinking', thinking }],
		},
	};
}

/** Assistant record with an encrypted thinking block (signature only, no text). CC 2.1.79+ */
export function assistantEncryptedThinking(opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'assistant',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:00:00.000Z',
		message: {
			role: 'assistant',
			model: 'claude-sonnet-4-20250514',
			content: [{ type: 'thinking', thinking: '', signature: 'abc123encrypted' }],
		},
	};
}

/** Assistant record with a tool_use block. */
export function assistantToolUse(name: string, id: string, input: Record<string, unknown>, opts?: {
	uuid?: string;
	timestamp?: string;
	msgId?: string;
}): Record<string, unknown> {
	return {
		type: 'assistant',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:00:00.000Z',
		message: {
			role: 'assistant',
			model: 'claude-sonnet-4-20250514',
			id: opts?.msgId,
			content: [{ type: 'tool_use', id, name, input }],
		},
	};
}

/** User record with actual text content. */
export function userText(text: string, opts?: {
	uuid?: string;
	timestamp?: string;
	sessionId?: string;
	cwd?: string;
}): Record<string, unknown> {
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:01:00.000Z',
		...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
		...(opts?.cwd ? { cwd: opts.cwd } : {}),
		message: {
			role: 'user',
			content: text,
		},
	};
}

/** User record with tool_result blocks (no user text). */
export function userToolResult(results: { toolUseId: string; content: string; isError?: boolean }[], opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:00:30.000Z',
		message: {
			role: 'user',
			content: results.map(r => ({
				type: 'tool_result',
				tool_use_id: r.toolUseId,
				content: r.content,
				is_error: r.isError ?? false,
			})),
		},
	};
}

/** File history snapshot record (should be skipped). */
export function fileHistorySnapshot(): Record<string, unknown> {
	return {
		type: 'file-history-snapshot',
		uuid: crypto.randomUUID(),
		timestamp: '2026-01-01T00:00:00.000Z',
		snapshot: { files: ['/some/path'] },
	};
}

/** Sidechain record (should be skipped unless allowSidechain). */
export function sidechainAssistant(text: string, opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		...assistantText(text, opts),
		isSidechain: true,
	};
}

/** isMeta assistant record (should always be skipped). */
export function metaAssistant(text: string): Record<string, unknown> {
	return {
		...assistantText(text),
		isMeta: true,
	};
}

/** User record invoking a slash command (e.g. /wrap or /context). */
export function userSlashCommand(command: string, opts?: {
	uuid?: string;
	timestamp?: string;
	commandMessage?: string;
}): Record<string, unknown> {
	const msg = opts?.commandMessage ?? command.replace(/^\//, '');
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:01:00.000Z',
		message: {
			role: 'user',
			content: `<command-message>${msg}</command-message>\n<command-name>${command}</command-name>`,
		},
	};
}

/** isMeta user record with skill expansion text (follows a slash command). */
export function metaSkillExpansion(text: string, opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:01:00.000Z',
		isMeta: true,
		message: {
			role: 'user',
			content: [{ type: 'text', text }],
		},
	};
}

/** Synthetic model record (should be skipped). */
export function syntheticAssistant(text: string): Record<string, unknown> {
	const rec = assistantText(text);
	(rec.message as Record<string, unknown>).model = '<synthetic>';
	return rec;
}

/** User record with bash command input (user-typed shell command). */
export function userBashInput(command: string, opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:01:00.000Z',
		message: {
			role: 'user',
			content: `<bash-input>${command}</bash-input>`,
		},
	};
}

/** User record with bash command output (stdout + stderr). */
export function userBashOutput(stdout: string, stderr = '', opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:01:01.000Z',
		message: {
			role: 'user',
			content: `<bash-stdout>${stdout}</bash-stdout><bash-stderr>${stderr}</bash-stderr>`,
		},
	};
}

/** isMeta user record with local-command-caveat (already filtered by isMeta). */
export function userBashCaveat(opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:01:00.000Z',
		isMeta: true,
		message: {
			role: 'user',
			content: '<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>',
		},
	};
}

/** User record with interruption message. */
export function userInterruption(opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:01:00.000Z',
		message: {
			role: 'user',
			content: '[Request interrupted by user] some context',
		},
	};
}

/** User record with custom session title from /rename command. CC ~2.1.90+ */
export function userCustomTitle(title: string, opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:01:00.000Z',
		message: {
			role: 'user',
			content: `<custom-title>${title}</custom-title>`,
		},
	};
}

/** System record with hook summary. CC ~2.1.90+ */
export function systemHookSummary(hooks: { hookName: string; hookEvent: string; command: string; durationMs: number; exitCode?: number; stdout?: string; toolUseId?: string }[], opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'system',
		subtype: 'stop_hook_summary',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:01:00.000Z',
		hookInfos: hooks.map(h => ({
			hookName: h.hookName,
			hookEvent: h.hookEvent,
			command: h.command,
			durationMs: h.durationMs,
			exitCode: h.exitCode ?? 0,
			stdout: h.stdout ?? '',
			stderr: '',
			toolUseId: h.toolUseId,
		})),
	};
}

/** System record with skill listing. CC ~2.1.90+ */
export function systemSkillListing(skills: string[], opts?: {
	uuid?: string;
	timestamp?: string;
}): Record<string, unknown> {
	const content = skills.map(s => `- ${s}: Description`).join('\n');
	return {
		type: 'system',
		subtype: 'skill_listing',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:00:00.000Z',
		content,
	};
}

/** Assistant record with tool_reference result (ToolSearch). CC ~2.1.88+ */
export function assistantToolReference(toolNames: string[], opts?: {
	uuid?: string;
	timestamp?: string;
	toolUseId?: string;
}): Record<string, unknown> {
	return {
		type: 'user',
		uuid: opts?.uuid ?? crypto.randomUUID(),
		timestamp: opts?.timestamp ?? '2026-01-01T00:00:30.000Z',
		message: {
			role: 'user',
			content: toolNames.map(name => ({
				type: 'tool_result',
				tool_use_id: opts?.toolUseId ?? 'toolu_123',
				content: [{ type: 'tool_reference', tool_name: name }],
			})),
		},
	};
}

// ── pi transcript fixtures ──────────────────────────────────────────────
// pi (@earendil-works/pi-coding-agent), session record `version: 3`, CLI 0.84.2.
// Shapes mirror real transcripts: the record's own `type` is always `message` for
// conversation, and the role sits one level down at `message.role`.

/** pi session header record — the first line of every pi transcript. */
export function piSession(opts?: {
	id?: string; cwd?: string; version?: number; timestamp?: string;
}): Record<string, unknown> {
	return {
		type: 'session',
		version: opts?.version ?? 3,
		id: opts?.id ?? '019fd343-27fe-7ae2-ae4b-efca854513b1',
		timestamp: opts?.timestamp ?? '2026-08-05T18:50:21.566Z',
		cwd: opts?.cwd ?? '/Users/daniel/lab/ankihub',
	};
}

/** Wrap a pi message payload in its record envelope. */
function piRecord(message: Record<string, unknown>, opts?: {
	id?: string; parentId?: string; timestamp?: string;
}): Record<string, unknown> {
	const timestamp = opts?.timestamp ?? '2026-08-05T18:50:22.000Z';
	return {
		type: 'message',
		id: opts?.id ?? crypto.randomUUID(),
		parentId: opts?.parentId ?? null,
		timestamp,
		message: { timestamp, ...message },
	};
}

/** pi user prompt. */
export function piUser(text: string, opts?: { timestamp?: string }): Record<string, unknown> {
	return piRecord({ role: 'user', content: [{ type: 'text', text }] }, opts);
}

/** pi assistant record carrying arbitrary content blocks. */
export function piAssistant(content: Record<string, unknown>[], opts?: {
	id?: string;
	timestamp?: string;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	usage?: {
		input?: number; output?: number; cacheRead?: number; cacheWrite?: number;
		reasoning?: number; totalTokens?: number; cost?: { total?: number };
	};
}): Record<string, unknown> {
	return piRecord({
		role: 'assistant',
		model: opts?.model ?? 'gpt-5.6-sol',
		provider: 'openai-codex',
		content,
		...(opts?.stopReason ? { stopReason: opts.stopReason } : {}),
		...(opts?.errorMessage ? { errorMessage: opts.errorMessage } : {}),
		...(opts?.usage ? { usage: opts.usage } : {}),
	}, opts);
}

/** pi assistant text block. */
export function piText(text: string): Record<string, unknown> {
	return { type: 'text', text };
}

/** pi assistant reasoning block. */
export function piThinking(thinking: string): Record<string, unknown> {
	return { type: 'thinking', thinking };
}

/** pi tool invocation block. */
export function piToolCall(name: string, id: string, args: Record<string, unknown>): Record<string, unknown> {
	return { type: 'toolCall', id, name, arguments: args };
}

/** pi tool output, addressed to a call by `toolCallId`. */
export function piToolResult(opts: {
	toolCallId: string; toolName?: string; content?: string; isError?: boolean; timestamp?: string;
}): Record<string, unknown> {
	return piRecord({
		role: 'toolResult',
		toolCallId: opts.toolCallId,
		toolName: opts.toolName ?? 'read',
		isError: opts.isError ?? false,
		content: [{ type: 'text', text: opts.content ?? 'ok' }],
		details: {},
	}, { timestamp: opts.timestamp });
}

/** pi shell execution. Its payload sits on the message; `content` is null. */
export function piBashExecution(opts: {
	command: string; output?: string; exitCode?: number; timestamp?: string;
}): Record<string, unknown> {
	return piRecord({
		role: 'bashExecution',
		command: opts.command,
		output: opts.output ?? '',
		exitCode: opts.exitCode ?? 0,
		cancelled: false,
		truncated: false,
		excludeFromContext: false,
		content: null,
	}, { timestamp: opts.timestamp });
}

/** pi metadata records that carry no renderable content. */
export function piModelChange(modelId = 'gpt-5.6-sol'): Record<string, unknown> {
	return { type: 'model_change', id: crypto.randomUUID(), parentId: null, timestamp: '2026-08-05T18:50:21.900Z', modelId, provider: 'openai-codex' };
}

export function piThinkingLevelChange(thinkingLevel = 'high'): Record<string, unknown> {
	return { type: 'thinking_level_change', id: crypto.randomUUID(), parentId: null, timestamp: '2026-08-05T18:50:21.950Z', thinkingLevel };
}

/**
 * pi's user-set session name (`--name`, `setSessionName()`), appended as a
 * `session_info` entry. Latest wins; a blank name is an explicit clear.
 */
export function piSessionInfo(name: string, opts?: { timestamp?: string }): Record<string, unknown> {
	return {
		type: 'session_info',
		id: crypto.randomUUID(),
		parentId: null,
		timestamp: opts?.timestamp ?? '2026-08-05T18:50:25.000Z',
		name,
	};
}
