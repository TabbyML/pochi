import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsAsync from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { lockSync } from "proper-lockfile";
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

  it("preserves every update from concurrent OS processes", async function () {
    this.timeout(20000);
    await Promise.all(Array.from({ length: 4 }, (_, writer) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [
        "-r", require.resolve("esbuild-register"),
            "-e", "require(process.argv[1])",
        path.join(__dirname, "fixtures/task-history-writer.ts"),
        file, String(writer), "30",
      ], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", data => { output += data; });
      child.stderr.on("data", data => { output += data; });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve() : reject(new Error(`Writer ${writer} exited ${code}: ${output}`)));
    })));
    const tasks = history.read();
    assert.equal(Object.keys(tasks).length, 120);
    for (let writer = 0; writer < 4; writer++) {
      for (let i = 0; i < 30; i++) assert.equal(tasks[`${writer}-${i}`].id, `${writer}-${i}`);
    }
    assert.deepEqual(await fsAsync.readdir(dir), ["tasks.json"]);
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

  it("does not touch the file while another writer holds its lock", async () => {
    history.update({ task: row("task") }, {});
    const original = await fsAsync.readFile(file, "utf8");
    const release = lockSync(file, { realpath: false, stale: 60000 });
    try {
      assert.throws(() => history.update({ new: row("new") }, {}), { code: "ELOCKED" });
      assert.equal(await fsAsync.readFile(file, "utf8"), original);
    } finally { release(); }
    history.update({ new: row("new") }, {});
    assert.deepEqual(Object.keys(history.read()).sort(), ["new", "task"]);
  });

  it("recovers a stale lock left by an interrupted process", async () => {
    await fsAsync.mkdir(`${file}.lock`);
    const stale = new Date(Date.now() - 120000);
    await fsAsync.utimes(`${file}.lock`, stale, stale);
    history.update({ task: row("task") }, {});
    assert.ok(history.read().task);
    assert.deepEqual(await fsAsync.readdir(dir), ["tasks.json"]);
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
