export const BLANK = '□';
export const LEFT_MARKER = '⊢';
export const RIGHT_MARKER = '⊣';
export const ACCEPT_STATE = 'q_accept';
export const REJECT_STATE = 'q_reject';
export const MAX_INPUT_LENGTH = 40;

const DISPLAY_NAMES = {
  q0: 'Start',
  q_scan0: 'Scan · no swaps yet',
  q_scan1: 'Scan · swap made',
  q_afterS0: 'Check next parcel',
  q_afterS1: 'Check next parcel · swap made',
  q_afterP0: 'Continue scan',
  q_afterP1: 'Continue scan · swap made',
  q_swapLeft: 'Swap · write priority parcel',
  q_rewind: 'Return to the first parcel',
  [ACCEPT_STATE]: 'Accepted · sorted',
  [REJECT_STATE]: 'Rejected'
};

export function displayState(state) {
  return DISPLAY_NAMES[state] ?? state;
}

export function stateShortName(state) {
  const names = {
    q0: 'q₀', q_scan0: 'qₛ', q_scan1: 'qₛ′', q_afterS0: 'qₛ₁',
    q_afterS1: 'qₛ₁′', q_afterP0: 'qₚ', q_afterP1: 'qₚ′',
    q_swapLeft: 'qₓ', q_rewind: 'qᵣ', [ACCEPT_STATE]: 'qₐ', [REJECT_STATE]: 'qᵣⱼ'
  };
  return names[state] ?? state;
}

function makeTransitions() {
  const transitions = new Map();
  const add = (state, read, nextState, write = read, move = 'R') => {
    transitions.set(`${state}|${read}`, { state, read, nextState, write, move });
  };

  add('q0', LEFT_MARKER, 'q_scan0');
  add('q_scan0', 'S', 'q_afterS0');
  add('q_scan0', 'P', 'q_afterP0');
  add('q_scan0', RIGHT_MARKER, ACCEPT_STATE, RIGHT_MARKER, 'S');
  add('q_scan1', 'S', 'q_afterS1');
  add('q_scan1', 'P', 'q_afterP1');
  add('q_scan1', RIGHT_MARKER, 'q_rewind', RIGHT_MARKER, 'L');

  add('q_afterS0', 'S', 'q_afterS0');
  add('q_afterS0', 'P', 'q_swapLeft', 'S', 'L');
  add('q_afterS0', RIGHT_MARKER, ACCEPT_STATE, RIGHT_MARKER, 'S');
  add('q_afterS1', 'S', 'q_afterS1');
  add('q_afterS1', 'P', 'q_swapLeft', 'S', 'L');
  add('q_afterS1', RIGHT_MARKER, 'q_rewind', RIGHT_MARKER, 'L');

  add('q_afterP0', 'P', 'q_afterP0');
  add('q_afterP0', 'S', 'q_afterS0');
  add('q_afterP0', RIGHT_MARKER, ACCEPT_STATE, RIGHT_MARKER, 'S');
  add('q_afterP1', 'P', 'q_afterP1');
  add('q_afterP1', 'S', 'q_afterS1');
  add('q_afterP1', RIGHT_MARKER, 'q_rewind', RIGHT_MARKER, 'L');

  add('q_swapLeft', 'S', 'q_scan1', 'P', 'R');
  add('q_rewind', 'S', 'q_rewind', 'S', 'L');
  add('q_rewind', 'P', 'q_rewind', 'P', 'L');
  add('q_rewind', LEFT_MARKER, 'q_scan0', LEFT_MARKER, 'R');
  return transitions;
}

function copyTape(tape) {
  return new Map(tape);
}

export function createMachine(input) {
  const tape = new Map([[0, LEFT_MARKER], [input.length + 1, RIGHT_MARKER]]);
  [...input].forEach((symbol, index) => tape.set(index + 1, symbol));
  const machine = {
    tape,
    head: 0,
    state: 'q0',
    status: 'ready',
    steps: 0,
    transitions: makeTransitions(),
    trace: [],
    lastTransition: null,
    reason: '',
    changedAt: null,
    initialInput: input,
    passNumber: 1,
    completedPasses: 0,
    swapsThisPass: 0,
    totalSwaps: 0,
    lastPassSwaps: null,
    lastPassClean: null,
    history: []
  };
  machine.history.push(snapshotMachine(machine));
  return machine;
}

export function cloneMachine(machine) {
  return { ...machine, tape: copyTape(machine.tape), trace: [...machine.trace] };
}

export function readSymbol(machine, position = machine.head) {
  return machine.tape.get(position) ?? BLANK;
}

export function getHistoryView(machine, index) {
  const snapshot = machine.history[index];
  if (!snapshot) return machine;
  return {
    ...machine,
    tape: new Map(snapshot.tape),
    head: snapshot.head,
    state: snapshot.state,
    status: snapshot.status,
    steps: snapshot.steps,
    trace: machine.trace.slice(0, snapshot.traceLength),
    lastTransition: snapshot.lastTransition,
    reason: snapshot.reason,
    changedAt: snapshot.changedAt,
    passNumber: snapshot.passNumber,
    completedPasses: snapshot.completedPasses,
    swapsThisPass: snapshot.swapsThisPass,
    totalSwaps: snapshot.totalSwaps,
    lastPassSwaps: snapshot.lastPassSwaps,
    lastPassClean: snapshot.lastPassClean
  };
}

