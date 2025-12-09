export type GitDiff = {
  // Relative filepath to cwd
  filepath: string;
  // if null, the file was created
  before: string | null;
  // if null, the file was deleted
  after: string | null;
  status?: string;
};
