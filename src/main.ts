// The plugin's entry point: PayBox runs this bundle and talks to it over stdio. The tools live in plugin.ts, which the Pro server
// (pro/) imports too, so importing plugin.ts must not start a server.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./plugin.js";

serveStdio(createServer, { legacy: "reject" });
