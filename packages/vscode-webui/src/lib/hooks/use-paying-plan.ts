import * as jose from "jose";
import { usePochiCredentials } from "./use-pochi-credentials";

type PayingPlan = "freebie" | "paid";

export function UsePayingPlan() {
  const { jwt } = usePochiCredentials();
  return getPayingPlan(jwt);
}

function getPayingPlan(jwt: string | null): PayingPlan {
  return (
    (jwt ? (jose.decodeJwt(jwt).plan as PayingPlan) : undefined) ?? "freebie"
  );
}
