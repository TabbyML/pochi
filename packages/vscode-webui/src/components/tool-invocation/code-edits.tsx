import { useTranslation } from "react-i18next";
import { CodeBlock } from "../message";

export const UserEdits: React.FC<{
  userEdits: string;
}> = ({ userEdits }) => {
  const { t } = useTranslation();

  return (
    <div className="my-2 ml-1 flex flex-col">
      <CodeBlock className="" language="diff" value={userEdits} />
      <p className="mt-1 self-center text-xs italic">
        {t("userEdits.youHaveMadeAboveEdits")}
      </p>
    </div>
  );
};

export const ModelEdits: React.FC<{
  edit: string;
  isPreview?: boolean;
}> = ({ edit, isPreview = false }) => {
  return (
    <div className="my-2 ml-1 flex flex-col">
      <CodeBlock className="" language="diff" value={edit} />
      <p className="mt-1 self-center text-xs italic">
        {isPreview
          ? "Pochi will make the above edits"
          : "Pochi have made the above edits"}
      </p>
    </div>
  );
};
