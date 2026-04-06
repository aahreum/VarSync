// 이 플러그인은 사용자에게 숫자를 입력받는 창을 띄우고,
// 입력된 숫자만큼 화면에 사각형을 생성합니다.

// 이 파일은 플러그인의 메인 코드를 담고 있습니다.
// 이 파일의 코드는 'figma' 전역 객체를 통해 *Figma 문서*에 접근할 수 있습니다.
// 브라우저 API는 "ui.html" 안의 <script> 태그 내에서 사용할 수 있으며,
// 그곳은 전체 브라우저 환경을 제공합니다.
// (참고: https://www.figma.com/plugin-docs/how-plugins-run)

// "ui.html"에 정의된 HTML 페이지를 화면에 보여줍니다.
figma.showUI(__html__);

// HTML 페이지 내부에서 "parent.postMessage"를 호출하면 이 콜백 함수가 실행됩니다.
// 이 콜백은 전달된 메시지의 "pluginMessage" 속성을 인자로 받습니다.
figma.ui.onmessage = (msg: { type: string; count: number }) => {
  // HTML 페이지에서 보낸 여러 종류의 메시지를 구분하는 한 가지 방법은
  // 아래와 같이 "type" 속성을 가진 객체를 사용하는 것입니다.
  if (msg.type === "create-shapes") {
    // 이 플러그인은 화면에 사각형들을 생성합니다.
    const numberOfRectangles = msg.count;

    const nodes: SceneNode[] = [];
    for (let i = 0; i < numberOfRectangles; i++) {
      // 사각형 객체를 생성합니다.
      const rect = figma.createRectangle();
      // x 좌표를 설정하여 사각형들을 가로로 나열합니다.
      rect.x = i * 150;
      // 채우기 색상을 설정합니다 (주황색).
      rect.fills = [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }];
      // 현재 페이지에 생성한 사각형을 추가합니다.
      figma.currentPage.appendChild(rect);
      // 생성된 노드를 배열에 담습니다.
      nodes.push(rect);
    }
    // 생성한 사각형들을 선택 상태로 만듭니다.
    figma.currentPage.selection = nodes;
    // 화면상의 뷰포트가 생성된 노드들을 비추도록 스크롤 및 줌을 조절합니다.
    figma.viewport.scrollAndZoomIntoView(nodes);
  }

  // 작업이 끝나면 반드시 플러그인을 종료해야 합니다.
  // 종료하지 않으면 화면 하단에 취소 버튼이 계속 표시되며 플러그인이 실행 상태로 유지됩니다.
  figma.closePlugin();
};
