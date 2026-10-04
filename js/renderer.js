import { BLANK, LEFT_MARKER, RIGHT_MARKER, displayState, getSortedParcels, readSymbol, stateShortName } from './machine.js';

const WINDOW_SIZE = 4;

function element(id) {
  return document.getElementById(id);
}

export function render(machine, historyCursor, historyLength) {
  renderTape(machine);
  element('stateValue').textContent = `${stateShortName(machine.state)} · ${displayState(machine.state)}`;
  element('headValue').textContent = `Cell ${machine.head}`;
  element('stepValue').textContent = machine.steps.toLocaleString();

  renderFactoryConveyor(machine);
  const result = element('resultValue');
  const results = {
    ready: ['Ready', 'result-idle'],
    running: ['Running', 'result-running'],
    accepted: ['Accepted · sorted', 'result-accepted'],
    rejected: ['Rejected', 'result-rejected']
  };
  const [label, className] = results[machine.status] ?? results.ready;
  result.textContent = label;
  result.className = className;

  const current = readSymbol(machine);
  element('readout').textContent = `Next read: ${current} at cell ${machine.head}`;
  renderProgress(machine);
  renderLastTransition(machine);
  renderStates(machine);
  renderDiagram(machine);
  renderTransitionTable(machine);
  renderTrace(machine);
  renderTimeline(machine, historyCursor, historyLength);
  document.body.classList.toggle('machine-running', machine._autoRunning);
  element('stepBtn').disabled = machine.status === 'accepted' || machine.status === 'rejected' || machine.status === 'running' && machine._autoRunning;
  element('runBtn').disabled = machine.status === 'accepted' || machine.status === 'rejected' || machine._autoRunning;
  element('pauseBtn').disabled = !machine._autoRunning;
  element('exportBtn').disabled = machine.trace.length === 0;
  element('previousStepBtn').disabled = historyCursor <= 0 || machine._autoRunning;
  element('nextStepBtn').disabled = historyCursor >= historyLength - 1 || machine._autoRunning;
  element('replayBtn').disabled = historyLength <= 1 || machine._autoRunning;
}

function renderTape(machine) {
  const tape = element('tape');
  const lastMarker = Math.max(...machine.tape.keys());
  const start = Math.min(-WINDOW_SIZE, machine.head - WINDOW_SIZE);
  const end = Math.max(lastMarker + WINDOW_SIZE, machine.head + WINDOW_SIZE);
  tape.replaceChildren();

  for (let position = start; position <= end; position += 1) {
    const symbol = machine.tape.get(position) ?? BLANK;
    const cell = document.createElement('div');
    const isMarker = symbol === LEFT_MARKER || symbol === RIGHT_MARKER;
    const swapClass = position === machine.changedAt && machine.lastTransition?.swapPhase ? ` swap-${machine.lastTransition.swapPhase}` : '';
    cell.className = `tape-cell${isMarker ? ' marker-cell' : symbol === BLANK ? ' blank-cell' : ` parcel-cell symbol-${symbol}`}${position === machine.head ? ' head-active' : ''}${position === machine.changedAt ? ' just-written' : ''}${swapClass}`;
    cell.setAttribute('role', 'listitem');
    cell.setAttribute('aria-label', `Cell ${position}: ${symbol}${position === machine.head ? ', read head' : ''}`);
    cell.innerHTML = `<span>${escapeHtml(symbol)}</span>${symbol === 'S' || symbol === 'P' ? '<i class="parcel-glyph">BOX</i>' : ''}<small class="cell-index">${position}</small>`;
    if (position === machine.head) {
      const scanner = document.createElement('div');
      scanner.className = 'scanner';
      scanner.setAttribute('aria-hidden', 'true');
      scanner.innerHTML = '<span>⌄</span><small>HEAD</small>';
      cell.append(scanner);
    }
    tape.append(cell);
  }

  const frame = document.querySelector('.conveyor-frame');
  const activeCell = tape.children[machine.head - start];
  if (activeCell) {
    const frameRect = frame.getBoundingClientRect();
    const visibleLeft = frameRect.left + frame.clientLeft + 10;
    const visibleRight = visibleLeft + frame.clientWidth - 20;
    const cellRect = activeCell.getBoundingClientRect();
    if (cellRect.left < visibleLeft) frame.scrollLeft -= visibleLeft - cellRect.left;
    else if (cellRect.right > visibleRight) frame.scrollLeft += cellRect.right - visibleRight;
  }
}

