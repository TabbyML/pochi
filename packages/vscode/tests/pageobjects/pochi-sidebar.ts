import { $, browser } from "@wdio/globals";

export class PochiSidebar {
  get input() {
    return $(".ProseMirror");
  }

  async open() {
    const workbench = await browser.getWorkbench();
    const activityBar = workbench.getActivityBar();
    const pochiView = await activityBar.getViewControl("Pochi");
    await pochiView?.openView();

    console.log("[Test Debug] Pochi sidebar opened, waiting for webview iframe...");

    // Wait for view to load
    await browser.waitUntil(
      async () => {
        const found = await this.findAndSwitchToPochiFrame();
        if (!found) {
          console.log("[Test Debug] Webview iframe not found yet, retrying...");
        }
        return found;
      },
      {
        timeout: 1000 * 30,
        timeoutMsg:
          "Could not find Pochi webview iframe containing .ProseMirror",
      },
    );

    console.log("[Test Debug] Successfully found Pochi webview iframe");
  }

  async close() {
    await browser.switchToFrame(null);
  }

  private async findAndSwitchToPochiFrame(): Promise<boolean> {
    // Ensure we start from top
    await browser.switchToFrame(null);

    // Try to find the iframe directly first (common case)
    const iframes = await browser.$$("iframe");
    console.log(`[Test Debug] Found ${iframes.length} iframe(s) at root level`);

    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i];
      try {
        console.log(`[Test Debug] Checking iframe ${i + 1}/${iframes.length}`);
        await browser.switchToFrame(iframe);
        // Wait a bit for content to load
        await browser.pause(100);

        const proseMirrorExists = await $(".ProseMirror").isExisting();
        console.log(`[Test Debug] .ProseMirror exists in iframe ${i + 1}: ${proseMirrorExists}`);

        if (proseMirrorExists) {
          return true;
        }

        // Check nested iframes recursively
        console.log(`[Test Debug] Checking nested iframes in iframe ${i + 1}`);
        if (await this.findProseMirrorInNestedFrames(2)) {
          return true;
        }

        await browser.switchToParentFrame();
      } catch (e) {
        console.log(`[Test Debug] Error checking iframe ${i + 1}: ${e}`);
        // Ignore errors when switching/checking frames
        try {
          await browser.switchToFrame(null);
        } catch {}
      }
    }

    console.log("[Test Debug] No iframe containing .ProseMirror found");
    return false;
  }

  private async findProseMirrorInNestedFrames(maxDepth: number, currentDepth = 0): Promise<boolean> {
    if (currentDepth >= maxDepth) {
      return false;
    }

    const nestedIframes = await browser.$$("iframe");
    for (const nested of nestedIframes) {
      try {
        await browser.switchToFrame(nested);
        await browser.pause(100);
        if (await $(".ProseMirror").isExisting()) {
          return true;
        }

        // Recurse deeper
        if (await this.findProseMirrorInNestedFrames(maxDepth, currentDepth + 1)) {
          return true;
        }

        await browser.switchToParentFrame();
      } catch (e) {
        // Ignore errors
        try {
          await browser.switchToParentFrame();
        } catch {}
      }
    }

    return false;
  }

  async sendMessage(text: string) {
    await this.input.waitForDisplayed({ timeout: 1000 * 30 });
    await this.input.click();
    await browser.keys(text);
    await browser.keys(["Enter"]);
  }
}
