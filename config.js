/* 서버 주소. 비워 두면 체험판(기기 안에만 저장)으로 돈다.
 * 서버 = Supabase 프로젝트 my-hoop-team 의 서버 함수 api (docs/03_서버_Supabase.md)
 * webUrl = 앱 없이 쓰는 웹 주소 (같은 www 폴더를 올린 곳). 팀 링크 = webUrl + '?t=팀ID' → 로그인하면 그 팀 참석 화면 */
window.APP_CONFIG = window.APP_CONFIG || {   // (시험할 때는 이 파일보다 먼저 값을 넣어 둘 수 있다)
  apiUrl: 'https://kugrqqnvmhfxowkicqcq.supabase.co/functions/v1/api',
  webUrl: 'https://daehan9074-dotcom.github.io/myhoopteam/'
};
