import type { Command } from "@commander-js/extra-typings";
import {
  type UserInfo,
  updateVendorConfig,
} from "@getpochi/common/configuration";
import { getVendors } from "@getpochi/common/vendor";
import chalk from "chalk";
import { login } from "./login";

export function registerAuthCommand(program: Command) {
  const vendors = getVendors();
  const vendorNames = Object.keys(vendors).join(", ");

  const authCommand = program
    .command("auth")
    .description("Manage auth for vendors");
  authCommand.command("status", { isDefault: true }).action(async () => {
    for (const [name, auth] of Object.entries(vendors)) {
      console.log(
        `${name}:`,
        auth.authenticated
          ? renderUser(await auth.getUserInfo())
          : chalk.gray("Not logged in"),
      );
    }
  });

  const loginCommand = authCommand.command("login");
  loginCommand
    .requiredOption(
      "-v, --vendor <vendor>",
      `Vendor to login to: ${vendorNames}`,
    )
    .action(async ({ vendor }) => {
      const auth = vendors[vendor as keyof typeof vendors];
      if (auth.authenticated) {
        const user = await auth.getUserInfo();
        console.log("You're already logged in as", renderUser(user));
        return;
      }

      try {
        const user = await login(vendor);
        console.log("Logged in as", renderUser(user));
      } catch (err) {
        if (err instanceof Error) {
          return loginCommand.error(err.message);
        }

        throw err;
      }
    });

  const logoutCommand = authCommand.command("logout");
  logoutCommand
    .option("-a, --all")
    .option("-v, --vendor <vendor>", `Vendor to logout from: ${vendors}`)
    .action(async ({ vendor, all }) => {
      const logout = async (name: string) => {
        await updateVendorConfig(name, null);
        console.log(`Logged out from ${name}`);
      };
      if (vendor) {
        const auth = vendors[vendor as keyof typeof vendors];
        if (auth.authenticated) {
          await logout(vendor);
        } else {
          return logoutCommand.error(`You are not logged in to ${vendor}`);
        }
        return;
      }

      if (all) {
        for (const [name, auth] of Object.entries(vendors)) {
          if (auth.authenticated) {
            await logout(name);
          }
        }
        return;
      }

      return logoutCommand.error("Please specify a provider or use --all");
    });
}

function renderUser(user: UserInfo | null) {
  const name = chalk.bold(user?.name);
  const email = user?.email;
  
  // Only show email in parentheses if it exists and is not empty
  if (email && email.trim() !== "") {
    return `${name} (${email})`;
  }
  
  return name;
}
