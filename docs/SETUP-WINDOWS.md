# 메인 노트북(Windows) 허브 세팅 — 이어하기 문서

이 문서는 **노트북에서 Claude Code 를 실행해 이어서 진행하기 위한 인수인계 문서**입니다.
노트북 터미널(PowerShell)에서 `claude` 를 실행한 뒤 이렇게 말하면 됩니다:

> `docs/SETUP-WINDOWS.md` 읽고 그대로 진행해줘. 각 단계 끝나면 확인 결과 알려줘.

사람이 직접 따라 해도 됩니다. 명령은 전부 **PowerShell** 기준입니다.

---

## 0. 지금까지의 상황 (컨텍스트)

- 저장소: `https://github.com/jisu0630/jisu` — **작업 브랜치 `claude/local-pc-recent-files-search-g2sjnf`** (main 에 아직 병합 안 됨)
- 이 브랜치에 추가된 것:
  - `docs/MANUAL.md` + `docs/img/*.svg` — 그림 포함 상세 매뉴얼
  - `scripts/tunnel.js` (`npm run tunnel`) — 허브를 HTTPS 로 공개해 폰·외부에서 접속 (cloudflared 또는 Tailscale Funnel)
  - `scripts/install-windows.ps1` — Windows 작업 스케줄러에 허브/에이전트 자동 시작 등록 (**리눅스 컨테이너에서 작성되어 실제 Windows 실행 검증은 안 됨** → 에러 나면 고쳐서 커밋)
- 확인된 환경: Windows 노트북, Node.js 와 Claude Code CLI 설치됨, 외부 접속은 **Tailscale** 로 하기로 결정
- 목표: **이 노트북이 허브(사령탑)** 가 되고, 폰/외부에서 고정 주소로 대시보드를 계속 볼 수 있게 한다. 이후 병원 PC 를 에이전트로 붙인다.

---

## 1. 저장소 받기 + 의존성 설치

```powershell
cd $HOME
git clone -b claude/local-pc-recent-files-search-g2sjnf https://github.com/jisu0630/jisu.git claude-fleet
cd claude-fleet
npm install
```

확인:
```powershell
node -v          # v18 이상
git branch       # * claude/local-pc-recent-files-search-g2sjnf
Test-Path scripts\tunnel.js, scripts\install-windows.ps1   # True True
```

> `git` 이 없다고 나오면: `winget install Git.Git` 후 PowerShell 을 새로 열고 다시.

---

## 2. 허브 설정 (토큰 생성)

```powershell
npm run setup
```

- 역할 질문에 **`1` (허브 서버)** 입력
- 포트는 Enter (기본 8787)
- 토큰이 자동 생성되어 `.fleet-token` 에 저장되고, 이 머신의 IP 와 접속 토큰이 출력됨

확인:
```powershell
Test-Path .fleet-token        # True
(Get-Content .fleet-token).Length -ge 16   # True
```

⚠ **토큰 값을 채팅·문서·커밋에 붙여넣지 말 것.** `.fleet-token` 은 `.gitignore` 처리되어 있음.

---

## 3. 허브를 항상 켜두기 (작업 스케줄러 등록 + 즉시 시작)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```

기대 출력: `등록 완료: ClaudeFleetHub  (로그: logs\hub.log)`

확인:
```powershell
Get-ScheduledTask -TaskName 'ClaudeFleet*' | Get-ScheduledTaskInfo   # LastTaskResult 0 또는 267009(실행 중)
Start-Sleep 3
Get-Content logs\hub.log -Tail 5      # "claude-fleet 허브 실행 중: http://localhost:8787" 이 보여야 함
Invoke-WebRequest http://localhost:8787 -UseBasicParsing | Select-Object StatusCode   # 200
```

브라우저 확인:
```powershell
start http://localhost:8787
```
토큰 입력창이 뜨고, `.fleet-token` 값을 넣으면 "허브 연결됨" 이 보이면 성공. (아직 에이전트가 없어 PC 목록은 비어 있음 — 정상)

**스크립트가 에러를 내면**: 에러 메시지를 읽고 `scripts/install-windows.ps1` 을 고친 뒤, 임시 대안으로 아래처럼 수동 실행해 두고 진행:
```powershell
Start-Process node -ArgumentList 'server\server.js' -WindowStyle Hidden -RedirectStandardOutput logs\hub.log -RedirectStandardError logs\hub.err
```

전원 설정: 설정 → 시스템 → 전원 → **"전원 연결 시 절전 모드: 안 함"** (노트북이 자면 허브도 멈춤)

---

## 4. 폰·외부에서 계속 볼 고정 주소 (Tailscale Funnel)

1. Tailscale 설치·로그인 (아직 안 했으면):
   ```powershell
   winget install tailscale.tailscale
   ```
   설치 후 트레이 아이콘에서 로그인 (구글/MS 계정, 무료). PowerShell 새로 열고:
   ```powershell
   tailscale status      # 로그인된 기기 목록이 보여야 함
   tailscale ip -4       # 100.x.x.x  ← 이 노트북의 Tailscale IP
   ```
