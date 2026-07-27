interface PackageManifest {
  readonly version?: unknown;
  readonly peerDependencies?: Readonly<Record<string, unknown>>;
}

const root = await Bun.file(
  new URL("../package.json", import.meta.url),
).json() as PackageManifest;
const vendored = await Bun.file(
  new URL(
    "../repos/effect/packages/effect/package.json",
    import.meta.url,
  ),
).json() as PackageManifest;

const expected = root.peerDependencies?.["effect"];
if (typeof expected !== "string" || expected.length === 0) {
  console.error("package.json must declare an exact Effect peer dependency");
  process.exit(1);
}

if (vendored.version !== expected) {
  console.error(
    `Vendored Effect version ${String(vendored.version)} does not match ${expected}`,
  );
  process.exit(1);
}

console.log(`Vendored Effect ${expected} matches the package peer dependency`);
