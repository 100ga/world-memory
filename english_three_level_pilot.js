/*
 * Three-level semantic-similarity false-memory pilot: PsychoJS (online) version.
 * Port of english_three_level_pilot.py so it can run on Pavlovia.
 * NOT validated experimental stimuli. Three blocks: one HIGH, one MODERATE, one LOW; exploratory demo only.
 */
import { core, util, visual } from 'https://lib.pavlovia.org/psychojs-2026.2.4.js';
const { PsychoJS } = core;
const { Scheduler } = util;

// The labels HIGH/MODERATE/LOW are ASSUMPTIONS, not measured similarity levels.
// Every list has 15 study words. HIGH: 15 school-related words; MODERATE: 10 school-related
// + 5 unrelated; LOW: 15 unrelated words. The never-presented critical lure is 학교 (none for LOW).
// Memory test (15 items, the SAME words for every participant):
//   studied   = 8 words from the study list (positions 1, 3, 5, ... 15)
//   related   = school-related words that were never presented (the critical lure 학교 included)
//   unrelated = new words unrelated to any list
const BLOCKS = [
  { condition: 'HIGH', topic: 'school', lure: '학교',
    study: ['수업', '급식', '담임', '숙제', '졸업', '시험', '칠판', '선생',
            '국어', '소풍', '반장', '과제', '성적', '청소', '분필'],
    test: { studied: ['수업', '담임', '졸업', '칠판', '국어', '반장', '성적', '분필'],
            related: ['수행', '조회', '야자'],
            unrelated: ['국자', '굴뚝', '저울'] } },
  { condition: 'MODERATE', topic: 'school_mixed', lure: '학교',
    study: ['동창', '출석', '복도', '가방', '지각', '필기', '입시', '독서',
            '정문', '후배', '풍선', '팽이', '철사', '편지', '자석'],
    test: { studied: ['동창', '복도', '지각', '입시', '정문', '풍선', '철사', '자석'],
            related: ['사회', '미술', '역사'],
            unrelated: ['시계', '달력', '연탄'] } },
  { condition: 'LOW', topic: 'unrelated', lure: '',
    study: ['열쇠', '깃발', '리본', '성냥', '도장', '간판', '밧줄', '석탄',
            '화살', '대문', '촛불', '분수', '궁궐', '필름', '잉크'],
    test: { studied: ['열쇠', '리본', '도장', '밧줄', '화살', '촛불', '궁궐', '잉크'],
            related: [],
            unrelated: ['액자', '안경', '벨트', '면봉', '수건', '골목', '나사'] } },
];
// true: the 15 test words appear in a new random order for each participant; false: as listed above.
const SHUFFLE_TEST_ORDER = true;

// Fail loudly while testing if a test list is inconsistent with the study lists.
const STUDY_WORDS = new Set(BLOCKS.flatMap((b) => b.study));
const NEW_WORDS = BLOCKS.flatMap((b) => [b.lure, ...b.test.related, ...b.test.unrelated].filter(Boolean));
for (const b of BLOCKS) {
  const wrong = b.test.studied.filter((w) => !b.study.includes(w));
  if (wrong.length) throw new Error(`${b.condition}: studied test words not in its study list: ${wrong}`);
}
const reused = NEW_WORDS.filter((w) => STUDY_WORDS.has(w));
if (reused.length) throw new Error(`New test words that were actually studied: ${reused}`);
const STUDY_SECONDS = 1.5;
const BLANK_SECONDS = 0.5;
const PROBLEMS_TO_SOLVE = 5;  // distractor task ends once this many additions are answered correctly
const RATING_KEYS = ['1', '2', '3', '4', 'num_1', 'num_2', 'num_3', 'num_4'];

// Results are sent to DataPipe (https://pipe.jspsych.org), which stores them in your Google Drive.
// Paste the Experiment ID from the DataPipe dashboard here. While it is empty (test mode),
// the CSV is downloaded to this computer instead.
const DATAPIPE_EXPERIMENT_ID = 'AE4LxxByJ6qP';
const DATAPIPE_URL = 'https://pipe.jspsych.org/api/data/';
const FIELDS = ['participant', 'block', 'condition', 'topic', 'critical_lure', 'phase',
                'trial', 'word_or_problem', 'item_type', 'correct_answer', 'typed_answer',
                'is_correct', 'rating_1to4', 'said_seen', 'confidence', 'rt_seconds'];

