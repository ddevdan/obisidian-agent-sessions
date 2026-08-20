import { describe, it, expect } from 'vitest';
import { PiParser } from '../src/parsers/pi-parser';
import { ClaudeParser } from '../src/parsers/claude-parser';
import { detectParser } from '../src/parsers/detect';
import {
	jsonl, piSession, piUser, piAssistant, piText, piThinking, piToolCall,
	piToolResult, piBashExecution, piModelChange, piThinkingLevelChange, piSessionInfo,
	assistantText, userText,
} from './fixtures';
import type { ToolUseBlock, ToolResultBlock, BashCommandBlock, ThinkingBlock } from '../src/types';
import { sessionDisplayName } from '../src/utils/session-title';

function parse(content: string, filePath = '/pi/sessions/proj/2026-08-05T18-50-21-566Z_abc.jsonl') {
	return new PiParser().parse(content, filePath);
}

describe('PiParser.canParse', () => {
	const parser = new PiParser();

	it('recognises a transcript by its session record', () => {
		expect(parser.canParse([JSON.stringify(piSession())])).toBe(true);
	});

	it('recognises a transcript by a message record with a pi role', () => {
		expect(parser.canParse([JSON.stringify(piUser('hi'))])).toBe(true);
	});

	// Detection must not depend on where the file was found.
	it('recognises a transcript regardless of file location', () => {
		const session = parse(jsonl(piSession(), piUser('hi')), '/somewhere/else/x.jsonl');
		expect(session.metadata.format).toBe('pi');
	});

	it('rejects a Claude transcript', () => {
		expect(parser.canParse([JSON.stringify(assistantText('hi'))])).toBe(false);
	});

	it('rejects unrelated JSON', () => {
		expect(parser.canParse(['{"hello":"world"}'])).toBe(false);
	});
});

describe('detectParser across formats', () => {
	it('routes a pi transcript to the pi parser', () => {
		expect(detectParser(jsonl(piSession(), piUser('hi')))?.format).toBe('pi');
	});

	it('routes a Claude transcript to the Claude parser', () => {
		expect(detectParser(jsonl(userText('hi'), assistantText('hello')))?.format).toBe('claude');
	});

	it('returns null for a transcript in no known format', () => {
		expect(detectParser('{"nope":1}\n{"still":"no"}')).toBeNull();
	});
});

describe('PiParser metadata', () => {
	it('reads identity from the session record', () => {
		const session = parse(jsonl(
			piSession({ id: 'sess-1', cwd: '/Users/x/lab/ankihub', version: 3, timestamp: '2026-08-05T18:50:21.566Z' }),
			piUser('hi'),
		));

		expect(session.metadata.id).toBe('sess-1');
		expect(session.metadata.cwd).toBe('/Users/x/lab/ankihub');
		expect(session.metadata.project).toBe('ankihub');
		expect(session.metadata.version).toBe('3');
		expect(session.metadata.format).toBe('pi');
		expect(session.metadata.startTime).toBe('2026-08-05T18:50:21.566Z');
	});

	it('records no git branch, because pi transcripts carry none', () => {
		const session = parse(jsonl(piSession(), piUser('hi')));
		expect(session.metadata.branch).toBeUndefined();
	});

	it('reports the model the assistant last used', () => {
		const session = parse(jsonl(
			piSession(),
			piUser('hi'),
			piAssistant([piText('one')], { model: 'deepseek-v4-pro' }),
		));
		expect(session.metadata.model).toBe('deepseek-v4-pro');
	});

	it('falls back to the filename when there is no session record', () => {
		const session = parse(jsonl(piUser('hi')), '/pi/sessions/proj/2026-08-05_zzz.jsonl');
		expect(session.metadata.id).toBe('2026-08-05_zzz');
	});
});

