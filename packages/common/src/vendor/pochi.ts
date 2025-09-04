import { createAuthClient as createAuthClientImpl } from "better-auth/react";
import type { UserInfo } from "../configuration";
import { deviceLinkClient } from "../device-link/client";
import { getServerBaseUrl } from "../vscode-webui-bridge";
import { type ModelOptions, VendorBase } from "./types";

type PochiCredentials = {
  token: string;
};

export class Pochi extends VendorBase {
  private authClient: ReturnType<typeof createAuthClientImpl>;

  constructor() {
    const vendorId = "pochi";
    super(vendorId);

    this.authClient = createAuthClient(this.authToken, (token) =>
      this.updateCredentials({
        token,
      }),
    );
  }

  private get authToken() {
    try {
      return (this.getVendorConfig().credentials as PochiCredentials).token;
    } catch {
      return undefined;
    }
  }

  fetchModels(): Promise<Record<string, ModelOptions>> {
    throw new Error("Method not implemented.");
  }

  protected override async renewCredentials(
    credentials: PochiCredentials,
  ): Promise<PochiCredentials> {
    return credentials;
  }

  protected override async fetchUserInfo(
    _credentials: PochiCredentials,
  ): Promise<UserInfo> {
    const session = await this.authClient.getSession();
    if (!session.data) {
      throw new Error(session.error.message);
    }

    return {
      ...session.data.user,
    };
  }
}

function createAuthClient(
  token: string | undefined,
  setToken: (token: string) => void,
) {
  const authClient = createAuthClientImpl({
    baseURL: getServerBaseUrl(),
    plugins: [deviceLinkClient()],

    fetchOptions: {
      customFetchImpl: buildCustomFetchImpl(token),
      onResponse: (ctx) => {
        const authToken = ctx.response.headers.get("set-auth-token"); // get the token from the response headers
        if (authToken) {
          setToken(authToken);
        }
      },
    },
  });

  return authClient;
}

const buildCustomFetchImpl = (token: string | undefined) => {
  return async (input: string | URL | Request, requestInit?: RequestInit) => {
    const headers = new Headers(requestInit?.headers);
    if (token) {
      headers.append("Authorization", `Bearer ${token}`);
    }
    return fetch(input, {
      ...requestInit,
      headers,
    });
  };
};
