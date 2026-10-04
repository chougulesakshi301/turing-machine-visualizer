import { createMachine, getHistoryView, getSortedParcels, haltMachine, MAX_INPUT_LENGTH, restoreHistoryPosition, stepMachine, validateInput } from './machine.js';
import { render } from './renderer.js';

const RUN_STEP_LIMIT = 20000;
let machine = createMachine('SPSP');
let timer = null;
let historyCursor = 0;
let playbackMode = false;
let latestScan = null;
let parcelBatch = [];
let batchLoaded = false;
let guidedStep = -1;

const SAMPLE_SHIPMENTS = {
  'PKG-1001': { symbol: 'P', service: 'Priority Express' },
  'PKG-1002': { symbol: 'S', service: 'Standard Delivery' },
  'PKG-1003': { symbol: 'P', service: 'Priority Overnight' },
  'PKG-1004': { symbol: 'S', service: 'Standard Delivery' }
};

const $ = (id) => document.getElementById(id);

function renderApp() {
  const view = getHistoryView(machine, historyCursor);
  view._autoRunning = timer !== null;
  render(view, historyCursor, machine.history.length);
  renderWorkflow(view);
  renderGuidedDemo(view);
}

function clearTimer() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  playbackMode = false;
}

function updateCurrentSnapshotStatus() {
  const snapshot = machine.history[historyCursor];
  if (snapshot) snapshot.status = machine.status;
}

function prepareLiveMachine() {
  if (historyCursor < machine.history.length - 1) {
    restoreHistoryPosition(machine, historyCursor);
  }
  historyCursor = machine.history.length - 1;
}

function haltRunIfNeeded() {
  if (machine.status === 'accepted' || machine.status === 'rejected' || machine.steps >= RUN_STEP_LIMIT) {
    clearTimer();
    if (machine.steps >= RUN_STEP_LIMIT && machine.status !== 'accepted' && machine.status !== 'rejected') {
      haltMachine(machine, `Stopped after ${RUN_STEP_LIMIT.toLocaleString()} transitions to prevent an unbounded run.`);
    }
  }
}

function doStep() {
  prepareLiveMachine();
  const advanced = stepMachine(machine);
  if (advanced) {
    machine.status = 'ready';
    historyCursor = machine.history.length - 1;
    updateCurrentSnapshotStatus();
  }
  haltRunIfNeeded();
  historyCursor = machine.history.length - 1;
  renderApp();
  return advanced;
}

function loadInput(value, fromBatch = false) {
  clearTimer();
  if (machine.status === 'running') {
    machine.status = 'ready';
    updateCurrentSnapshotStatus();
  }
  const validation = validateInput(value);
  if (validation.error) {
    $('inputError').textContent = validation.error;
    $('inputValue').setAttribute('aria-invalid', 'true');
    renderApp();
    return false;
  }
  $('inputError').textContent = '';
  $('inputValue').removeAttribute('aria-invalid');
  $('inputValue').value = validation.value;
  batchLoaded = fromBatch && validation.value === parcelBatch.map((parcel) => parcel.symbol).join('');
  machine = createMachine(validation.value);
  historyCursor = 0;
  updateExampleSummary(validation.value);
  renderApp();
  return true;
}

function startRun() {
  prepareLiveMachine();
  if (machine.status === 'accepted' || machine.status === 'rejected') return;
  clearTimer();
  machine.status = 'running';
  updateCurrentSnapshotStatus();
  const interval = Number($('speedInput').value);
  timer = window.setInterval(() => {
    const advanced = stepMachine(machine);
    haltRunIfNeeded();
    historyCursor = machine.history.length - 1;
    renderApp();
    if (!advanced) clearTimer();
  }, interval);
  renderApp();
}

function pauseRun() {
  const wasPlayback = playbackMode;
  clearTimer();
  if (!wasPlayback && machine.status === 'running') {
    machine.status = 'ready';
    updateCurrentSnapshotStatus();
  }
  renderApp();
}

function resetMachine() {
  clearTimer();
  machine = createMachine(machine.initialInput);
  historyCursor = 0;
  renderApp();
}

function setHistoryCursor(value) {
  if (timer !== null) {
    const wasPlayback = playbackMode;
    clearTimer();
    if (!wasPlayback && machine.status === 'running') {
      machine.status = 'ready';
      updateCurrentSnapshotStatus();
    }
  }
  historyCursor = Math.max(0, Math.min(Number(value), machine.history.length - 1));
  renderApp();
}

