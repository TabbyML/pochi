function toBase64(bytes: Uint8Array) {
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  const base64 = btoa(binString);
  return base64;
}

export function findBlob(
  url: URL,
  mediaType: string,
): { data: string; mediaType: string } | undefined {
  return {
    // @ts-ignore: promise is resolved in flexible-chat-transport. we keep the string type to make toModelOutput type happy.
    data: fetch(url)
      .then((x) => x.blob())
      .then((blob) => blob.arrayBuffer())
      .then((data) => toBase64(new Uint8Array(data))),
    mediaType,
  };
}

export async function fileToRemoteUri(file: File, signal?: AbortSignal) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("https://app.getpochi.com/api/upload", {
    method: "POST",
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const data = (await response.json()) as { url?: string };

  if (!data.url) {
    throw new Error("Failed to upload attachment");
  }
  return data.url;
}
