import type { Command } from "@commander-js/extra-typings";
import {
  type UserInfo,
  updateVendorConfig,
} from "@getpochi/common/configuration";
import { getVendors } from "@getpochi/common/vendor";
import select from "@inquirer/select";
import chalk from "chalk";
import { login } from "./login";
import { confirmVendorSelection, selectVendor } from "./vendor-selector";

export function registerAuthCommand(program: Command) {
  const vendors = getVendors();

  const authCommand = program
    .command("auth")
    .description("Manage authentication for different AI vendors.")
    .addHelpCommand(true);

  authCommand
    .command("status", { isDefault: true })
    .description("Check authentication status for all supported vendors.")
    .action(async () => {
      for (const [name, auth] of Object.entries(vendors)) {
        console.log(
          `${name}:`,
          auth.authenticated
            ? renderUser(await auth.getUserInfo())
            : chalk.gray("Not logged in"),
        );
      }
    });

  const loginCommand = authCommand
    .command("login")
    .description("Log in to a specific AI vendor.")
    .action(async () => {
      try {
        const selectedVendor = await selectVendor();
        const auth = vendors[selectedVendor as keyof typeof vendors];
        if (!auth) {
          return loginCommand.error(`Unknown vendor: ${selectedVendor}`);
        }

        const shouldProceed = await confirmVendorSelection(selectedVendor);
        if (!shouldProceed) {
          const user = await auth.getUserInfo();
          console.log("Using existing authentication for", renderUser(user));
          return;
        }

        const user = await login(selectedVendor);
        console.log("Logged in as", renderUser(user));
      } catch (err) {
        if (err instanceof Error) {
          if (
            err.name === "ExitPromptError" ||
            err.message.includes("force closed")
          ) {
            console.log("Login cancelled");
            return;
          }
          return loginCommand.error(err.message);
        }
        throw err;
      }
    });

  const logoutCommand = authCommand
    .command("logout")
    .description("Log out from a specific AI vendor or all vendors.")
    .option("-a, --all", "Log out from all authenticated vendors.")
    .action(async ({ all }) => {
      const logout = async (name: string) => {
        await updateVendorConfig(name, null);
        console.log(`Logged out from ${name}`);
      };

      if (all) {
        let loggedOutCount = 0;
        for (const [name, auth] of Object.entries(vendors)) {
          if (auth.authenticated) {
            await logout(name);
            loggedOutCount++;
          }
        }
        if (loggedOutCount === 0) {
          console.log(chalk.gray("No authenticated vendors found"));
        }
        return;
      }

      // Prompt for selection from authenticated vendors
      try {
        const authenticatedVendors = Object.entries(vendors).filter(
          ([, auth]) => auth.authenticated,
        );

        if (authenticatedVendors.length === 0) {
          console.log(chalk.gray("No authenticated vendors found"));
          return;
        }

        const choices = await Promise.all(
          authenticatedVendors.map(async ([vendorId, vendor]) => {
            try {
              const userInfo = await vendor.getUserInfo();
              const name = userInfo?.name || "Unknown User";
              const email = userInfo?.email || "";
              const userDisplay = email ? `${chalk.bold(name)} (${email})` : chalk.bold(name);
              return {
                name: `${vendorId} ${chalk.white("-")} ${chalk.green(userDisplay)}`,
                value: vendorId,
              };
            } catch {
              return {
                name: `${vendorId} ${chalk.white("-")} ${chalk.green("authenticated user")}`,
                value: vendorId,
              };
            }
          }),
        );

        const selectedVendor = await select({
          message: "Select a vendor to logout from:",
          choices,
        });

        await logout(selectedVendor);
      } catch (err) {
        if (err instanceof Error) {
          // Handle user cancellation (Ctrl+C)
          if (
            err.name === "ExitPromptError" ||
            err.message.includes("force closed")
          ) {
            console.log("Logout cancelled");
            return;
          }
          return logoutCommand.error(err.message);
        }
        throw err;
      }
    });
}

function renderUser(user: UserInfo | null) {
  if (!user) return chalk.gray("Not logged in");

  const name = user.name || "Unknown User";
  const email = user.email;

  // Only show email in parentheses if it exists and is not empty
  if (email && email.trim() !== "") {
    return `${chalk.bold(name)} (${email})`;
  }

  return chalk.bold(name);
}
