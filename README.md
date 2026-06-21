# Cheese Tracker

치지직 후원 이벤트를 실시간으로 받아 로컬에 누적 저장하는 보조 대시보드입니다.

## 준비

1. 치지직 Developers에서 애플리케이션을 등록합니다.
2. Redirect URI에 `http://localhost:5177/oauth/callback`을 등록합니다.
3. 권한 Scope에 `후원 조회`를 포함합니다.
4. Node.js 18 이상에서 실행합니다.

## 실행

```powershell
.\run.ps1
```

또는 파일 탐색기에서 `run.bat`를 더블클릭해도 됩니다.

Node.js와 npm이 PATH에 등록되어 있다면 아래 명령도 사용할 수 있습니다.

```powershell
npm start
```

브라우저에서 `http://localhost:5177`을 엽니다.

## 사용 흐름

1. 대시보드에서 Client ID, Client Secret, Redirect URI를 저장합니다.
2. `치지직 로그인`을 눌러 스트리머 계정으로 권한을 승인합니다.
3. 방송 전에 `후원 수집 시작`을 누릅니다.
4. 들어온 후원은 `data/donations.ndjson`에 저장됩니다.
5. `CSV 내보내기`로 기록을 받을 수 있습니다.

## 참고

- 이 프로그램은 공식 Open API의 Session 후원 이벤트를 사용합니다.
- 프로그램이 켜져 있고 수집을 시작한 뒤의 후원만 기록됩니다.
- Client Secret과 토큰은 로컬 `data/config.json`에 저장되므로 외부에 공유하지 마세요.
- 치지직 Socket.IO 클라이언트는 배포본 내부 `public/vendor/socket.io.js`를 사용합니다.

## 배포 압축 만들기

```powershell
.\make-package.ps1
```

생성된 `cheese-tracker.zip`을 전달하세요. 기존 `data` 폴더는 압축에 포함하지 않습니다.
압축본에는 실행용 `runtime/node.exe`가 포함되므로 받는 사람이 Node.js를 따로 설치하지 않아도 됩니다.