function renderFactoryConveyor(machine) {
  const track = element('factoryTrack');
  const parcels = [...machine.initialInput];
  track.replaceChildren();

  const leftBoundary = document.createElement('div');
  leftBoundary.className = 'factory-boundary';
  leftBoundary.textContent = 'START';
  if (machine.head === 0) leftBoundary.append(createFactoryScanner());
  track.append(leftBoundary);

  parcels.forEach((_, index) => {
    const position = index + 1;
    const symbol = machine.tape.get(position) ?? BLANK;
    const parcel = document.createElement('div');
    const classes = ['factory-parcel', symbol === 'P' ? 'symbol-P' : 'symbol-S'];
    if (position === machine.head) classes.push('head-target');
    if (position === machine.changedAt && machine.lastTransition?.swapPhase) {
      classes.push(machine.lastTransition.swapPhase === 'write-standard' ? 'factory-swap-standard' : 'factory-swap-priority');
    }
    parcel.className = classes.join(' ');
    parcel.setAttribute('role', 'listitem');
    parcel.setAttribute('aria-label', `Conveyor parcel ${index + 1}: ${symbol === 'P' ? 'priority' : 'standard'}${position === machine.head ? ', scanner here' : ''}`);
    parcel.innerHTML = `<img class="factory-parcel-image" src="assets/parcel-${symbol === 'P' ? 'priority' : 'standard'}.svg" alt="${symbol === 'P' ? 'Priority' : 'Standard'} cardboard parcel"><span class="factory-parcel-code">${symbol}</span><span class="factory-parcel-name">${symbol === 'P' ? 'PRIORITY' : 'STANDARD'}</span><small>${String(index + 1).padStart(2, '0')}</small>`;

    if (position === machine.head) {
      parcel.append(createFactoryScanner());
    }
    track.append(parcel);
  });

  const rightBoundary = document.createElement('div');
  rightBoundary.className = 'factory-boundary';
  rightBoundary.textContent = 'END';
  if (machine.head === parcels.length + 1) rightBoundary.append(createFactoryScanner());
  track.append(rightBoundary);

  const viewport = element('factoryViewport');
  const target = track.children[Math.min(machine.head, track.children.length - 1)];
  if (target) {
    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const leftLimit = viewportRect.left + viewport.clientLeft + 10;
    const rightLimit = viewportRect.left + viewport.clientLeft + viewport.clientWidth - 10;
    if (targetRect.left < leftLimit) viewport.scrollLeft -= leftLimit - targetRect.left;
    else if (targetRect.right > rightLimit) viewport.scrollLeft += targetRect.right - rightLimit;
  }

  const indicator = element('conveyorState');
  const message = element('conveyorMessage');
  indicator.className = `conveyor-state${machine._autoRunning ? ' conveyor-active' : ''}${machine.status === 'accepted' ? ' conveyor-complete' : machine.status === 'rejected' ? ' conveyor-error' : ''}`;
  if (machine.status === 'accepted') {
    indicator.innerHTML = '<i></i> SORT COMPLETE';
    message.textContent = `All parcels are in priority-first order after ${machine.completedPasses} passes.`;
  } else if (machine.status === 'rejected') {
    indicator.innerHTML = '<i></i> HALTED';
    message.textContent = machine.reason || 'The machine halted.';
  } else if (machine.lastTransition?.swapPhase === 'write-standard') {
    indicator.innerHTML = '<i></i> SWAPPING';
    message.textContent = 'Out-of-order pair found: S is written over P; the head moves left for the second write.';
  } else if (machine.lastTransition?.swapPhase === 'write-priority') {
    indicator.innerHTML = '<i></i> SWAPPING';
    message.textContent = 'The second write places P before S. The adjacent swap is complete.';
  } else if (machine._autoRunning) {
    indicator.innerHTML = '<i></i> SCANNING';
    message.textContent = `The scanner is reading ${machine.tape.get(machine.head) ?? BLANK} at tape cell ${machine.head}.`;
  } else if (machine.steps > 0) {
    indicator.innerHTML = '<i></i> PAUSED';
    message.textContent = `Scanner paused at tape cell ${machine.head}; use Step or Run to continue.`;
  } else {
    indicator.innerHTML = '<i></i> READY';
    message.textContent = 'The scanner starts at the tape’s left boundary.';
  }
}

