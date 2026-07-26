import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app/app.js', 'utf8');
const exposed = source.replace(
  /  if \('serviceWorker' in navigator\)[\s\S]*?\n  start\(\)\.catch\([\s\S]*?\n  \}\);\n\}\)\(\);\s*$/,
  `  globalThis.__arrivalTest = {
    state,
    forecastDayKeys,
    forecastDateAt,
    minutesInForecastDay,
    visitSampleTimes,
    visitLikelihood,
    buildVisitResult,
    longestCircularWetRun,
    visitDirectionFromVector
  };
})();`
);

if (!exposed.includes('globalThis.__arrivalTest')) {
  throw new Error('Could not expose the visit-window helpers');
}

const context = {
  console,
  Date,
  Intl,
  Map,
  Set,
  URL,
  URLSearchParams,
  Math,
  Number,
  String,
  Object,
  Array,
  Promise,
  Error,
  JSON,
  location: { hostname: 'release-test.invalid' },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  window: {},
  document: {
    querySelector: () => null,
    querySelectorAll: () => []
  },
  navigator: {}
};
context.globalThis = context;
vm.runInNewContext(exposed, context, { filename: 'app/app.js' });

const api = context.__arrivalTest;
if (!api) throw new Error('Visit-window helpers did not load');
api.state.place = { name: 'Oakville', lat: 43.4675, lon: -79.6877, zoom: 9 };

const visitDay = api.forecastDayKeys(2)[1];
const start = api.forecastDateAt(visitDay, 16 * 60);
const end = api.forecastDateAt(visitDay, 18 * 60);
if (api.minutesInForecastDay(start) !== 16 * 60 || api.minutesInForecastDay(end) !== 18 * 60) {
  throw new Error('Oakville 4–6 PM timezone conversion failed');
}

api.state.forecastTimeZone = 'America/Winnipeg';
const centralStart = api.forecastDateAt(visitDay, 16 * 60);
if (api.minutesInForecastDay(centralStart) !== 16 * 60 || centralStart.getTime() === start.getTime()) {
  throw new Error('An Ontario Central Time visit did not preserve 4 PM local time');
}
api.state.forecastTimeZone = 'America/Toronto';

const times = api.visitSampleTimes(start.getTime(), end.getTime());
const localMinutes = times.map(value => api.minutesInForecastDay(new Date(value)));
if (times.length !== 5 || localMinutes[0] !== 16 * 60 || localMinutes.at(-1) !== 18 * 60) {
  throw new Error(`Visit sampling lost an exact boundary: ${localMinutes.join(', ')}`);
}

const futureFrame = time => ({
  layer: 'HRDPS.CONTINENTAL.DIAG_PR_PT1H',
  kind: 'futurecast',
  time: new Date(time).toISOString()
});
const wetSamples = times.map((time, index) => ({
  time: new Date(time),
  frame: futureFrame(time),
  pointValue: index === 2 ? 1.8 : 0.2,
  modelAmount: index === 2 ? 1.8 : 0.2,
  observedRate: null,
  officialPop: 65,
  ensembleAny: index === 2 ? 78 : 61,
  support: 72,
  wet: true
}));
const wet = api.buildVisitResult(
  start.getTime(),
  end.getTime(),
  wetSamples,
  {
    label: 'Rain band approaching from the west',
    detail: 'A broader official wet area is west of Oakville.'
  }
);
if (wet.risk !== 'high' || wet.likelihood.value !== '78%' || !wet.title.includes('Plan for rain')) {
  throw new Error('The wet Oakville visit did not produce a high-risk decision');
}

const drySamples = times.map(time => ({
  time: new Date(time),
  frame: futureFrame(time),
  pointValue: 0,
  modelAmount: 0,
  observedRate: null,
  officialPop: 10,
  ensembleAny: 8,
  support: 18,
  wet: false
}));
const dry = api.buildVisitResult(
  start.getTime(),
  end.getTime(),
  drySamples,
  {
    label: 'No organized rain band nearby',
    detail: 'Surrounding guidance is dry.'
  }
);
if (dry.risk !== 'low' || !dry.title.includes('mostly dry') || dry.arrivalFact !== 'No wet period identified') {
  throw new Error('The dry Oakville visit did not produce a dry decision');
}

if (api.longestCircularWetRun([{ wet: true }, { wet: false }, { wet: false }, { wet: true }]) !== 2) {
  throw new Error('Circular rain-band grouping failed');
}
if (api.visitDirectionFromVector(-1, 0) !== 'west') {
  throw new Error('Rain-band direction failed');
}

console.log('Visit-window tests passed: Oakville 4–6 PM wet, dry, Ontario timezones, exact boundaries and rain-band direction');
