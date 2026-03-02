import { useDefaultStore } from "@/lib/use-default-store";
import { isVSCodeEnvironment } from "@/lib/vscode";
import { type File, catalog } from "@getpochi/livekit";
import { createContext, useContext } from "react";

type FileProviderProps = {
  children: React.ReactNode;
  defaultFiles?: File[];
};

type FileProviderState = {
  defaultFiles: File[];
};

const initialState: FileProviderState = {
  defaultFiles: [],
};

const FileProviderContext = createContext<FileProviderState>(initialState);

export function FilesProvider({
  children,
  defaultFiles = [],
}: FileProviderProps) {
  return (
    <FileProviderContext.Provider
      value={{
        defaultFiles,
      }}
    >
      {children}
    </FileProviderContext.Provider>
  );
}

export const useStoreFile = (filePath: string) => {
  const context = useContext(FileProviderContext);

  if (context === undefined) {
    throw new Error("useStoreFile must be used within a FilesProvider");
  }

  const { defaultFiles } = context;
  const store = useDefaultStore();

  const storeFile = store.useQuery(
    catalog.queries.makeStoreFileQuery(filePath),
  );

  if (isVSCodeEnvironment()) {
    return storeFile;
  }

  return defaultFiles.find((file) => file.filePath === filePath);
};
