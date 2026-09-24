import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app/visit.js', 'utf8');
const context = {
  console, Date, Intl, Map, Set, URL, URLSearchParams, Math, Number, String, Object, Array, Promise, Error, JSON,
  location: { hostname: 'release-test.invalid' },
  window: {},
  document: { querySelector: () => null, querySelectorAll: () => [] },
  navigator: {},
  __SKYMAP_VISIT_TEST__: {}
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'app/visit.js' });

const api = context.__SKYMAP_VISIT_TEST__.api;
if (!api) throw new Error('Visit-window helpers did not load');
const oakville = { name: 'Oakville', lat: 43.4675, lon: -79.6877, zoom: 11 };
api.state.zone = 'America/Toronto';

const visitDay = api.forecastDayKeys(2)[1];
const start = api.forecastDateAt(visitDay, 16 * 60);
const end = api.forecastDateAt(visitDay, 18 * 60);
if (api.minutesInForecastDay(start) !== 16 * 60 || api.minutesInForecastDay(end) !== 18 * 60) {
  throw new Error('Oakville 4–6 PM timezone conversion failed');
}

api.state.zone = 'America/Winnipeg';
const centralStart = api.forecastDateAt(visitDay, 16 * 60);
if (api.minutesInForecastDay(centralStart) !== 16 * 60 || centralStart.getTime() === start.getTime()) {
  throw new Error('An Ontario Central Time visit did not preserve 4 PM local time');
}
api.state.zone = 'America/Toronto';

const times = api.visitSampleTimes(start.getTime(), end.getTime());
const localMinutes = times.map(value => api.minutesInForecastDay(new Date(value)));
if (times.length !== 5 || localMinutes[0] !== 16 * 60 || localMinutes.at(-1) !== 18 * 60) {
  throw new Error(`Visit sampling lost an exact boundary: ${localMinutes.join(', ')}`);
}

const guidanceFrame = time => ({ layer: 'HRDPS.CONTINENTAL.DIAG_PR_PT1H', kind: 'guidance', time: new Date(time).toISOString() });

const wetSamples = times.map((time, index) => api.visitSignalAt(
  time, guidanceFrame(time), index === 2 ? 1.8 : 0.2, { any: index === 2 ? 78 : 61, heavy: 20 }, { wet: 72, precip: 0.4 }
));
if (!wetSamples.every(sample => sample.wet)) throw new Error('Wet guidance samples were not classified wet');
const wet = api.buildVisitResult(start.getTime(), end.getTime(), wetSamples, {
  label: 'Rain band approaching from the west', detail: 'A broader official wet area is west of Oakville.'
}, oakville);
if (wet.risk !== 'high' || wet.likelihood.value !== '78%' || !wet.title.includes('Plan for rain')) {
  throw new Error('The wet Oakville visit did not produce a high-risk decision');
}

const drySamples = times.map(time => api.visitSignalAt(time, guidanceFrame(time), 0, { any: 8, heavy: 0 }, { wet: 18, precip: 0 }));
const dry = api.buildVisitResult(start.getTime(), end.getTime(), drySamples, {
  label: 'No organized rain band nearby', detail: 'Surrounding guidance is dry.'
}, oakville);
if (dry.risk !== 'low' || !dry.title.includes('mostly dry') || dry.arrivalFact !== 'No wet period identified') {
  throw new Error('The dry Oakville visit did not produce a dry decision');
}

// Missing evidence must never be converted into a dry certainty or a probability.
const unknown = times.map(time => api.visitSignalAt(time, null, undefined, null, null));
const unknownResult = api.visitLikelihood(unknown);
if (unknownResult.value.includes('%') || unknownResult.score !== 0) throw new Error('Missing evidence produced a probability');

const observedNow = [api.visitSignalAt(Date.now(), { kind: 'observed', layer: 'RADAR_1KM_RRAI', time: new Date().toISOString() }, 2.4, null, null)];
if (api.visitLikelihood(observedNow).value !== 'NOW') throw new Error('Measured radar rain was not reported as present');

if (api.longestCircularWetRun([{ wet: true }, { wet: false }, { wet: false }, { wet: true }]) !== 2) {
  throw new Error('Circular rain-band grouping failed');
}
if (api.visitDirectionFromVector(-1, 0) !== 'west') throw new Error('Rain-band direction failed');

console.log('Visit-window tests passed: Oakville 4–6 PM wet, dry, unknown evidence, measured rain, Ontario timezones, exact boundaries and rain-band direction');
