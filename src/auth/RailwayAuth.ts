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
  Schema.Struct({ method: Schema.Literal("env") }),
  Schema.Struct({ method: Schema.Literal("stored") }),
]);

export type RailwayAuthConfig =
  Schema.Schema.Type<typeof RailwayAuthConfig>;

export interface RailwayStoredCredentials {
  readonly type: "token";
  readonly token: string;
}

export interface RailwayResolvedCredentials {
  readonly type: "token";
  readonly token: Redacted.Redacted<string>;
  readonly source: {
    readonly type: RailwayAuthConfig["method"];
    readonly details?: string;
  };
}

const options: ReadonlyArray<{
  readonly value: RailwayAuthConfig["method"];
  readonly label: string;
  readonly hint?: string;
}> = [
  {
    value: "env",
    label: "Environment Variable",
    hint: "RAILWAY_API_TOKEN",
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
    ) {
      const token = yield* Clank.password({
        message: "Railway API Token",
        validate: (value) => (value.length === 0 ? "Required" : undefined),
      }).pipe(retryOnce);

      yield* store.write<RailwayStoredCredentials>(
        profileName,
        "railway-stored",
        {
          type: "token",
          token,
        },
      );
      yield* Clank.success("Railway: credentials saved.");
      return { method: "stored" as const };
    });

    const configureInteractive = (profileName: string) =>
      Clank.select({
        message: "Railway authentication method",
        options: [...options],
      }).pipe(
        Effect.flatMap((method) =>
          Match.value(method).pipe(
            Match.when("env", () =>
              Effect.succeed({ method: "env" as const })
            ),
            Match.when("stored", () => loginStored(profileName)),
            Match.exhaustive,
          ),
        ),
      );

    const configure = (profileName: string, context: ConfigureContext) =>
      (context.ci
        ? Effect.succeed({ method: "env" as const })
        : configureInteractive(profileName)
      ).pipe(
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
            const token = yield* getEnvRedacted("RAILWAY_API_TOKEN");
            if (!token) {
              return yield* new AuthError({
                message:
                  "Railway environment credentials were not found. Set RAILWAY_API_TOKEN.",
              });
            }
            return {
              type: "token" as const,
              token,
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
          getEnvRedacted("RAILWAY_API_TOKEN").pipe(
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
                credentials ? Effect.void : loginStored(profileName),
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
