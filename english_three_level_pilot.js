/*
 * Three-level semantic-similarity false-memory pilot: PsychoJS (online) version.
 * Port of english_three_level_pilot.py so it can run on Pavlovia.
 * NOT validated experimental stimuli. Two blocks: one HIGH, one LOW; exploratory demo only.
 */
import { core, util, visual } from 'https://lib.pavlovia.org/psychojs-2026.2.4.js';
const { PsychoJS } = core;
const { Scheduler } = util;

// The labels HIGH/LOW are ASSUMPTIONS, not measured similarity levels.
// Every list has 8 study words, a never-presented critical lure and 2 new foils.
// Each condition has different topics; this demo DOES NOT control topic confounds.
const BLOCKS = [
  { condition: 'HIGH', topic: 'sleep', lure: 'SLEEP',
    study: ['BED', 'PILLOW', 'DREAM', 'TIRED', 'NAP', 'BLANKET', 'REST', 'DROWSY'],
    foils: ['CARROT', 'BRIDGE'] },
  { condition: 'LOW', topic: 'garden', lure: 'GARDEN',
    study: ['PHONE', 'COFFEE', 'RIVER', 'JACKET', 'WINDOW', 'MUSIC', 'TICKET', 'CLOCK'],
    foils: ['PENCIL', 'AIRPLANE'] },
];
const STUDY_SECONDS = 1.5;
const BLANK_SECONDS = 0.5;
const DISTRACTOR_SECONDS = 30;
const RATING_KEYS = ['1', '2', '3', '4', 'num_1', 'num_2', 'num_3', 'num_4'];

// Results are sent to DataPipe (https://pipe.jspsych.org), which stores them in your OSF project.
// Paste the Experiment ID from the DataPipe dashboard here. While it is empty (test mode),
// the CSV is downloaded to this computer instead.
const DATAPIPE_EXPERIMENT_ID = 'AE4LxxByJ6qP';
const DATAPIPE_URL = 'https://pipe.jspsych.org/api/data/';
const FIELDS = ['participant', 'block', 'condition', 'topic', 'critical_lure', 'phase',
                'trial', 'word_or_problem', 'item_type', 'correct_answer', 'typed_answer',
                'is_correct', 'rating_1to4', 'said_seen', 'confidence', 'rt_seconds'];

const expName = 'english_three_level_pilot';
// participant can also be passed in the URL, e.g. ...?participant=P01
// (PsychoJS hides URL fields in the dialog but does not copy them into expInfo, so read it here.)
const urlParticipant = new URLSearchParams(window.location.search).get('participant');
const expInfo = { participant: urlParticipant || `${Math.floor(Math.random() * 1e6)}`.padStart(6, '0') };
const rows = [];

// saveResults: false stops PsychoJS from downloading its own CSV; saveData() below handles it.
const psychoJS = new PsychoJS({ debug: false, saveResults: false });
psychoJS.openWindow({ fullscr: true, color: new util.Color('black'), units: 'height', waitBlanking: true });

psychoJS.schedule(psychoJS.gui.DlgFromDict({ dictionary: expInfo, title: expName }));
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
  if (savingFrames === 0) show('Saving your responses...\n\nPlease do not close this window.');
  savingFrames += 1;
  return savingFrames > 2 ? Scheduler.Event.NEXT : Scheduler.Event.FLIP_REPEAT;
}

async function finish(isCompleted) {
  const { filename, result } = await saveData();
  const thanks = isCompleted ? 'Thank you for participating!' : 'You exited early.';
  const messages = {
    sent: `${thanks} Your responses have been saved.`,
    test: `TEST MODE (no DataPipe ID set): the results were downloaded as ${filename}.`,
    failed: `${thanks} Online saving failed, so the results were downloaded as ${filename}. `
            + 'Please send this file to the researcher.',
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
  show('ARITHMETIC TASK\n\nSolve each addition problem.',
       'Only CORRECT answers advance. Type digits and press ENTER. SPACE to start.');
  yield* getKey(['space']);
  const overall = new util.Clock();
  let number = 0;
  while (overall.getTime() < DISTRACTOR_SECONDS) {
    number += 1;
    const a = randint(10, 49);
    const b = randint(10, 49);
    const correctAnswer = a + b;
    let typed = '';
    let attempts = 0;
    const questionClock = new util.Clock();
    let feedbackUntil = 0;
    typedKeys.length = 0;
    let solved = false;

    while (overall.getTime() < DISTRACTOR_SECONDS && !solved) {
      const remaining = Math.max(0, Math.floor(DISTRACTOR_SECONDS - overall.getTime() + 0.999));
      const feedback = overall.getTime() < feedbackUntil
        ? 'Incorrect. Try again!' : 'Only a correct answer moves to the next problem.';
      show(`${a} + ${b} = ?\n\nYour answer: ${typed || '_'}`,
           `${feedback}\nENTER: submit   BACKSPACE: delete   ${remaining}s left`);

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

function* experiment() {
  show('THREE-LEVEL SEMANTIC SIMILARITY PILOT\n\n'
       + 'You will study short word lists, solve arithmetic problems, and take memory tests.\n\n'
       + 'Some test words were NOT presented. Respond based on what you actually remember.',
       'Press SPACE to begin. ESC saves available data and exits.');
  yield* getKey(['space']);

  // One block per condition (HIGH, LOW); shuffle order for this DEMO.
  const blocks = shuffle(BLOCKS);
  for (const [index, block] of blocks.entries()) {
    const blockNum = index + 1;
    show(`BLOCK ${blockNum} OF ${blocks.length}\n\nRemember the following words.`,
         'Press SPACE to begin.');
    yield* getKey(['space']);
    for (const word of block.study) {
      show(word);
      yield* wait(STUDY_SECONDS);
      show('');
      yield* wait(BLANK_SECONDS);
    }

    yield* arithmetic(blockNum, block);
    show('MEMORY TEST\n\nWas each word in the list you JUST studied?\n\n'
         + '1 = Definitely YES    2 = Probably YES\n'
         + '3 = Probably NO       4 = Definitely NO', 'Press SPACE to begin.');
    yield* getKey(['space']);
    // Four old words, one critical lure and two unrelated new foils per block.
    const tests = shuffle([
      ...shuffle(block.study).slice(0, 4).map((w) => [w, 'studied']),
      [block.lure, 'critical_lure'],
      ...block.foils.map((w) => [w, 'unrelated_foil']),
    ]);
    for (const [i, [word, kind]] of tests.entries()) {
      show(word, '1 Definitely YES     2 Probably YES\n3 Probably NO        4 Definitely NO');
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

  show('PILOT COMPLETE!\n\nThank you for participating.',
       'Press SPACE to save your results and exit.');
  yield* getKey(['space']);
}
