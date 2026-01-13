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

    // Wait for view to load
    await browser.waitUntil(
      async () => {
        return await this.findAndSwitchToPochiFrame();
      },
      {
        timeout: 1000 * 10,
        timeoutMsg:
          "Could not find Pochi webview iframe containing .ProseMirror",
      },
    );
  }

  async close() {
    await browser.switchToFrame(null);
  }

  private async findAndSwitchToPochiFrame(): Promise<boolean> {
    // Ensure we start from top
    await browser.switchToFrame(null);

    // Try to find the iframe directly first (common case)
    const iframes = await browser.$$("iframe");

    for (const iframe of iframes) {
      try {
        await browser.switchToFrame(iframe);
        if (await $(".ProseMirror").isExisting()) {
          return true;
        }

        // Check nested iframes (one level deep)
        const nestedIframes = await browser.$$("iframe");
        for (const nested of nestedIframes) {
          await browser.switchToFrame(nested);
          if (await $(".ProseMirror").isExisting()) {
            return true;
          }
          await browser.switchToParentFrame();
        }

        await browser.switchToParentFrame();
      } catch (e) {
        // Ignore errors when switching/checking frames
        try {
          await browser.switchToFrame(null);
        } catch {}
      }
    }

    return false;
  }

  async sendMessage(text: string) {
    await this.input.waitForDisplayed({ timeout: 1000 * 10 });
    await this.input.click();
    await browser.keys(text);
    await browser.keys(["Enter"]);
  }
}
