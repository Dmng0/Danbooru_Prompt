# Danbooru Prompt Helper

한국어 묘사를 Gemini로 분석하여 **Stable Diffusion, NovelAI, 영어 자연어**를 출력하는 GitHub Pages용 사이트와 Cloudflare Workers API 서버입니다.

대상 저장소: https://github.com/Dmng0/Danbooru_Prompt

## 포함 기능

- 원본 HTML의 자유 입력 / 인물·배경 분할 입력, 고정 퀄리티·작가 태그, 위치·우선순위 설정
- 이미지 탭: JPG/JPEG/PNG 드래그앤드롭 또는 파일 선택, Gemini 시각 분석을 통한 세 가지 프롬프트 출력
- 고정 태그·작가 가중치·위치·순서·온도 값은 브라우저에 저장하며, 고정 태그와 고급 설정은 페이지를 열 때 항상 접힘
- 태그 클릭 삭제, 마우스 휠 가중치 변경, 태그 직접 수정, 로컬 자동완성
- 독립적으로 편집·복사 가능한 Stable Diffusion `(smile:1.5)`, NovelAI `1.5::smile::`, 영어 자연어 출력
- 출력 탭 또는 모두 보기, 직접 편집 보존 및 원본에서 복원
- Gemini를 이용한 관련 태그 검색, 검색 태그 뒤에 추가·중복 방지
- ‘단부루 태그 검색’ 결과를 클릭하면 별도 모드 전환 없이 프롬프트 끝에 추가
- 운영자 설정 서버로 자동 연결, 별도 동의 체크 없이 생성·검색, 화면에 외부 전송 안내 표시
- 서버 키 보관, 선택 비밀번호, Origin 허용 목록, 요청 크기 제한, 요청 빈도 제한, 시간 초과·429 오류 처리

**현재 태그 데이터는 직접 구성한 시작용 149개입니다. 전체·최신 Danbooru DB 또는 원본 CSV가 아닙니다.** 원본 서버 코드와 벡터 DB도 제공되지 않았으므로 검색 점수는 Gemini의 추정 관련도이며 원본의 벡터 유사도가 아닙니다. 화면에 이를 표시합니다. 미확인 태그는 그대로 편집할 수 있으며 잘못된 태그라는 뜻은 아닙니다. 캐릭터·작가 사전은 기본 데이터에 없어 AI 제안과 사용자의 직접 입력을 사용합니다.

## 1. API 서버 배포

브라우저 대시보드에서 배포할 경우 `server/dashboard-worker.js`를 Worker 코드 편집기에 붙여 넣을 수 있습니다. 이 파일은 `node server/build-dashboard.mjs`로 원본 모듈과 사전을 묶어 생성합니다. 대시보드에서는 Settings → Variables and Secrets에 `GEMINI_API_KEY`를 Secret으로, `ALLOWED_ORIGINS`를 `https://dmng0.github.io`로, `GEMINI_MODEL`을 사용할 모델 이름으로 설정합니다. 이 단일 파일의 빈도 제한은 인스턴스 메모리에 보관하는 보조 제한으로, 아래 Wrangler 배포의 Cloudflare 바인딩보다 제한적입니다. 두 방식 모두 전 세계 공통의 일일 예산 상한은 아닙니다.

Node.js 22 이상과 Cloudflare 계정이 필요합니다. 저장소를 내려받고 PowerShell에서 저장소 폴더로 이동합니다.

```powershell
cd server
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
```

마지막 명령의 입력 요청에 **Google AI Studio의 API 키**를 붙여 넣습니다. 키를 채팅·GitHub·site/config.js에 넣지 마세요.

백엔드는 선택적으로 ACCESS_TOKEN을 지원하지만, 현재 공개 사이트에는 비밀번호 입력 UI가 없습니다. 아래 설정은 별도 인증 UI를 구현한 경우에만 사용합니다. 공개 사이트에서는 설정하지 마세요.

```powershell
npx wrangler secret put ACCESS_TOKEN
npx wrangler deploy
```

배포 결과의 `https://danbooru-prompt-api.<계정>.workers.dev` 주소를 복사합니다.

