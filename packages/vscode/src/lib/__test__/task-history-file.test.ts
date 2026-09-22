import assert from "node:assert/strict";
import fs from "node:fs";
import fsAsync from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";
import { TaskHistoryFile } from "../task-history-file";

describe("TaskHistoryFile", () => {
  let dir: string;
  let file: string;
  let history: TaskHistoryFile;
  const row = (id: string, title = id) => ({ id, title, parentId: null, shareId: null, updatedAt: Date.now() });
  beforeEach(async () => {
    dir = await fsAsync.mkdtemp(path.join(os.tmpdir(), "pochi-history-file-"));
    file = path.join(dir, "tasks.json");
    history = new TaskHistoryFile(file);
  });
  afterEach(async () => {
    sinon.restore();
    await fsAsync.rm(dir, { recursive: true, force: true });
  });

  it("creates the storage directory on the first save", () => {
    const storage = path.join(dir, "storage");
    const initialHistory = new TaskHistoryFile(path.join(storage, "tasks.json"));
    assert.deepEqual(initialHistory.read(), {});
    const task = row("task");
    initialHistory.update({ task }, {});
    assert.deepEqual(initialHistory.read(), { task });
    assert.deepEqual(fs.readdirSync(storage), ["tasks.json"]);
  });

  it("does not remove an entry another window refreshed after retention inspected it", () => {
    const old = row("task", "old");
    history.update({ task: old }, {});
    const inspected = history.read();
    const refreshed = row("task", "fresh from SQLite");
    history.update({ task: refreshed }, {});
    const result = history.update({}, inspected);
    assert.deepEqual(result.evicted, []);
    assert.deepEqual(result.tasks.task, refreshed);
  });

  it("preserves the original file when reading fails with an I/O error", async () => {
    history.update({ task: row("task") }, {});
    const original = await fsAsync.readFile(file, "utf8");
    const read = sinon.stub(fs, "readFileSync").throws(Object.assign(new Error("Injected I/O error"), { code: "EIO" }));
    assert.throws(() => history.update({ new: row("new") }, {}), { code: "EIO" });
    read.restore();
    assert.equal(await fsAsync.readFile(file, "utf8"), original);
    assert.deepEqual(await fsAsync.readdir(dir), ["tasks.json"]);
  });

  it("preserves corrupt input when making its backup fails", async () => {
    const original = '{"recoverable": {"id":"task"}, "partial":';
    await fsAsync.writeFile(file, original);
    const rename = sinon.stub(fs, "renameSync").throws(Object.assign(new Error("Injected backup failure"), { code: "EACCES" }));
    assert.throws(() => history.update({ new: row("new") }, {}), { code: "EACCES" });
    rename.restore();
    assert.equal(await fsAsync.readFile(file, "utf8"), original);
    assert.deepEqual(await fsAsync.readdir(dir), ["tasks.json"]);
  });
});
