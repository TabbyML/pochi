import * as childProcess from "node:child_process";
import type { Command } from "@commander-js/extra-typings";
import { GeminiCliOAuthHandler } from "@getpochi/common/auth";
import chalk from "chalk";

export function registerGeminiCliAuthCommand(program: Command) {
  const authCommand = program
    .command("auth")
    .description("Authentication commands");

  authCommand
    .command("gemini-cli")
    .description("Authenticate with Google Gemini using OAuth")
    .action(async () => {
      try {
        const geminiOAuth = new GeminiCliOAuthHandler();

        // Check if already authenticated
        const isAuthenticated = await geminiOAuth.isAuthenticated();
        if (isAuthenticated) {
          const user = await geminiOAuth.getCurrentUser();
          if (user) {
            console.log(
              chalk.green(
                `Already authenticated as: ${user.name} (${user.email})`,
              ),
            );
            return;
          }
        }

        console.log(chalk.yellow("Starting Gemini OAuth authentication..."));

        const oauthResult = await geminiOAuth.startOAuthFlow();

        console.log(
          chalk.blue(`OAuth server started on localhost:${oauthResult.port}`),
        );
        console.log(chalk.blue("Opening browser for authentication..."));
        console.log(chalk.gray(`Auth URL: ${oauthResult.authUrl}`));

        // Try to open the browser automatically
        try {
          const platform = process.platform;
          let cmd: string;

          switch (platform) {
            case "darwin": // macOS
              cmd = `open "${oauthResult.authUrl}"`;
              break;
            case "win32": // Windows
              cmd = `start "${oauthResult.authUrl}"`;
              break;
            default: // Linux and others
              cmd = `xdg-open "${oauthResult.authUrl}"`;
              break;
          }

          childProcess.exec(cmd, (error) => {
            if (error) {
              console.log(
                chalk.yellow(
                  "\nCould not open browser automatically. Please open the following URL manually:",
                ),
              );
              console.log(chalk.cyan(oauthResult.authUrl));
            }
          });
        } catch (error) {
          console.log(
            chalk.yellow(
              "\nPlease open the following URL in your browser to authenticate:",
            ),
          );
          console.log(chalk.cyan(oauthResult.authUrl));
        }
        console.log(
          chalk.yellow("\nWaiting for authentication to complete..."),
        );

        // Wait for OAuth completion
        await oauthResult.loginCompletePromise;

        // Get user info after authentication
        const user = await geminiOAuth.getCurrentUser();
        if (user) {
          console.log(
            chalk.green(
              `\n✅ Successfully authenticated as: ${user.name} (${user.email})`,
            ),
          );
        } else {
          console.log(chalk.green("\n✅ Authentication successful!"));
        }
      } catch (error) {
        console.error(
          chalk.red("❌ Authentication failed:"),
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  authCommand
    .command("status")
    .description("Check authentication status")
    .action(async () => {
      try {
        const geminiOAuth = new GeminiCliOAuthHandler();
        const isAuthenticated = await geminiOAuth.isAuthenticated();

        if (isAuthenticated) {
          const user = await geminiOAuth.getCurrentUser();
          if (user) {
            console.log(chalk.green("✅ Authenticated"));
            console.log(`   User: ${user.name} (${user.email})`);
          } else {
            console.log(
              chalk.green("✅ Authenticated (unable to fetch user info)"),
            );
          }
        } else {
          console.log(chalk.red("❌ Not authenticated"));
          console.log(
            chalk.gray("Run 'pochi auth gemini-cli' to authenticate"),
          );
        }
      } catch (error) {
        console.error(
          chalk.red("Error checking authentication status:"),
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  authCommand
    .command("logout")
    .description("Log out and clear stored credentials")
    .action(async () => {
      try {
        const geminiOAuth = new GeminiCliOAuthHandler();
        await geminiOAuth.logout();
        console.log(chalk.green("✅ Successfully logged out"));
      } catch (error) {
        console.error(
          chalk.red("Error during logout:"),
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });
}
