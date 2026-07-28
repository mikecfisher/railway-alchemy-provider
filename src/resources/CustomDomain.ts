import { Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  type CustomDomainScope,
  type CustomDomainSnapshot,
  RailwayClient,
} from "../client/RailwayClient.js";
import { RailwayAmbiguousMatch } from "../Errors.js";
import type { Providers } from "../Providers.js";
import type { ServiceAttributes } from "./Service.js";

const CustomDomainPropsSchema = Schema.Struct({
  service: Schema.Struct({
    projectId: Schema.NonEmptyString,
    environmentId: Schema.NonEmptyString,
    serviceId: Schema.NonEmptyString,
  }),
  domain: Schema.NonEmptyString,
  targetPort: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThan(0)),
  ),
});

export interface CustomDomainProps
  extends Schema.Schema.Type<typeof CustomDomainPropsSchema> {
  readonly service: Pick<
    ServiceAttributes,
    "projectId" | "environmentId" | "serviceId"
  >;
}

export interface CustomDomainAttributes {
  readonly domainId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId: string;
  readonly domain: string;
  readonly targetPort?: number;
  readonly verified?: boolean;
  readonly certificateStatus?: string;
  readonly syncStatus?: string;
}

export type CustomDomain = Resource<
  "Railway.CustomDomain",
  CustomDomainProps,
  CustomDomainAttributes,
  never,
  Providers
>;

export const CustomDomain = Resource<CustomDomain>("Railway.CustomDomain");

const decodeProps = Schema.decodeUnknownEffect(CustomDomainPropsSchema);

const attributesOf = (
  domain: CustomDomainSnapshot,
): CustomDomainAttributes => ({ ...domain });

const findByDomain = Effect.fn("Railway.CustomDomain.findByDomain")(
  function* (props: CustomDomainProps) {
    const client = yield* RailwayClient;
    const domains = yield* client.listCustomDomains(props.service);
    const matches = domains.filter(
      (domain) => domain.domain === props.domain,
    );
    if (matches.length > 1) {
      return yield* new RailwayAmbiguousMatch({
        resource: "custom domain",
        selector: props.domain,
        matches: matches.length,
        message:
          `Railway returned ${matches.length} custom domains named ` +
          `'${props.domain}'; refusing an ambiguous adoption`,
      });
    }
    return matches[0];
  },
);

export const CustomDomainProvider = Provider.succeed(CustomDomain, {
  stables: [
    "domainId",
    "projectId",
    "environmentId",
    "serviceId",
    "domain",
  ],
  list: () => Effect.succeed([]),
  read: Effect.fn("Railway.CustomDomain.read")(function* ({
    olds,
    output,
  }) {
    const props = yield* decodeProps(olds);
    const client = yield* RailwayClient;
    const domains = yield* client.listCustomDomains(props.service);
    if (output?.domainId) {
      const domain = domains.find(
        (candidate) => candidate.domainId === output.domainId,
      );
      return domain ? attributesOf(domain) : undefined;
    }
    const existing = yield* findByDomain(props);
    return existing ? Unowned(attributesOf(existing)) : undefined;
  }),
  diff: Effect.fn("Railway.CustomDomain.diff")(function* ({
    olds,
    news,
    output,
  }) {
    if (!isResolved(news)) return undefined;
    const props = yield* decodeProps(news);
    if (
      olds.service.projectId !== props.service.projectId ||
      olds.service.environmentId !== props.service.environmentId ||
      olds.service.serviceId !== props.service.serviceId ||
      olds.domain !== props.domain
    ) {
      return { action: "replace" } as const;
    }
    if (!output?.domainId) return { action: "update" } as const;
    const client = yield* RailwayClient;
    const live = (yield* client.listCustomDomains(props.service)).find(
      (domain) => domain.domainId === output.domainId,
    );
    return live && live.targetPort === props.targetPort
      ? ({ action: "noop" } as const)
      : ({ action: "update" } as const);
  }),
  reconcile: Effect.fn("Railway.CustomDomain.reconcile")(function* ({
    news,
    output,
  }) {
    const props = yield* decodeProps(news);
    const client = yield* RailwayClient;
    let live = output?.domainId
      ? (yield* client.listCustomDomains(props.service)).find(
          (domain) => domain.domainId === output.domainId,
        )
      : undefined;
    if (!live) {
      live = yield* client.createCustomDomain({
        ...props.service,
        domain: props.domain,
        ...(props.targetPort === undefined
          ? {}
          : { targetPort: props.targetPort }),
      });
    } else if (live.targetPort !== props.targetPort) {
      live = yield* client.updateCustomDomain(
        props.service,
        live.domainId,
        props.targetPort,
      );
    }
    return attributesOf(live);
  }),
  delete: Effect.fn("Railway.CustomDomain.delete")(function* ({ output }) {
    const client = yield* RailwayClient;
    const scope: CustomDomainScope = {
      projectId: output.projectId,
      environmentId: output.environmentId,
      serviceId: output.serviceId,
    };
    yield* client
      .deleteCustomDomain(scope, output.domainId)
      .pipe(Effect.catchTag("RailwayNotFound", () => Effect.void));
  }),
});
