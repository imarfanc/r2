import { installShutdownHandlers, startServer } from "./server/server.ts";

installShutdownHandlers(startServer());
