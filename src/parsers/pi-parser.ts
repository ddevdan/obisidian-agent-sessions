import { BaseParser } from './base-parser';
import {
	Session, Turn, ContentBlock, SessionStats, ParseWarning,
	ToolUseBlock, ToolResultBlock, BashCommandBlock,
} from '../types';
import { projectFromCwd, basename } from '../utils/path-utils';
import {
	PI_RT_SESSION, PI_RT_MESSAGE, PI_RT_SESSION_INFO,
	PI_RT_THINKING_LEVEL_CHANGE, PI_RT_MODEL_CHANGE,
	PI_ROLE_USER, PI_ROLE_ASSISTANT, PI_ROLE_TOOL_RESULT, PI_ROLE_BASH_EXECUTION,
	PI_BT_TEXT, PI_BT_THINKING, PI_BT_TOOL_CALL,
} from '../constants';
import { Logger } from '../utils/logger';

/**
 * Parser for pi (`@earendil-works/pi-coding-agent`) transcripts.
 *
 * pi writes JSONL and carries the conversation role one level down at `message.role`
 * rather than as the record's own `type`.
 *
 * Its `SessionEntry` union declares ten record types. Handled here: `session`, `message`,
 * `session_info`, plus `thinking_level_change` and `model_change` which are skipped as
 * metadata. Declared by pi but not yet seen in any transcript: `compaction`,
 * `branch_summary`, `label`, `custom`, `custom_message` — these fall through to the
 * unknown-type warning rather than being dropped silently.
 *
 * Two things differ from Claude Code in ways that matter here:
 *
 *  - pi records its own cost per assistant message. Its models are not necessarily
 *    Anthropic, so the Anthropic price table must not be applied — see `costSource`.
 *  - every record carries a `parentId`, making a transcript a tree. The viewer's model
 *    is a linear turn list, so records are read in file order and `parentId` is ignored.
 *    A rewound-and-branched transcript would therefore show every branch in the order
 *    written; no such transcript has been observed.
 */

/** pi record types that carry no renderable content and are skipped deliberately. */
const PI_SKIP_RECORD_TYPES = new Set<string>([
	PI_RT_THINKING_LEVEL_CHANGE,
	PI_RT_MODEL_CHANGE,
]);

const PI_KNOWN_ROLES = new Set<string>([
	PI_ROLE_USER, PI_ROLE_ASSISTANT, PI_ROLE_TOOL_RESULT, PI_ROLE_BASH_EXECUTION,
]);

interface PiUsage {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	reasoning?: number;
	totalTokens?: number;
	cost?: { total?: number };
}

interface PiMessage {
	role?: string;
	timestamp?: string;
	content?: unknown;
	// assistant
	model?: string;
	provider?: string;
	usage?: PiUsage;
	stopReason?: string;
	errorMessage?: string;
	// toolResult
	toolCallId?: string;
	toolName?: string;
	isError?: boolean;
	// bashExecution
	command?: string;
	output?: string;
	exitCode?: number;
	cancelled?: boolean;
}

interface PiRecord {
	type?: string;
	id?: string;
	parentId?: string | null;
	timestamp?: string;
	message?: PiMessage;
	// session record
	cwd?: string;
	version?: number | string;
	// session_info record
	name?: string;
}

interface PiBlock {
	type?: string;
	text?: string;
	thinking?: string;
	// toolCall
	id?: string;
	name?: string;
	arguments?: unknown;
}

export class PiParser extends BaseParser {
	readonly format = 'pi' as const;

	canParse(firstLines: string[]): boolean {
		for (const line of firstLines) {
			const record = this.tryParseJson(line) as PiRecord | null;
			if (!record) continue;
			// A session record is unambiguous: pi is the only format that has one.
			if (record.type === PI_RT_SESSION && typeof record.cwd === 'string') return true;
			// Otherwise a message record whose nested role is one pi uses.
			if (record.type === PI_RT_MESSAGE && PI_KNOWN_ROLES.has(record.message?.role ?? '')) {
				return true;
			}
		}
		return false;
	}

