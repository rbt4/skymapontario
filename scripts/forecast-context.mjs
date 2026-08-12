import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const OUT='verification-history/context.json';
const SOURCES={
  pna:'https://ftp.cpc.ncep.noaa.gov/cwlinks/norm.daily.pna.cdas.z500.19500101_current.csv',
  nao:'https://ftp.cpc.ncep.noaa.gov/cwlinks/norm.daily.nao.cdas.z500.19500101_current.csv',
  ao:'https://ftp.cpc.ncep.noaa.gov/cwlinks/norm.daily.ao.cdas.z1000.19500101_current.csv',
  nino34:'https://psl.noaa.gov/data/correlation/nina34.anom.csv',
  mjo:'https://www.cpc.ncep.noaa.gov/products/precip/CWlink/daily_mjo_index/proj_norm_order.ascii',
  lakeSuperior:'https://apps.glerl.noaa.gov/coastwatch/webdata/statistic/csv/all_year_glsea_avg_s_C.csv',
  lakeMichigan:'https://apps.glerl.noaa.gov/coastwatch/webdata/statistic/csv/all_year_glsea_avg_m_C.csv',
  lakeHuron:'https://apps.glerl.noaa.gov/coastwatch/webdata/statistic/csv/all_year_glsea_avg_h_C.csv',
  lakeOntario:'https://apps.glerl.noaa.gov/coastwatch/webdata/statistic/csv/all_year_glsea_avg_o_C.csv',
  lakeErie:'https://apps.glerl.noaa.gov/coastwatch/webdata/statistic/csv/all_year_glsea_avg_e_C.csv'
};
const finite=v=>v===null||v===undefined||String(v).trim()===''?null:(Number.isFinite(Number(v))?Number(v):null);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);
async function fetchText(url,attempts=3){let last;for(let i=1;i<=attempts;i++){try{const r=await fetch(url,{headers:{'user-agent':'SkyMap-Ontario-Forecast-Research/24'},signal:AbortSignal.timeout(30000),cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const t=await r.text();if(t.trim().length<20)throw new Error('empty response');return t;}catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,800*i));}}throw last;}
function csvRows(text){return text.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>line.split(',').map(v=>v.trim().replace(/^"|"$/g,'')));}
function parseDailyIndex(text,id){const rows=csvRows(text),out=[];for(const row of rows){let date=null,value=null;if(/^\d{4}-\d{2}-\d{2}/.test(row[0])){date=row[0].slice(0,10);value=finite(row.find((v,i)=>i>0&&finite(v)!=null));}else if(row.length>=4&&/^\d{4}$/.test(row[0])&&finite(row[1])!=null&&finite(row[2])!=null){date=`${row[0]}-${String(row[1]).padStart(2,'0')}-${String(row[2]).padStart(2,'0')}`;value=finite(row.find((v,i)=>i>=3&&finite(v)!=null));}if(date&&value!=null&&value>-90)out.push([date,value]);}if(out.length<1000)throw new Error(`${id} parsed only ${out.length} daily rows`);return out;}
function parseNino(text){const rows=csvRows(text),out=[];for(const row of rows){if(row.length>=3&&/^\d{4}$/.test(row[0])&&finite(row[1])!=null){const month=finite(row[1]);const value=finite(row[2]);if(month>=1&&month<=12&&value!=null&&value>-90){out.push([`${row[0]}-${String(month).padStart(2,'0')}`,value]);continue;}}if(/^\d{4}-\d{2}/.test(row[0])){const value=finite(row.find((v,i)=>i>0&&finite(v)!=null));if(value!=null&&value>-90)out.push([row[0].slice(0,7),value]);}}
 if(out.length<100)throw new Error(`nino34 parsed only ${out.length} rows`);return out;}
function parseMjo(text){const out=[];for(const line of text.split(/\r?\n/)){const nums=line.trim().split(/\s+/).map(finite);if(nums.length<13||nums.slice(0,3).some(v=>v==null))continue;const [y,m,d]=nums;if(y<1970||m<1||m>12||d<1||d>31)continue;const vals=nums.slice(3,13);if(vals.some(v=>v==null||v<-90))continue;out.push([`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,...vals]);}if(out.length<1000)throw new Error(`MJO parsed only ${out.length} rows`);return out;}
function parseLake(text,id){const rows=csvRows(text);if(rows.length<100)throw new Error(`${id} has only ${rows.length} rows`);const header=rows[0],body=rows.slice(1).filter(r=>r.some(v=>finite(v)!=null));return{header,rows:body};}
async function one(id,url,parser){const text=await fetchText(url);const data=parser(text,id);return{url,sha256:hash(text),bytes:Buffer.byteLength(text),data};}
async function main(){await fs.mkdir('verification-history',{recursive:true});const results={},errors={};const specs=[['pna',SOURCES.pna,parseDailyIndex],['nao',SOURCES.nao,parseDailyIndex],['ao',SOURCES.ao,parseDailyIndex],['nino34',SOURCES.nino34,parseNino],['mjo',SOURCES.mjo,parseMjo],['lakeSuperior',SOURCES.lakeSuperior,parseLake],['lakeMichigan',SOURCES.lakeMichigan,parseLake],['lakeHuron',SOURCES.lakeHuron,parseLake],['lakeOntario',SOURCES.lakeOntario,parseLake],['lakeErie',SOURCES.lakeErie,parseLake]];
 for(const [id,url,parser] of specs){try{results[id]=await one(id,url,parser);const n=Array.isArray(results[id].data)?results[id].data.length:results[id].data.rows.length;console.log(`✓ ${id}: ${n} records`);}catch(e){errors[id]=String(e.message||e);console.warn(`⚠ ${id}: ${errors[id]}`);}}
 const required=['pna','nao','ao','nino34','mjo','lakeOntario','lakeErie'];const missing=required.filter(k=>!results[k]);if(process.argv.includes('--smoke')&&missing.length)throw new Error(`required context sources missing: ${missing.join(', ')}`);
 const out={schema:1,generatedAt:new Date().toISOString(),purpose:'Large-scale conditioning features for future out-of-sample calibration; not direct deterministic forecast inputs.',coverage:{teleconnections:'daily CPC AO/NAO/PNA',enso:'monthly NOAA/CPC Niño 3.4',mjo:'CPC MJO historical index',greatLakes:'NOAA GLSEA average surface water temperature'},results,errors};await fs.writeFile(OUT,JSON.stringify(out));console.log(`✓ context memory written with ${Object.keys(results).length}/${specs.length} sources`);}
await main();