// Where to send the participant after they click OK on the final message ('' = stay on the page).
// {participant} is replaced with the participant ID, e.g. to pre-fill a Google Form question.
const COMPLETION_URL =  // follow-up form; the participant-number question is pre-filled
  'https://docs.google.com/forms/d/e/1FAIpQLSczfJNJT6Fw7zQqBxkEiXn6dIdXkglVfDotr_Ol4qLX8Si2tQ/viewform?usp=pp_url&entry.1881614587={participant}';
const EXIT_URL = '';        // after quitting early with ESC

const expName = 'english_three_level_pilot';
// participant can also be passed in the URL, e.g. ...?participant=P01
// (PsychoJS hides URL fields in the dialog but does not copy them into expInfo, so read it here.)
const urlParticipant = new URLSearchParams(window.location.search).get('participant');
const expInfo = { participant: urlParticipant || `${Math.floor(Math.random() * 1e6)}`.padStart(6, '0') };
const rows = [];

// saveResults: false stops PsychoJS from downloading its own CSV; saveData() below handles it.
const psychoJS = new PsychoJS({ debug: false, saveResults: false });
psychoJS.openWindow({ fullscr: true, color: new util.Color('black'), units: 'height', waitBlanking: true });

psychoJS.schedule(psychoJS.gui.DlgFromDict({ dictionary: expInfo, title: '단어 기억 실험' }));
const flowScheduler = new Scheduler(psychoJS);
const dialogCancelScheduler = new Scheduler(psychoJS);
psychoJS.scheduleCondition(() => psychoJS.gui.dialogComponent.button === 'OK',
                           flowScheduler, dialogCancelScheduler);
flowScheduler.add(setup);
flowScheduler.add(runFrame);
flowScheduler.add(showSaving);
flowScheduler.add(() => finish(isCompleted));
dialogCancelScheduler.add(() => quit('', false));

psychoJS.start({ expName, expInfo, resources: [] });

let main, footer, experimentRun;
let isCompleted = true;  // false when the participant exits with ESC

function setup() {
  // Participants' screens vary, so keep text inside 90% of the window width (height units).
  const [width, height] = psychoJS.window.size;
  const maxWrap = 0.9 * width / height;
  main = new visual.TextStim({ win: psychoJS.window, name: 'main', text: '', color: new util.Color('white'),
                               height: 0.052, wrapWidth: Math.min(1.45, maxWrap), pos: [0, 0] });
  footer = new visual.TextStim({ win: psychoJS.window, name: 'footer', text: '', color: new util.Color('white'),
                                 height: 0.028, wrapWidth: Math.min(1.7, maxWrap), pos: [0, -0.30] });
  main.setAutoDraw(true);
  footer.setAutoDraw(true);
  experimentRun = experiment();
  return Scheduler.Event.NEXT;
}

// Called once per screen refresh; advances the experiment generator by one frame.
function runFrame() {
  if (psychoJS.experiment.experimentEnded
      || psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0) {
    isCompleted = false;  // Saves partial data too.
    return Scheduler.Event.NEXT;
  }
  return experimentRun.next().done ? Scheduler.Event.NEXT : Scheduler.Event.FLIP_REPEAT;
}

// Draw the saving notice before the upload starts; the screen does not refresh while it runs.
// PsychoJS applies text changes after drawing a frame, so the notice appears on the second flip.
// (FLIP_NEXT would end the nested flowScheduler, so repeat with FLIP_REPEAT instead.)
let savingFrames = 0;
function showSaving() {
  if (savingFrames === 0) show('응답을 저장하고 있습니다...\n\n창을 닫지 마세요.');
  savingFrames += 1;
  return savingFrames > 2 ? Scheduler.Event.NEXT : Scheduler.Event.FLIP_REPEAT;
}

function redirectUrl(template) {
  return template ? template.replace(/\{participant\}/g, encodeURIComponent(expInfo.participant)) : undefined;
}

async function finish(isCompleted) {
  const { filename, result } = await saveData();
  // PsychoJS follows these when the participant clicks OK on the final message.
  psychoJS.setRedirectUrls(redirectUrl(COMPLETION_URL), redirectUrl(EXIT_URL));
  const thanks = isCompleted ? '참여해 주셔서 감사합니다!' : '실험을 중간에 종료했습니다.';
  const messages = {
    sent: `${thanks} 응답이 저장되었습니다.`,
    test: `테스트 모드(DataPipe ID 없음): 결과가 ${filename} 파일로 다운로드되었습니다.`,
    failed: `${thanks} 온라인 저장에 실패하여 결과가 ${filename} 파일로 다운로드되었습니다. `
            + '이 파일을 연구자에게 보내 주세요.',
  };
  return quit(messages[result], isCompleted);
}

