import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";

export function resolveModelFromString(
  model: string | undefined,
  models: DisplayModel[] | undefined,
): DisplayModel | undefined {
  if (!model || !models?.length) {
    return;
  }
  const sep = model.indexOf("/");
  const vendorId = model.slice(0, sep);
  const modelId = model.slice(sep + 1);

  const vendors = models.filter((x) => x.type === "vendor");
  const pochiVendors = vendors.filter((x) => x.vendorId === "pochi");
  const providers = models.filter((x) => x.type === "provider");

  return (
    vendors.find((x) => x.vendorId === vendorId && x.modelId === modelId) ||
    pochiVendors.find((x) => x.modelId === model) ||
    providers.find((x) => x.id === model)
  );
}