function startReplay() {
  const wasPlayback = playbackMode;
  clearTimer();
  if (!wasPlayback && machine.status === 'running') {
    machine.status = 'ready';
    updateCurrentSnapshotStatus();
  }
  if (machine.history.length <= 1) return;
  if (historyCursor >= machine.history.length - 1) historyCursor = 0;
  playbackMode = true;
  const interval = Number($('speedInput').value);
  timer = window.setInterval(() => {
    if (historyCursor >= machine.history.length - 1) {
      clearTimer();
      renderApp();
      return;
    }
    historyCursor += 1;
    renderApp();
  }, interval);
  renderApp();
}

function updateExampleSummary(input) {
  const priorityCount = [...input].filter((symbol) => symbol === 'P').length;
  const standardCount = input.length - priorityCount;
  let inversions = 0;
  let standardsSeen = 0;
  for (const symbol of input) {
    if (symbol === 'S') standardsSeen += 1;
    if (symbol === 'P') inversions += standardsSeen;
  }
  $('expectedValue').textContent = `${'P'.repeat(priorityCount)}${'S'.repeat(standardCount)}` || '(empty)';
  $('expectedSwapsValue').textContent = inversions.toLocaleString();
}

function exportTrace() {
  if (machine.trace.length === 0) return;
  const payload = {
    project: 'Turing Machine Simulator and Visualizer',
    example: 'Factory Parcel Sorter',
    input: machine.initialInput,
    output: machine.status === 'accepted' ? getSortedParcels(machine) : null,
    status: machine.status,
    transitionsExecuted: machine.steps,
    passesCompleted: machine.completedPasses,
    adjacentSwaps: machine.totalSwaps,
    transitions: machine.trace
  };
  let url = '';
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `turing-machine-trace-${new Date().toISOString().replaceAll(':', '-')}.json`;
    link.click();
    $('exportStatus').textContent = 'Run trace downloaded as JSON.';
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    $('exportStatus').textContent = `Could not export the run trace: ${error.message}`;
  }
}

function togglePresentation() {
  const active = document.body.classList.toggle('presentation-mode');
  $('presentBtn').setAttribute('aria-pressed', String(active));
  $('presentBtn').textContent = active ? '▣ Exit presentation' : '▣ Presentation mode';
}

function scanParcel() {
  const trackingId = $('trackingIdInput').value.trim().toUpperCase();
  if (!trackingId) {
    latestScan = null;
    $('scanResult').textContent = 'Enter a tracking ID to simulate a parcel scan.';
    $('scanResult').className = 'scan-result scan-warning';
    renderApp();
    return;
  }

  const idRead = trackingId !== 'UNREADABLE';
  latestScan = {
    trackingId,
    idRead,
    shipment: idRead ? SAMPLE_SHIPMENTS[trackingId] ?? null : null
  };

  if (!idRead) {
    $('scanResult').textContent = 'Parcel detected, but the label could not be read. Hold it for manual review; no class was guessed.';
    $('scanResult').className = 'scan-result scan-warning';
  } else if (!latestScan.shipment) {
    $('scanResult').textContent = `ID ${trackingId} was read, but no shipping record was found. Hold it for manual review; no class was guessed.`;
    $('scanResult').className = 'scan-result scan-warning';
  } else {
    const kind = latestScan.shipment.symbol === 'P' ? 'Priority' : 'Standard';
    $('scanResult').textContent = `ID ${trackingId} matched a demo shipping record: ${latestScan.shipment.service} → ${kind} (${latestScan.shipment.symbol}).`;
    $('scanResult').className = 'scan-result scan-success';
  }
  renderApp();
}

function addScannedParcel() {
  if (!latestScan?.shipment || parcelBatch.length >= MAX_INPUT_LENGTH) return;
  parcelBatch.push({ trackingId: latestScan.trackingId, ...latestScan.shipment });
  batchLoaded = false;
  $('batchMessage').textContent = `${latestScan.trackingId} added as ${latestScan.shipment.symbol}. Load the batch to pass these classifications to the sorter.`;
  renderApp();
}

function clearParcelBatch() {
  parcelBatch = [];
  latestScan = null;
  batchLoaded = false;
  $('scanResult').textContent = 'Ready to simulate parcel detection and label identification.';
  $('scanResult').className = 'scan-result';
  $('batchMessage').textContent = 'Classified records are converted to S/P symbols only when loaded.';
  renderApp();
}

function loadParcelBatch() {
  if (parcelBatch.length === 0) return;
  const symbols = parcelBatch.map((parcel) => parcel.symbol).join('');
  if (loadInput(symbols, true)) {
    $('batchMessage').textContent = `Loaded ${parcelBatch.length} classified parcel${parcelBatch.length === 1 ? '' : 's'} as ${symbols}. Run the Turing machine to sort them.`;
  }
}

