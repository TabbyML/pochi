import { browser, expect } from "@wdio/globals";
import { PochiSidebar } from "../../pageobjects/pochi-sidebar";

describe("Model Restriction Tests", () => {

  it("should disable super models for freebie user", async () => {
    const pochi = new PochiSidebar();
    await pochi.open();
    
    // Open model selector
    await pochi.modelSelect.waitForDisplayed({ timeout: 1000 * 10 });
    await browser.waitUntil(
      async () => {
        if (await pochi.modelSelectMenu.isDisplayed()) {
          return true;
        }
        await pochi.modelSelect.click();
        try {
          await pochi.modelSelectMenu.waitForDisplayed({ timeout: 1000 });
          return true;
        } catch (e) {
          return false;
        }
      },
      {
        timeout: 1000 * 10,
        timeoutMsg: "Could not open model selector",
      },
    );

    // Verify the menu is visible
    const menu = pochi.modelSelectMenu;
    await expect(menu).toBeDisplayed();

    // Verify we have some items in the menu
    // The dropdown items usually have role="menuitemradio" in the shadcn/ui dropdown
    const firstItem = menu.$("[role=menuitemradio]");
    await firstItem.waitForExist({
      timeout: 1000 * 10 * 2,
      timeoutMsg: "No models found in the dropdown",
    });

    // Verify Super models are disabled for freebie user
    // 1. Find the "Super" group header
    const groupHeaders = await menu.$$('[aria-label="model-group-title"]');
    let superHeader: WebdriverIO.Element | undefined;


    for (const header of groupHeaders) {
      const text = await header.getText();
      if (text.startsWith("Super")) {
        superHeader = header;
        break;
      }
    }

    if (superHeader) {
      // The header is inside the group container <div><div>Title</div>...items</div>
      // So the parent of the header is the group container
      const superGroupContainer = await superHeader.$("..");
      const superItems = (await superGroupContainer.$$(
        "[role=menuitemradio]",
      )) as unknown as WebdriverIO.ElementArray;

      if (superItems.length > 0) {
        for (const item of superItems) {
          const isEnabled = await item.isEnabled();

          const ariaDisabled = await item.getAttribute("aria-disabled");
          const dataDisabled = await item.getAttribute("data-disabled");
          const isDisabled =
            !isEnabled || ariaDisabled === "true" || dataDisabled !== null;
          expect(isDisabled).toBe(true);
        }
      }
    }

    await pochi.close();
  });
});