export type FileUIPart = {
  name: string;
  contentType: string;
  url: string;
};

export interface TaskIdParams {
  uid: string;
  prompt?: string;
  files?: FileUIPart[];
}

export interface NewTaskParams {
  uid: undefined;
}
