// 石巻圏 地域課題プラットフォーム（試作）
// データはCSVから読み込みます。Googleスプレッドシートに切り替えるときは、
// 下の DATA_URLS を「ウェブに公開」したCSVのURLに書き換えてください。
'use strict';

const DATA_URLS = {
  groups: 'data/groups.csv',
  news: 'data/news.csv',
};

// 課題カテゴリ（並び順＝表示順）
const ISSUES = [
  '子ども・子育て', '高齢者・福祉', '障害', '移動・交通',
  '防災・震災伝承', '水産・農林業の担い手', 'まちなか・空き家', '観光・交流',
  '環境', '若者・しごと', '文化・スポーツ', '半島・離島の暮らし',
];
const AREAS = ['石巻市', '東松島市', '女川町'];

// ---- CSV の読み込み（引用符・改行を含むセルに対応） ----
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else { cell += c; }
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else { cell += c; }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

async function loadCSV(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('データを読み込めませんでした（' + res.status + '）');
  return parseCSV(await res.text());
}

// ---- 安全な要素の作成（データは必ず文字として表示し、HTMLとして解釈しない） ----
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'href') { const safe = safeUrl(v); if (safe) node.setAttribute('href', safe); }
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null || child === '') continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// リンクは https:// で始まるもの、またはサイト内の相対パスだけを許可
function safeUrl(url) {
  if (!url) return '';
  const u = String(url).trim();
  if (/^https:\/\//i.test(u)) return u;
  if (/^[a-z0-9_\-./?=&#%]+$/i.test(u) && !/^[a-z]+:/i.test(u)) return u;
  return '';
}

const splitList = (s) => (s || '').split(/[;；]/).map((x) => x.trim()).filter(Boolean);

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : (iso || '');
}

function showError(container, err) {
  container.replaceChildren(el('p', { class: 'empty-msg' }, err.message || 'データを読み込めませんでした。'));
}

// ---- トップページ ----
async function initTop() {
  const issueBox = document.getElementById('issue-grid');
  const newsBox = document.getElementById('news-list');

  try {
    const groups = await loadCSV(DATA_URLS.groups);
    const counts = Object.fromEntries(ISSUES.map((i) => [i, 0]));
    groups.forEach((g) => splitList(g.issues).forEach((i) => { if (i in counts) counts[i]++; }));
    issueBox.replaceChildren(...ISSUES.map((issue) => {
      const n = counts[issue];
      const tile = el('a', { class: 'issue-tile' + (n === 0 ? ' empty' : ''), href: 'groups.html?issue=' + encodeURIComponent(issue) },
        el('span', {}, issue),
        el('span', { class: 'count' }, n === 0 ? 'まだいません' : n + '団体'));
      // 環境によってURLの ? 以降が渡らない場合に備え、選んだ課題を一時保存
      tile.addEventListener('click', () => { try { sessionStorage.setItem('issue', issue); } catch (e) { /* 保存できなくても動作に支障なし */ } });
      return tile;
    }));
    const total = document.getElementById('group-total');
    if (total) total.textContent = String(groups.length);
  } catch (e) { showError(issueBox, e); }

  try {
    const news = (await loadCSV(DATA_URLS.news)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    newsBox.replaceChildren(...news.slice(0, 5).map((n) =>
      el('li', { class: 'news-item' },
        el('time', { datetime: n.date }, formatDate(n.date)),
        el('h3', {}, el('span', { class: 'kind' }, n.kind), n.title),
        el('p', {}, n.detail))));
  } catch (e) { showError(newsBox, e); }
}

// ---- 団体を探すページ ----
async function initGroups() {
  const listBox = document.getElementById('group-list');
  const countBox = document.getElementById('result-count');
  const kw = document.getElementById('f-keyword');
  const fIssue = document.getElementById('f-issue');
  const fArea = document.getElementById('f-area');
  const fType = document.getElementById('f-type');

  ISSUES.forEach((i) => fIssue.append(el('option', { value: i }, i)));
  AREAS.forEach((a) => fArea.append(el('option', { value: a }, a)));

  let groups = [];
  try { groups = await loadCSV(DATA_URLS.groups); }
  catch (e) { showError(listBox, e); return; }

  [...new Set(groups.map((g) => g.type).filter(Boolean))].sort()
    .forEach((t) => fType.append(el('option', { value: t }, t)));

  // URLの ?issue= で課題を指定できる（トップの課題タイルから来たとき）
  let picked = new URLSearchParams(location.search).get('issue');
  try {
    if (!picked) picked = sessionStorage.getItem('issue');
    sessionStorage.removeItem('issue');
  } catch (e) { /* 保存領域が使えない環境では何もしない */ }
  if (picked && ISSUES.includes(picked)) fIssue.value = picked;

  function render() {
    const q = kw.value.trim().toLowerCase();
    const shown = groups.filter((g) => {
      if (fIssue.value && !splitList(g.issues).includes(fIssue.value)) return false;
      if (fArea.value && g.area !== fArea.value) return false;
      if (fType.value && g.type !== fType.value) return false;
      if (q && ![g.name, g.summary, g.needs, g.offers, g.issues].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    countBox.textContent = `${shown.length}件の団体・企業が見つかりました`;
    if (shown.length === 0) {
      listBox.replaceChildren(el('li', { class: 'empty-msg' },
        'この条件に当てはまる団体はまだ登録されていません。取り組みが手薄な分野かもしれません。'));
      return;
    }
    listBox.replaceChildren(...shown.map((g) => {
      const link = safeUrl(g.url);
      return el('li', { class: 'group' },
        el('h3', {}, g.name),
        el('div', { class: 'meta' }, `${g.type || '種別未設定'}　｜　${g.area || '地域未設定'}`),
        el('div', { class: 'chips' }, ...splitList(g.issues).map((i) => el('span', { class: 'chip' }, i))),
        el('p', {}, g.summary),
        el('div', { class: 'give-take' },
          el('div', { class: 'needs' }, el('b', {}, '求めていること'), g.needs || '—'),
          el('div', { class: 'offers' }, el('b', {}, '提供できること'), g.offers || '—')),
        link ? el('a', { href: link, target: '_blank', rel: 'noopener noreferrer' }, '団体のWebサイトへ') : null);
    }));
  }

  [kw, fIssue, fArea, fType].forEach((x) => x.addEventListener('input', render));
  document.getElementById('f-reset').addEventListener('click', () => {
    kw.value = ''; fIssue.value = ''; fArea.value = ''; fType.value = '';
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* 履歴を書き換えられない環境では省略 */ }
    render();
  });
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'top') initTop();
  if (page === 'groups') initGroups();
});
