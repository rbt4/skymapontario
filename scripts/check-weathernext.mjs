const url = new URL('https://ensemble-api.open-meteo.com/v1/ensemble');
url.search = new URLSearchParams({
  latitude:'43.6532',longitude:'-79.3832',timezone:'UTC',forecast_days:'2',
  models:'google_weathernext2_ensemble',hourly:'precipitation,weather_code'
}).toString();

const response = await fetch(url, { cache:'no-store', signal:AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`WeatherNext HTTP ${response.status}`);
const data = await response.json();
const hourly = data?.hourly || {};
const times = hourly.time || [];
const precipKeys = Object.keys(hourly).filter(key => /^precipitation(?:_member\d+)?$/i.test(key) && Array.isArray(hourly[key]));
if (!times.length) throw new Error(`WeatherNext missing time axis; keys=${Object.keys(hourly).join(',')}`);
if (precipKeys.length < 24) throw new Error(`WeatherNext expected many ensemble precipitation arrays, found ${precipKeys.length}; keys=${Object.keys(hourly).slice(0,120).join(',')}`);
let usable=0,wet=0,total=0;
for (let i=0;i<times.length;i++) {
  for (const key of precipKeys) {
    const raw=hourly[key]?.[i];
    if (raw===null||raw===undefined||raw==='') continue;
    const value=Number(raw);
    if (!Number.isFinite(value)) continue;
    usable++; total++; if (value>=0.10) wet++;
  }
}
if (usable < precipKeys.length * Math.min(12,times.length)) throw new Error(`WeatherNext has too few usable member values (${usable})`);
console.log(`✓ Google WeatherNext 2 ensemble: ${precipKeys.length} precipitation arrays · ${times.length} hourly times · ${(100*wet/Math.max(1,total)).toFixed(1)}% member-hours wet near Toronto`);
