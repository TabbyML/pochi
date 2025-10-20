import { Console } from "node:console";

globalThis.console = new Console(process.stderr);
