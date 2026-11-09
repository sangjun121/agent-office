// 음악 창: 주소의 재생목록(list)이나 영상(v)을 YouTube 쿠키 없는 플레이어로 튼다
const q = new URLSearchParams(location.search);
const list = q.get('list') || '';
const v = q.get('v') || '';
const okList = /^[A-Za-z0-9_-]{10,80}$/.test(list);
const okV = /^[A-Za-z0-9_-]{11}$/.test(v);
if (okList || okV) {
  const src = new URL(okV ? `https://www.youtube-nocookie.com/embed/${v}` : 'https://www.youtube-nocookie.com/embed/videoseries');
  if (okList) src.searchParams.set('list', list);
  else {
    // 영상 하나면 끝나도 다시 처음부터
    src.searchParams.set('loop', '1');
    src.searchParams.set('playlist', v);
  }
  src.searchParams.set('autoplay', '1');
  src.searchParams.set('rel', '0');
  src.searchParams.set('hl', 'ko');
  const f = document.createElement('iframe');
  f.src = src.href;
  f.title = 'YouTube 플레이어';
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  document.body.appendChild(f);
} else {
  const d = document.createElement('div');
  d.className = 'err';
  d.textContent = '재생목록 주소를 확인해 주세요';
  document.body.appendChild(d);
}
