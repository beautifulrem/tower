# Releasing Tower

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed. The workflow always produces a draft GitHub release with a universal (Apple silicon + Intel) `.dmg`; whether the build is signed and notarized depends on the repository secrets below.

## One-time setup (maintainer)

1. **Apple Developer ID.** A paid Apple Developer account with a *Developer ID Application* certificate.
2. **Repository secrets** (Settings → Secrets and variables → Actions):

   | Secret | What it is |
   |---|---|
   | `APPLE_CERTIFICATE` | The Developer ID certificate and key exported as `.p12`, base64-encoded |
   | `APPLE_CERTIFICATE_PASSWORD` | The `.p12` export password |
   | `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
   | `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH` | An App Store Connect API key for notarization (or use `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`) |

   Without them the release is unsigned and its notes say so.
3. **Homebrew tap** (optional): a repository `homebrew-tower` with `Casks/tower.rb` from `packaging/homebrew/tower.rb`.

## Each release

1. Move the `[Unreleased]` section of `CHANGELOG.md` under a new `## [x.y.z] — YYYY-MM-DD` heading; bump `version` in `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/package.json` and the workspace `Cargo.toml`.
2. `pnpm check` must pass locally; CI must be green on `main`.
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. When the workflow finishes, open the draft release, check the notes and the `.dmg` (install it on a clean account: it should open without a Gatekeeper warning when signed), then publish.
5. Update the cask: set `version`, and `sha256` to `shasum -a 256 Tower_X.Y.Z_universal.dmg`.

## Not yet in place

- **Automatic updates.** The Tauri updater needs an update-signing key pair (`pnpm tauri signer generate`); the public key goes into `tauri.conf.json`, the private key into the `TAURI_SIGNING_PRIVATE_KEY` secret, and the workflow then publishes `latest.json`. Until then, updates are manual (or via the cask).