describe('PiParser turns and content blocks', () => {
	it('maps a user prompt to a user turn', () => {
		const session = parse(jsonl(piSession(), piUser('do the thing')));

		expect(session.turns).toHaveLength(1);
		expect(session.turns[0].role).toBe('user');
		expect(session.turns[0].contentBlocks[0]).toMatchObject({ type: 'text', text: 'do the thing' });
	});

	it('maps reasoning to a thinking block', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piThinking('weighing options'), piText('done')]),
		));

		const assistant = session.turns.find(t => t.role === 'assistant');
		const thinking = assistant?.contentBlocks.find(b => b.type === 'thinking') as ThinkingBlock;
		expect(thinking.thinking).toBe('weighing options');
	});

	it('maps a tool invocation with its arguments', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piToolCall('read', 'call-1', { path: '/tmp/a.txt', limit: 10 })]),
		));

		const toolUse = session.turns
			.flatMap(t => t.contentBlocks)
			.find(b => b.type === 'tool_use') as ToolUseBlock;
		expect(toolUse).toMatchObject({ id: 'call-1', name: 'read', input: { path: '/tmp/a.txt', limit: 10 } });
	});

	// pi emits reasoning, tool calls and prose as separate consecutive records; they
	// are one turn, and an interleaved tool result must not split them.
	it('merges consecutive assistant records into one turn', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piThinking('first')]),
			piAssistant([piToolCall('read', 'call-1', {})]),
			piToolResult({ toolCallId: 'call-1', content: 'file body' }),
			piAssistant([piText('summary')]),
		));

		const assistantTurns = session.turns.filter(t => t.role === 'assistant');
		expect(assistantTurns).toHaveLength(1);
		expect(assistantTurns[0].contentBlocks.map(b => b.type))
			.toEqual(['thinking', 'tool_use', 'tool_result', 'text']);
	});

	it('attaches a tool result to the call it belongs to', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piToolCall('read', 'call-42', {})]),
			piToolResult({ toolCallId: 'call-42', toolName: 'read', content: 'contents' }),
		));

		const result = session.turns
			.flatMap(t => t.contentBlocks)
			.find(b => b.type === 'tool_result') as ToolResultBlock;
		expect(result).toMatchObject({ toolUseId: 'call-42', toolName: 'read', content: 'contents', isError: false });
	});

	it('marks a failed tool result as an error', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piToolCall('bash', 'call-9', {})]),
			piToolResult({ toolCallId: 'call-9', toolName: 'bash', content: 'boom', isError: true }),
		));

		const result = session.turns
			.flatMap(t => t.contentBlocks)
			.find(b => b.type === 'tool_result') as ToolResultBlock;
		expect(result.isError).toBe(true);
	});

	it('maps a shell execution with its command, output and exit status', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piBashExecution({ command: 'npm test', output: '283 passed', exitCode: 0 }),
		));

		const bash = session.turns
			.flatMap(t => t.contentBlocks)
			.find(b => b.type === 'bash_command') as BashCommandBlock;
		expect(bash).toMatchObject({ command: 'npm test', stdout: '283 passed', exitCode: 0 });
	});

	it('preserves a non-zero exit status', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piBashExecution({ command: 'false', exitCode: 1 }),
		));

		const bash = session.turns
			.flatMap(t => t.contentBlocks)
			.find(b => b.type === 'bash_command') as BashCommandBlock;
		expect(bash.exitCode).toBe(1);
	});

	it('surfaces an assistant error message on the turn', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([], { errorMessage: 'provider refused' }),
		));

		const assistant = session.turns.find(t => t.role === 'assistant');
		expect(assistant?.isApiError).toBe(true);
		expect(assistant?.contentBlocks[0]).toMatchObject({ type: 'text', text: 'provider refused' });
	});

	it('numbers turns consecutively from zero', () => {
		const session = parse(jsonl(
			piSession(), piUser('one'),
			piAssistant([piText('a')]),
			piUser('two'),
			piAssistant([piText('b')]),
		));
		expect(session.turns.map(t => t.index)).toEqual([0, 1, 2, 3]);
		expect(session.metadata.totalTurns).toBe(4);
	});
});

describe('PiParser statistics and cost', () => {
	const usage = {
		input: 1000, output: 200, cacheRead: 5000, cacheWrite: 50,
		reasoning: 80, totalTokens: 6250, cost: { total: 0.0425 },
	};

	it('uses the cost the transcript recorded, verbatim', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piText('done')], { usage }),
		));

		expect(session.stats.costUSD).toBeCloseTo(0.0425, 10);
		expect(session.stats.costSource).toBe('recorded');
	});

	// The price table is Anthropic-keyed and getPricing() falls back to Sonnet for any
	// unrecognised model, so applying it to a pi model would invent a figure.
	it('does not price a non-Anthropic model from the built-in table', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piText('done')], { model: 'deepseek-v4-pro', usage }),
		));

		// Sonnet rates on this usage would be ~0.0054, not the recorded 0.0425.
		expect(session.stats.costUSD).toBeCloseTo(0.0425, 10);
	});

	it('maps pi usage onto the token counters', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piText('done')], { usage }),
		));

		expect(session.stats).toMatchObject({
			inputTokens: 1000,
			outputTokens: 200,
			cacheReadTokens: 5000,
			cacheCreationTokens: 50,
			totalTokens: 6250,
		});
	});

	it('reports an unknown cost rather than zero-as-fact when none was recorded', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piText('done')], { usage: { input: 10, output: 5 } }),
		));

		expect(session.stats.costSource).toBe('unknown');
		expect(session.stats.costUSD).toBe(0);
	});

	it('sums usage across assistant records without double-counting a repeat', () => {
		const first = piAssistant([piText('a')], { id: 'rec-1', usage: { input: 100, output: 10, cost: { total: 0.01 } } });
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			first,
			first, // same record id — must not count twice
			piAssistant([piText('b')], { id: 'rec-2', usage: { input: 100, output: 10, cost: { total: 0.01 } } }),
		));

		expect(session.stats.inputTokens).toBe(200);
		expect(session.stats.costUSD).toBeCloseTo(0.02, 10);
	});

	it('counts tool invocations by name', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([piToolCall('read', 'c1', {}), piToolCall('read', 'c2', {}), piToolCall('bash', 'c3', {})]),
		));
		expect(session.stats.toolUseCounts).toEqual({ read: 2, bash: 1 });
	});

	it('reports no compaction, which pi has no concept of', () => {
		const session = parse(jsonl(piSession(), piUser('hi')));
		expect(session.stats).toMatchObject({ compactionCount: 0, peakContextTokens: 0, cumulativeDroppedTokens: 0 });
	});
});

