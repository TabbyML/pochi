import { CodeBlock } from "../message";

export const UserEdits: React.FC<{
  userEdits: string;
}> = ({ userEdits }) => {
  return (
    <div className="my-2 ml-1 flex flex-col">
      <CodeBlock className="" language="diff" value={userEdits} />
      <p className="mt-1 self-center text-xs italic">
        You have made the above edits
      </p>
    </div>
  );
};

export const ModelEdits: React.FC<{
  edits: string;
}> = ({ edits }) => {
  return (
    <div className="my-2 ml-1 flex flex-col">
      <CodeBlock className="" language="diff" value={edits} />
      <p className="mt-1 self-center text-xs italic">
        Pochi have made the above edits
      </p>
    </div>
  );
};