`server/wrangler.jsonc`의 `GEMINI_MODEL` 기본값은 공식 API 문서의 예시 모델인 `gemini-3.8-flash`입니다. 계정의 AI Studio에서 사용 가능하고 무료 등급이 제공되는 모델인지 확인하세요. 사용 가능한 모델 이름으로 변경한 뒤 다시 배포할 수 있습니다. 무료 한도와 모델 제공 여부는 계정·시점에 따라 달라집니다.

`ALLOWED_ORIGINS`는 이미 `https://dmng0.github.io`를 포함합니다. 커스텀 도메인이 있으면 **경로 없이 origin만** 추가합니다. `/Danbooru_Prompt`를 뒤에 넣으면 안 됩니다. Origin 대조는 CORS 설정이며 인증 수단이 아닙니다. 현재 공개 사이트는 비밀번호 입력 없이 이용합니다. ACCESS_TOKEN을 설정하려면 별도 인증 UI가 필요합니다.

Cloudflare의 빈도 제한은 위치별로 동작하므로 프로젝트 전체의 일일 Gemini 예산 한도를 보장하지 않습니다. 기본값은 같은 IP에서 1분에 5회이며 공용 네트워크 사용자는 한도를 공유할 수 있습니다. 공개 사이트 운영 시 실제 할당량에 맞게 조정하세요.

## 2. 사이트에서 서버 주소 설정

`site/config.js`를 다음처럼 수정하고 GitHub에 올립니다. 여기는 공개 정보만 들어갑니다.

```js
window.PROMPT_HELPER_CONFIG = {
  apiBase: "https://danbooru-prompt-api.YOUR-SUBDOMAIN.workers.dev",
};
```

운영자가 `site/config.js`의 `apiBase`에 서버 주소를 설정합니다. 이용자 화면에는 서버 설정 패널과 동의 체크박스가 없습니다. 이전에 브라우저에 저장한 서버 주소는 사용하지 않습니다. 생성·검색 버튼을 누르면 바로 API 요청을 보냅니다.

## 3. GitHub Pages 게시

이 폴더의 내용을 저장소 루트에 올립니다. `site/`와 `server/` 디렉터리 구조를 유지하세요. `.github/workflows/pages.yml`도 포함해야 합니다.

저장소의 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택합니다. `main` 브랜치에 올리면 자동 테스트 후 `site/`만 게시합니다. 자동으로 시작하지 않으면 **Actions → Deploy GitHub Pages → Run workflow**를 누릅니다.

기본 사이트 주소는 https://dmng0.github.io/Danbooru_Prompt/ 입니다. 실제 배포가 성공하기 전에는 이 주소가 작동하지 않을 수 있습니다.

서버 코드는 GitHub Pages에서 실행되지 않습니다. Pages 게시와 Workers 배포는 별개입니다. 자동 배포에는 Gemini 키가 필요하지 않으며, API 서버에만 키를 설정합니다.

## 4. 로컬 실행

단순 더블클릭 대신 로컬 HTTP 서버를 사용합니다. Node.js 22 이상에서:

```powershell
npm start
```

http://127.0.0.1:8787 을 열고 화면 API 서버 주소에 배포된 Workers 주소를 넣거나 같은 로컬 주소를 넣습니다.

로컬 서버에서 Gemini를 직접 호출하려면 환경 변수로 키와 모델을 전달합니다. 키는 이 명령 예시나 소스에 넣지 않습니다. PowerShell 7에서:

```powershell
$env:GEMINI_API_KEY = Read-Host 'Gemini API key' -MaskInput
$env:GEMINI_MODEL = 'gemini-3.8-flash'
npm start
```

Workers 로컬 개발은 `server/.dev.vars.example`을 `server/.dev.vars`로 복사하고 키를 넣은 뒤 `cd server; npx wrangler dev`로 실행합니다. `.dev.vars`는 Git에 포함되지 않습니다. Node 로컬 서버는 이 파일을 읽지 않으며 환경 변수를 사용합니다.

## 데이터·출력 동작

