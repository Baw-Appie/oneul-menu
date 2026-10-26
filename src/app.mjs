import { categories, menus, spiceLabels } from './data.mjs';

const categoryIcons = ['✦', '🍚', '🥟', '🍣', '🍝', '🍢', '🍜'];

document.querySelector('#category-options').innerHTML = categories.map((category, index) => `
  <button class="chip" type="button" data-category="${category}" aria-pressed="${index === 0}"><span class="chip-emoji" aria-hidden="true">${categoryIcons[index]}</span>${category}</button>
`).join('');

document.querySelector('#budget-options').innerHTML = [
  [0, '상관없어요'], [7000, '7,000원 이하'], [10000, '10,000원 이하'], [15000, '15,000원 이하'],
].map(([value, label]) => `<button class="chip" type="button" data-budget="${value}" aria-pressed="${value === 0}">${label}</button>`).join('');

document.querySelector('#spice-options').innerHTML = [
  ['all', '모두 좋아요'], ['0', '🌿 순한맛'], ['1', '🌶️ 보통'], ['2', '🔥 매운맛'],
].map(([value, label]) => `<button class="chip" type="button" data-spice="${value}" aria-pressed="${value === 'all'}">${label}</button>`).join('');

document.querySelector('#menu-grid').innerHTML = menus.map(menu => `
  <article class="menu-card">
    <div class="card-art ${menu.color}"><span class="art-category">${menu.category}</span><span class="food-emoji" aria-hidden="true">${menu.emoji}</span><button type="button" class="exclude-button" data-exclude="${menu.id}" aria-label="${menu.name} 추천에서 제외" title="추천에서 제외">−</button></div>
    <div class="card-body"><div class="card-title-row"><h3>${menu.name}</h3><span class="spice-pill ${menu.spice > 0 ? 'hot' : ''}">${spiceLabels[menu.spice]}</span></div><p class="card-description">${menu.description}</p><div class="tags">${menu.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div><div class="card-bottom"><span class="price"><small>예상</small>${menu.price.toLocaleString('ko-KR')}원</span><button type="button" class="choose-button" data-choose="${menu.id}" aria-label="${menu.name} 선택하기">이 메뉴로 <span aria-hidden="true">↗</span></button></div></div>
  </article>
`).join('');

document.querySelector('#history-list').innerHTML = '<div class="history-empty"><span aria-hidden="true">🍽️</span><div><strong>아직 비어 있는 나만의 메뉴 기록</strong><p>오늘의 메뉴를 결정하면 여기에 차곡차곡 쌓여요.</p></div></div>';
