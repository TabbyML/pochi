import type { Command } from "@commander-js/extra-typings";
import {
  type AuthProvider,
  type User,
  authProviders,
} from "@getpochi/common/auth";
import chalk from "chalk";
import { geminiCliLogin } from "./gemini-cli";

const loginFns: Record<string, () => Promise<User>> = {
  "gemini-cli": geminiCliLogin,
};

export function registerAuthCommand(program: Command) {
  const providers = Object.keys(authProviders).join(", ");

  const authCommand = program.command("auth");
  authCommand.command("status", { isDefault: true }).action(async () => {
    for (const [name, auth] of Object.entries(authProviders)) {
      if (auth.authenticated) {
        console.log(`${name}:`, renderUser(await auth.getUser()));
      }
    }
  });

  const loginCommand = authCommand.command("login");
  loginCommand
    .requiredOption(
      "--provider <provider>",
      `Provider to login to: ${providers}`,
    )
    .action(async ({ provider }) => {
      if (provider) {
        const auth = authProviders[provider as keyof typeof authProviders];
        if (auth.authenticated) {
          const user = await auth.getUser();
          console.log("You're already logged in as", renderUser(user));
          return;
        }
      }

      if (!(provider in loginFns)) {
        return loginCommand.error(`Unknown provider: ${provider}`);
      }

      const user = await loginFns[provider]();
      console.log("Logged in as", renderUser(user));
    });

  const logoutCommand = authCommand.command("logout");
  logoutCommand
    .option("-a, --all")
    .option("--provider <provider>", `Provider to logout from: ${providers}`)
    .action(async ({ provider, all }) => {
      const logout = async (name: string, auth: AuthProvider) => {
        await auth.logout();
        console.log(`Logged out from ${name}`);
      };

      if (provider) {
        const auth = authProviders[provider as keyof typeof authProviders];
        if (auth.authenticated) {
          await logout(provider, auth);
        } else {
          return logoutCommand.error(`You are not logged in to ${provider}`);
        }
        return;
      }

      if (all) {
        for (const [name, auth] of Object.entries(authProviders)) {
          if (auth.authenticated) {
            await logout(name, auth);
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
