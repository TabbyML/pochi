import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const renderWidget: ToolFunctionType<
  ClientTools["renderWidget"]
> = async () => {
  return {
    success: true,
  };
};
