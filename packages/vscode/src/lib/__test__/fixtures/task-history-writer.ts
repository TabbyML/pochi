import { TaskHistoryFile } from "../../task-history-file";

const [file, writer, count] = process.argv.slice(2);
const history = new TaskHistoryFile(file);
for (let i = 0; i < Number(count); i++) {
  const id = `${writer}-${i}`;
  history.update(
    { [id]: { id, parentId: null, shareId: null, updatedAt: i } },
    {},
    true,
  );
}
