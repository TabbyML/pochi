import { authClient } from "@getpochi/vendor-pochi";
import type { DependencyContainer } from "tsyringe";
import { PostHog } from "./posthog";

export function createAuthClient(container: DependencyContainer) {
  const posthog = container.resolve(PostHog);

  const identifyUser = () => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) {
        posthog.identify(data.user.id, {
          email: data.user.email,
          name: data.user.name,
        });
      }
    });
  };

  identifyUser();
  return authClient;
}

export type AuthClient = ReturnType<typeof createAuthClient>;
