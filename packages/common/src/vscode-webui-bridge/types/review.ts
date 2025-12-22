export type ReviewComment = {
  id: string;
  body: string;
};

export type Review = {
  id: string;
  uri: string;
  range?: {
    start: Position;
    end: Position;
  };
  comments: ReviewComment[];
};

type Position = {
  line: number;
  character: number;
};
