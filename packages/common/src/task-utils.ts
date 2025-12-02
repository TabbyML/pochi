const WorktreePrefix = "⎇";
const TaskDisplayIdPrefix = "∙";
export const prefixWorktreeName = (name: string) => `${WorktreePrefix} ${name}`;
export const prefixTaskDisplayId = (displayId: number) =>
  `${TaskDisplayIdPrefix}${displayId}`;

export const getTaskDisplayTitle = (params: {
  worktreeName: string;
  uid: string;
  displayId?: number;
}) => {
  const { worktreeName, uid, displayId } = params;
  return `${prefixWorktreeName(worktreeName)}${displayId ? prefixTaskDisplayId(displayId) : ` - ${uid.split("-")[0]} `}`;
};
