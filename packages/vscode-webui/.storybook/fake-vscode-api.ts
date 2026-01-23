import {
  type VSCodeHostApi,
  type WebviewHostApi,
  createVscodeHostStub,
} from "@getpochi/common/vscode-webui-bridge";
import { Thread } from "@quilted/threads";
import Emittery from "emittery";

const channel = new Emittery();

// @ts-ignore
window.acquireVsCodeApi = () => {
  return {
    postMessage: (message: unknown) => {
      channel.emit("message", message);
    },
  };
};

new Thread<WebviewHostApi, VSCodeHostApi>(
  {
    send(message) {
      window.dispatchEvent(new MessageEvent("message", { data: message }));
    },
    listen(listener) {
      channel.on("message", listener);
    },
  },
  {
    exports: createVscodeHostStub({
      async readCurrentWorkspace() {
        return { cwd: "/", workspaceFolder: "/", workspacePath: "/" };
      },
    }),
  },
);
