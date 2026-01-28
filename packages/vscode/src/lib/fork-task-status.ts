import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";

@injectable()
@singleton()
export class ForkTaskStatus {
  readonly status = signal<Record<string, "inProgress" | "ready">>({});

  setStatus(uid: string, status: "inProgress" | "ready") {
    this.status.value = {
      ...this.status.value,
      [uid]: status,
    };
  }
}
