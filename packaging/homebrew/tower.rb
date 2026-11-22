# Homebrew cask for Tower. Updated automatically by `.github/workflows/release.yml`
# into `beautifulrem/homebrew-tower` (`Casks/tower.rb`) on each tagged release.
cask "tower" do
  version "0.1.0"
  sha256 "REPLACE_WITH_SHA256_OF_THE_DMG"

  url "https://github.com/beautifulrem/tower/releases/download/v#{version}/Tower_#{version}_universal.dmg"
  name "Tower"
  desc "Goal-centric supervision desk for coding agents with independent verification"
  homepage "https://github.com/beautifulrem/tower"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :ventura"

  app "Tower.app"

  zap trash: [
    "~/.tower",
    "~/Library/Application Support/dev.tower.desktop",
    "~/Library/Caches/dev.tower.desktop",
    "~/Library/Preferences/dev.tower.desktop.plist",
    "~/Library/WebKit/dev.tower.desktop",
  ]

  caveats <<~EOS
    Tower supervises coding agents inside OS sandboxes with independent verification.
    Install an agent engine (or start with the built-in demo goal from the Welcome screen):
      npm i -g @earendil-works/pi-coding-agent
    Supported engines: Pi, Claude Code, Codex CLI, Gemini CLI, OpenCode.
  EOS
end
