import { DiffViewer } from "@/components/message/diff-viewer";

export const ModelEdits: React.FC<{
  edit: string;
  filePath?: string;
}> = ({ edit, filePath }) => {
  return (
    <div className="my-2 ml-1 flex flex-col">
      <DiffViewer patch={edit} filePath={filePath} />
    </div>
  );
};
