import * as net from "node:net";

export async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== "string") {
        const port = address.port;
        server.close(() => {
          resolve(port);
        });
      } else {
        server.close(() => {
          reject(new Error("Failed to get address from server"));
        });
      }
    });

    server.on("error", (err) => {
      server.close(() => {
        reject(err);
      });
    });
  });
}
