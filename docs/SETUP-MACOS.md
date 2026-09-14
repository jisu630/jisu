# 맥미니(macOS) 허브 세팅 — 이어하기 문서

이 문서는 **맥미니에서 Claude Code 를 실행해 허브(사령탑)를 세팅하기 위한 인수인계 문서**입니다.
맥미니 터미널에서 `claude` 를 실행한 뒤 이렇게 말하면 됩니다:

> `docs/SETUP-MACOS.md` 읽고 그대로 진행해줘. 각 단계 끝나면 확인 결과 알려줘.

사람이 직접 따라 해도 됩니다. 명령은 전부 **macOS 터미널(zsh)** 기준입니다.

---

## 0. 지금까지의 상황 (컨텍스트)

- 역할 결정(2026-09-14): **허브 = 맥미니(항상 켜둠)**, **에이전트 = 노트북(Windows) + 병원 PC**.
  노트북은 허브가 아니므로 노트북에 있던 허브·Funnel 은 이미 내렸다.
- 저장소: `https://github.com/jisu630/jisu` (jisu0630/jisu 의 포크) — **작업 브랜치 `claude/local-pc-recent-files-search-g2sjnf`**
  - 이 브랜치에 있는 것: `docs/MANUAL.md`, `scripts/tunnel.js`(HTTPS 공개), `scripts/install-macos.sh`(launchd 자동 시작),
    `scripts/install-windows.ps1`(노트북에서 실검증·수정 완료), `docs/SETUP-WINDOWS.md`(노트북용), 이 문서.
- 토큰: **노트북에서 쓰던 `.fleet-token` 을 그대로 재사용**한다(새로 만들지 않음). 값은 Google Drive
  `내 드라이브/claude-fleet/fleet-token.txt` 에 있다. 재사용해야 노트북 에이전트 설정을 다시 안 해도 된다.
- 외부(폰) 접속은 **Tailscale Funnel** 로 한다. 노트북은 이미 Tailscale 에 `jisu@` 계정으로 로그인돼 있으니
  맥미니도 **같은 계정**으로 로그인하면 사설망(100.x.x.x)으로 서로 보인다.
- 목표: 맥미니가 허브가 되고, 폰/외부에서 고정 https 주소로 대시보드를 본다. 그 다음 노트북·병원 PC 를 에이전트로 붙인다.

---

## 1. 준비물 확인

```bash
node -v      # v18 이상. 없으면: brew install node  (brew 없으면 https://nodejs.org 에서 설치)
git --version
claude --version   # Claude Code CLI. 없으면: npm install -g @anthropic-ai/claude-code && claude (로그인)
```

---

## 2. 저장소 받기 + 의존성 설치

```bash
cd ~
git clone -b claude/local-pc-recent-files-search-g2sjnf https://github.com/jisu630/jisu.git claude-fleet
cd claude-fleet
npm install
```

확인:
```bash
git branch              # * claude/local-pc-recent-files-search-g2sjnf
ls scripts/tunnel.js scripts/install-macos.sh   # 둘 다 있어야 함
```

> 이미 `~/claude-fleet` 가 있으면(9/3 에 받아둔 경우) clone 대신:
> `cd ~/claude-fleet && git fetch origin && git checkout claude/local-pc-recent-files-search-g2sjnf && npm install`
> (origin 이 jisu0630 이면 `git remote set-url origin https://github.com/jisu630/jisu.git` 먼저)

---

## 3. 토큰 넣기 (노트북 토큰 재사용)

Google Drive 의 `내 드라이브/claude-fleet/fleet-token.txt` 를 받아 저장소 루트에 `.fleet-token` 으로 둔다.

```bash
# Google Drive 데스크톱 앱이 있으면 (경로는 환경에 따라 다름):
cp ~/Library/CloudStorage/GoogleDrive-*/내\ 드라이브/claude-fleet/fleet-token.txt ~/claude-fleet/.fleet-token
# 앱이 없으면 drive.google.com 에서 파일을 내려받아 위 경로로 옮긴다.
chmod 600 ~/claude-fleet/.fleet-token
```

