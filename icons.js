/* 선 아이콘 모음 (이모지 대신 쓴다). 글자 크기·색을 따라가며, I.이름 이 바로 HTML 문자열이다 */
(function () {
  'use strict';
  const P = {
    ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.500 3-6 7-6s7 2.500 7 6M16 4.600a3.500 3.500 0 0 1 0 6.800M18 14.300c2.400.7 4 2.700 4 5.700"/>',
    userPlus: '<circle cx="10" cy="8" r="4"/><path d="M2 21c0-4 3.600-7 8-7 1.500 0 2.900.3 4 .9M19 14v6M16 17h6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    link: '<path d="M10 14a4.500 4.500 0 0 0 6.400 0l3.200-3.200a4.500 4.500 0 0 0-6.400-6.400L11.800 5.800"/><path d="M14 10a4.500 4.500 0 0 0-6.400 0l-3.200 3.200a4.500 4.500 0 0 0 6.400 6.400l1.400-1.400"/>',
    hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 5 5 9s-5 4-5 9M17 3c0 5-5 5-5 9s5 4 5 9"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 11h6M9 15h6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    megaphone: '<path d="M4 10v4h3l8 5V5l-8 5zM18 9a4 4 0 0 1 0 6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    alert: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
    chart: '<path d="M4 20V4M4 20h16M8 20v-6M12 20V8M16 20v-9"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    pencil: '<path d="m4 20 1-4L16 5l3 3L8 19zM14 7l3 3"/>',
    note: '<path d="M5 3h10l4 4v14H5zM14 3v5h5M9 12h6M9 16h6"/>',
    shuffle: '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/>',
    scale: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    save: '<path d="M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7"/>',
    book: '<path d="M5 4h13v16H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h11M9 8h5"/>',
    thumb: '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.300l-1 6A2 2 0 0 1 17 20H7"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900 7 7M17 17l2.100 2.100M4.900 19.100 7 17M17 7l2.100-2.100"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500h.01"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    rotate: '<path d="M20 11a8 8 0 1 0-2.300 6.300M20 4v7h-7"/>',
    play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
    shirt: '<path d="M8 3 3 6l2 4 2-1v11h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
    undo: '<path d="M8 5 3 10l5 5M3 10h11a5.500 5.500 0 0 1 0 11h-3"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    arrows: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>'
  };
  const I = {};
  Object.keys(P).forEach((k) => { I[k] = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + P[k] + '</svg>'; });
  window.I = I;
})();
