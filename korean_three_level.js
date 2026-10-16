/*
 * 한국어 의미 관련성 오기억 실험 — PsychoJS(온라인) 버전.
 * 기존 english_three_level_pilot.js(학교 1세트 데모)의 흐름을 유지하되,
 *   - 자극을 stimuli.js(본실험_단어셋_v1 에서 생성)로 분리
 *   - DESIGN 상수로 설계 선택: 기본 'themes_plus_unrelated' = 주제 목록 3개(학교·음료·병원) + 무관 목록 1개, 블록 4개
 *     ('latin_square' = 유인어 고정·조건 회전, 블록 3개)
 *   - 블록당 학습 10단어, 산수(최소 문제 수 + 최소 시간), 재인 검사 old 5 + new 5(유인어 1 + 무관 foil 4), 4점 확신 + RT
 *   - 참가자 ID로 무선화를 재현(seed)할 수 있음
 * 설계 근거: experiment_design_v1.md
 */
import { core, util, visual } from 'https://lib.pavlovia.org/psychojs-2026.2.4.js';
import { SETS, UNRELATED } from './stimuli.js?v=20261016c';   // 자극 파일을 다시 만들면 v 값을 바꿔 캐시를 무효화
const { PsychoJS } = core;
const { Scheduler } = util;

// ---------- 설정 ----------
// DESIGN
//  'themes_plus_unrelated' : 모든 참가자가 주제 목록 3개(학교·음료·병원, 각 강 15단어)와 무관 목록 1개(무관 풀 15단어)를 본다 → 블록 4개, 순서 무선.
//                            검사 = old 8 + new 8 (주제 블록: 유인어 1 + 무관 foil 7 / 무관 블록: 무관 풀 새 단어 8). 비교: 주제 블록 유인어 오인률 vs 무관 블록 새 단어·모든 블록 foil 오경보율.
//  'latin_square'          : 유인어 고정·조건 회전(참가자 번호 % 3 으로 각 유인어를 강/약/무관 중 하나에 배정) → 블록 3개. experiment_design_v1.md 안. (약 목록은 10개뿐이라 LIST_LEN 10 으로 낮춰야 함)
const DESIGN = 'themes_plus_unrelated';
const INCLUDE_SPARE = false;        // latin_square 에서만: 예비 세트(가구)도 블록으로 포함
const LIST_LEN = 15;                // 블록당 학습 단어 수 (기존 실험과 같이 15)
const N_OLD_TEST = 8;               // 검사 old 수 (학습 순서 1,3,5,…,15번째 — 기존 실험과 같음)
const N_FOILS = 7;                  // 검사 무관 foil 수 (+ 유인어 1 = new 8 → old 8 : new 8)
// ?quick=1 : 동작 점검용(제시 0.3초, 산수 2문제·3초). 본실험에서는 붙이지 말 것.
const QUICK = new URLSearchParams(window.location.search).get('quick') === '1';
const STUDY_SECONDS = QUICK ? 0.3 : 1.5;
const BLANK_SECONDS = QUICK ? 0.1 : 0.5;
const PROBLEMS_TO_SOLVE = QUICK ? 2 : 6;          // 산수: 최소 문제 수
const DISTRACTOR_MIN_SECONDS = QUICK ? 3 : 45;    // 산수: 최소 시간(둘 다 채워야 끝남)
const PRACTICE = true;              // 연습 블록(분석 제외)
const SHUFFLE_TEST_ORDER = true;
const CONDITIONS = ['high', 'mid', 'unrelated'];
const CONDITION_LABEL = { high: '강', mid: '약', unrelated: '무관' };
const RATING_KEYS = ['1', '2', '3', '4', 'num_1', 'num_2', 'num_3', 'num_4'];
// 연습용 단어(어느 세트·무관 풀에도 없음)
const PRACTICE_STUDY = ['양말', '거울', '양초', '사다리'];
const PRACTICE_TEST = [['양말', 'studied'], ['모자', 'unrelated_foil'], ['양초', 'studied'], ['가위', 'unrelated_foil']];

