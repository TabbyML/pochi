import * as childProcess from "node:child_process";
import { updateVendorConfig } from "@getpochi/common/configuration";
import { vendors } from "@getpochi/common/vendor/node";
import chalk from "chalk";

const { "gemini-cli": geminiCli } = vendors;

export async function geminiCliLogin() {
  console.log(chalk.yellow("Starting Gemini OAuth authentication..."));

  const oauthResult = await geminiCli.startOAuthFlow();

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
  console.log(chalk.yellow("\nWaiting for authentication to complete..."));

  // Wait for OAuth completion
  const credentials = await oauthResult.loginCompletePromise;
  await updateVendorConfig(geminiCli.vendorId, {
    credentials,
  });

  // Get user info after authentication
  const user = await geminiCli.getUserInfo();
  if (!user) {
    throw new Error("Failed to get user info after authentication");
  }
  return user;
}
