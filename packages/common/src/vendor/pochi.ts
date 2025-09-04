import { createAuthClient as createAuthClientImpl } from "better-auth/react";
import type { PochiVendorConfig, UserInfo } from "../configuration";
import { deviceLinkClient } from "../device-link/client";
import { getServerBaseUrl } from "../vscode-webui-bridge";
import { type ModelOptions, VendorBase } from "./types";

export const PochiVendorId = "pochi";

type PochiCredentials = PochiVendorConfig["credentials"];

export class Pochi extends VendorBase {
  private authClient: ReturnType<typeof createAuthClientImpl>;

  constructor(
    credentials: PochiCredentials,
    updateCredentials: (credentials: PochiCredentials) => void,
  ) {
    super(PochiVendorId);

    this.authClient = createAuthClient(credentials.token, (token) =>
      updateCredentials({
        token,
      }),
    );
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
      name: session.data.user.name,
      email: session.data.user.email,
      image: session.data.user.image || undefined,
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
