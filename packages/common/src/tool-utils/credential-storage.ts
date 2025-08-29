import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { getLogger } from "../base";
import { isFileExists } from "./fs";

const PochiCredential = z.object({
  bearer_token: z.string().optional(),
});

export type PochiCredential = z.infer<typeof PochiCredential>;

const logger = getLogger("PochiCredentialStorage");

class CredentialStorage {
  private isDev: boolean;

  constructor(options?: {
    isDev?: boolean;
  }) {
    this.isDev = options?.isDev ?? false;
  }

  private get credentialFilePath(): string {
    return path.join(
      os.homedir(),
      ".pochi",
      this.isDev ? "credentials-dev.json" : "credentials.json",
    );
  }

  private async readCredentials() {
    try {
      if (!(await isFileExists(this.credentialFilePath))) {
        return undefined;
      }
      const data = await fs.readFile(this.credentialFilePath, "utf-8");
      const parsed = JSON.parse(data);
      return PochiCredential.parse(parsed);
    } catch (error) {
      logger.error(
        `Failed to read credential store file at ${this.credentialFilePath}:`,
        error,
      );
      return undefined;
    }
  }

  async read(): Promise<string | undefined> {
    const credential = await this.readCredentials();
    return credential?.bearer_token;
  }

  async write(value: string | undefined): Promise<void> {
    try {
      const credential = (await this.readCredentials()) || {};
      const { bearer_token, ...rest } = credential;
      const updatedCredential =
        value !== undefined ? { ...rest, bearer_token: value } : rest;
      // Validate the updated credential structure
      PochiCredential.parse(updatedCredential);

      if (Object.keys(updatedCredential).length === 0) {
        // if credential becomes empty, remove the file
        if (await isFileExists(this.credentialFilePath)) {
          await fs.unlink(this.credentialFilePath);
        }
      } else {
        await fs.mkdir(path.dirname(this.credentialFilePath), {
          recursive: true,
        });
        await fs.writeFile(
          this.credentialFilePath,
          JSON.stringify(updatedCredential),
        );
      }
    } catch (error) {
      logger.error(
        `Failed to write credential storage file at ${this.credentialFilePath}:`,
        error,
      );
    }
  }
}

export { CredentialStorage };
