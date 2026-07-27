import * as Effect from "effect/Effect";
import { RailwayApiError } from "../Errors.js";
import {
  decodeRailwayGraphQLResponse,
  redactRailwayErrorMessage,
  railwaySensitiveValues,
} from "../client/RailwayGraphQLRequest.js";
import type { RailwayGraphQLExecutor } from "../client/RailwayGraphQLRequest.js";

export interface RailwayCliGraphQLExecutorOptions {
  readonly railwayPath?: string;
  readonly caller?: string;
  readonly agentSession?: string;
}

export const makeRailwayCliGraphQLExecutor = ({
  railwayPath = "railway",
  caller = "skill:use-railway@1.3.6",
  agentSession = "railway-alchemy-provider",
}: RailwayCliGraphQLExecutorOptions = {}): RailwayGraphQLExecutor => ({
  execute: (operation, query, variables) => {
    const sensitiveValues = railwaySensitiveValues(variables);
    return Effect.tryPromise({
      try: async (signal) => {
        const process = Bun.spawn(
          [
            railwayPath,
            "api",
            "--compact",
            "--allow-errors",
            query,
            "--variables",
            JSON.stringify(variables),
          ],
          {
            env: {
              ...Bun.env,
              RAILWAY_CALLER: caller,
              RAILWAY_AGENT_SESSION: agentSession,
            },
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        const abort = () => process.kill();
        signal.addEventListener("abort", abort, { once: true });
        const [exitCode, stdout, stderr] = await Promise.all([
          process.exited,
          new Response(process.stdout).text(),
          new Response(process.stderr).text(),
        ]);
        signal.removeEventListener("abort", abort);
        if (exitCode !== 0) {
          throw new Error(
            redactRailwayErrorMessage(
              stderr.trim().slice(0, 1_000) ||
                `railway api exited with code ${exitCode}`,
              sensitiveValues,
            ),
          );
        }
        return JSON.parse(stdout) as unknown;
      },
      catch: (error) =>
        new RailwayApiError({
          operation,
          message: redactRailwayErrorMessage(
            `Railway CLI request failed: ${String(error)}`,
            sensitiveValues,
          ),
        }),
    }).pipe(
      Effect.flatMap((value) =>
        decodeRailwayGraphQLResponse(operation, value, sensitiveValues),
      ),
    );
  },
});
