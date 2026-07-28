import {
  AuthError,
  AuthProviderLayer,
  type ConfigureContext,
} from "alchemy/Auth/AuthProvider";
import {
  CredentialsStore,
  displayRedacted,
} from "alchemy/Auth/Credentials";
import { getEnvRedacted, retryOnce } from "alchemy/Auth/Env";
import { AlchemyProfile } from "alchemy/Auth/Profile";
import * as Clank from "alchemy/Util/Clank";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

export const RAILWAY_AUTH_PROVIDER_NAME = "Railway";

export const RailwayAuthConfig = Schema.Union([
  Schema.Struct({
    method: Schema.Literal("env"),
    tokenType: Schema.optionalKey(
      Schema.Literals(["api", "project"]),
    ),
  }),
  Schema.Struct({
    method: Schema.Literal("stored"),
    tokenType: Schema.optionalKey(
      Schema.Literals(["api", "project"]),
    ),
  }),
]);

export type RailwayAuthConfig =
  Schema.Schema.Type<typeof RailwayAuthConfig>;

export interface RailwayStoredCredentials {
  readonly type: "token";
  readonly token: string;
  readonly tokenType?: "api" | "project";
}

export interface RailwayResolvedCredentials {
  readonly type: "token";
  readonly token: Redacted.Redacted<string>;
  readonly tokenType: "api" | "project";
  readonly source: {
    readonly type: RailwayAuthConfig["method"];
    readonly details?: string;
  };
}

const methodOptions: ReadonlyArray<{
  readonly value: RailwayAuthConfig["method"];
  readonly label: string;
  readonly hint?: string;
}> = [
  {
    value: "env",
    label: "Environment Variable",
    hint: "RAILWAY_API_TOKEN or RAILWAY_TOKEN",
  },
  {
    value: "stored",
    label: "API Token",
    hint: "enter interactively, stored in ~/.alchemy/credentials",
  },
];

export const RailwayAuth = AuthProviderLayer<
  RailwayAuthConfig,
  RailwayResolvedCredentials
