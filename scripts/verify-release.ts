interface PackageManifest {
  readonly version?: unknown;
}

const manifest = await Bun.file(
  new URL("../package.json", import.meta.url),
).json() as PackageManifest;

if (typeof manifest.version !== "string" || manifest.version.length === 0) {
  console.error("package.json must contain a non-empty string version");
  process.exit(1);
}

const tag = Bun.argv[2] ?? Bun.env["GITHUB_REF_NAME"];
if (!tag) {
  console.error("A release tag is required");
  process.exit(1);
}

const expectedTag = `v${manifest.version}`;
if (tag !== expectedTag) {
  console.error(
    `Release tag ${tag} does not match package version ${manifest.version}`,
  );
  process.exit(1);
}

console.log(
  `Release tag ${tag} matches package version ${manifest.version}`,
);
