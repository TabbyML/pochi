export type ReviewComment = {
  id: string;
  body: string;
};

export type ReviewCodeSnippet = {
  content: string;
  startLine: number;
  endLine: number;
};

export type Review = {
  id: string;
  uri: string;
  range?: {
    start: Position;
    end: Position;
  };
  comments: ReviewComment[];
  codeSnippet: ReviewCodeSnippet;
};

type Position = {
  line: number;
  character: number;
};
