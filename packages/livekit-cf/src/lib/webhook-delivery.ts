import type { Task } from "@getpochi/livekit";
import type { WebhookEventPayload } from "@getpochi/vendor-pochi/edge";

export class WebhookDelivery {
  constructor(
    private readonly storeId: string,
    private readonly url: string,
  ) {}

  async onTaskUpdated(
    task: Task,
    result?: {
      completion?: string;
      followup?: {
        question: string;
        choices?: string[];
      };
    },
  ) {
    const payload: WebhookEventPayload = {
      event: "task.updated",
      data: {
        storeId: this.storeId,
        task,
        result,
      },
    };

    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) {
      throw new Error(`Failed to deliver webhook: ${response.statusText}`);
    }
  }
}