export function restoreHistoryPosition(machine, index) {
  const snapshot = machine.history[index];
  if (!snapshot) return false;
  machine.tape = new Map(snapshot.tape);
  machine.head = snapshot.head;
  machine.state = snapshot.state;
  machine.status = snapshot.status === 'running' ? 'ready' : snapshot.status;
  machine.steps = snapshot.steps;
  machine.trace = machine.trace.slice(0, snapshot.traceLength);
  machine.lastTransition = snapshot.lastTransition;
  machine.reason = snapshot.reason;
  machine.changedAt = snapshot.changedAt;
  machine.passNumber = snapshot.passNumber;
  machine.completedPasses = snapshot.completedPasses;
  machine.swapsThisPass = snapshot.swapsThisPass;
  machine.totalSwaps = snapshot.totalSwaps;
  machine.lastPassSwaps = snapshot.lastPassSwaps;
  machine.lastPassClean = snapshot.lastPassClean;
  machine.history = machine.history.slice(0, index + 1);
  return true;
}

function snapshotMachine(machine) {
  return {
    tape: [...machine.tape.entries()],
    head: machine.head,
    state: machine.state,
    status: machine.status,
    steps: machine.steps,
    traceLength: machine.trace.length,
    lastTransition: machine.lastTransition ? { ...machine.lastTransition } : null,
    reason: machine.reason,
    changedAt: machine.changedAt,
    passNumber: machine.passNumber,
    completedPasses: machine.completedPasses,
    swapsThisPass: machine.swapsThisPass,
    totalSwaps: machine.totalSwaps,
    lastPassSwaps: machine.lastPassSwaps,
    lastPassClean: machine.lastPassClean
  };
}

export function haltMachine(machine, reason) {
  machine.status = 'rejected';
  machine.reason = reason;
  machine.lastTransition = { error: reason };
  machine.trace.push({ step: machine.steps + 1, state: machine.state, read: readSymbol(machine), error: reason });
  machine.history.push(snapshotMachine(machine));
}

export function isHalting(state) {
  return state === ACCEPT_STATE || state === REJECT_STATE;
}

export function stepMachine(machine) {
  if (isHalting(machine.state) || machine.status === 'rejected') return false;

  const read = readSymbol(machine);
  const rule = machine.transitions.get(`${machine.state}|${read}`);
  if (!rule) {
    machine.status = 'rejected';
    machine.reason = `No transition is defined for ${machine.state} reading ${read}.`;
    machine.lastTransition = { read, error: machine.reason };
    machine.trace.push({ step: machine.steps + 1, state: machine.state, read, error: machine.reason });
    machine.history.push(snapshotMachine(machine));
    return false;
  }

  const fromState = machine.state;
  const swapPhase = fromState === 'q_swapLeft' ? 'write-priority' :
    (fromState === 'q_afterS0' || fromState === 'q_afterS1') && read === 'P' ? 'write-standard' : null;
  if (swapPhase === 'write-standard') {
    machine.swapsThisPass += 1;
    machine.totalSwaps += 1;
  }
  if (read === RIGHT_MARKER && fromState !== 'q0' && fromState !== 'q_rewind') {
    machine.lastPassSwaps = machine.swapsThisPass;
    machine.lastPassClean = machine.swapsThisPass === 0;
    machine.completedPasses += 1;
    if (!machine.lastPassClean) machine.passNumber += 1;
    machine.swapsThisPass = 0;
  }
  if (rule.write === BLANK) machine.tape.delete(machine.head);
  else machine.tape.set(machine.head, rule.write);
  machine.head += rule.move === 'L' ? -1 : rule.move === 'R' ? 1 : 0;
  machine.state = rule.nextState;
  machine.steps += 1;
  machine.status = machine.state === ACCEPT_STATE ? 'accepted' : machine.state === REJECT_STATE ? 'rejected' : 'running';
  machine.changedAt = rule.write !== read ? machine.head - (rule.move === 'R' ? 1 : rule.move === 'L' ? -1 : 0) : null;
  machine.lastTransition = { ...rule, fromState, swapPhase };
  machine.trace.push({ step: machine.steps, fromState, ...rule, swapPhase });
  machine.history.push(snapshotMachine(machine));
  return true;
}

export function getSortedParcels(machine) {
  const parcels = [];
  for (let position = 1; position < machine.tape.size + 2; position += 1) {
    const symbol = machine.tape.get(position);
    if (symbol === RIGHT_MARKER) break;
    if (symbol === 'S' || symbol === 'P') parcels.push(symbol);
  }
  return parcels.join('');
}

export function validateInput(value) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized.length > MAX_INPUT_LENGTH) return { error: `Please use ${MAX_INPUT_LENGTH} parcels or fewer.` };
  if (!/^[SP]*$/.test(normalized)) return { error: 'Input can contain only S and P. Spaces are allowed.' };
  return { value: normalized };
}
