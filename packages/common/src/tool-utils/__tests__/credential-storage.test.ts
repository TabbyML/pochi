import * as fs from "node:fs/promises";
import * as os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger, mockGetLogger } = vi.hoisted(() => {
  const mockLogger = {
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
  };
  return { mockLogger, mockGetLogger: vi.fn().mockReturnValue(mockLogger) };
});

vi.mock("node:fs/promises");
vi.mock("node:os");
vi.mock("../fs");
vi.mock("../../base", () => ({
  getLogger: mockGetLogger,
}));

import { CredentialStorage } from "../credential-storage";
import { isFileExists } from "../fs";

describe("CredentialStorage", () => {
  const homedir = "/home/user";

  beforeEach(() => {
    vi.spyOn(os, "homedir").mockReturnValue(homedir);
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("read", () => {
    it("should return the bearer token when the credential file exists", async () => {
      const storage = new CredentialStorage();
      const mockCredential = { bearer_token: "test-token" };

      vi.mocked(isFileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockCredential));

      const token = await storage.read();

      expect(token).toBe("test-token");
      expect(fs.readFile).toHaveBeenCalledWith(
        `${homedir}/.pochi/credentials.json`,
        "utf-8",
      );
    });

    it("should return undefined when the credential file does not exist", async () => {
      const storage = new CredentialStorage();
      vi.mocked(isFileExists).mockResolvedValue(false);

      const token = await storage.read();

      expect(token).toBeUndefined();
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it("should return undefined and log an error when readFile fails", async () => {
      const storage = new CredentialStorage();
      const mockError = new Error("Read error");
      vi.mocked(isFileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockRejectedValue(mockError);

      const token = await storage.read();

      expect(token).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to read credential store file at ${homedir}/.pochi/credentials.json:`,
        mockError,
      );
    });
  });

  describe("write", () => {
    it("should write a new token to the credential file", async () => {
      const storage = new CredentialStorage();
      vi.mocked(isFileExists).mockResolvedValue(false);

      await storage.write("new-token");

      expect(fs.writeFile).toHaveBeenCalledWith(
        `${homedir}/.pochi/credentials.json`,
        JSON.stringify({ bearer_token: "new-token" }),
      );
    });

    it("should remove the credential file when the token is set to undefined", async () => {
      const storage = new CredentialStorage();
      const mockCredential = { bearer_token: "some-token" };
      vi.mocked(isFileExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockCredential));

      await storage.write(undefined);

      expect(fs.unlink).toHaveBeenCalledWith(`${homedir}/.pochi/credentials.json`);
    });
  });

  describe("isDev option", () => {
    it("should use credentials-dev.json when isDev is true", async () => {
      const storage = new CredentialStorage({ isDev: true });

      vi.mocked(isFileExists).mockResolvedValue(false);
      await storage.write("dev-token");

      expect(fs.writeFile).toHaveBeenCalledWith(
        `${homedir}/.pochi/credentials-dev.json`,
        JSON.stringify({ bearer_token: "dev-token" }),
      );
    });
  });

  describe("write error handling", () => {
    it("should log an error if writeFile fails", async () => {
      const storage = new CredentialStorage();
      const mockError = new Error("Write error");
      vi.mocked(isFileExists).mockResolvedValue(false);
      vi.mocked(fs.writeFile).mockRejectedValue(mockError);

      await storage.write("some-token");

      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to write credential storage file at ${homedir}/.pochi/credentials.json:`,
        mockError,
      );
    });
  });
});
