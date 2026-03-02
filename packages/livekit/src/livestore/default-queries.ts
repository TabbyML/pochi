import { queryDb } from "@livestore/livestore";
import { tables } from "./default-schema";

export const makeTaskQuery = (taskId: string) =>
  queryDb(
    () =>
      tables.tasks.where("id", "=", taskId).first({ behaviour: "undefined" }),
    {
      label: "task",
      deps: [taskId],
    },
  );

export const makeMessagesQuery = (taskId: string) =>
  queryDb(() => tables.messages.where("taskId", "=", taskId), {
    label: "messages",
    deps: [taskId],
  });

export const tasks$ = queryDb(
  () => tables.tasks.where("parentId", "=", null).orderBy("createdAt", "desc"),
  {
    label: "tasks",
  },
);

export const makeSubTaskQuery = (taskId: string) =>
  queryDb(() => tables.tasks.where("parentId", "=", taskId), {
    label: "subTasks",
    deps: [taskId],
  });

export const makeStoreFileQuery = (filePath: string) =>
  queryDb(
    () => tables.files.where("filePath", "=", filePath).first(undefined),
    {
      label: "file",
      deps: [filePath],
    },
  );

export const makeStoreFilesQuery = () =>
  queryDb(() => tables.files.select(), {
    label: "files",
  });

export const makeAllDataQuery = () => {
  return {
    tasks: queryDb(() => tables.tasks.select(), {
      label: "allTasks",
    }),
    messages: queryDb(() => tables.messages.select(), {
      label: "allMessages",
    }),
    files: queryDb(() => tables.files.select(), {
      label: "allFiles",
    }),
  };
};
