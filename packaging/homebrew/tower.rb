# Homebrew cask for Tower. Copy into a tap (e.g. beautifulrem/homebrew-tower,
# Casks/tower.rb) after each release; RELEASING.md lists the steps.
cask "tower" do
  version "0.1.0"
  sha256 "REPLACE_WITH_SHA256_OF_THE_DMG"

  url "https://github.com/beautifulrem/tower/releases/download/v#{version}/Tower_#{version}_universal.dmg"
  name "Tower"
  desc "Goal-centric supervision desk for coding agents"
  homepage "https://github.com/beautifulrem/tower"

  depends_on macos: ">= :ventura"

  app "Tower.app"

  zap trash: [
    "~/.tower",
    "~/Library/Caches/dev.tower.desktop",
    "~/Library/WebKit/dev.tower.desktop",
  ]

  caveats <<~EOS
    Tower drives the Pi coding agent:
      npm i -g @earendil-works/pi-coding-agent
    Or try a demo goal from the welcome screen without it.
  EOS
end