2. Funnel 켜기:
   ```powershell
   npm run tunnel -- --tailscale
   ```
   기대 출력:
   ```
   ✅ 외부 접속 주소 (Tailscale Funnel · 백그라운드 유지)
      대시보드:  https://<노트북이름>.<tailnet>.ts.net
   ```
   **이 https 주소가 앞으로 계속 쓸 고정 링크.** 한 번 켜면 재부팅 후에도 유지됨.

3. `Funnel 활성화 실패` 가 나오면:
   - https://login.tailscale.com/admin/acls 에서 ACL 에 아래를 추가(또는 기본 정책에 funnel 속성 포함되는지 확인):
     ```json
     "nodeAttrs": [{ "target": ["autogroup:member"], "attr": ["funnel"] }]
     ```
   - 그리고 다시 `npm run tunnel -- --tailscale`
   - 그래도 안 되면 `tailscale funnel 8787` 을 직접 실행해 메시지 확인 (HTTPS 인증서 활성화 안내가 나오면 관리 콘솔 DNS 탭에서 **HTTPS Certificates** 를 Enable)

4. 폰에서 확인: 폰 브라우저로 위 https 주소 열기 → 토큰 입력 → 대시보드 표시.
   Safari/Chrome 메뉴 → **"홈 화면에 추가"** 하면 앱처럼 쓸 수 있음.

> Funnel 없이도 됨: 폰에 Tailscale 앱을 깔고 같은 계정으로 로그인하면 `http://<Tailscale IP>:8787` 로 사설망 접속 가능 (인터넷 노출 없음, 더 안전).

---

## 5. 이 노트북을 사령탑으로 쓰기

허브가 도는 이 노트북에서 저장소 폴더로 Claude Code 를 실행하면 `CLAUDE.md` 에 따라 사령탑이 됨:

```powershell
cd $HOME\claude-fleet
claude
```

확인 질문: "지금 fleet 현황 보여줘" → `/api/fleet` 결과가 나오면 정상.

밖에서도 사령탑과 대화하려면 같은 세션에서 `/remote-control` 실행 → claude.ai / 모바일 앱 세션 목록에 나타남.

---

## 6. 병원 PC 붙이기 (에이전트)

병원 PC 에서 (Node.js + Claude Code 설치·로그인 필요):

```powershell
cd $HOME
git clone -b claude/local-pc-recent-files-search-g2sjnf https://github.com/jisu0630/jisu.git claude-fleet
cd claude-fleet
npm install
npm run setup        # 역할: 2 (에이전트)
```

- 허브 주소: 노트북의 **Tailscale IP** (`ws://100.x.x.x:8787`) 또는 Funnel 주소 (`wss://<노트북이름>.<tailnet>.ts.net`)
  - Tailscale IP 를 쓰려면 병원 PC 에도 Tailscale 설치·로그인
- 토큰: 노트북 `.fleet-token` 값 (연결·검증 자동 수행, "성공 ✓" 확인)
- PC 이름: `hospital-pc` 처럼 알아보기 쉬운 이름
- 프로젝트 경로: 작업시킬 폴더(들)
- 권한 모드: 기본 `acceptEdits` (파일 편집만 자동 허용). Bash 명령까지 자동 허용하려면 `bypassPermissions` — 신뢰 환경에서만

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1   # ClaudeFleetAgent 등록
```

확인: 노트북 대시보드(또는 폰)에 `hospital-pc` 카드가 **온라인** 으로 뜨면 성공. 그 카드에서 [새 세션] → 예) "최근 24시간 내 새로 생기거나 수정된 파일을 최근 순으로 찾아줘".

---

## 7. 마무리 (선택)

- 잘 되면 이 브랜치를 main 에 PR/병합: 노트북 사령탑 세션에서 "이 브랜치 PR 만들어줘" 라고 하면 됨
- `install-windows.ps1` 을 고쳤다면 커밋·푸시:
  ```powershell
  git add scripts\install-windows.ps1
  git commit -m "Windows 설치 스크립트 수정: <무엇을 고쳤는지>"
  git push -u origin claude/local-pc-recent-files-search-g2sjnf
  ```

---

## 자주 겪는 문제

| 증상 | 조치 |
|---|---|
| `npm run setup` 에서 한글이 깨짐 | PowerShell 에서 `chcp 65001` 후 다시 실행 |
| 스크립트 실행이 막힘 ("이 시스템에서 스크립트를 실행할 수 없으므로") | 위처럼 `powershell -ExecutionPolicy Bypass -File ...` 로 실행 |
| `localhost:8787` 이 안 열림 | `Get-Content logs\hub.log -Tail 20` 로 에러 확인. `토큰이 없습니다` 면 2단계부터 다시 |
| 포트 8787 이미 사용 중 | `netstat -ano \| findstr :8787` 로 PID 확인 후 종료하거나, `.fleet-token` 옆에 `PORT` 바꿔 실행 (스케줄러 작업의 인수에 `$env:PORT` 추가 필요) |
| 폰에서 https 주소가 안 열림 | 노트북에서 `tailscale funnel status` 확인. `tailscale serve reset` 후 다시 `npm run tunnel -- --tailscale` |
| 대시보드에 PC 가 안 뜸 | 병원 PC 의 `logs\agent.log` 확인 — 허브 주소/토큰 오류 메시지 참고 |
| Windows 방화벽 경고 | 같은 망(폰)에서 접속하려면 node.exe 의 사설 네트워크 허용. Tailscale 만 쓰면 불필요 |
