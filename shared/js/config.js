// 캐릭터 꾸미기 옵션, 인벤토리, 춤, 책 목록 같은 고정 데이터

export const PALETTE = [
  ['하양', '#F7F5F0'], ['크림', '#F3E3C3'], ['회색', '#A7A9AC'], ['먹색', '#3A3D42'],
  ['라벤더', '#C6B8F0'], ['보라', '#8E6CCF'], ['분홍', '#F6A6C1'], ['빨강', '#E5484D'],
  ['주황', '#FF8A3D'], ['노랑', '#FFD15C'], ['민트', '#7FD8BE'], ['초록', '#3FA66B'],
  ['하늘', '#8CCBF2'], ['파랑', '#3D6FD8'], ['남색', '#28366B'], ['갈색', '#8A5A3C'],
];
export const SKINS = [
  ['피부 1', '#FFE6D2'], ['피부 2', '#F6CBA6'], ['피부 3', '#D9A07A'], ['피부 4', '#9B6A4A'],
];
export const HAIR_COLORS = [
  ['검정', '#2B2422'], ['고동', '#5A3A2A'], ['밤색', '#8E5B3A'], ['금발', '#E8C36A'],
  ['분홍', '#F29BB8'], ['하늘', '#8CCBF2'], ['보라', '#9E7BD8'], ['백발', '#E9E6E1'],
];

// 모양 고르기 (칸 이름 → 선택지)
export const LOOK_PARTS = {
  hair: { label: '머리', options: { short: '짧은 머리', bob: '단발', bun: '똥머리', curly: '곱슬', ponytail: '포니테일', bowl: '바가지 머리', quiff: '올림머리', none: '민머리' } },
  hat: {
    label: '모자·장식',
    options: { none: '없음', beanie: '비니', cap: '캡모자', phones: '헤드폰', cat: '고양이 귀', ribbon: '리본', sprout: '새싹', ahoge: '더듬이', crown: '왕관' },
  },
  face: { label: '표정', options: { smile: '방긋', wink: '윙크', cat: '고양이 입', wow: '깜짝', calm: '덤덤', sleepy: '졸림', blank: '멍', tongue: '메롱', uneven: '짝눈' } },
  glasses: { label: '안경·얼굴', options: { none: '없음', round: '동그란 안경', square: '네모 안경', sun: '선글라스', bandaid: '반창고', snot: '콧물' } },
  top: { label: '옷', options: { jacket: '과잠', hoodie: '후드티', tee: '티셔츠', shirt: '셔츠', jersey: '축구 유니폼' } },
  neck: { label: '목', options: { none: '없음', scarf: '목도리', bow: '나비넥타이' } },
  bag: { label: '가방', options: { none: '없음', backpack: '백팩', cross: '크로스백' } },
};

// 색 고르기 (칸 이름 → 팔레트)
export const COLOR_PARTS = {
  skin: { label: '피부', palette: SKINS },
  hairColor: { label: '머리 색', palette: HAIR_COLORS },
  cloth: { label: '옷 색', palette: PALETTE },
  accent: { label: '소품 색', palette: PALETTE },
};

export const DEFAULT_LOOK = {
  skin: '#FFE6D2', hairColor: '#2B2422', cloth: '#28366B', accent: '#FF8A3D',
  hair: 'short', hat: 'none', face: 'smile', glasses: 'none', top: 'jacket', neck: 'none', bag: 'none',
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function randomLook() {
  const l = {};
  for (const [k, part] of Object.entries(LOOK_PARTS)) l[k] = pick(Object.keys(part.options));
  for (const [k, part] of Object.entries(COLOR_PARTS)) l[k] = pick(part.palette)[1];
  // 너무 요란하지 않게: 모자와 안경은 반반
  if (Math.random() < 0.5) l.hat = 'none';
  if (Math.random() < 0.55) l.glasses = 'none';
  if (Math.random() < 0.6) l.neck = 'none';
  if (l.hair === 'none' && Math.random() < 0.7) l.hair = 'short';
  return l;
}

// 어설프고 정감 가는(밤티) 조합
export function bamtiLook() {
  const l = randomLook();
  l.hair = pick(['ponytail', 'bowl', 'ponytail', 'curly', 'bun']);
  l.hat = pick(['ahoge', 'ahoge', 'sprout', 'none']);
  l.face = pick(['blank', 'tongue', 'uneven', 'sleepy']);
  l.glasses = pick(['snot', 'bandaid', 'snot', 'round', 'none']);
  l.top = pick(['tee', 'hoodie', 'jacket']);
  l.neck = pick(['none', 'scarf', 'none']);
  return l;
}

// 호날두 조합: 빨간 7번 유니폼에 올림머리
export function starLook() {
  return {
    skin: '#F6CBA6', hairColor: '#2B2422', cloth: '#E5484D', accent: '#F7F5F0',
    hair: 'quiff', hat: 'none', face: 'smile', glasses: 'none', top: 'jersey', neck: 'none', bag: 'none',
  };
}

export function normalizeLook(l) {
  const out = { ...DEFAULT_LOOK };
  if (!l || typeof l !== 'object') return out;
  for (const [k, part] of Object.entries(LOOK_PARTS)) if (l[k] in part.options) out[k] = l[k];
  for (const k of Object.keys(COLOR_PARTS)) if (/^#[0-9a-fA-F]{6}$/.test(l[k] || '')) out[k] = l[k];
  return out;
}

// 인벤토리: 탭으로 열고 숫자키로 쓴다
export const ITEMS = [
  { id: 'laptop', icon: '💻', name: '노트북', tip: '앉아서 펼치기' },
  { id: 'coffee', icon: '🥤', name: '아이스 아메리카노', tip: '언제든 한 모금' },
  { id: 'gun', icon: '🔫', name: '종이 총', tip: '꺼내서 클릭·F로 발사' },
  { id: 'book', icon: '📖', name: '책', tip: '앉거나 누워서 읽기' },
];

export const DANCES = ['통통 춤', '파도 춤', '빙글빙글', '로봇 춤', '디스코', '박수 춤', '셔플'];

// 책장에 꽂혀 있는 책들
export const BOOKS = [
  '클린 코드', '리팩터링 2판', '알고리즘 문제 해결 전략', '이것이 취업을 위한 코딩 테스트다',
  '혼자 공부하는 컴퓨터 구조+운영체제', '운영체제 공룡책', '컴퓨터 네트워킹 하향식 접근',
  '모던 자바스크립트 Deep Dive', '점프 투 파이썬', '열혈 C 프로그래밍', '이펙티브 자바',
  '밑바닥부터 시작하는 딥러닝', '혼자 공부하는 머신러닝+딥러닝', '그림으로 배우는 HTTP & Network',
  '코딩 인터뷰 완전 분석', '실용주의 프로그래머', '함께 자라기', '개발자의 글쓰기', '토비의 스프링',
  '데이터베이스 개론', '이산수학', '선형대수와 군', '선배가 두고 간 자료구조 필기',
];

// 이름이 없을 때 붙여 줄 별명
const ADJ = ['졸린', '배고픈', '성실한', '커밋하는', '디버깅하는', '야근하는', '용감한', '느긋한', '반짝이는', '조용한', '신난', '꾸준한'];
const NOUN = ['코알라', '고양이', '수달', '펭귄', '다람쥐', '햄스터', '알파카', '너구리', '부엉이', '오리', '판다', '토끼'];
export const randomName = () => `${pick(ADJ)} ${pick(NOUN)}`;
