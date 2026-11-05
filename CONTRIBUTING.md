# Contributing

이슈와 PR 모두 환영합니다. Issues and pull requests are welcome (Korean or English).

## 개발 환경

```sh
npm ci
npm run dev        # http://localhost:3002, Supabase 미설정 시 데모 모드(.demo-db.json)
```

데모 모드는 외부 서비스 없이 동작합니다. `OPENAI_API_KEY`가 없으면 채팅은 스크립트 응답을 돌려줍니다.

## PR 전에 돌릴 것

CI(`.github/workflows/ci.yml`)와 같은 오프라인 점검입니다.

```sh
npx tsc --noEmit
npx eslint .
npm run test:mcp:local
npm run test:mcp:saved
npm run test:codex
npm run test:mobile-api
```

UI를 바꿨다면 Playwright 점검도 돌려 주세요.

```sh
npx playwright install chromium webkit
npm run test:workspace
# smoke는 데이터를 만들고 지우므로 별도 데모 저장소에서 돌립니다
DEMO_DB_PATH=/tmp/airo-smoke.json npm run dev &
node scripts/smoke.mjs
```

## 규칙

- 도구(tool)를 추가·변경할 때는 `src/lib/tool-contracts.ts` 한 곳만 고칩니다. 웹 채팅·MCP·Codex 브리지가 같은 계약을 공유합니다.
- DB 변경은 `supabase/migrations/`에 새 번호의 마이그레이션으로 추가하고 RLS를 함께 작성합니다.
- `service_role` 키를 사용하는 코드는 받지 않습니다.
- `src/ee/`는 별도 상용 라이선스입니다. 이 디렉터리에 대한 기여는 받지 않습니다.

## 라이선스

기여한 코드는 저장소 라이선스(AGPL-3.0)로 배포됩니다.