확인:
```bash
test -f .fleet-token && [ "$(tr -d '\n' < .fleet-token | wc -c)" -eq 48 ] && echo OK
```

⚠ **토큰 값을 채팅·문서·커밋에 붙여넣지 말 것.** `.fleet-token` 은 `.gitignore` 처리되어 있음.
(토큰을 못 받는 상황이면 4단계 `npm run setup` 이 새 토큰을 만든다 — 그 경우 노트북 에이전트 설정을 새 토큰으로 바꿔야 한다.)

---

## 4. 허브 설정

```bash
npm run setup
```

- 역할 질문에 **`1` (허브 서버)** 입력 → "기존 토큰(.fleet-token)을 재사용합니다" 가 나와야 함
- 포트는 Enter (기본 8787)

---

## 5. 허브를 항상 켜두기 (launchd 등록 + 즉시 시작)

```bash
bash scripts/install-macos.sh
```

기대 출력: `등록 완료: com.claude-fleet.hub  (로그: logs/com.claude-fleet.hub.log)`

확인:
```bash
launchctl list | grep claude-fleet          # com.claude-fleet.hub 가 보이고 PID 가 있어야 함
sleep 3; tail -n 5 logs/com.claude-fleet.hub.log   # "claude-fleet 허브 실행 중: http://localhost:8787"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8787    # 200
curl -s http://localhost:8787/healthz       # {"ok":true,"pcs":0,...}  (아직 에이전트 없음 — 정상)
```

브라우저: `open http://localhost:8787` → 토큰 입력 → "허브 연결됨".

**잠자기 방지(필수)** — 맥미니가 자면 허브가 멈춘다:
```bash
sudo pmset -a sleep 0 disksleep 0
pmset -g | grep -E '^\s*(sleep|disksleep)'   # 둘 다 0
```
(디스플레이는 꺼져도 됨. 시스템 설정 → 에너지 → "디스플레이가 꺼져 있을 때 자동으로 잠자기 방지" 도 켜두면 안전.)

---

## 6. 폰·외부에서 계속 볼 고정 주소 (Tailscale Funnel)

1. Tailscale 설치·로그인 — **노트북과 같은 계정(jisu@)** 으로:
   ```bash
   brew install --cask tailscale     # 또는 App Store 에서 Tailscale 설치
   open -a Tailscale                 # 메뉴막대 아이콘 → Log in
   ```
   확인 (CLI 경로는 앱 설치 방식에 따라 다름 — 둘 중 되는 것 사용):
   ```bash
   tailscale status || /Applications/Tailscale.app/Contents/MacOS/Tailscale status
   # 목록에 book-e3lhdj2h53 (노트북, 100.126.85.50) 이 같이 보이면 같은 tailnet 에 들어온 것
   tailscale ip -4      # 100.x.x.x  ← 맥미니의 Tailscale IP (노트북·병원 PC 가 이 주소로 붙는다)
   ```
   `tailscale` 명령이 없으면 `scripts/tunnel.js` 가 못 찾으므로 alias 를 만든다:
   ```bash
   sudo ln -sf /Applications/Tailscale.app/Contents/MacOS/Tailscale /usr/local/bin/tailscale
   ```
2. Funnel 켜기:
   ```bash
   npm run tunnel -- --tailscale
   ```
   기대 출력:
   ```
   ✅ 외부 접속 주소 (Tailscale Funnel · 백그라운드 유지)
      대시보드:  https://<맥미니이름>.tail407aad.ts.net
   ```
   **이 https 주소가 앞으로 계속 쓸 고정 링크**(재부팅 후에도 유지).
3. `Funnel 활성화 실패` 가 나오면 https://login.tailscale.com/admin/acls 에서 ACL 에
   `"nodeAttrs": [{ "target": ["autogroup:member"], "attr": ["funnel"] }]` 를 추가하고 다시 실행.
   (노트북에서는 기본 정책으로 바로 됐으므로 보통 필요 없음.)
4. 확인:
   ```bash
   tailscale funnel status
   curl -s -o /dev/null -w '%{http_code}\n' https://<맥미니이름>.tail407aad.ts.net/   # 200 (첫 응답은 10초쯤 걸릴 수 있음)
   ```
   폰 브라우저로 위 주소 열기 → 토큰 입력 → 대시보드. Safari 메뉴 → **"홈 화면에 추가"**.

