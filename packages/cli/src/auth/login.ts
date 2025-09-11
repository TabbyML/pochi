import * as childProcess from "node:child_process";
import { updateVendorConfig } from "@getpochi/common/configuration";
import { getVendor } from "@getpochi/common/vendor";
import chalk from "chalk";
import { promptForCode } from "./prompt-code";

// Type for callback-based authentication (used by claude-code vendor)
interface CallbackCredentials {
  mode: "callback";
  callback: (code: string) => Promise<unknown>;
}

// Type guard to check if credentials have callback mode
function isCallbackCredentials(
  credentials: unknown,
): credentials is CallbackCredentials {
  return (
    typeof credentials === "object" &&
    credentials !== null &&
    "mode" in credentials &&
    credentials.mode === "callback" &&
    "callback" in credentials &&
    typeof credentials.callback === "function"
  );
}

export async function login(vendorId: string) {
  const vendor = getVendor(vendorId);
  const { url, credentials } = await vendor.authenticate();

  console.log(chalk.blue("Opening browser for authentication..."));
  console.log(chalk.gray(`Auth URL: ${url}`));

  // Try to open the browser automatically
  try {
    const platform = process.platform;
    let cmd: string;

    switch (platform) {
      case "darwin": // macOS
        cmd = `open "${url}"`;
        break;
      case "win32": // Windows
        cmd = `start "${url}"`;
        break;
      default: // Linux and others
        cmd = `xdg-open "${url}"`;
        break;
    }

    childProcess.exec(cmd, (error) => {
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

  // Check if this is manual code input flow (for claude-code)
  const credentialsValue = await credentials;
  let finalCredentials: unknown;

  if (isCallbackCredentials(credentialsValue)) {
    // Manual code input flow
    const code = await promptForCode();
    finalCredentials = await credentialsValue.callback(code);
  } else {
    // Normal OAuth flow with automatic callback
    console.log(chalk.yellow("\nWaiting for authentication to complete..."));
    finalCredentials = credentialsValue;
  }

  // Save credentials
  await updateVendorConfig(vendorId, {
    credentials: finalCredentials,
  });

  // Get user info after authentication
  const user = await vendor.getUserInfo();
  if (!user) {
    throw new Error("Failed to get user info after authentication");
  }
  return user;
}
