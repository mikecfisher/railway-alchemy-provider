import { AuthError, getAuthProvider } from "alchemy/Auth/AuthProvider";
import { ALCHEMY_PROFILE, AlchemyProfile } from "alchemy/Auth/Profile";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import {
  RAILWAY_AUTH_PROVIDER_NAME,
  RailwayAuthConfig,
  type RailwayResolvedCredentials,
} from "./RailwayAuth.js";

export interface RailwayCredentialsService {
  readonly resolve: Effect.Effect<RailwayResolvedCredentials, AuthError>;
}

export class RailwayCredentials extends Context.Service<
  RailwayCredentials,
  RailwayCredentialsService
>()("railway-alchemy-provider/auth/RailwayCredentials") {}

export const RailwayCredentialsFromAuthProvider =
  Layer.effect(
    RailwayCredentials,
    Effect.gen(function* () {
      const profile = yield* AlchemyProfile;
      const auth = yield* getAuthProvider<
        RailwayAuthConfig,
        RailwayResolvedCredentials
      >(RAILWAY_AUTH_PROVIDER_NAME);
      const profileName = yield* ALCHEMY_PROFILE;
      const ci = yield* Config.boolean("CI").pipe(Config.withDefault(false));

      const resolve = yield* profile
        .loadOrConfigure(auth, profileName, { ci })
        .pipe(
          Effect.flatMap((config) =>
            Schema.decodeUnknownEffect(RailwayAuthConfig)(config).pipe(
              Effect.mapError(
                (cause) =>
                  new AuthError({
                    message:
                      `Invalid Railway authentication configuration for profile '${profileName}'`,
                    cause,
                  }),
              ),
              Effect.flatMap((decoded) => auth.read(profileName, decoded)),
            ),
          ),
          Effect.mapError(
            (cause) =>
              new AuthError({
                message:
                  `Failed to resolve Railway credentials for profile '${profileName}'`,
                cause,
              }),
          ),
          Effect.cached,
        );
      return RailwayCredentials.of({ resolve });
    }),
  );
