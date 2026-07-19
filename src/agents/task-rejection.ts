export const TASK_REJECTION_INSTRUCTION = `<TaskRejection>
If the assignment is outside your role, permissions, or available context, reject it instead of attempting partial work. Respond exactly:
<task_rejection>
<reason>brief explanation for the orchestrator</reason>
<recommended_agent>@agent-name when clear, otherwise omit this tag</recommended_agent>
</task_rejection>
</TaskRejection>`;

export function appendTaskRejectionInstruction(prompt: string): string {
  return `${prompt}\n\n${TASK_REJECTION_INSTRUCTION}`;
}
