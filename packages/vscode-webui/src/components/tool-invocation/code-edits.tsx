import { CodeBlock } from "../message";

export const ModelEdits: React.FC<{
  edit: string;
}> = ({ edit }) => {
  return (
    <div className="my-2 ml-1 flex flex-col">
      <CodeBlock className="" language="diff" value={edit} />
    </div>
  );
};
