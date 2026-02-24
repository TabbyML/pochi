import { $, browser } from "@wdio/globals";

export class PochiPanel {
  async findAndSwitchToPanelFrame(): Promise<boolean> {
    // Ensure we start from top
    await browser.switchFrame(null);

    // Search all iframes on the page (similar to sidebar approach)
    const iframes = await browser.$$("iframe");
    console.log(`[Test Debug] Found ${iframes.length} iframes to search`);

    for (const iframe of iframes) {
      try {
        await browser.switchFrame(iframe);
        const hasProseMirror = await $(".ProseMirror").isExisting();
        const hasSidebarSelect = await $(".sidebar-model-select").isExisting();
        console.log(
          `[Test Debug] Iframe check: ProseMirror=${hasProseMirror}, sidebarSelect=${hasSidebarSelect}`,
        );

        if (hasProseMirror && !hasSidebarSelect) {
          // This is the panel frame (has ProseMirror but no sidebar-model-select)
          return true;
        }

        // Check nested iframes (one level deep)
        const nestedIframes = await browser.$$("iframe");
        for (const nested of nestedIframes) {
          await browser.switchFrame(nested);
          const nestedHasProseMirror = await $(".ProseMirror").isExisting();
          const nestedHasSidebarSelect = await $(
            ".sidebar-model-select",
          ).isExisting();
          console.log(
            `[Test Debug] Nested iframe check: ProseMirror=${nestedHasProseMirror}, sidebarSelect=${nestedHasSidebarSelect}`,
          );

          if (nestedHasProseMirror && !nestedHasSidebarSelect) {
            return true;
          }
          await browser.switchToParentFrame();
        }

        await browser.switchToParentFrame();
      } catch (e) {
        // Ignore errors when switching/checking frames
        console.log(`[Test Debug] Error checking iframe: ${e}`);
        try {
          await browser.switchFrame(null);
        } catch {}
      }
    }

    // Reset to top frame before returning false
    await browser.switchFrame(null);
    return false;
  }

  /**
   * Wait for at least one assistant message to appear.
   * This indicates the request was successful.
   */
  async waitForAssistantMessage(timeout = 60000) {
    const assistantMessage = $('[aria-label="chat-message-assistant"]');
    await assistantMessage.waitForExist({
      timeout,
      timeoutMsg: "Assistant message did not appear",
    });
  }

  /**
   * Switch back to the main frame (top level).
   * Call this after interacting with the panel to ensure clean state.
   */
  async close() {
    await browser.switchFrame(null);
  }
}
