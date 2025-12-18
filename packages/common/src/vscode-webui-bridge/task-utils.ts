export const WorktreePrefix = "⎇";
export const prefixWorktreeName = (name: string) => `${WorktreePrefix} ${name}`;
export const prefixTaskDisplayId = (displayId: number) =>
  `${String(displayId).padStart(3, "0")}`;

export const getTaskDisplayTitle = (params: {
  worktreeName: string;
  uid: string;
  displayId?: number;
}) => {
  const { worktreeName, uid, displayId } = params;
  return `${prefixWorktreeName(worktreeName)}${displayId ? ` - ${prefixTaskDisplayId(displayId)}` : ` - ${uid.split("-")[0]} `}`;
};