describe('PiParser unknown and skipped records', () => {
	it('skips metadata records without warning about them', () => {
		const session = parse(jsonl(
			piSession(), piModelChange(), piThinkingLevelChange(), piUser('hi'),
		));

		expect(session.warnings).toBeUndefined();
		expect(session.turns).toHaveLength(1);
	});

	it('warns about an unknown record type but keeps the turns', () => {
		const session = parse(jsonl(
			piSession(),
			{ type: 'brand_new_record', id: 'x', timestamp: '2026-08-05T18:50:23.000Z' },
			piUser('hi'),
		));

		expect(session.turns).toHaveLength(1);
		expect(session.warnings).toEqual([
			expect.objectContaining({ type: 'unknown_record_type', count: 1 }),
		]);
	});

	it('warns about an unknown content block but keeps the others', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			piAssistant([{ type: 'hologram', payload: 1 }, piText('still here')]),
		));

		const assistant = session.turns.find(t => t.role === 'assistant');
		expect(assistant?.contentBlocks.map(b => b.type)).toEqual(['text']);
		expect(session.warnings).toEqual([
			expect.objectContaining({ type: 'unknown_block_type', count: 1 }),
		]);
	});

	it('warns about an unknown message role but keeps the turns', () => {
		const session = parse(jsonl(
			piSession(), piUser('hi'),
			{ type: 'message', id: 'm1', parentId: null, timestamp: '2026-08-05T18:50:24.000Z', message: { role: 'oracle', content: [] } },
		));

		expect(session.turns).toHaveLength(1);
		expect(session.warnings?.[0].type).toBe('unknown_record_type');
	});

	it('survives a malformed line', () => {
		const session = parse([JSON.stringify(piSession()), '{not json', JSON.stringify(piUser('hi'))].join('\n'));

		expect(session.turns).toHaveLength(1);
		expect(session.warnings).toEqual([
			expect.objectContaining({ type: 'parse_errors', count: 1 }),
		]);
	});
});

describe('Claude parsing is unaffected by pi support', () => {
	it('still labels a Claude session as claude with a computed cost', () => {
		const session = new ClaudeParser().parse(jsonl(
			userText('hi'),
			assistantText('hello', { usage: { input_tokens: 1000, output_tokens: 100 } }),
		), '/claude/x.jsonl');

		expect(session.metadata.format).toBe('claude');
		expect(session.stats.costSource).toBe('computed');
		expect(session.stats.costUSD).toBeGreaterThan(0);
	});
});

describe('PiParser session name', () => {
	// pi's name is user-set, the same provenance as Claude Code's /rename, so it lands
	// on customTitle and wins over anything auto-generated.
	it('reads the session name from a session_info entry', () => {
		const session = parse(jsonl(
			piSession(), piSessionInfo('Refactor the timeout guard'), piUser('hi'),
		));
		expect(session.metadata.customTitle).toBe('Refactor the timeout guard');
	});

	it('keeps the last name when it is set more than once', () => {
		const session = parse(jsonl(
			piSession(),
			piSessionInfo('first'),
			piUser('hi'),
			piSessionInfo('second'),
			piUser('more'),
			piSessionInfo('final'),
		));
		expect(session.metadata.customTitle).toBe('final');
	});

	// pi resolves a name as `name?.trim() || undefined`, so a blank entry clears it.
	it('treats a blank name as an explicit clear', () => {
		const session = parse(jsonl(
			piSession(), piSessionInfo('was named'), piUser('hi'), piSessionInfo('   '),
		));
		expect(session.metadata.customTitle).toBeUndefined();
	});

	it('trims surrounding whitespace', () => {
		const session = parse(jsonl(piSession(), piSessionInfo('  padded  '), piUser('hi')));
		expect(session.metadata.customTitle).toBe('padded');
	});

	it('leaves customTitle undefined when no name was ever set', () => {
		const session = parse(jsonl(piSession(), piUser('hi')));
		expect(session.metadata.customTitle).toBeUndefined();
	});

	it('does not warn about session_info as an unknown record type', () => {
		const session = parse(jsonl(piSession(), piSessionInfo('named'), piUser('hi')));
		expect(session.warnings).toBeUndefined();
	});

	// The display name resolver needs no pi-specific branch: a named pi session shows
	// its name, an unnamed one falls back to the project.
	it('feeds the shared display-name resolution', () => {
		const named = parse(jsonl(piSession({ cwd: '/x/lab/ankihub' }), piSessionInfo('Fix the parser'), piUser('hi')));
		const unnamed = parse(jsonl(piSession({ cwd: '/x/lab/ankihub' }), piUser('hi')));
		expect(sessionDisplayName(named.metadata)).toBe('Fix the parser');
		expect(sessionDisplayName(unnamed.metadata)).toBe('ankihub');
	});
});
