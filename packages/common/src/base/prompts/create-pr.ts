export function createPr(isDraft?: boolean) {
  return `Please use gh cli to create a ${isDraft ? "draft" : ""} pull request`;
}