function createFactoryScanner() {
  const scanner = document.createElement('div');
  scanner.className = 'factory-scanner';
  scanner.setAttribute('aria-hidden', 'true');
  scanner.innerHTML = '<span class="scanner-light"></span><span class="scanner-beam"></span><small>READ HEAD</small>';
  return scanner;
}

function renderLastTransition(machine) {
  const title = element('transitionValue');
  const detail = element('transitionDetail');
  const transition = machine.lastTransition;
  if (!transition) {
    title.textContent = 'Ready to begin';
    detail.textContent = 'A transition reads, writes, changes state, and moves the head.';
    return;
  }
  if (transition.error) {
    title.textContent = transition.error;
    detail.textContent = machine.reason;
    return;
  }
  title.textContent = `${stateShortName(transition.fromState)} read ${transition.read} → write ${transition.write}, move ${transition.move}`;
  detail.textContent = `Next state: ${stateShortName(transition.nextState)} · ${displayState(transition.nextState)}`;
  if (transition.swapPhase === 'write-standard') detail.textContent = 'Out-of-order S P found · first write moves the standard parcel one cell right.';
  if (transition.swapPhase === 'write-priority') detail.textContent = 'Second write completes the adjacent swap · priority parcel is now one cell left.';
  if (machine.lastPassClean === true && machine.status === 'accepted') detail.textContent = 'Clean pass · no out-of-order pair remains.';
  else if (machine.lastPassSwaps !== null && machine.lastPassSwaps !== undefined && machine.state === 'q_rewind') detail.textContent = `Pass ${machine.completedPasses} complete · ${machine.lastPassSwaps} adjacent swap${machine.lastPassSwaps === 1 ? '' : 's'} · return to start.`;
  if (machine.status === 'accepted') {
    detail.textContent = `Sorted output: ${getSortedParcels(machine) || '(empty tape)'} · ${machine.steps.toLocaleString()} transitions`;
  }
}

function renderProgress(machine) {
  element('passValue').textContent = machine.passNumber.toLocaleString();
  element('passSwapsValue').textContent = machine.swapsThisPass.toLocaleString();
  element('totalSwapsValue').textContent = machine.totalSwaps.toLocaleString();
  const verdict = element('passVerdict');
  if (machine.status === 'accepted') verdict.textContent = `Sorted in ${machine.completedPasses} pass${machine.completedPasses === 1 ? '' : 'es'}`;
  else if (machine.lastTransition?.swapPhase === 'write-standard') verdict.textContent = 'Out-of-order S P found';
  else if (machine.lastTransition?.swapPhase === 'write-priority') verdict.textContent = 'Adjacent swap complete';
  else if (machine.lastPassSwaps !== null && machine.lastPassSwaps !== undefined && machine.state === 'q_rewind') verdict.textContent = `Pass complete · ${machine.lastPassSwaps} swaps`;
  else if (machine.status === 'rejected') verdict.textContent = 'Machine halted';
  else if (machine.steps === 0) verdict.textContent = 'Ready to scan';
  else verdict.textContent = `Scanning pass ${machine.passNumber}`;

  const parcelCount = machine.initialInput.length;
  const progress = machine.status === 'accepted' ? 100 : parcelCount === 0 ? 0 :
    Math.min(100, Math.max(0, ((machine.head - 1) / (parcelCount + 1)) * 100));
  const progressBar = element('progressBar');
  progressBar.style.width = `${progress}%`;
  const progressTrack = progressBar.parentElement;
  progressTrack.setAttribute('aria-valuenow', Math.round(progress).toString());
}

function renderStates(machine) {
  document.querySelectorAll('#stateList [data-state]').forEach((item) => {
    item.classList.toggle('active', item.dataset.state === machine.state);
  });
}

