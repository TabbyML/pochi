import * as fs from "node:fs";
import * as z from "zod/v4";
import { PochiConfig } from "./types";

const content = JSON.stringify(z.toJSONSchema(PochiConfig), null, 2);

fs.writeFileSync("config.schema.json", content);
