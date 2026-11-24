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
   | `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`, `APPLE_TEAM_ID` | An App Store Connect API key for notarization. The workflow passes these through as they are; it does not write a key file on the runner, and it does not pass `APPLE_ID` / `APPLE_PASSWORD`. Confirm notarization on the first signed release (see below) |
   | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The update-signing key pair's private half (`pnpm tauri signer generate`) |
   | `TOWER_UPDATER_PUBKEY` | Its public half. It is compiled into the app (`src-tauri/src/updater.rs`); the workflow also writes it into the generated `tauri.updater.json` |
   | `HOMEBREW_TAP_TOKEN` | Optional: a token that may push to the tap repository |

   Without the Apple secrets the release is unsigned and its notes say so. Without both update-signing secrets the app never checks for updates.
3. **Homebrew tap** (optional): a repository `homebrew-tower` with `Casks/tower.rb` from `packaging/homebrew/tower.rb`. With `HOMEBREW_TAP_TOKEN` set, the workflow's `homebrew-cask` job bumps it.

## Each release

1. Move the `[Unreleased]` section of `CHANGELOG.md` under a new `## [x.y.z] — YYYY-MM-DD` heading; bump `version` in `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/package.json` and the workspace `Cargo.toml`.
2. `pnpm check` must pass locally; CI must be green on `main`.
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. When the workflow finishes, open the draft release, check the notes and the `.dmg` (install it on a clean account: it should open without a Gatekeeper warning when signed), then publish.
5. The cask: with `HOMEBREW_TAP_TOKEN` the workflow sets `version` and `sha256` itself. It does so while the release is still a draft, so the cask's download link works only once you publish. Without the token, set them by hand (`shasum -a 256 Tower_X.Y.Z_universal.dmg`).

## Known gaps in the release workflow

These need a change to `.github/workflows/release.yml` or the repository settings:

- **Notarization.** It is unproven: no release has been signed yet. On the first one, check `xcrun stapler validate` and `spctl -a -vv` on the `.dmg`'s app.
- **The cask.** It is bumped while the release is a draft, and for unsigned builds too.
- **Versions.** Nothing checks that the tag matches the version in `tauri.conf.json`, `Cargo.toml` and `package.json`.
- **Tags.** Any tag can start a release: no ruleset limits tags to commits on `main` that passed CI.
- **Actions.** They are referenced by major tag rather than pinned to a commit SHA.
