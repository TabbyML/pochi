import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const renderWidget: ToolFunctionType<
  ClientTools["renderWidget"]
> = async ({ title, kind }) => {
  return {
    success: true,
    title,
    kind,
  };
};
