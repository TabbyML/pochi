import { $, $$, browser } from "@wdio/globals";

export class PochiPanel {
  async findAndSwitchToPanelFrame(): Promise<boolean> {
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

  /**
   * Get user message containers.
   */
  async getUserMessages() {
    return $$('[data-testid="chat-message-user"]');
  }

  /**
   * Get assistant message containers.
   */
  async getAssistantMessages() {
    return $$('[data-testid="chat-message-assistant"]');
  }

  /**
   * Wait for at least one assistant message to appear.
   * This indicates the request was successful.
   */
  async waitForAssistantMessage(timeout = 60000) {
    const assistantMessage = $('[data-testid="chat-message-assistant"]');
    await assistantMessage.waitForExist({
      timeout,
      timeoutMsg: "Assistant message did not appear",
    });
  }
}
