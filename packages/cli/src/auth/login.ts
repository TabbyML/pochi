import * as childProcess from "node:child_process";
import { updateVendorConfig } from "@getpochi/common/configuration";
import { getVendor } from "@getpochi/common/vendor";
import chalk from "chalk";

export async function login(vendorId: string) {
  const vendor = getVendor(vendorId);
  const { url, credentials } = await vendor.authenticate();

  // If the vendor returns a URL, open it in the browser, it's likely an OAuth flow.
  // For some vendors, like Tabby, the `authenticate()` method might directly return credentials.
  if (url) {
    console.log(chalk.blue("Opening browser for authentication..."));
    console.log(chalk.gray(`Auth URL: ${url}`));

    // Try to open the browser automatically
    try {
      const platform = process.platform;
      let cmd: string;

      let openCmd: string;

      switch (platform) {
        case "darwin": // macOS
          openCmd = "open";
          break;
        case "win32": // Windows
          openCmd = "start";
          break;
        default: // Linux and others
          openCmd = "xdg-open";
          break;
      }

      childProcess.execFile(openCmd, [url], (error) => {
        if (error) {
          console.log(
            chalk.yellow(
              "\nCould not open browser automatically. Please open the following URL manually:",
            ),
          );
          console.log(chalk.cyan(url));
        }
      });
    } catch (error) {
      console.log(
        chalk.yellow(
          "\nPlease open the following URL in your browser to authenticate:",
        ),
      );
      console.log(chalk.cyan(url));
    }
    console.log(chalk.yellow("\nWaiting for authentication to complete..."));
  }

  // Wait for OAuth completion
  await updateVendorConfig(vendorId, {
    credentials: await credentials,
  });

  // Get user info after authentication
  const user = await vendor.getUserInfo();
  if (!user) {
    throw new Error("Failed to get user info after authentication");
  }
  return user;
}
