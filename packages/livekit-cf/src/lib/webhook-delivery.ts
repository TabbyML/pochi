import type { Task } from "@getpochi/livekit";

export class WebhookDelivery {
  constructor(
    private readonly storeId: string,
    private readonly url: string,
  ) {}

  async onTaskUpdated(task: Task) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "task.updated",
        data: {
          storeId: this.storeId,
          task,
        },
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) {
      throw new Error(`Failed to deliver webhook: ${response.statusText}`);
    }
  }
}
