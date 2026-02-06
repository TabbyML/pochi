import * as jose from "jose";
import { usePochiCredentials } from "./use-pochi-credentials";

type PayingPlan = "freebie" | "paid";

export type PayingInfo = {
  plan: PayingPlan;
  isFreebieWhitelistedForSuperModel: boolean;
};

export function usePayingPlan(): PayingInfo {
  const { jwt } = usePochiCredentials();
  return getPayingPlan(jwt);
}

function getPayingPlan(jwt: string | null): PayingInfo {
  if (!jwt) {
    return { plan: "freebie", isFreebieWhitelistedForSuperModel: false };
  }
  const decoded = jose.decodeJwt(jwt);
  return {
    plan: (decoded.plan as PayingPlan) ?? "freebie",
    isFreebieWhitelistedForSuperModel:
      (decoded.isFreebieWhitelistedForSuperModel as boolean) ?? false,
  };
}