>()(
  RAILWAY_AUTH_PROVIDER_NAME,
  Effect.gen(function* () {
    const profiles = yield* AlchemyProfile;
    const store = yield* CredentialsStore;

    const loginStored = Effect.fn("RailwayAuth.loginStored")(function* (
      profileName: string,
      tokenType: "api" | "project",
    ) {
      const token = yield* Clank.password({
        message:
          tokenType === "project"
            ? "Railway Project Token"
            : "Railway API or Workspace Token",
        validate: (value) => (value.length === 0 ? "Required" : undefined),
      }).pipe(retryOnce);

      yield* store.write<RailwayStoredCredentials>(
        profileName,
        "railway-stored",
        {
          type: "token",
          token,
          tokenType,
        },
      );
      yield* Clank.success("Railway: credentials saved.");
      return { method: "stored" as const, tokenType };
    });

    const configureInteractive = (profileName: string) =>
      Clank.select({
        message: "Railway token type",
        options: [
          {
            value: "api" as const,
            label: "API or Workspace Token",
            hint: "Authorization: Bearer",
          },
          {
            value: "project" as const,
            label: "Project Token",
            hint: "Project-Access-Token",
          },
        ],
      }).pipe(
        Effect.flatMap((tokenType) =>
          Clank.select({
            message: "Railway authentication method",
            options: [...methodOptions],
          }).pipe(
            Effect.flatMap((method) =>
              Match.value(method).pipe(
                Match.when("env", () =>
                  Effect.succeed({
                    method: "env" as const,
                    tokenType,
                  })
                ),
                Match.when("stored", () =>
                  loginStored(profileName, tokenType)
                ),
                Match.exhaustive,
              ),
            ),
          )
        ),
      );

    const configureCi = Effect.all({
      api: getEnvRedacted("RAILWAY_API_TOKEN"),
      project: getEnvRedacted("RAILWAY_TOKEN"),
    }).pipe(
      Effect.flatMap(({ api, project }) =>
        api && project
          ? Effect.fail(
              new AuthError({
                message:
                  "Set only one of RAILWAY_API_TOKEN or RAILWAY_TOKEN.",
              }),
            )
          : Effect.succeed({
              method: "env" as const,
              tokenType: project ? ("project" as const) : ("api" as const),
            })
      ),
    );

    const configure = (profileName: string, context: ConfigureContext) =>
      (context.ci ? configureCi : configureInteractive(profileName)).pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "failed to configure Railway credentials",
              cause,
            }),
        ),
      );

    const read = (
      profileName: string,
      config: RailwayAuthConfig,
    ): Effect.Effect<RailwayResolvedCredentials, AuthError> =>
      Match.value(config).pipe(
        Match.when(
          { method: "env" },
          Effect.fn("RailwayAuth.readEnv")(function* () {
            const tokenType = config.tokenType ?? "api";
            const variableName =
              tokenType === "project"
                ? "RAILWAY_TOKEN"
                : "RAILWAY_API_TOKEN";
            const token = yield* getEnvRedacted(variableName);
            if (!token) {
              return yield* new AuthError({
                message:
                  `Railway environment credentials were not found. Set ${variableName}.`,
              });
            }
            return {
              type: "token" as const,
              token,
              tokenType,
              source: { type: "env" as const },
            };
          }),
        ),
        Match.when({ method: "stored" }, () =>
          store.read<RailwayStoredCredentials>(
            profileName,
            "railway-stored",
          ).pipe(
            Effect.flatMap((credentials) =>
              credentials
                ? Effect.succeed({
                    type: "token" as const,
                    token: Redacted.make(credentials.token),
                    tokenType:
                      config.tokenType ??
                      credentials.tokenType ??
                      ("api" as const),
                    source: { type: "stored" as const },
                  })
                : Effect.fail(
                    new AuthError({
                      message:
                        "Railway stored credentials were not found. Run: alchemy login --configure",
                    }),
                  ),
            ),
          ),
        ),
        Match.exhaustive,
      );

    const logout = (profileName: string, config: RailwayAuthConfig) =>
      Match.value(config).pipe(
        Match.when({ method: "env" }, () => Effect.void),
        Match.when({ method: "stored" }, () =>
          store.delete(profileName, "railway-stored").pipe(
            Effect.andThen(
              Clank.success("Railway: stored credentials removed."),
            ),
          ),
        ),
        Match.exhaustive,
      );

    const login = (profileName: string, config: RailwayAuthConfig) =>
      Match.value(config).pipe(
        Match.when({ method: "env" }, () =>
          getEnvRedacted(
            (config.tokenType ?? "api") === "project"
              ? "RAILWAY_TOKEN"
              : "RAILWAY_API_TOKEN",
          ).pipe(
            Effect.flatMap((token) =>
              token
                ? Effect.void
                : Effect.gen(function* () {
                    const next = yield* configureInteractive(profileName);
                    const existing = yield* profiles.getProfile(profileName);
                    yield* profiles.setProfile(profileName, {
                      ...existing,
                      [RAILWAY_AUTH_PROVIDER_NAME]: next,
                    });
                  }),
            ),
          ),
        ),
        Match.when({ method: "stored" }, () =>
          store
            .read<RailwayStoredCredentials>(profileName, "railway-stored")
            .pipe(
              Effect.flatMap((credentials) =>
                credentials
                  ? Effect.void
                  : loginStored(profileName, config.tokenType ?? "api"),
              ),
            ),
        ),
        Match.exhaustive,
        Effect.mapError(
          (cause) =>
            new AuthError({ message: "Railway login failed", cause }),
        ),
      );

    const prettyPrint = (
      profileName: string,
      config: RailwayAuthConfig,
    ) =>
      read(profileName, config).pipe(
        Effect.tap((credentials) =>
          Effect.all([
            Console.log(`  token: ${displayRedacted(credentials.token, 6)}`),
            Console.log(`  token type: ${credentials.tokenType}`),
            Console.log(`  source: ${credentials.source.type}`),
          ]),
        ),
      );

    return {
      configure,
      logout,
      login,
      prettyPrint,
      read,
    };
  }),
);
