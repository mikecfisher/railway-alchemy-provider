import { expect, test } from "bun:test";

const verifyRelease = async (tag: string) => {
  const process = Bun.spawn(
    ["bun", "run", "./scripts/verify-release.ts", tag],
    {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
};

test("release verification accepts the package version tag", async () => {
  const result = await verifyRelease("v0.2.0");

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "Release tag v0.2.0 matches package version 0.2.0",
  );
});

test("release verification rejects a mismatched tag", async () => {
  const result = await verifyRelease("v0.1.0");

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain(
    "Release tag v0.1.0 does not match package version 0.2.0",
  );
});