function renderWorkflow(view) {
  const detected = latestScan !== null;
  const identified = latestScan?.idRead === true;
  const classified = latestScan?.shipment !== null && latestScan?.shipment !== undefined;
  const sorted = batchLoaded && view.status === 'accepted';
  const stageState = {
    detect: detected ? 'complete' : 'active',
    identify: identified ? 'complete' : detected ? 'active' : 'pending',
    classify: classified ? 'complete' : identified ? 'active' : 'pending',
    sort: sorted ? 'complete' : batchLoaded ? 'active' : 'pending',
    route: sorted ? 'complete' : 'pending'
  };
  document.querySelectorAll('[data-flow-step]').forEach((step) => {
    const state = stageState[step.dataset.flowStep] ?? 'pending';
    step.dataset.status = state;
    step.setAttribute('aria-current', state === 'active' ? 'step' : 'false');
  });

  const batchList = $('parcelBatch');
  batchList.replaceChildren();
  parcelBatch.forEach((parcel, index) => {
    const item = document.createElement('li');
    const image = document.createElement('img');
    image.src = `assets/parcel-${parcel.symbol === 'P' ? 'priority' : 'standard'}.svg`;
    image.alt = '';
    const detail = document.createElement('span');
    const id = document.createElement('strong');
    id.textContent = parcel.trackingId;
    const service = document.createElement('small');
    service.textContent = `${parcel.service} · ${parcel.symbol === 'P' ? 'Priority' : 'Standard'}`;
    detail.append(id, service);
    const position = document.createElement('small');
    position.className = 'batch-position';
    position.textContent = String(index + 1).padStart(2, '0');
    item.append(image, detail, position);
    batchList.append(item);
  });
  $('batchEmpty').hidden = parcelBatch.length > 0;
  $('batchCount').textContent = `${parcelBatch.length} parcel${parcelBatch.length === 1 ? '' : 's'}`;
  $('addParcelBtn').disabled = !classified || parcelBatch.length >= MAX_INPUT_LENGTH;
  $('loadBatchBtn').disabled = parcelBatch.length === 0 || batchLoaded;
  $('clearBatchBtn').disabled = parcelBatch.length === 0;
  $('routingResult').hidden = !sorted;
  if (sorted) renderRoutingLanes(view);
}

function renderRoutingLanes(view) {
  const output = getSortedParcels(view);
  const priority = [...output].filter((symbol) => symbol === 'P').length;
  const standard = [...output].filter((symbol) => symbol === 'S').length;
  renderLane('priorityLane', parcelBatch.filter((parcel) => parcel.symbol === 'P'));
  renderLane('standardLane', parcelBatch.filter((parcel) => parcel.symbol === 'S'));
  $('priorityLaneCount').textContent = `${priority} parcel${priority === 1 ? '' : 's'}`;
  $('standardLaneCount').textContent = `${standard} parcel${standard === 1 ? '' : 's'}`;
  $('routingSummary').textContent = `${view.completedPasses} pass${view.completedPasses === 1 ? '' : 'es'} · ${view.totalSwaps} swap${view.totalSwaps === 1 ? '' : 's'}`;
}

function renderLane(id, parcels) {
  const lane = $(id);
  lane.replaceChildren();
  parcels.forEach((parcel) => {
    const item = document.createElement('span');
    item.className = 'routing-parcel';
    const image = document.createElement('img');
    image.src = `assets/parcel-${parcel.symbol === 'P' ? 'priority' : 'standard'}.svg`;
    image.alt = '';
    const trackingId = document.createElement('small');
    trackingId.textContent = parcel.trackingId;
    item.append(image, trackingId);
    lane.append(item);
  });
  if (lane.childElementCount === 0) {
    const empty = document.createElement('span');
    empty.className = 'lane-empty';
    empty.textContent = 'No parcels';
    lane.append(empty);
  }
}

