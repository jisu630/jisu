#!/usr/bin/env node
// 외부(폰·다른 망·클라우드 Claude)에서 대시보드에 들어올 수 있도록 허브를 HTTPS 터널로 공개한다.
//   npm run tunnel                → cloudflared 가 있으면 즉석 터널(계정 불필요), 없으면 Tailscale Funnel
//   npm run tunnel -- --tailscale → Tailscale Funnel 강제 (고정 주소, tailscale 로그인 필요)
// 대시보드는 https 로 열리면 자동으로 wss 를 쓰므로 추가 설정은 없다.
// ⚠ 터널이 열리는 동안 URL 을 아는 누구나 접속 시도가 가능하다 — 토큰이 유일한 방어선이다.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8787);
const forceTailscale = process.argv.includes('--tailscale');

const has = (bin) => spawnSync(bin, ['--version'], { stdio: 'ignore' }).error === undefined;

function hubAlive() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 2000 }, (res) => {
      res.resume(); resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function banner(url, how) {
  const tokenFile = path.join(ROOT, '.fleet-token');
  console.log('\n────────────────────────────────────────────');
  console.log(`✅ 외부 접속 주소 (${how})`);
  console.log(`\n   대시보드:  ${url}`);
  console.log(`   HTTP API:  ${url}/api/fleet   (Authorization: Bearer <토큰>)`);
  console.log(`\n   토큰: ${fs.existsSync(tokenFile) ? '.fleet-token 파일의 값' : 'FLEET_TOKEN 환경변수의 값'} 을 입력하세요.`);
  console.log('   📱 폰: 위 주소를 브라우저로 열고 토큰 입력 → "홈 화면에 추가" 하면 앱처럼 씁니다.');
  console.log('   🧭 클라우드 Claude(claude.ai/code) 사령탑: "내 fleet 허브는 <위 주소>, 토큰은 …" 라고 알려주면 됩니다.');
  console.log('\n⚠ 이 주소를 아는 누구나 접속을 시도할 수 있습니다. 토큰이 유일한 방어선이니 짧게 만들지 말고,');
  console.log('   쓰지 않을 때는 Ctrl+C 로 터널을 닫으세요. 토큰이 샜다면 .fleet-token 을 바꾸고 허브를 재시작하세요.');
  console.log('────────────────────────────────────────────\n');
}

async function viaCloudflared() {
  console.log('cloudflared 즉석 터널을 엽니다 (계정 불필요, 주소는 매번 바뀜)…');
  const child = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let announced = false;
  const watch = (chunk) => {
    const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !announced) { announced = true; banner(m[0], 'Cloudflare 즉석 터널'); }
  };
  child.stdout.on('data', watch);
  child.stderr.on('data', watch);
  child.on('exit', (code) => {
    if (!announced) console.error('\n터널을 열지 못했습니다. 네트워크를 확인하거나 `npm run tunnel -- --tailscale` 을 시도하세요.');
    process.exit(code ?? 0);
  });
  process.on('SIGINT', () => { child.kill('SIGINT'); });
}

async function viaTailscale() {
  console.log('Tailscale Funnel 을 켭니다 (고정 주소, 이 머신의 tailnet 이름 사용)…');
  const st = spawnSync('tailscale', ['status', '--json'], { encoding: 'utf8' });
  let dns = '';
  try { dns = JSON.parse(st.stdout).Self?.DNSName?.replace(/\.$/, '') || ''; } catch {}
  if (!dns) {
    console.error('tailscale 이 로그인되어 있지 않습니다. `tailscale up` 후 다시 실행하세요.');
    process.exit(1);
  }
  const r = spawnSync('tailscale', ['funnel', '--bg', String(PORT)], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\nFunnel 활성화 실패. Tailscale 관리 콘솔에서 Funnel 을 허용했는지(ACL "funnel" 노드 속성) 확인하세요.');
    console.error('  https://tailscale.com/kb/1223/funnel');
    process.exit(r.status ?? 1);
  }
  banner(`https://${dns}`, 'Tailscale Funnel · 백그라운드 유지');
  console.log('끄기:  tailscale funnel --bg off   (또는 tailscale funnel reset)\n');
}

(async () => {
  if (!(await hubAlive())) {
    console.error(`허브가 localhost:${PORT} 에서 응답하지 않습니다. 먼저 다른 터미널에서 \`npm run server\` 를 실행하세요.`);
    process.exit(1);
  }
  const cf = has('cloudflared');
  const ts = has('tailscale');
  if (forceTailscale) {
    if (!ts) { console.error('tailscale 명령을 찾을 수 없습니다: https://tailscale.com/download'); process.exit(1); }
    return viaTailscale();
  }
  if (cf) return viaCloudflared();
  if (ts) return viaTailscale();

  console.error('터널 도구가 없습니다. 둘 중 하나를 설치한 뒤 다시 실행하세요.\n');
  console.error('  1) cloudflared — 계정 없이 즉시 (주소는 매번 바뀜)');
  console.error('       macOS:   brew install cloudflared');
  console.error('       Windows: winget install Cloudflare.cloudflared');
  console.error('       Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
  console.error('  2) Tailscale — 고정 주소 + 사설망 (권장, 계정 필요)');
  console.error('       https://tailscale.com/download  → tailscale up → npm run tunnel -- --tailscale\n');
  process.exit(1);
})();
