/**
 * APP-OWNED: the agents this app exposes at POST /api/agent/runs { agentId }. The invoice send isn't
 * one: it runs behind the Guard from src/lib/say/send.ts.
 */
import type { AgentDefinition } from "@/lib/agent/define";
import { reminderAgent } from "./reminder";

export const AGENTS: Record<string, AgentDefinition> = { [reminderAgent.id]: reminderAgent };