생성·AI 태그 검색을 누를 때 묘사 또는 검색어가 중계 서버와 Google에 전송됩니다. 서버 애플리케이션은 입력·응답을 파일/DB에 저장하거나 로그에 기록하지 않습니다. 호스팅 사업자의 운영·보안 로그와 Google의 데이터 처리는 별도입니다. 무료 Gemini 콘텐츠는 Google의 제품 개선에 사용될 수 있습니다.

브라우저는 자동완성 인덱스와 고정 태그·작가·가중치·배치·온도 설정을 저장합니다. API 주소는 운영자의 config.js에서 읽습니다. 묘사·결과·업로드 이미지·추가 이미지 요청·Gemini 키는 이 앱에서 영구 저장하지 않습니다. 화면을 새로고침하기 전에 필요한 결과를 복사하세요. 시크릿 모드나 브라우저 데이터 삭제 시 저장 설정이 사라질 수 있습니다.

이미지는 1장, 최대 10MB인 JPG/JPEG/PNG를 받습니다. 파일 선택 시 브라우저에서 미리보기와 변환만 수행하고 생성 버튼을 누르면 이미지가 서버와 Google로 전송됩니다. 전송 전에 긴 변 1600px 이하 JPEG로 변환하며 투명 영역은 흰색으로 합성합니다. 이미지 파일 메타데이터는 변환본에 복사하지 않습니다. 서버는 base64 크기와 MIME/파일 시그니처를 검증하며 이미지를 파일이나 DB에 저장하지 않습니다. 이미지 속 글자는 지시문으로 실행하지 않도록 모델에 지시합니다. 분석 대상은 시각적으로 확인되는 구도·대상·배치·색상·조명·배경이며, 보이지 않는 내용이나 인물의 정체를 추정하도록 요청하지 않습니다.

Stable Diffusion 출력은 A1111/Forge 방식이며 다른 실행기의 가중치 해석은 다를 수 있습니다. NAI의 음수 가중치는 SD 출력에서 0.1로 제한합니다. NAI `{...}`/`[...]` 중첩 강조를 임의로 숫자로 변환하지 않으며 숫자 가중치 문법을 기준으로 합니다. 작가 접두사와 사용자 지정 품질 태그는 직접 확인하세요. 자연어 문장은 태그를 수동 삭제할 때 자동으로 다시 생성하지 않으므로 별도로 편집하거나 재생성합니다.

키워드/자연어 온도 UI는 유지되지만 비용을 줄이기 위해 한 요청을 사용합니다. API의 temperature에는 자연어 온도를 적용하고 키워드 온도는 해석 지침으로 전달합니다. 원본처럼 두 개의 별도 모델 샘플링은 아닙니다.

사전을 늘리려면 `server/catalog.json`과 `site/danbooru-tags.csv`를 함께 갱신합니다. CSV 형식은 `name,category,post_count,description`이며 설명에 `[분류] 키워드: 한글 별칭`을 넣으면 검색에 사용합니다. 변경 후 `index.html`의 AC_DB_NAME 버전을 올려 브라우저 캐시를 갱신하세요. 대규모 사전을 시스템 프롬프트에 모두 넣는 방식은 한계가 있으므로 전체 데이터로 확장할 때는 검색 인덱스/후보 추출 단계를 추가해야 합니다.

## 검증

```powershell
npm test
```

API 계약·입력 검증·CORS·비밀번호·사용량 오류·인물 분리·결과 정규화를 모의 Gemini 응답으로 검증합니다. 실제 Gemini 생성 품질·속도·모델 이용 가능 여부는 키 설정 후 확인해야 합니다.

공식 문서: [Gemini API](https://ai.google.dev/api/generate-content), [요금](https://ai.google.dev/gemini-api/docs/pricing), [사용량 제한](https://ai.google.dev/gemini-api/docs/rate-limits), [Workers 빈도 제한](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

원본 HTML의 화면 코드를 바탕으로 수정했습니다. 원본 코드의 라이선스 정보는 제공 파일에 포함되어 있지 않아 새 오픈소스 라이선스를 임의로 부여하지 않았습니다.
