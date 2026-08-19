import { describe, it, expect } from 'vitest';
import { lastPromptedAt, sortByLastPrompt } from '../src/utils/session-order';

const MTIME = Date.parse('2026-08-19T19:36:00.000Z');

describe('lastPromptedAt', () => {
	it('uses the last prompt time when present', () => {
		expect(lastPromptedAt({ lastPromptTime: '2026-08-19T17:29:00.000Z', mtime: MTIME }))
			.toBe(Date.parse('2026-08-19T17:29:00.000Z'));
	});

	// A session with no user record at all still needs a position in the list.
	it('falls back to mtime when there is no prompt time', () => {
		expect(lastPromptedAt({ mtime: MTIME })).toBe(MTIME);
	});

	it('falls back to mtime when the timestamp is unparseable', () => {
		expect(lastPromptedAt({ lastPromptTime: 'not-a-date', mtime: MTIME })).toBe(MTIME);
	});

	it('falls back to mtime on an empty timestamp', () => {
		expect(lastPromptedAt({ lastPromptTime: '', mtime: MTIME })).toBe(MTIME);
	});
});

describe('sortByLastPrompt', () => {
	it('puts the most recently prompted session first', () => {
		const entries = [
			{ id: 'older', lastPromptTime: '2026-08-19T10:00:00.000Z', mtime: 0 },
			{ id: 'newest', lastPromptTime: '2026-08-19T18:00:00.000Z', mtime: 0 },
			{ id: 'middle', lastPromptTime: '2026-08-19T14:00:00.000Z', mtime: 0 },
		];
		expect(sortByLastPrompt(entries).map(e => e.id)).toEqual(['newest', 'middle', 'older']);
	});

	// The case the change exists for: a stale file that kept being written after the
	// last prompt must not outrank a session prompted more recently.
	it('ranks by prompt time even when mtime disagrees', () => {
		const entries = [
			{
				id: 'written-late',
				lastPromptTime: '2026-08-19T17:29:00.000Z',
				mtime: Date.parse('2026-08-19T19:36:00.000Z'),
			},
			{
				id: 'prompted-late',
				lastPromptTime: '2026-08-19T18:29:00.000Z',
				mtime: Date.parse('2026-08-19T18:30:00.000Z'),
			},
		];
		expect(sortByLastPrompt(entries).map(e => e.id)).toEqual(['prompted-late', 'written-late']);
	});

	it('interleaves sessions with and without a prompt time', () => {
		const entries = [
			{ id: 'no-prompt-old', mtime: Date.parse('2026-08-19T09:00:00.000Z') },
			{ id: 'prompted', lastPromptTime: '2026-08-19T12:00:00.000Z', mtime: 0 },
			{ id: 'no-prompt-new', mtime: Date.parse('2026-08-19T15:00:00.000Z') },
		];
		expect(sortByLastPrompt(entries).map(e => e.id))
			.toEqual(['no-prompt-new', 'prompted', 'no-prompt-old']);
	});

	it('handles an empty list', () => {
		expect(sortByLastPrompt([])).toEqual([]);
	});
});