async function quit(message, isCompleted) {
  psychoJS.window.close();
  psychoJS.quit({ message, isCompleted });
  return Scheduler.Event.QUIT;
}

function toCsv(records) {
  const cell = (value) => {
    const text = value === undefined || value === null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [FIELDS.join(','), ...records.map((r) => FIELDS.map((f) => cell(r[f])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';  // BOM so Excel reads it as UTF-8, like the .py
}

function downloadCsv(filename, csv) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Same file name pattern as the .py version: three_level_<participant>_<YYYYMMDD_HHMMSS>.csv
async function saveData() {
  const participant = String(expInfo.participant).replace(/[^A-Za-z0-9_-]/g, '') || 'test';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_`
                + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `three_level_${participant}_${stamp}.csv`;
  const csv = toCsv(rows);

  if (!DATAPIPE_EXPERIMENT_ID) {
    downloadCsv(filename, csv);
    return { filename, result: 'test' };
  }
  try {
    const response = await fetch(DATAPIPE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({ experimentID: DATAPIPE_EXPERIMENT_ID, filename, data: csv }),
      signal: AbortSignal.timeout(15000),  // give up after 15 s and fall back to a download
    });
    // 201 = stored, 202 = queued for retry by DataPipe (also a success; do not resend).
    if (response.status === 201 || response.status === 202) return { filename, result: 'sent' };
    console.error('DataPipe rejected the data:', response.status, await response.text());
  } catch (error) {
    console.error('Could not reach DataPipe:', error);
  }
  downloadCsv(filename, csv);  // never lose the data: fall back to a local file
  return { filename, result: 'failed' };
}

function show(message, hint = '') {
  main.setText(message);
  footer.setText(hint);
}

function addRow(row) {
  rows.push(row);
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// PsychoJS 2026.2.4's key map has no entry for Backspace, so eventManager.getKeys() never
// reports it. Typed answers are therefore read straight from the browser's keydown events.
const typedKeys = [];
window.addEventListener('keydown', (event) => {
  // Text fields (e.g. the participant box in the start dialog) must keep their normal editing keys.
  if (event.target.closest && event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === 'Backspace') event.preventDefault();  // never let it trigger "go back"
  typedKeys.push(event.key);
});

function randint(low, high) {  // inclusive, like Python's random.randint
  return low + Math.floor(Math.random() * (high - low + 1));
}

// Generator helpers: every `yield` waits for the next screen refresh.
function* wait(seconds) {
  const clock = new util.Clock();
  while (clock.getTime() < seconds) yield;
}

function* getKey(allowed) {
  psychoJS.eventManager.clearEvents();
  while (true) {
    const keys = psychoJS.eventManager.getKeys({ keyList: allowed });
    if (keys.length > 0) return keys[0];
    yield;
  }
}

function* arithmetic(blockNum, block) {
  show(`계산 과제\n\n덧셈 문제 ${PROBLEMS_TO_SOLVE}개를 풀어 주세요.`,
       '정답을 입력해야 다음 문제로 넘어갑니다. 숫자를 입력하고 Enter를 누르세요. 시작하려면 스페이스바를 누르세요.');
  yield* getKey(['space']);
  const overall = new util.Clock();
  for (let number = 1; number <= PROBLEMS_TO_SOLVE; number++) {
    const a = randint(10, 49);
    const b = randint(10, 49);
    const correctAnswer = a + b;
    let typed = '';
    let attempts = 0;
    const questionClock = new util.Clock();
    let feedbackUntil = 0;
    typedKeys.length = 0;
    let solved = false;

    while (!solved) {
      const feedback = overall.getTime() < feedbackUntil
        ? '틀렸습니다. 다시 입력해 주세요!' : '정답을 입력해야 다음 문제로 넘어갑니다.';
      show(`${a} + ${b} = ?\n\n입력한 답: ${typed || '_'}`,
           `${feedback}\nEnter: 제출   Backspace: 지우기   ${number} / ${PROBLEMS_TO_SOLVE}번째 문제`);

      // event.key is '0'-'9' for both the top row and the numpad, and 'Enter' for both Enter keys.
      for (const key of typedKeys.splice(0)) {
        if (key === 'Enter' && typed) {
          attempts += 1;
          const isCorrect = typed === String(correctAnswer);
          addRow({
            participant: expInfo.participant, block: blockNum,
            condition: block.condition, topic: block.topic,
            critical_lure: block.lure, phase: 'arithmetic',
            trial: number, word_or_problem: `${a}+${b}`,
            item_type: `addition_attempt_${attempts}`,
            correct_answer: correctAnswer, typed_answer: typed,
            is_correct: Number(isCorrect), rating_1to4: '',
            said_seen: '', confidence: '',
            rt_seconds: Number(questionClock.getTime().toFixed(4)),
          });
          typed = '';
          if (isCorrect) {
            solved = true;
          } else {
            feedbackUntil = overall.getTime() + 1.5;
          }
          break;
        } else if (key === 'Backspace') {
          typed = typed.slice(0, -1);
        } else if (/^[0-9]$/.test(key) && typed.length < 4) {
          typed += key;
        }
      }
      yield;
    }
  }
  psychoJS.eventManager.clearEvents();  // drop the typing keys PsychoJS buffered meanwhile
}

function buildTest(block) {
  const items = [
    ...block.test.studied.map((w) => [w, 'studied']),
    ...(block.lure ? [[block.lure, 'critical_lure']] : []),
    ...block.test.related.map((w) => [w, 'related_new']),
    ...block.test.unrelated.map((w) => [w, 'unrelated_new']),
  ];
  return SHUFFLE_TEST_ORDER ? shuffle(items) : items;
}

function* experiment() {
  show('단어 기억 실험\n\n'
       + '짧은 단어 목록을 외운 뒤, 덧셈 문제를 풀고, 기억 검사를 하게 됩니다.\n\n'
       + '검사에는 보여 드리지 않은 단어도 나옵니다. 실제로 기억나는 대로 답해 주세요.',
       '시작하려면 스페이스바를 누르세요. ESC를 누르면 그때까지의 응답을 저장하고 종료합니다.');
  yield* getKey(['space']);

  // One block per condition (HIGH, MODERATE, LOW); shuffle order for this DEMO.
  const blocks = shuffle(BLOCKS);
  for (const [index, block] of blocks.entries()) {
    const blockNum = index + 1;
    show(`${blocks.length}개 중 ${blockNum}번째 세트\n\n이제 나오는 단어들을 기억해 주세요.`,
         '시작하려면 스페이스바를 누르세요.');
    yield* getKey(['space']);
    for (const word of block.study) {
      show(word);
      yield* wait(STUDY_SECONDS);
      show('');
      yield* wait(BLANK_SECONDS);
    }

    yield* arithmetic(blockNum, block);
    show('기억 검사\n\n각 단어가 방금 외운 목록에 있었나요?\n\n'
         + '1 = 확실히 있었다    2 = 아마 있었다\n'
         + '3 = 아마 없었다      4 = 확실히 없었다', '시작하려면 스페이스바를 누르세요.');
    yield* getKey(['space']);
    const tests = buildTest(block);
    for (const [i, [word, kind]] of tests.entries()) {
      show(word, '1 확실히 있었다     2 아마 있었다\n3 아마 없었다       4 확실히 없었다');
      const clock = new util.Clock();
      const key = yield* getKey(RATING_KEYS);
      const rt = clock.getTime();
      const rating = Number(key.slice(-1));
      const saidSeen = Number(rating === 1 || rating === 2);
      addRow({
        participant: expInfo.participant, block: blockNum,
        condition: block.condition, topic: block.topic,
        critical_lure: block.lure, phase: 'recognition', trial: i + 1,
        word_or_problem: word, item_type: kind, correct_answer: '',
        typed_answer: '', is_correct: Number(saidSeen === Number(kind === 'studied')),
        rating_1to4: rating, said_seen: saidSeen,
        confidence: rating === 1 || rating === 4 ? 'high' : 'low',
        rt_seconds: Number(rt.toFixed(4)),
      });
    }
  }

  show('실험이 끝났습니다!\n\n참여해 주셔서 감사합니다.',
       '스페이스바를 누르면 결과를 저장하고 종료합니다.');
  yield* getKey(['space']);
}
