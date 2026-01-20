import { $, browser } from "@wdio/globals";

export class PochiSidebar {
  get input() {
    return $(".ProseMirror");
  }

  get modelSelect() {
    return $('[aria-label="model-select"]');
  }

  get modelSelectMenu() {
    return $('[aria-label="model-select-menu"]');
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
    await browser.switchFrame(null);
  }

  private async findAndSwitchToPochiFrame(): Promise<boolean> {
    // Ensure we start from top
    await browser.switchFrame(null);

    // Try to find the iframe directly first (common case)
    const iframes = await browser.$$("iframe");

    for (const iframe of iframes) {
      try {
        await browser.switchFrame(iframe);
        if (await $(".ProseMirror").isExisting()) {
          return true;
        }

        // Check nested iframes (one level deep)
        const nestedIframes = await browser.$$("iframe");
        for (const nested of nestedIframes) {
          await browser.switchFrame(nested);
          if (await $(".ProseMirror").isExisting()) {
            return true;
          }
          await browser.switchToParentFrame();
        }

        await browser.switchToParentFrame();
      } catch (e) {
        // Ignore errors when switching/checking frames
        try {
          await browser.switchFrame(null);
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
