# Factory Parcel Sorter

An educational, browser-based Turing machine simulator. It sorts `P` (priority) parcels before `S` (standard) parcels using repeated adjacent swaps on a tape.

## Run it

Open `index.html` in a modern browser, or serve this folder with any static web server (for example, the VS Code Live Server extension). No build step or package installation is required.

## Project files

- `index.html` — interactive simulator
- `theory.html` — formal machine and sorting strategy
- `manual.html` — simulator instructions
- `about.html` — project purpose and scope
- `style.css` — shared responsive styling and tape animation
- `assets/parcel-standard.svg`, `assets/parcel-priority.svg` — local parcel illustrations used in the synchronized conveyor view
- `js/machine.js` — tape model, transition rules, and input validation
- `js/renderer.js` — tape, live state diagram, transition table, progress, and history rendering
- `js/app.js` — controls, run/pause/reset, timeline replay, trace export, and presentation mode

The simulator accepts input strings of up to 40 `S`/`P` symbols. It supports step execution, animated runs, pause/resume, history scrubbing and replay, expected-output and swap counts, JSON trace export, and a presentation view. A live parcel conveyor mirrors the tape, scanner position, and swap writes using local vector artwork for standard and priority parcels. The parcel-to-route workflow includes an offline sample-ID lookup, classification exceptions for manual review, batch loading, a guided presentation demo, and priority/standard destination lanes. No physical scanner, shipping service, or conveyor hardware is connected; the sorting concept could inform an industrial system integrated with parcel identification, conveyor controls, and appropriate safety engineering.