---

## 7. 노트북·병원 PC 를 에이전트로 붙이기

### 노트북(Windows)
노트북 저장소(`C:\Users\anjis\claude-fleet`)에는 이미 `fleet-agent.config.json`(pcName `laptop`, 토큰 동일)이 있고
허브 주소만 `ws://localhost:8787` → 맥미니 주소로 바꾸면 된다. **노트북에서 Claude 에게 이렇게 말하면 된다:**

> 맥미니 허브 준비됨. Tailscale IP 는 100.x.x.x (Funnel 주소는 https://…ts.net). 노트북 에이전트 붙여줘.

(수동으로 하려면: `fleet-agent.config.json` 의 `"hub"` 를 `ws://100.x.x.x:8787` 로 바꾸고
`powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1` — 에이전트만 등록된다. 노트북에는 `.fleet-token` 이 있으므로
허브까지 같이 등록되지 않게 **노트북의 `.fleet-token` 은 지우거나 이름을 바꿔둘 것**.)

### 병원 PC(Windows)
```powershell
cd $HOME
git clone -b claude/local-pc-recent-files-search-g2sjnf https://github.com/jisu630/jisu.git claude-fleet
cd claude-fleet
npm install
npm run setup        # 역할: 2 (에이전트)
```
- 허브 주소: `ws://<맥미니 Tailscale IP>:8787` (병원 PC 에도 Tailscale 설치·같은 계정 로그인)
  또는 Tailscale 없이 `wss://<맥미니이름>.tail407aad.ts.net` (Funnel 경유)
- 토큰: `.fleet-token` 값 → "성공 ✓" 확인
- PC 이름: `hospital-pc`, 프로젝트 경로: 작업시킬 폴더, 권한 모드: 기본 `acceptEdits`
```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1   # ClaudeFleetAgent 등록
```
확인: 맥미니 대시보드(또는 폰)에 `laptop`, `hospital-pc` 카드가 **온라인**으로 뜨면 성공.

---

## 8. 맥미니를 사령탑으로 쓰기

```bash
cd ~/claude-fleet
claude
```
확인 질문: "지금 fleet 현황 보여줘" → `/api/fleet` 결과에 laptop 등이 나오면 정상.
밖에서도 사령탑과 대화하려면 같은 세션에서 `/remote-control`.

---

## 9. 마무리 (선택)

- 잘 되면 PR: 포크 `jisu630/jisu` 브랜치 → 원본 `jisu0630/jisu` `main`. (원본 푸시 권한은 jisu0630 계정에만 있음)
- `install-macos.sh` 를 고쳤다면:
  ```bash
  git add scripts/install-macos.sh
  git commit -m "macOS 설치 스크립트 수정: <무엇을 고쳤는지>"
  git push origin claude/local-pc-recent-files-search-g2sjnf
  ```

---

## 자주 겪는 문제

| 증상 | 조치 |
|---|---|
| `launchctl bootstrap` 이 "Input/output error" | 이미 등록됨. `bash scripts/install-macos.sh uninstall` 후 다시 |
| `localhost:8787` 이 안 열림 | `tail -n 20 logs/com.claude-fleet.hub.log`. `토큰이 없습니다` 면 3단계부터 |
| 포트 8787 이미 사용 중 | `lsof -i :8787` 로 PID 확인 후 `kill` |
| `tailscale: command not found` | 6단계의 `ln -sf` 로 CLI 링크 |
| 폰에서 https 주소가 안 열림 | `tailscale funnel status` 확인. `tailscale serve reset` 후 `npm run tunnel -- --tailscale` |
| 대시보드에 PC 가 안 뜸 | 그 PC 의 `logs/agent.log`(Windows: `logs\agent.log`) — 허브 주소/토큰 오류 확인. 두 머신 모두 `tailscale status` 에 서로 보이는지 |
| 맥미니가 자서 끊김 | `pmset -g` 의 sleep 이 0 인지. 노트북 뚜껑 닫힘 등은 해당 없음(허브는 맥미니) |
