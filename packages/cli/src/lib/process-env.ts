export const getCommonProcessEnv = () => ({
  ...process.env,
  PAGER: "cat",
  GIT_COMMITTER_NAME: "Pochi",
  GIT_COMMITTER_EMAIL: "noreply@getpochi.com",
});
