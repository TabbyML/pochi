import * as childProcess from "node:child_process";
import { updateVendorConfig } from "@getpochi/common/configuration";
import { getVendor } from "@getpochi/common/vendor";
import chalk from "chalk";

export async function login(vendorId: string) {
  const vendor = getVendor(vendorId);
  const { url, userCode, credentials } = await vendor.authenticate();

  console.log(chalk.blue("Opening browser for authentication..."));

  if (userCode) {
    console.log(
      chalk.blue(
        "Please enter the following code on the page to authenticate:",
      ),
    );
    console.log(`URL: ${chalk.cyan(url)}`);
    console.log(`Code: ${chalk.bold(userCode)}`);
  } else {
    console.log(chalk.gray(`Auth URL: ${url}`));
  }

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
  console.log(chalk.yellow("\nWaiting for authentication to complete..."));

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
