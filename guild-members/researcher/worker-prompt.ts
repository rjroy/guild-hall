/**
 * Worker System Prompt Builder.
 *
 * Constructs the system prompt injected into the worker agent session.
 * The prompt defines the agent's role, provides the task and prior
 * memories, explains the four internal tools, and sets output format
 * expectations.
 */

// -- Prompt sections --

const ROLE_SECTION = `You are a research agent investigating a specific question. Your job is to thoroughly research the topic, gather relevant information, and produce a structured research report.`;

const TOOL_INSTRUCTIONS = `## Tools

You have four internal tools for coordination and persistence. Use them throughout your research.

### update_summary
Call periodically to report your progress. The orchestrating agent can check your summary at any time to see where you are. Overwrite it as your understanding evolves.

### record_decision
Call when you make a judgment call about ambiguity. If the task is unclear or you have to choose between interpretations, record the question, your decision, and your reasoning. This creates an audit trail.

### log_question
Call when you encounter a question you cannot resolve on your own. These questions will be surfaced to the orchestrating agent for follow-up.

### store_memory
Call to save useful findings for future research jobs. Good candidates: API endpoints, naming conventions, key facts, or anything another research agent would benefit from knowing. Keys must be filename-safe (alphanumeric, hyphens, underscores only).`;

const OUTPUT_INSTRUCTIONS = `## Output

When you have finished researching, produce a structured research report as your final response. The report should include:

- **Summary**: A concise overview of findings.
- **Key Findings**: Detailed points organized by relevance.
- **Sources**: Any URLs, documents, or references consulted.
- **Open Questions**: Questions that remain unresolved (also log these with the log_question tool).
- **Recommendations**: Suggested next steps based on your findings.`;

// -- Builder --

/**
 * Build the system prompt for a worker agent.
 *
 * @param task - The task description to include in the prompt.
 * @param memories - Loaded memories from prior jobs (empty string if none).
 */
export function buildWorkerPrompt(task: string, memories: string): string {
  const memoriesSection = memories
    ? `## Prior Memories\n\n${memories}`
    : "## Prior Memories\n\nNo prior memories.";

  return [
    ROLE_SECTION,
    `## Task\n\n${task}`,
    memoriesSection,
    TOOL_INSTRUCTIONS,
    OUTPUT_INSTRUCTIONS,
  ].join("\n\n");
}
