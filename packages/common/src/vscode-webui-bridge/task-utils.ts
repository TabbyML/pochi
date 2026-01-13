export const WorktreePrefix = "⎇";
export const prefixWorktreeName = (name: string) => `${WorktreePrefix} ${name}`;

export const getTaskDisplayTitle = (params: {
  worktreeName: string;
  uid: string;
}) => {
  const { worktreeName, uid } = params;
  return `${prefixWorktreeName(worktreeName)} - ${uid.split("-")[0]}`;
};
