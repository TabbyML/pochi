import type { Command } from "@commander-js/extra-typings";
import { type User, vendors } from "@getpochi/common/vendor";
import chalk from "chalk";
import { geminiCliLogin } from "./gemini-cli";

const loginFns: Record<string, () => Promise<User>> = {
  "gemini-cli": geminiCliLogin,
};

export function registerAuthCommand(program: Command) {
  const vendorNames = Object.keys(vendors).join(", ");

  const authCommand = program.command("auth");
  authCommand.command("status", { isDefault: true }).action(async () => {
    for (const [name, auth] of Object.entries(vendors)) {
      if (auth.authenticated) {
        console.log(`${name}:`, renderUser(await auth.getUser()));
      }
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
        const user = await auth.getUser();
        console.log("You're already logged in as", renderUser(user));
        return;
      }

      if (!(vendor in loginFns)) {
        return loginCommand.error(`Unknown vendor: ${vendor}`);
      }

      const user = await loginFns[vendor]();
      console.log("Logged in as", renderUser(user));
    });

  const logoutCommand = authCommand.command("logout");
  logoutCommand
    .option("-a, --all")
    .option("-v, --vendor <vendor>", `Vendor to logout from: ${vendors}`)
    .action(async ({ vendor, all }) => {
      if (vendor) {
        const auth = vendors[vendor as keyof typeof vendors];
        if (auth.authenticated) {
          await auth.logout();
          console.log(`Logged out from ${vendor}`);
        } else {
          return logoutCommand.error(`You are not logged in to ${vendor}`);
        }
        return;
      }

      if (all) {
        for (const [name, auth] of Object.entries(vendors)) {
          if (auth.authenticated) {
            await auth.logout();
            console.log(`Logged out from ${name}`);
          }
        }
        return;
      }

      return logoutCommand.error("Please specify a provider or use --all");
    });
}

function renderUser(user: User | null) {
  return `${chalk.bold(user?.name)} (${user?.email})`;
}