// 결과 저장: DataPipe(https://pipe.jspsych.org). 비우면 CSV 다운로드. URL 에 ?test=1 을 붙이면 업로드하지 않고 다운로드.
const DATAPIPE_EXPERIMENT_ID = 'AE4LxxByJ6qP';   // 본실험용 DataPipe 실험을 새로 만들면 여기 ID 교체
const DATAPIPE_URL = 'https://pipe.jspsych.org/api/data/';
const COMPLETION_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSczfJNJT6Fw7zQqBxkEiXn6dIdXkglVfDotr_Ol4qLX8Si2tQ/viewform?usp=pp_url&entry.1881614587={participant}';
const EXIT_URL = '';
const FIELDS = ['participant', 'version', 'design', 'block', 'set_id', 'critical_lure', 'condition', 'phase',
                'trial', 'word_or_problem', 'item_type', 'study_position', 'correct_answer', 'typed_answer',
                'is_correct', 'rating_1to4', 'said_seen', 'confidence', 'rt_seconds'];

// ---------- 참가자·무선화 ----------
const params = new URLSearchParams(window.location.search);
const TEST_MODE = params.get('test') === '1';
const urlParticipant = params.get('participant');
const expInfo = { participant: urlParticipant || `${Math.floor(Math.random() * 1e6)}`.padStart(6, '0') };
const rows = [];

