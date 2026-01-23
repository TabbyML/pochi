import type { TabCompletionNESProviderSettings } from "@/integrations/configuration";
import { getVendor } from "@getpochi/common/vendor";
import type { PochiCredentials } from "@getpochi/common/vscode-webui-bridge";
import { OpenAIFetcher } from "../fetchers";
import type { TabCompletionProviderClient } from "../types";
import { NESChatModelClient } from "./chat-model-client";
import { createGoogleVertexTuningModel } from "./models/google-vertex-tuning";
import { createPochiModel } from "./models/pochi";
import { NESSweepModelClient } from "./sweep-model-client";

export function createNESProviderClient(
  id: string,
  config: TabCompletionNESProviderSettings,
): TabCompletionProviderClient<object, object> | undefined {
  if (config.type === "NES:openai") {
    if (config.model.startsWith("sweep-next-edit")) {
      const fetcher = new OpenAIFetcher({
        baseURL: config.baseURL,
        authToken: config.apiKey,
        model: config.model,
      });
      return new NESSweepModelClient(id, fetcher);
    }
  }

  if (config.type === "NES:google-vertex-tuning") {
    const model = createGoogleVertexTuningModel(config);
    if (!model) {
      return undefined;
    }
    return new NESChatModelClient(id, model);
  }

  if (config.type === "NES:pochi") {
    if (config.model === "sweep-next-edit") {
      const fetcher = new OpenAIFetcher({
        baseURL:
          "https://api-gateway.getpochi.com/https/tabbyml--vllm-gguf-ngram-server-serve.modal.run/v1",
        authToken: getPochiJwt,
        model: "sweep-next-edit-1.5b",
      });
      return new NESSweepModelClient(id, fetcher);
    }

    const model = createPochiModel();
    return new NESChatModelClient(id, model);
  }

  return undefined;
}

async function getPochiJwt() {
  const pochiVendor = getVendor("pochi");
  const { jwt } = (await pochiVendor.getCredentials()) as PochiCredentials;
  return jwt || undefined;
}