function runGuidedDemo() {
  if (guidedStep === -1 || guidedStep >= 5) {
    clearTimer();
    parcelBatch = [];
    latestScan = null;
    batchLoaded = false;
    guidedStep = 0;
    machine = createMachine('');
    historyCursor = 0;
    $('inputValue').value = '';
    $('trackingIdInput').value = 'PKG-1002';
    $('scanResult').textContent = 'Ready to simulate parcel detection and label identification.';
    $('scanResult').className = 'scan-result';
    $('batchMessage').textContent = 'Classified records are converted to S/P symbols only when loaded.';
    $('guidedMessage').textContent = 'Step 1 of 5: A simulated presence sensor detects a parcel. Continue to scan its sample label.';
    renderApp();
    return;
  }

  if (guidedStep === 0) {
    guidedStep = 1;
    $('trackingIdInput').value = 'PKG-1002';
    scanParcel();
    addScannedParcel();
    $('guidedMessage').textContent = 'Step 2 of 5: PKG-1002 matched the demo shipping record as Standard (S) and was added to the batch.';
  } else if (guidedStep === 1) {
    guidedStep = 2;
    $('trackingIdInput').value = 'PKG-1001';
    scanParcel();
    addScannedParcel();
    $('guidedMessage').textContent = 'Step 3 of 5: PKG-1001 matched as Priority (P). The batch is now SP; load it into the Turing machine.';
  } else if (guidedStep === 2) {
    guidedStep = 3;
    loadParcelBatch();
    $('guidedMessage').textContent = 'Step 4 of 5: The classified batch became the tape input SP. Run the machine to sort it.';
  } else if (guidedStep === 3) {
    guidedStep = 4;
    startRun();
    guidedStep = 5;
    $('guidedMessage').textContent = 'Step 5 of 5: The Turing machine is sorting. When it accepts, inspect the separate destination lanes below.';
  }
  renderApp();
}

function renderGuidedDemo(view) {
  const button = $('guidedDemoBtn');
  if (guidedStep === -1 || guidedStep >= 5) {
    button.textContent = guidedStep === 5 ? 'Restart guided demo' : 'Start guided demo';
  } else {
    button.textContent = 'Next guided step';
  }
  button.disabled = guidedStep === 5 && timer !== null;
  if (guidedStep === 5 && view.status === 'accepted') {
    $('guidedMessage').textContent = 'Walkthrough complete: the parcels are sorted, and the priority and standard destination lanes are shown.';
  }
}

function bindEvents() {
  $('stepBtn').addEventListener('click', doStep);
  $('runBtn').addEventListener('click', startRun);
  $('pauseBtn').addEventListener('click', pauseRun);
  $('resetBtn').addEventListener('click', resetMachine);
  $('previousStepBtn').addEventListener('click', () => setHistoryCursor(historyCursor - 1));
  $('nextStepBtn').addEventListener('click', () => setHistoryCursor(historyCursor + 1));
  $('timelineSlider').addEventListener('input', (event) => setHistoryCursor(event.target.value));
  $('replayBtn').addEventListener('click', startReplay);
  $('exportBtn').addEventListener('click', exportTrace);
  $('presentBtn').addEventListener('click', togglePresentation);
  $('scanParcelBtn').addEventListener('click', scanParcel);
  $('trackingIdInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') scanParcel();
  });
  $('addParcelBtn').addEventListener('click', addScannedParcel);
  $('loadBatchBtn').addEventListener('click', loadParcelBatch);
  $('clearBatchBtn').addEventListener('click', clearParcelBatch);
  $('guidedDemoBtn').addEventListener('click', runGuidedDemo);
  $('traceList').addEventListener('click', (event) => {
    const entry = event.target.closest('[data-history-index]');
    if (entry) setHistoryCursor(entry.dataset.historyIndex);
  });
  $('traceList').addEventListener('keydown', (event) => {
    const entry = event.target.closest('[data-history-index]');
    if (entry && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setHistoryCursor(entry.dataset.historyIndex);
    }
  });
  $('loadBtn').addEventListener('click', () => loadInput($('inputValue').value));
  $('inputValue').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadInput($('inputValue').value);
  });
  $('inputValue').addEventListener('input', () => {
    $('inputError').textContent = '';
    $('inputValue').removeAttribute('aria-invalid');
  });
  $('exampleSelect').addEventListener('change', (event) => {
    $('inputValue').value = event.target.value;
    loadInput(event.target.value);
  });
  $('speedInput').addEventListener('input', (event) => {
    $('speedValue').value = `${event.target.value} ms / step`;
    if (timer !== null) {
      if (playbackMode) startReplay();
      else startRun();
    }
  });
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.key === 'Escape' && document.body.classList.contains('presentation-mode')) {
      document.body.classList.remove('presentation-mode');
      $('presentBtn').setAttribute('aria-pressed', 'false');
      $('presentBtn').textContent = '▣ Presentation mode';
      return;
    }
    if (event.code === 'Space' && target instanceof HTMLElement && !['INPUT', 'SELECT', 'BUTTON'].includes(target.tagName)) {
      event.preventDefault();
      if (timer === null) doStep();
    }
  });
}

if ($('inputValue').maxLength !== MAX_INPUT_LENGTH) $('inputValue').maxLength = MAX_INPUT_LENGTH;
updateExampleSummary(machine.initialInput);
bindEvents();
renderApp();
