import * as fs from "node:fs";
import * as z from "zod/v4";
import { makePochiConfig } from "./types";

const content = JSON.stringify(z.toJSONSchema(makePochiConfig(true)), null, 2);

fs.writeFileSync("./assets/config.schema.json", content);
