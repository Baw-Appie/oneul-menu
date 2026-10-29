# Docker 배포

정적 화면과 `/api/search`를 하나의 Node.js 컨테이너에서 제공한다. 패키지 설치나 프런트엔드 빌드 단계는 없다. Docker Engine과 Docker Compose v2 이상을 사용한다.

## 실행

1. `.env`가 없다면 `.env.example`을 복사한다. 기존 `.env`가 있으면 그대로 사용한다.

```bash
cp .env.example .env
```

2. AI 검색을 사용하려면 편집기로 `.env`의 `OPENAI_API_KEY`를 설정한다. 빈 값이어도 기본 메뉴 기능은 실행된다.
3. 프로젝트 루트에서 설정을 검사하고 실행한다.

```bash
docker compose config --quiet
docker compose up -d --build --wait
```

기본 접속 주소는 `http://localhost:4173`이다. 다른 PC에서 접속하려면 아래의 `APP_ORIGIN`을 실제 접속 주소로 지정한다. API는 설정된 주소의 Host와 Origin을 검사한다.

```bash
docker compose ps
docker compose logs --tail=100 -f web
```

`Ctrl+C`는 로그 보기만 종료한다. 컨테이너를 중지하고 제거하려면 `docker compose down`을 실행한다. 소스 변경 후에는 위의 `up -d --build --wait` 명령을 다시 실행한다. 베이스 이미지도 갱신하려면 먼저 `docker compose build --pull`을 실행한다.

## 환경변수

Compose는 프로젝트의 `.env`와 셸 환경변수를 읽는다. 같은 이름이 있으면 셸 값이 우선한다. 실제 키가 출력되지 않도록 설정 검사에는 `docker compose config --quiet`을 사용한다.

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 빈 값 | 서버의 AI 검색 키. 이미지에 저장하지 않고 실행 시 전달 |
| `APP_PORT` | `4173` | 호스트에 공개할 포트. 컨테이너 내부 포트는 `4173`으로 고정 |
| `APP_ORIGIN` | `http://localhost:${APP_PORT}` | 브라우저에서 접속하는 주소. 프로토콜·호스트·필요한 포트 포함, 경로 제외 |
| `BIND_ADDRESS` | `0.0.0.0` | 호스트의 포트 바인딩 주소 |

예를 들어 서버 IP로 직접 접속하려면 `.env`에 다음과 같이 지정한다. 예시 IP는 실제 서버 IP로 바꾼다.

```dotenv
APP_PORT=8080
APP_ORIGIN=http://192.0.2.10:8080
```

HTTPS 리버스 프록시가 **같은 호스트**에서 실행 중이라면 다음처럼 설정한다.

```dotenv
BIND_ADDRESS=127.0.0.1
APP_PORT=4173
APP_ORIGIN=https://menu.example.com
```

프록시는 `http://127.0.0.1:4173`으로 전달하고, 브라우저 요청의 원래 `Host`와 `Origin` 헤더를 유지해야 한다. 앱은 `X-Forwarded-Host`나 `X-Forwarded-Proto`로 허용 주소를 결정하지 않는다. TLS 인증서와 리버스 프록시는 이 Compose에 포함하지 않았다. 별도 컨테이너의 프록시는 그 컨테이너의 `127.0.0.1`로 앱에 접근할 수 없으므로 공유 Docker 네트워크를 구성해야 한다.

일반 `node server.mjs` 실행은 기존처럼 `127.0.0.1`에 바인딩한다. 필요하면 `HOST`로 변경한다. `APP_ORIGIN`을 지정하지 않은 일반 실행에서는 해당 `PORT`의 `localhost`와 `127.0.0.1`을 모두 허용한다. Compose는 컨테이너의 `HOST=0.0.0.0`, `PORT=4173`을 지정한다.

## 이미지와 운영 동작

- [공식 Node.js 이미지](https://github.com/nodejs/docker-node)의 `node:24-alpine`을 사용한다. 패치 버전은 새로 빌드할 때 갱신될 수 있다.
- `.dockerignore`는 실행 파일만 허용한다. `.env`, Git 이력, 문서, 스크린샷은 빌드 컨텍스트에서 제외한다.
- Dockerfile은 `node` 사용자로 실행한다. Compose는 읽기 전용 파일시스템, Linux capability 제거, 권한 상승 금지, 프로세스 수 제한을 적용한다.
- `/`의 HTTP 응답을 30초마다 확인한다. 이 검사는 OpenAI를 호출하지 않으며 AI 연결 상태를 보장하지 않는다. `unhealthy`만으로 컨테이너가 자동 재시작되지는 않는다. `unless-stopped`는 프로세스 종료 시 재시작 정책이다.
- 로그는 컨테이너별 최대 10MiB 파일 3개로 순환한다. 선택 기록과 즐겨찾기는 브라우저에 있으므로 서버 볼륨은 사용하지 않는다. 접속 주소가 바뀌면 브라우저 저장 영역도 달라진다.
- AI API는 인증 없이 동작한다. 동시 2개·분당 6개·시간당 60개 제한은 프로세스 전체에 적용되고 재시작하면 초기화된다. API 키를 넣어 인터넷에 공개할 경우 프록시 인증과 영속 사용량 제한을 별도로 구성해야 한다.

## Dockerfile만 사용하는 경우

```bash
docker build --pull -t oneul-menu:latest .
docker run -d --name oneul-menu --init --restart unless-stopped \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 128 \
  -p 4173:4173 \
  --env-file .env \
  oneul-menu:latest
```

이 명령에서는 `.env`의 `APP_PORT`와 `BIND_ADDRESS`로 포트 매핑이 바뀌지 않는다. 포트는 `-p`로 지정하고 `APP_ORIGIN`은 실제 접속 주소와 맞춘다. `APP_ORIGIN`이 없으면 기본 로컬 주소 두 개를 허용한다.

Compose 환경변수 동작의 기준은 [Docker 공식 문서](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)를 참고한다. 실제 검증 결과와 미검증 항목은 [검증 기록](VERIFICATION.md)에 기록한다.
