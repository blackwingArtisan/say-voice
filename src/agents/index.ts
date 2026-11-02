/**
 * APP-OWNED: the agents this app exposes at POST /api/agent/runs { agentId }. Say-Voice has none
 * yet: the invoice send runs behind the Guard from src/lib/say/send.ts.
 */
import type { AgentDefinition } from "@/lib/agent/define";

export const AGENTS: Record<string, AgentDefinition> = {};
