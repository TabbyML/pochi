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
}> = ({ edit }) => {
  return (
    <div className="my-2 ml-1 flex flex-col">
      <CodeBlock className="" language="diff" value={edit} />
    </div>
  );
};
