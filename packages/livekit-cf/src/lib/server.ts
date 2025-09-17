// only use localhost:4113 on env has value `dev`
export function getServerBaseUrl(env: "dev" | "prod" | undefined) {
  return env === "dev" ? "http://localhost:4111" : "https://app.getpochi.com";
}
