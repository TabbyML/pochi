export type ReviewComment = {
  id: string;
  body: string;
  author: {
    name: string;
    iconPath?: string | undefined;
  };
};

export type Review = {
  id: string;
  uri: string;
  range?:
    | {
        startLine: number;
        startCharacter: number;
        endLine: number;
        endCharacter: number;
      }
    | undefined;
  comments: ReviewComment[];
};
