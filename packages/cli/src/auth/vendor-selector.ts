import { getVendors } from "@getpochi/common/vendor";
import select from "@inquirer/select";
import chalk from "chalk";

export interface VendorChoice {
  name: string;
  value: string;
  description?: string;
}

export async function selectVendor(): Promise<string> {
  const vendors = getVendors();
  const vendorEntries = Object.entries(vendors);

  if (vendorEntries.length === 0) {
    throw new Error("No vendors are available");
  }

  // If only one vendor is available, use it directly
  if (vendorEntries.length === 1) {
    const [vendorId] = vendorEntries[0];
    console.log(chalk.gray(`Using ${vendorId} (only available vendor)`));
    return vendorId;
  }

  const choices: VendorChoice[] = await Promise.all(
    vendorEntries.map(async ([vendorId, vendor]) => {
      let description = "";

      if (vendor.authenticated) {
        try {
          const userInfo = await vendor.getUserInfo();
          const name = userInfo?.name || "Unknown User";
          const email = userInfo?.email || "";
          description = email ? `${chalk.bold(name)} (${email})` : chalk.bold(name);
        } catch {
          description = chalk.bold("Unknown User");
        }
      } else {
        description = "Not logged in";
      }
      return {
        name: `${vendorId} ${chalk.white("-")} ${vendor.authenticated ? chalk.green(description) : chalk.gray(description)}`,
        value: vendorId,
        description: `\n${chalk.gray("Current selection:")} ${chalk.gray(description)}`,
      };
    }),
  );

  const answer = await select({
    message: "Select a vendor to authenticate with:",
    instructions: {
      navigation: "Use arrow keys to navigate, enter to select",
      pager: "Press space to load more",
    },
    theme: {
      helpMode: "always",
      style: {
        help: (text: string) => chalk.gray(text),
        message: (text: string) => chalk.bold(text),
      },
    },
    choices,
  });

  return answer;
}

export async function confirmVendorSelection(
  vendorId: string,
): Promise<boolean> {
  const vendors = getVendors();
  const vendor = vendors[vendorId];

  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found`);
  }

  if (vendor.authenticated) {
    try {
      const userInfo = await vendor.getUserInfo();
      const name = userInfo?.name || "Unknown User";
      const email = userInfo?.email || "";
      const userDisplay = email ? `${chalk.bold(name)} (${email})` : chalk.bold(name);
      const confirm = await select({
        message: `You're already logged in to ${vendorId} as ${chalk.green(userDisplay)}. Do you want to re-authenticate?`,
        choices: [
          { name: "No, use existing authentication", value: false },
          { name: "Yes, re-authenticate", value: true },
        ],
      });
      return confirm;
    } catch {
      return true;
    }
  }

  return true;
}
