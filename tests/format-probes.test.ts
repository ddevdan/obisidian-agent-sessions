import { describe, it, expect } from 'vitest';
import {
	lineHead, HEAD_CHARS, isConversationRecord, sessionIdFromRecord, isUserPromptLine,
	formatFromRecord,
} from '../src/parsers/format-probes';
import {
	piSession, piUser, piAssistant, piText, piToolResult, piModelChange,
	assistantText, userText, fileHistorySnapshot,
} from './fixtures';

const head = (record: Record<string, unknown>) => lineHead(JSON.stringify(record));

describe('lineHead', () => {
	it('passes a short line through whole', () => {
		expect(lineHead('{"a":1}')).toBe('{"a":1}');
	});

	it('truncates a long line to the head budget', () => {
		expect(lineHead('x'.repeat(HEAD_CHARS + 50))).toHaveLength(HEAD_CHARS);
	});
});

describe('isConversationRecord', () => {
	// The bug this exists to prevent: a Claude-shaped check judged every pi session
	// empty, so none of them were ever listed.
	it('accepts a pi user message', () => {
		expect(isConversationRecord(piUser('hi'))).toBe(true);
	});

	it('accepts a pi assistant message', () => {
		expect(isConversationRecord(piAssistant([piText('hello')]))).toBe(true);
	});

	it('accepts a Claude user record', () => {
		expect(isConversationRecord(userText('hi'))).toBe(true);
	});

	it('accepts a Claude assistant record', () => {
		expect(isConversationRecord(assistantText('hello'))).toBe(true);
	});

	it('rejects a pi session header', () => {
		expect(isConversationRecord(piSession())).toBe(false);
	});

	it('rejects a pi metadata record', () => {
		expect(isConversationRecord(piModelChange())).toBe(false);
	});

	// A tool result is machine output, not an exchange, so it alone should not make a
	// transcript count as a conversation.
	it('rejects a pi tool result', () => {
		expect(isConversationRecord(piToolResult({ toolCallId: 'c1' }))).toBe(false);
	});

	it('rejects a Claude metadata record', () => {
		expect(isConversationRecord(fileHistorySnapshot())).toBe(false);
	});

	it('rejects an unrelated object', () => {
		expect(isConversationRecord({ hello: 'world' })).toBe(false);
	});
});

describe('sessionIdFromRecord', () => {
	it('reads a pi session id from the session record', () => {
		expect(sessionIdFromRecord(piSession({ id: 'sess-9' }))).toBe('sess-9');
	});

	// A pi message also has a top-level `id`, but it identifies the message.
	it('does not mistake a pi message id for the session id', () => {
		expect(sessionIdFromRecord(piUser('hi'))).toBeUndefined();
	});

	it('reads a Claude session id', () => {
		expect(sessionIdFromRecord({ type: 'user', sessionId: 'claude-1' })).toBe('claude-1');
	});

	it('returns undefined when no id is present', () => {
		expect(sessionIdFromRecord({ type: 'user' })).toBeUndefined();
	});
});

describe('isUserPromptLine', () => {
	it('accepts a pi user line', () => {
		expect(isUserPromptLine(head(piUser('hi')))).toBe(true);
	});

	it('rejects a pi assistant line', () => {
		expect(isUserPromptLine(head(piAssistant([piText('hello')])))).toBe(false);
	});

	it('rejects a pi tool result line', () => {
		expect(isUserPromptLine(head(piToolResult({ toolCallId: 'c1' })))).toBe(false);
	});

	it('accepts a Claude user line', () => {
		expect(isUserPromptLine(head(userText('hi')))).toBe(true);
	});

	// pi's test is anchored to the line prefix because the literal `"type":"message"`
	// also appears early in Claude assistant records.
	it('does not treat a nested type:message as a pi record', () => {
		const nested = '{"parentUuid":null,"type":"assistant","message":{"type":"message","role":"assistant"}}';
		expect(isUserPromptLine(lineHead(nested))).toBe(false);
	});
});

describe('formatFromRecord', () => {
	// The session list labels each entry from this, without running a parser. It was
	// previously hard-coded to 'claude', which left pi sessions present in the list but
	// indistinguishable from Claude ones — they looked missing.
	it('labels a pi conversation record as pi', () => {
		expect(formatFromRecord(piUser('hi'))).toBe('pi');
		expect(formatFromRecord(piAssistant([piText('hello')]))).toBe('pi');
	});

	it('labels a Claude conversation record as claude', () => {
		expect(formatFromRecord(userText('hi'))).toBe('claude');
		expect(formatFromRecord(assistantText('hello'))).toBe('claude');
	});

	it('returns undefined for a record no format claims', () => {
		expect(formatFromRecord(piSession())).toBeUndefined();
		expect(formatFromRecord(fileHistorySnapshot())).toBeUndefined();
		expect(formatFromRecord({ hello: 'world' })).toBeUndefined();
	});

	it('agrees with isConversationRecord', () => {
		for (const record of [piUser('a'), userText('b'), piSession(), { x: 1 }]) {
			expect(formatFromRecord(record) !== undefined).toBe(isConversationRecord(record));
		}
	});
});
