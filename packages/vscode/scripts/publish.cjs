const packageJson = require("../package.json");
const semver = require("semver");

const minor = semver.minor(packageJson.version);
const prerelease = semver.prerelease(packageJson.version);

if (minor % 2 === 0 && !prerelease) {
  console.warn("Even minor version, release as stable channel");
  console.log("publish");
} else {
  console.warn(
    prerelease
      ? "Pre-release suffix detected, release as prerelease channel"
      : "Odd minor version, release as prerelease channel",
  );
  console.log("publish-prerelease");
}
