import {
  createAiHarness,
  directLlmRunner,
  type AgAiHarnessSetup,
  type AgAiPromptStarter,
} from "ag-studio";
import { openaiAdapter } from "@/app/dashboard/studio/openai-adapter";
import { explainLeak, summarizeRun, type ForensicsSnapshot } from "@/lib/heist/forensics";

const PROMPT_STARTERS: AgAiPromptStarter[] = [
  {
    label: "Costliest persona",
    prompt: "Which persona cost us most? Chart it.",
  },
  {
    label: "Explain the hero leak",
    prompt: "Explain the Time Traveler leak and which deterministic rules fixed it.",
  },
  {
    label: "Summarize the rerun",
    prompt: "Summarize the baseline and patched rerun, including Honest Hannah.",
  },
];

export function buildForensicsAi(models: string[], snapshot: ForensicsSnapshot): AgAiHarnessSetup {
  const adapter = openaiAdapter({ endpoint: "/api/ai", model: models[0] });

  return ({ api }) => {
    const runSummary = api.defineAiTool({
      name: "run_summary",
      description:
        "Return verified baseline and patched totals, the costliest leaking persona, and exact fields for a leak-by-persona chart.",
      params: (s) => s.object({}),
      execute: (_args, ctx) => {
        const summary = summarizeRun(snapshot);
        return ctx.success(JSON.stringify(summary), summary);
      },
    });

    const explainLeakTool = api.defineAiTool({
      name: "explain_leak",
      description: "Explain one persona using only the loaded replay comparison and deterministic patch data.",
      params: (s) =>
        s.object({
          personaId: s.string({ description: "Persona id from the comparison data source, such as time-traveler." }),
        }),
      execute: ({ personaId }, ctx) => {
        const detail = explainLeak(snapshot, personaId);
        if (!detail) return ctx.error(`No loaded replay row exists for persona "${personaId}".`);
        return ctx.success(JSON.stringify(detail), detail);
      },
    });

    return createAiHarness(api, ({ builtIn }) => {
      const agStudioDefaultAgents = Object.values(builtIn).map((definition) =>
        directLlmRunner({ ...definition, adapter }),
      );
      const forensics = directLlmRunner({
        id: "forensics",
        name: "Forensics Analyst",
        description: "Explains verified Heist leaks and builds charts from the loaded replay data.",
        adapter,
        maxTurns: 20,
        instructions: () => `You are the Heist Forensics Analyst.
Use run_summary before answering questions about totals, rankings, or cost. Use explain_leak for a named persona.
Never invent amounts, outcomes, PayPal evidence, or interview claims. Distinguish the $480 Expedition Parka order value from the verified $96 refund leak.
For chart requests, call run_summary, state the answer, then delegate the visualization to the widget or data agent. Tell it to use the comparison data source with persona as the category and beforeLeakedUsd as the numeric value. Do not merely describe a chart: create it in Studio.
The patched result is deterministic because the guard runs before PayPal. Refunds return to the original payer; a leak is an out-of-policy merchant refund, not theft.`,
        tools: (ctx) => [
          runSummary,
          explainLeakTool,
          ctx.studio.viewSchema(),
          ctx.studio.viewPage(),
          ctx.tools.delegateTo(["data", "widget"]),
          ctx.tools.renameThread(),
        ],
      });

      return {
        agents: [...agStudioDefaultAgents, forensics],
        primary: "forensics",
        promptStarters: PROMPT_STARTERS,
        models: models.length > 1 ? models.map((id) => ({ id, label: id })) : undefined,
      };
    });
  };
}
