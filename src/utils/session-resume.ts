/**
 * The shell command that reopens a session in the agent that produced it.
 *
 * Format-aware because the two agents spell it differently, and offering a pi session
 * a `claude --resume` command hands the reader something that cannot work:
 *
 *   - Claude Code: `claude --resume <session-id>`
 *   - pi:          `pi --session <session-id>`  (`--resume` is an interactive picker,
 *                  `--session` takes a path or a full/partial UUID)
 */

import type { SessionFormat } from '../types';

export function resumeCommand(format: SessionFormat, sessionId: string): string {
	switch (format) {
		case 'pi':
			return `pi --session ${sessionId}`;
		case 'claude':
		default:
			return `claude --resume ${sessionId}`;
	}
}
