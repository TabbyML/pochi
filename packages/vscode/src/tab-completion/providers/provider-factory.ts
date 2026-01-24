import type {
  TabCompletionFIMProviderSettings,
  TabCompletionNESProviderSettings,
} from "@/integrations/configuration";
import { injectable, singleton } from "tsyringe";
import { createFIMProviderClient } from "./fim-clients";
import { createNESProviderClient } from "./nes-clients";
import { TabCompletionProvider } from "./provider";
import type { TabCompletionProviderClient } from "./types";

@injectable()
@singleton()
export class TabCompletionProviderFactory {
  private nextProviderId = 0;

  createProvider(
    config: TabCompletionNESProviderSettings | TabCompletionFIMProviderSettings,
  ): TabCompletionProvider | undefined {
    this.nextProviderId++;
    const shortId = Math.random().toString(36).substring(2, 8);
    const id = `${config.type}-${this.nextProviderId}-${shortId}`;

    let client: TabCompletionProviderClient<object, object> | undefined =
      undefined;

    if (config.type.startsWith("NES")) {
      client = createNESProviderClient(
        id,
        config as TabCompletionNESProviderSettings,
      );
    }

    if (config.type.startsWith("FIM")) {
      client = createFIMProviderClient(
        id,
        config as TabCompletionFIMProviderSettings,
      );
    }

    if (!client) {
      return undefined;
    }

    return new TabCompletionProvider(client);
  }
}