	parse(content: string, filePath: string): Session {
		this.parseErrorCount = 0;
		const lines = this.splitLines(content);

		let sessionId = '';
		let cwd = '';
		let version = '';
		let startTime = '';
		let lastModel = '';
		let customTitle = '';

		const turns: Turn[] = [];
		const toolUseCounts: Record<string, number> = {};
		const unknownRecordTypes = new Map<string, number>();
		const unknownBlockTypes = new Map<string, number>();

		// Token usage per message record id, so a duplicated record cannot double-count.
		const usageById = new Map<string, PiUsage>();

		let firstTimestamp = '';
		let lastTimestamp = '';

		// The assistant turn currently being accumulated. pi emits reasoning, tool calls
		// and text as separate consecutive assistant records; they belong to one turn, and
		// interleaved tool results attach to it rather than breaking it.
		let openAssistant: Turn | null = null;
		const flushAssistant = () => {
			if (openAssistant && openAssistant.contentBlocks.length > 0) turns.push(openAssistant);
			openAssistant = null;
		};

		for (const line of lines) {
			const record = this.tryParseJson(line) as PiRecord | null;
			if (!record) continue;

			const type = record.type ?? '';

			if (type === PI_RT_SESSION) {
				if (typeof record.id === 'string' && !sessionId) sessionId = record.id;
				if (typeof record.cwd === 'string' && !cwd) cwd = record.cwd;
				if (record.version !== undefined && !version) version = String(record.version);
				if (record.timestamp && !startTime) startTime = record.timestamp;
				continue;
			}

			// pi's user-set session name (`--name`, `setSessionName()`). The latest entry
			// wins and a blank name is an explicit clear, matching pi's own resolution.
			if (type === PI_RT_SESSION_INFO) {
				customTitle = (record.name ?? '').trim();
				continue;
			}

			if (PI_SKIP_RECORD_TYPES.has(type)) continue;

			if (type !== PI_RT_MESSAGE) {
				unknownRecordTypes.set(type, (unknownRecordTypes.get(type) ?? 0) + 1);
				continue;
			}

			const message = record.message;
			if (!message) continue;

			const timestamp = this.formatTimestamp(message.timestamp ?? record.timestamp);
			if (timestamp) {
				if (!firstTimestamp) firstTimestamp = timestamp;
				lastTimestamp = timestamp;
			}

			switch (message.role) {
				case PI_ROLE_USER: {
					flushAssistant();
					const blocks = this.mapBlocks(message.content, timestamp, toolUseCounts, unknownBlockTypes);
					if (blocks.length > 0) {
						turns.push({ index: turns.length, role: 'user', timestamp, endTimestamp: timestamp, contentBlocks: blocks });
					}
					break;
				}

				case PI_ROLE_ASSISTANT: {
					if (typeof message.model === 'string' && message.model) lastModel = message.model;
					if (record.id && message.usage) usageById.set(record.id, message.usage);

					const blocks = this.mapBlocks(message.content, timestamp, toolUseCounts, unknownBlockTypes);
					if (blocks.length === 0 && !message.errorMessage) break;

					if (!openAssistant) {
						openAssistant = {
							index: turns.length,
							role: 'assistant',
							timestamp,
							endTimestamp: timestamp,
							contentBlocks: [],
							model: message.model,
							stopReason: message.stopReason,
						};
					}
					openAssistant.contentBlocks.push(...blocks);
					openAssistant.endTimestamp = timestamp ?? openAssistant.endTimestamp;
					if (message.stopReason) openAssistant.stopReason = message.stopReason;
					if (message.errorMessage) {
						openAssistant.isApiError = true;
						openAssistant.contentBlocks.push({ type: 'text', text: message.errorMessage, timestamp });
					}
					break;
				}

				case PI_ROLE_TOOL_RESULT: {
					const block: ToolResultBlock = {
						type: 'tool_result',
						toolUseId: message.toolCallId ?? '',
						toolName: message.toolName,
						content: this.flattenText(message.content),
						isError: message.isError === true,
						timestamp,
					};
					// Attach to the assistant turn that made the call, matching the
					// existing convention that results belong to the preceding turn.
					if (openAssistant) {
						openAssistant.contentBlocks.push(block);
						openAssistant.endTimestamp = timestamp ?? openAssistant.endTimestamp;
					} else {
						const previous = turns[turns.length - 1];
						if (previous && previous.role === 'assistant') previous.contentBlocks.push(block);
						else turns.push({ index: turns.length, role: 'assistant', timestamp, endTimestamp: timestamp, contentBlocks: [block] });
					}
					break;
				}

				case PI_ROLE_BASH_EXECUTION: {
					flushAssistant();
					// The payload sits on the message itself; `content` is null for this role.
					const block: BashCommandBlock = {
						type: 'bash_command',
						command: message.command ?? '',
						stdout: message.output ?? '',
						stderr: '',
						exitCode: typeof message.exitCode === 'number' ? message.exitCode : undefined,
						timestamp,
					};
					turns.push({ index: turns.length, role: 'user', timestamp, endTimestamp: timestamp, contentBlocks: [block] });
					break;
				}

				default:
					unknownRecordTypes.set(
						`message.role=${message.role ?? '<none>'}`,
						(unknownRecordTypes.get(`message.role=${message.role ?? '<none>'}`) ?? 0) + 1,
					);
			}
		}
		flushAssistant();

		// Re-index, since turns are pushed from several branches above.
		turns.forEach((turn, i) => { turn.index = i; });

		const stats = this.buildStats(turns, usageById, toolUseCounts, firstTimestamp, lastTimestamp);

		const warnings: ParseWarning[] = [];
		for (const [type, count] of unknownRecordTypes) {
			Logger.warn(`pi: skipped unknown record type "${type}" (${count}x)`);
			warnings.push({ type: 'unknown_record_type', message: `Unknown pi record type "${type}" — plugin may need update`, count });
		}
		for (const [type, count] of unknownBlockTypes) {
			Logger.warn(`pi: skipped unknown content block type "${type}" (${count}x)`);
			warnings.push({ type: 'unknown_block_type', message: `Unknown pi content block "${type}" — plugin may need update`, count });
		}
		if (this.parseErrorCount > 0) {
			warnings.push({ type: 'parse_errors', message: `${this.parseErrorCount} line(s) could not be parsed`, count: this.parseErrorCount });
		}

		return {
			metadata: {
				id: sessionId || basename(filePath).replace(/\.\w+$/, ''),
				format: this.format,
				project: cwd ? projectFromCwd(cwd) : '',
				cwd,
				// pi records no git branch.
				model: lastModel || undefined,
				version: version || undefined,
				customTitle: customTitle || undefined,
				startTime: this.formatTimestamp(startTime) ?? (firstTimestamp || undefined),
				totalTurns: turns.length,
			},
			stats,
			turns,
			systemEvents: [],
			rawPath: filePath,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	}

	/** Map a pi `message.content` array to content blocks. */
	private mapBlocks(
		content: unknown,
		timestamp: string | undefined,
		toolUseCounts: Record<string, number>,
		unknownBlockTypes: Map<string, number>,
	): ContentBlock[] {
		if (!Array.isArray(content)) return [];
		const blocks: ContentBlock[] = [];
		for (const raw of content) {
			if (!raw || typeof raw !== 'object') continue;
			const block = raw as PiBlock;
			switch (block.type) {
				case PI_BT_TEXT:
					if (block.text) blocks.push({ type: 'text', text: block.text, timestamp });
					break;
				case PI_BT_THINKING:
					if (block.thinking) blocks.push({ type: 'thinking', thinking: block.thinking, timestamp });
					break;
				case PI_BT_TOOL_CALL: {
					const name = block.name ?? '';
					const toolUse: ToolUseBlock = {
						type: 'tool_use',
						id: block.id ?? '',
						name,
						input: (block.arguments && typeof block.arguments === 'object')
							? block.arguments as Record<string, unknown>
							: {},
						timestamp,
					};
					blocks.push(toolUse);
					if (name) toolUseCounts[name] = (toolUseCounts[name] ?? 0) + 1;
					break;
				}
				default: {
					const type = block.type ?? '<none>';
					unknownBlockTypes.set(type, (unknownBlockTypes.get(type) ?? 0) + 1);
				}
			}
		}
		return blocks;
	}

	/** Flatten a pi content array to plain text, for tool results. */
	private flattenText(content: unknown): string {
		if (typeof content === 'string') return content;
		if (!Array.isArray(content)) return '';
		const parts: string[] = [];
		for (const raw of content) {
			if (!raw || typeof raw !== 'object') continue;
			const block = raw as PiBlock;
			if (block.type === PI_BT_TEXT && block.text) parts.push(block.text);
		}
		return parts.join('\n');
	}

	private buildStats(
		turns: Turn[],
		usageById: Map<string, PiUsage>,
		toolUseCounts: Record<string, number>,
		firstTimestamp: string,
		lastTimestamp: string,
	): SessionStats {
		let inputTokens = 0;
		let outputTokens = 0;
		let cacheReadTokens = 0;
		let cacheCreationTokens = 0;
		let recordedCost = 0;
		let sawRecordedCost = false;
		let lastCallContext = 0;

		for (const usage of usageById.values()) {
			const input = usage.input ?? 0;
			const output = usage.output ?? 0;
			const cacheRead = usage.cacheRead ?? 0;
			const cacheWrite = usage.cacheWrite ?? 0;
			inputTokens += input;
			outputTokens += output;
			cacheReadTokens += cacheRead;
			cacheCreationTokens += cacheWrite;
			if (typeof usage.cost?.total === 'number') {
				recordedCost += usage.cost.total;
				sawRecordedCost = true;
			}
			lastCallContext = input + cacheRead + cacheWrite;
		}

		let durationMs = 0;
		if (firstTimestamp && lastTimestamp) {
			const span = new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime();
			if (Number.isFinite(span) && span > 0) durationMs = span;
		}

		return {
			userTurns: turns.filter(t => t.role === 'user').length,
			assistantTurns: turns.filter(t => t.role === 'assistant').length,
			inputTokens,
			outputTokens,
			cacheReadTokens,
			cacheCreationTokens,
			totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
			contextWindowTokens: lastCallContext,
			// pi declares a `compaction` record type but none appears in the transcripts
			// observed so far, and it is not yet handled — so these stay zero.
			peakContextTokens: 0,
			cumulativeDroppedTokens: 0,
			compactionCount: 0,
			costUSD: recordedCost,
			// pi runs models this project has no price table for, so the figure above is
			// pi's own and must never be recomputed from MODEL_PRICING.
			costSource: sawRecordedCost ? 'recorded' : 'unknown',
			toolUseCounts,
			durationMs,
		};
	}
}