function renderDiagram(machine) {
  const stateGroups = {
    q0: 'q0',
    q_scan0: 'q_scan',
    q_scan1: 'q_scan',
    q_afterS0: 'q_check',
    q_afterS1: 'q_check',
    q_afterP0: 'q_check',
    q_afterP1: 'q_check',
    q_swapLeft: 'q_swapLeft',
    q_rewind: 'q_rewind',
    q_accept: 'q_rewind',
    q_reject: 'q_rewind'
  };
  const activeGroup = stateGroups[machine.state];
  document.querySelectorAll('#stateDiagram [data-diagram-state]').forEach((node) => {
    node.classList.toggle('active', node.dataset.diagramState === activeGroup);
    node.classList.toggle('accepted', machine.state === 'q_accept' && node.dataset.diagramState === 'q_rewind');
    node.classList.toggle('rejected', machine.state === 'q_reject' && node.dataset.diagramState === 'q_rewind');
  });
  const transition = machine.lastTransition;
  const edgeId = transition ? getTransitionEdge(transition) : null;
  document.querySelectorAll('#stateDiagram .diagram-edge').forEach((edge) => {
    edge.classList.toggle('active', edge.id === edgeId);
  });
}

function getTransitionEdge(transition) {
  const { fromState, read, nextState } = transition;
  if (fromState === 'q0') return 'edge-start-scan';
  if (fromState === 'q_rewind') return read === LEFT_MARKER ? 'edge-rewind-scan' : 'edge-rewind-loop';
  if (fromState === 'q_swapLeft') return 'edge-swap-scan';
  if (fromState.startsWith('q_scan')) {
    if (read === RIGHT_MARKER) return nextState === 'q_accept' ? 'edge-clean-accept' : 'edge-scan-rewind';
    return 'edge-scan-check';
  }
  if (fromState.startsWith('q_after')) {
    if (nextState === 'q_swapLeft') return 'edge-check-swap';
    if (read === RIGHT_MARKER) return nextState === 'q_accept' ? 'edge-clean-accept' : 'edge-scan-rewind';
    return 'edge-check-check';
  }
  return null;
}

function renderTransitionTable(machine) {
  const rows = [...machine.transitions.values()].sort((left, right) =>
    left.state.localeCompare(right.state) || left.read.localeCompare(right.read));
  const body = element('transitionRows');
  body.replaceChildren();
  rows.forEach((rule) => {
    const row = document.createElement('tr');
    if (machine.lastTransition && rule.state === machine.lastTransition.fromState && rule.read === machine.lastTransition.read) {
      row.classList.add('current-rule');
    }
    [stateShortName(rule.state), rule.read, rule.write, rule.move, stateShortName(rule.nextState)].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
  element('ruleCount').textContent = `${rows.length} rules`;
}

function renderTimeline(machine, cursor, historyLength) {
  const slider = element('timelineSlider');
  slider.max = Math.max(0, historyLength - 1).toString();
  slider.value = cursor.toString();
  element('timelineValue').textContent = `Step ${cursor.toLocaleString()} of ${Math.max(0, historyLength - 1).toLocaleString()}`;
}

function renderTrace(machine) {
  const list = element('traceList');
  list.replaceChildren();
  if (machine.trace.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'trace-empty';
    empty.textContent = 'Your machine steps will appear here.';
    list.append(empty);
  } else {
    const recent = machine.trace.slice(-150);
    const firstIndex = machine.trace.length - recent.length;
    recent.forEach((entry, index) => {
      const item = document.createElement('li');
      item.dataset.historyIndex = (firstIndex + index + 1).toString();
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Review machine after transition ${entry.step}`);
      if (entry.error) {
        item.textContent = `Step ${entry.step}: ${entry.error}`;
      } else {
        const action = entry.write === entry.read ? `keep ${entry.write}` : `write ${entry.write}`;
        item.textContent = `Step ${entry.step}: ${stateShortName(entry.fromState)} reads ${entry.read} → ${action}, move ${entry.move}, enter ${stateShortName(entry.nextState)}`;
      }
      list.append(item);
    });
    list.scrollTop = list.scrollHeight;
  }
  element('traceCount').textContent = `${machine.steps.toLocaleString()} transition${machine.steps === 1 ? '' : 's'}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
