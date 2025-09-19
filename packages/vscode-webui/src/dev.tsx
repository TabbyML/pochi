import { type Message, type Task, catalog } from "@getpochi/livekit";
import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import { liveStoreVersion } from "@livestore/livestore";
import { LiveStoreProvider, useStore } from "@livestore/react";
import { type FormEvent, useState } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import ReactDOM from "react-dom/client";
import LiveStoreWorker from "./livestore.worker.ts?worker";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

function App() {
  if (typeof window === "undefined") {
    return null;
  }
  const searchParams = new URLSearchParams(window.location.search);
  const storeId = searchParams.get("storeId");
  const jwt = searchParams.get("jwt");

  if (!storeId || !jwt) {
    return <AuthForm storeId={storeId} jwt={jwt} />;
  }

  return (
    <LiveStoreProvider
      schema={catalog.schema}
      adapter={adapter}
      renderLoading={() => <>Loading</>}
      batchUpdates={batchUpdates}
      syncPayload={{ jwt }}
      storeId={storeId}
    >
      <Content />
    </LiveStoreProvider>
  );
}

function Content() {
  const { store } = useStore();
  const tasks = store.useQuery(catalog.queries.makeTasksQuery());
  const devtoolsLink = `/_livestore/web/${store.storeId}/${store.clientId}/${store.sessionId}/default`;
  return (
    <div>
      <p>Store ID: {store.storeId}</p>
      <p>LiveStore Version: v{liveStoreVersion}</p>
      <a href={devtoolsLink} target="_blank" rel="noreferrer">
        Open DevTools
      </a>
      {tasks.map((task) => (
        <RenderTask key={task.id} task={task} />
      ))}
    </div>
  );
}

function RenderTask({ task }: { task: Task }) {
  const { store } = useStore();
  const messages = store.useQuery(catalog.queries.makeMessagesQuery(task.id));
  return (
    <details open>
      <summary>
        <strong>Task:</strong> {task.title} - <em>{task.id}</em>
      </summary>
      <div style={{ paddingLeft: "2em" }}>
        <pre>{JSON.stringify(task, null, 2)}</pre>
        <h4>Messages</h4>
        {messages.map((message) => (
          <RenderMessage key={message.id} message={message.data as Message} />
        ))}
      </div>
    </details>
  );
}

function RenderMessage({ message }: { message: Message }) {
  return (
    <details>
      <summary>
        <strong>{message.role}</strong> - <em>{message.id}</em>
      </summary>
      <div style={{ paddingLeft: "2em" }}>
        <pre>{JSON.stringify(message, null, 2)}</pre>
      </div>
    </details>
  );
}

function AuthForm({
  storeId: initialStoreId,
  jwt: initialJwt,
}: {
  storeId: string | null;
  jwt: string | null;
}) {
  const [storeId, setStoreId] = useState(initialStoreId || crypto.randomUUID());
  const [jwt, setJwt] = useState(initialJwt || "");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const searchParams = new URLSearchParams();
    searchParams.set("storeId", storeId);
    searchParams.set("jwt", jwt);
    window.location.search = searchParams.toString();
  };

  return (
    <div>
      <h1>Enter Session Info</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Session ID (storeId):
            <input
              type="text"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              style={{ width: "400px" }}
            />
          </label>
        </div>
        <div>
          <label>
            JWT:
            <textarea
              value={jwt}
              onChange={(e) => setJwt(e.target.value)}
              style={{ width: "400px", height: "100px" }}
            />
          </label>
        </div>
        <button type="submit">Submit</button>
      </form>
    </div>
  );
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
