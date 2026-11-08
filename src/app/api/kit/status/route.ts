import { appConfig } from "@/app.config";
import { getBudget, isAiLive } from "@/lib/ai";
import { AI_MODELS, modelLabel } from "@/lib/ai/config";
import { DEFAULT_POLICY } from "@/lib/agent/policy";
import { getEnv } from "@/lib/env";
import { route } from "@/lib/http";
import { getBrowserClientId } from "@/lib/paypal";
import { kickExampleJob } from "@/lib/say/example-job";
import { kickTradeHistory } from "@/lib/say/paypal-history";
import { isSpeechLive, SPEECH_MODEL_LABEL } from "@/lib/say/speech";

/** Public runtime status for the UI: modes, models, AI spend. Never includes secrets. */
export const GET = route(async () => {
  const env = getEnv();
  // The host's health check calls this as soon as the server is up, so the sample job is made on boot.
  // (Not from instrumentation.ts: that's a separate bundle, and a PayPal client made there isn't the app's.)
  kickExampleJob();
  kickTradeHistory();
  return {
    app: { name: appConfig.name, slug: appConfig.slug },
    paypal: { mode: env.paypalMode, clientId: getBrowserClientId() ?? null, buyerEmail: env.sandboxBuyerEmail, webhookConfigured: Boolean(env.paypalWebhookId), testCard: env.paypalMode === "sandbox" && env.demoTestCard },
    ai: { mode: isAiLive() ? "live" : "mock", models: { default: modelLabel(AI_MODELS.default), smart: modelLabel(AI_MODELS.smart) }, budget: getBudget().status() },
    speech: { mode: isSpeechLive() ? "live" : "mock", model: SPEECH_MODEL_LABEL },
    policy: { ...DEFAULT_POLICY, ...appConfig.agentPolicy },
  };
});
