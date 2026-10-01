# 중화 반응 탐구 노트

아두이노 Uno의 온도·pH 측정값을 Chrome에서 기록하는 수업용 웹페이지입니다.

## GitHub Pages 배포

1. GitHub에 공개 저장소를 만듭니다.
2. 이 폴더 안의 index.html, style.css, notebook.js, app.js, charts.js와 fonts 폴더를 저장소 최상위에 올립니다. fonts 안의 글꼴과 OFL.txt를 함께 올려주세요. .nojekyll도 포함합니다.
3. 저장소 Settings → Pages를 엽니다.
4. Build and deployment의 Source를 Deploy from a branch로 선택합니다.
5. Branch는 main, 폴더는 /(root)로 선택하고 Save를 누릅니다.
6. 배포가 완료되면 Pages에 표시된 웹주소를 공유합니다.

## 학생 사용

Windows 또는 macOS의 최신 Chrome에서 웹주소를 엽니다. 학생 정보와 세트를 선택하고 USB로 준비된 아두이노를 연결합니다. 아두이노 연결 버튼에서 기기를 선택하고, 측정값이 나타나면 기록을 시작합니다. 각 아두이노는 해당 세트의 보정값이 적용된 측정 코드가 미리 업로드되어 있어야 합니다. 노트북이 보드를 인식하지 못하면 USB 드라이버가 필요할 수 있습니다.

연결: 온도 모듈 DATA A1, pH 보드 PO A0, 통신 속도 9600. 다른 프로그램에서 시리얼 포트를 사용 중이면 닫아야 합니다.

## 데이터

학생 정보와 측정값은 브라우저 메모리에 보관되며 GitHub로 전송되지 않습니다. 종료 후 두 CSV를 저장합니다. 새로고침하거나 닫으면 저장하지 않은 값이 사라집니다. 선택한 세트 번호는 기록 구분용이며 아두이노 보정값을 변경하지 않습니다.

## 글꼴

나눔고딕을 포함합니다. 글꼴 라이선스는 fonts/OFL.txt를 참고하세요.
