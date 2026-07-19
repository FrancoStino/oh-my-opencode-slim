import { describe, expect, test } from 'bun:test';
import { buildOrchestratorPrompt } from './orchestrator';

describe('orchestrator prompt', () => {
  test('requires the question tool for blocking user input', () => {
    const prompt = buildOrchestratorPrompt();

    expect(prompt).toContain('use the `question` tool');
    expect(prompt).toContain('Enable custom input');
    expect(prompt).toContain('concise pasted response or command output');
    expect(prompt).toContain('small bounded set of options');
    expect(prompt).toContain('ordinary dialogue that does not block work');
  });

  test('treats specialist rejection reasons as routing input', () => {
    const prompt = buildOrchestratorPrompt();

    expect(prompt).toContain(
      "Treat a specialist's rejection reason as routing input",
    );
    expect(prompt).toContain('reroute or clarify');
    expect(prompt).not.toContain('task_rejection');
    expect(prompt).not.toContain('<reason>');
    expect(prompt).not.toMatch(/recommended[_ -]?agent/i);
    expect(prompt).toContain(
      'Never reissue an unchanged task to the same specialist',
    );
  });
});
