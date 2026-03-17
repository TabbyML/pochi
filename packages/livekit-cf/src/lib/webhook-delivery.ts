import type { FollowupQuestion, Task } from "@getpochi/livekit";
import type { WebhookEventPayload } from "@getpochi/vendor-pochi/edge";

export class WebhookDelivery {
  constructor(
    private readonly storeId: string,
    private readonly url: string,
    private readonly secret: string,
  ) {}

  async onTaskUpdated(
    task: Task,
    result?: {
      completion?: string;
      followups?: FollowupQuestion[];
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
        Authorization: `Bearer ${this.secret}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) {
      throw new Error(`Failed to deliver webhook: ${response.statusText}`);
    }
  }
}