function hashString(s) {  // FNV-1a 32bit
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = Math.random;
function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function randint(low, high) { return low + Math.floor(rng() * (high - low + 1)); }

// 참가자 번호가 정수면 (n-1) % 3, 아니면 ID 해시 % 3 → 유인어 묶음–조건 회전 버전
function versionOf(participant) {
  const n = Number(participant);
  return Number.isInteger(n) && n > 0 ? (n - 1) % 3 : hashString(String(participant)) % 3;
}

// 세션 구성: 블록 목록 (무관 학습 목록·foil 은 공용 풀에서 참가자마다 중복 없이)
function buildSession(participant) {
  rng = mulberry32(hashString(`k3l:${participant}`));
  const version = versionOf(participant);
  const pool = shuffle(UNRELATED);
  let cursor = 0;
  const take = (n) => { const out = pool.slice(cursor, cursor + n); cursor += n; if (out.length < n) throw new Error('무관 풀 부족'); return out; };
  const makeBlock = (s, condition) => {
    const study = shuffle(condition === 'unrelated' ? take(LIST_LEN) : s[condition].slice(0, LIST_LEN));
    const oldIdx = [0, 2, 4, 6, 8, 10, 12, 14].slice(0, N_OLD_TEST);   // 학습 순서 1,3,5,…번째(0-based 짝수) — 기존 실험과 같음
    const unrelatedBlock = condition === 'unrelated';   // 무관 블록: 유인어 없음, new 는 전부 무관 풀 단어
    const test = [
      ...oldIdx.map((k) => ({ word: study[k], kind: 'studied', pos: k + 1 })),
      ...(unrelatedBlock ? [] : [{ word: s.lure, kind: 'critical_lure', pos: '' }]),
      ...take(N_FOILS + (unrelatedBlock ? 1 : 0)).map((w) => ({ word: w, kind: 'unrelated_foil', pos: '' })),
    ];
    return { set_id: unrelatedBlock ? 0 : s.set_id, lure: unrelatedBlock ? '' : s.lure, condition, study, test: SHUFFLE_TEST_ORDER ? shuffle(test) : test };
  };
  let blocks;
  if (DESIGN === 'themes_plus_unrelated') {
    const mains = SETS.filter((s) => s.role === 'main');
    blocks = [...mains.map((s) => makeBlock(s, 'high')), makeBlock(mains[0], 'unrelated')];
  } else {
    const sets = SETS.filter((s) => s.role === 'main' || INCLUDE_SPARE);
    blocks = sets.map((s, i) => makeBlock(s, CONDITIONS[(i + version) % 3]));
  }
  // 블록 순서: 같은 조건 3연속 금지
  if (DESIGN === 'themes_plus_unrelated') {
    blocks = shuffle(blocks);                  // 4블록 순서 무선 (무관 블록 위치도 무선 → 분석에서 block 열로 순서 효과 확인)
  } else {
    for (let tries = 0; tries < 500; tries++) {
      const order = shuffle(blocks);
      let ok = true, run = 1;
      for (let i = 1; i < order.length; i++) { run = order[i].condition === order[i - 1].condition ? run + 1 : 1; if (run > 2) ok = false; }
      if (ok) { blocks = order; break; }
    }
  }
  // 한 세션 안에서 학습·검사에 쓰인 단어는 모두 유일해야 한다(세트 간·무관 풀 겹침, 중복 추출 방지)
  const used = blocks.flatMap((b) => [...b.study, ...b.test.filter((x) => x.kind !== 'studied').map((x) => x.word)]);   // old 문항은 학습 단어와 같으므로 제외
  const dup = used.filter((w, i) => used.indexOf(w) !== i);
  if (dup.length) throw new Error(`세션 안에 중복 단어: ${[...new Set(dup)].join(', ')}`);
  return { version, design: DESIGN, blocks };
}

// 무결성 검사(세트 간 중복·무관 풀 겹침)는 make_stimuli_js.py 가 보장; 여기서는 길이만 확인
for (const s of SETS) {
  if (s.role === 'main' && s.high.length < LIST_LEN) throw new Error(`${s.lure}: 강 단어가 ${LIST_LEN}개 미만`);
}
if (UNRELATED.length < LIST_LEN + N_FOILS * (SETS.length + 1)) throw new Error('무관 풀이 학습 목록 + foil 수보다 작음');

// ---------- PsychoJS ----------
const expName = 'korean_three_level';
const psychoJS = new PsychoJS({ debug: false, saveResults: false });
psychoJS.openWindow({ fullscr: !TEST_MODE, color: new util.Color('black'), units: 'height', waitBlanking: true });
psychoJS.schedule(psychoJS.gui.DlgFromDict({ dictionary: expInfo, title: '단어 기억 실험' }));
const flowScheduler = new Scheduler(psychoJS);
const dialogCancelScheduler = new Scheduler(psychoJS);
psychoJS.scheduleCondition(() => psychoJS.gui.dialogComponent.button === 'OK', flowScheduler, dialogCancelScheduler);
flowScheduler.add(setup);
flowScheduler.add(runFrame);
flowScheduler.add(showSaving);
flowScheduler.add(() => finish(isCompleted));
dialogCancelScheduler.add(() => quit('', false));
psychoJS.start({ expName, expInfo, resources: [] });

let main, footer, experimentRun, session;
let isCompleted = true;

function setup() {
  const [width, height] = psychoJS.window.size;
  const maxWrap = 0.9 * width / height;
  main = new visual.TextStim({ win: psychoJS.window, name: 'main', text: '', color: new util.Color('white'),
                               height: 0.052, wrapWidth: Math.min(1.45, maxWrap), pos: [0, 0] });
  footer = new visual.TextStim({ win: psychoJS.window, name: 'footer', text: '', color: new util.Color('white'),
                                 height: 0.028, wrapWidth: Math.min(1.7, maxWrap), pos: [0, -0.30] });
  main.setAutoDraw(true); footer.setAutoDraw(true);
  session = buildSession(expInfo.participant);
  window.K3L_SESSION = session;  // 디버그·검증용
  experimentRun = experiment();
  return Scheduler.Event.NEXT;
}

function runFrame() {
  if (psychoJS.experiment.experimentEnded || psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0) {
    isCompleted = false;
    return Scheduler.Event.NEXT;
  }
  return experimentRun.next().done ? Scheduler.Event.NEXT : Scheduler.Event.FLIP_REPEAT;
}

let savingFrames = 0;
function showSaving() {
  if (savingFrames === 0) show('응답을 저장하고 있습니다...\n\n창을 닫지 마세요.');
  savingFrames += 1;
  return savingFrames > 2 ? Scheduler.Event.NEXT : Scheduler.Event.FLIP_REPEAT;
}
function redirectUrl(t) { return t ? t.replace(/\{participant\}/g, encodeURIComponent(expInfo.participant)) : undefined; }

async function finish(isCompleted) {
  const { filename, result } = await saveData();
  psychoJS.setRedirectUrls(redirectUrl(COMPLETION_URL), redirectUrl(EXIT_URL));
  const thanks = isCompleted ? '참여해 주셔서 감사합니다!' : '실험을 중간에 종료했습니다.';
  const messages = {
    sent: `${thanks} 응답이 저장되었습니다.`,
    test: `테스트 모드: 결과가 ${filename} 파일로 다운로드되었습니다.`,
    failed: `${thanks} 온라인 저장에 실패하여 결과가 ${filename} 파일로 다운로드되었습니다. 이 파일을 연구자에게 보내 주세요.`,
  };
  return quit(messages[result], isCompleted);
}
async function quit(message, isCompleted) {
  psychoJS.window.close();
  psychoJS.quit({ message, isCompleted });
  return Scheduler.Event.QUIT;
}

function toCsv(records) {
  const cell = (v) => { const t = v === undefined || v === null ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return '﻿' + [FIELDS.join(','), ...records.map((r) => FIELDS.map((f) => cell(r[f])).join(','))].join('\r\n') + '\r\n';
}
function downloadCsv(filename, csv) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = filename; document.body.appendChild(link); link.click(); link.remove();
}
async function saveData() {
  const participant = String(expInfo.participant).replace(/[^A-Za-z0-9_-]/g, '') || 'test';
  const now = new Date(); const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `k3l_${participant}_v${session.version}_${stamp}.csv`;
  const csv = toCsv(rows);
  window.K3L_CSV = csv;  // 검증용
  if (!DATAPIPE_EXPERIMENT_ID || TEST_MODE) { downloadCsv(filename, csv); return { filename, result: 'test' }; }
  try {
    const response = await fetch(DATAPIPE_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({ experimentID: DATAPIPE_EXPERIMENT_ID, filename, data: csv }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 201 || response.status === 202) return { filename, result: 'sent' };
    console.error('DataPipe rejected the data:', response.status, await response.text());
  } catch (error) { console.error('Could not reach DataPipe:', error); }
  downloadCsv(filename, csv);
  return { filename, result: 'failed' };
}

function show(message, hint = '') { main.setText(message); footer.setText(hint); }
function addRow(row) { rows.push(row); }

const typedKeys = [];
window.addEventListener('keydown', (event) => {
  if (event.target.closest && event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === 'Backspace') event.preventDefault();
  typedKeys.push(event.key);
});

function* wait(seconds) { const clock = new util.Clock(); while (clock.getTime() < seconds) yield; }
function* getKey(allowed) {
  psychoJS.eventManager.clearEvents();
  while (true) { const keys = psychoJS.eventManager.getKeys({ keyList: allowed }); if (keys.length > 0) return keys[0]; yield; }
}

function baseRow(block, blockNum, phase) {
  return { participant: expInfo.participant, version: session.version, design: session.design, block: blockNum, set_id: block.set_id,
           critical_lure: block.lure, condition: block.condition, phase };
}

function* arithmetic(blockNum, block, minProblems, minSeconds) {
  show(`계산 과제\n\n덧셈 문제를 풀어 주세요. (최소 ${minProblems}문제, ${minSeconds}초)`,
       '정답을 입력해야 다음 문제로 넘어갑니다. 숫자를 입력하고 Enter를 누르세요. 시작하려면 스페이스바를 누르세요.');
  yield* getKey(['space']);
  const overall = new util.Clock();
  let number = 0;
  while (number < minProblems || overall.getTime() < minSeconds) {
    number += 1;
    const a = randint(10, 49), b = randint(10, 49), correctAnswer = a + b;
    window.K3L_PROBLEM = correctAnswer;  // 검증용
    let typed = '', attempts = 0, solved = false, feedbackUntil = 0;
    const questionClock = new util.Clock();
    typedKeys.length = 0;
    while (!solved) {
      const feedback = overall.getTime() < feedbackUntil ? '틀렸습니다. 다시 입력해 주세요!' : '정답을 입력해야 다음 문제로 넘어갑니다.';
      show(`${a} + ${b} = ?\n\n입력한 답: ${typed || '_'}`, `${feedback}\nEnter: 제출   Backspace: 지우기   ${number}번째 문제`);
      for (const key of typedKeys.splice(0)) {
        if (key === 'Enter' && typed) {
          attempts += 1;
          const isCorrect = typed === String(correctAnswer);
          addRow({ ...baseRow(block, blockNum, 'arithmetic'), trial: number, word_or_problem: `${a}+${b}`,
                   item_type: `addition_attempt_${attempts}`, study_position: '', correct_answer: correctAnswer, typed_answer: typed,
                   is_correct: Number(isCorrect), rating_1to4: '', said_seen: '', confidence: '',
                   rt_seconds: Number(questionClock.getTime().toFixed(4)) });
          typed = '';
          if (isCorrect || attempts >= 3) solved = true; else feedbackUntil = overall.getTime() + 1.5;
          break;
        } else if (key === 'Backspace') typed = typed.slice(0, -1);
        else if (/^[0-9]$/.test(key) && typed.length < 4) typed += key;
      }
      yield;
    }
  }
  psychoJS.eventManager.clearEvents();
}

function* runBlock(block, blockNum, total, isPractice) {
  const label = isPractice ? '연습' : `${total}개 중 ${blockNum}번째 세트`;
  show(`${label}\n\n이제 나오는 단어들을 기억해 주세요.`, '시작하려면 스페이스바를 누르세요.');
  yield* getKey(['space']);
  for (const [k, word] of block.study.entries()) {
    show(word); yield* wait(STUDY_SECONDS); show(''); yield* wait(BLANK_SECONDS);
    addRow({ ...baseRow(block, blockNum, 'study'), trial: k + 1, word_or_problem: word, item_type: 'study_word', study_position: k + 1,
             correct_answer: '', typed_answer: '', is_correct: '', rating_1to4: '', said_seen: '', confidence: '', rt_seconds: '' });
  }
  yield* arithmetic(blockNum, block, isPractice ? 2 : PROBLEMS_TO_SOLVE, isPractice ? 5 : DISTRACTOR_MIN_SECONDS);
  show('기억 검사\n\n각 단어가 방금 외운 목록에 있었나요?\n\n1 = 확실히 있었다    2 = 아마 있었다\n3 = 아마 없었다      4 = 확실히 없었다',
       '시작하려면 스페이스바를 누르세요.');
  yield* getKey(['space']);
  for (const [i, item] of block.test.entries()) {
    show(item.word, '1 확실히 있었다     2 아마 있었다\n3 아마 없었다       4 확실히 없었다');
    const clock = new util.Clock();
    const key = yield* getKey(RATING_KEYS);
    const rt = clock.getTime();
    const rating = Number(key.slice(-1));
    const saidSeen = Number(rating === 1 || rating === 2);
    addRow({ ...baseRow(block, blockNum, 'recognition'), trial: i + 1, word_or_problem: item.word, item_type: item.kind, study_position: item.pos,
             correct_answer: '', typed_answer: '', is_correct: Number(saidSeen === Number(item.kind === 'studied')),
             rating_1to4: rating, said_seen: saidSeen, confidence: rating === 1 || rating === 4 ? 'high' : 'low',
             rt_seconds: Number(rt.toFixed(4)) });
  }
}

function* experiment() {
  show('단어 기억 실험\n\n짧은 단어 목록을 외운 뒤, 덧셈 문제를 풀고, 기억 검사를 하게 됩니다.\n\n'
       + '검사에는 보여 드리지 않은 단어도 나옵니다. 실제로 기억나는 대로 답해 주세요.',
       '시작하려면 스페이스바를 누르세요. ESC를 누르면 그때까지의 응답을 저장하고 종료합니다.');
  yield* getKey(['space']);
  if (PRACTICE) {
    const practice = { set_id: 0, lure: '', condition: 'practice', study: PRACTICE_STUDY,
                       test: PRACTICE_TEST.map(([word, kind]) => ({ word, kind, pos: '' })) };
    yield* runBlock(practice, 0, session.blocks.length, true);
    show('연습이 끝났습니다.\n\n이제 본 실험을 시작합니다. 세트는 모두 ' + session.blocks.length + '개입니다.', '시작하려면 스페이스바를 누르세요.');
    yield* getKey(['space']);
  }
  for (const [index, block] of session.blocks.entries()) yield* runBlock(block, index + 1, session.blocks.length, false);
  show('실험이 끝났습니다!\n\n참여해 주셔서 감사합니다.', '스페이스바를 누르면 결과를 저장하고 종료합니다.');
  yield* getKey(['space']);
}
