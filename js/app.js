
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let curCat = 'all', curQuery = '', curTool = null;
const PAGE_SIZE = 16; let curPage = 1;

/* ---------- formatting ---------- */
function fmt(n){
  if(n === null || n === undefined || isNaN(n) || !isFinite(n)) return '—';
  if(n === 0) return '0';
  n = parseFloat(n.toPrecision(10));
  if(n === 0) return '0';
  const a = Math.abs(n);
  if(a >= 1e12 || (a < 1e-4 && a > 0)) return n.toExponential(6).replace(/\.?0+e/,'e');
  return n.toLocaleString('en-US',{maximumFractionDigits:8});
}
function fmtPace(mins){
  if(!isFinite(mins) || mins < 0) return '—';
  const m = Math.floor(mins), s = Math.round((mins - m) * 60);
  if(s === 60) return (m+1) + ':00';
  return m + ':' + String(s).padStart(2,'0');
}
function parsePace(v){
  v = String(v).trim();
  if(v.indexOf(':') >= 0){ const p = v.split(':'); return (parseFloat(p[0])||0) + (parseFloat(p[1])||0)/60; }
  return parseFloat(v);
}

/* ---------- special-function registry (numeric + text + file) ---------- */
const SPECIAL = {};
/* psychrometrics (Magnus) */
function es(T){ return 6.112 * Math.exp(17.67*T/(T+243.5)); }
SPECIAL.rhToAh = (rh, x)=> 216.7 * (rh/100*es(x.temp??25)) / ((x.temp??25)+273.15);
SPECIAL.ahToRh = (ah, x)=> 100 * (ah*((x.temp??25)+273.15)/216.7) / es(x.temp??25);
SPECIAL.rhToDew = (rh, x)=>{ const T=x.temp??25, a=Math.log(rh/100)+17.67*T/(T+243.5); return 243.5*a/(17.67-a); };
SPECIAL.dewToRh = (td, x)=> 100 * es(td) / es(x.temp??25);
SPECIAL.wbToRh = (tw, x)=>{ const dry=x.dry??25, P=x.press??1013.25; return 100*(es(tw)-0.00066*P*(dry-tw))/es(dry); };
SPECIAL.rhToWb = (rh, x)=>{ const dry=x.dry??25, P=x.press??1013.25, e=rh/100*es(dry); let lo=-20, hi=dry; for(let i=0;i<60;i++){ const mid=(lo+hi)/2; if(es(mid)-0.00066*P*(dry-mid) < e) lo=mid; else hi=mid; } return (lo+hi)/2; };
/* pace / speed */
SPECIAL.speedToPace = (v)=> v>0 ? 60/v : NaN;
SPECIAL.paceToSpeed = (v)=>{ const p=parsePace(v); return p>0 ? 60/p : NaN; };
SPECIAL.machToMs = (v,x)=> v*(x.sound??343);
SPECIAL.msToMach = (v,x)=> v/(x.sound??343);
/* angles */
SPECIAL.decToDms = (v)=>{ const sgn=v<0?'-':''; const a=Math.abs(v); const d=Math.floor(a); const m=Math.floor((a-d)*60); const s=Math.round(((a-d)*60-m)*60); return sgn+d+'° '+m+'′ '+s+'″'; };
SPECIAL.dmsToDec = (v,x)=> v+(x.mins||0)/60+(x.secs||0)/3600;
SPECIAL.slopeToAngle = (v)=> Math.atan(v/100)*180/Math.PI;
SPECIAL.angleToSlope = (v)=> Math.tan(v*Math.PI/180)*100;
SPECIAL.ratioToAngle = (v)=> Math.atan(v)*180/Math.PI;
SPECIAL.angleToRatio = (v)=> Math.tan(v*Math.PI/180);
SPECIAL.bearingToMath = (v)=> ((90-v)%360+360)%360;
SPECIAL.mathToBearing = (v)=> ((90-v)%360+360)%360;
/* time */
SPECIAL.decHrsToHms = (v)=>{ const h=Math.floor(v), m=Math.floor((v-h)*60), s=Math.round(((v-h)*60-m)*60); return h+'h '+m+'m '+s+'s'; };
SPECIAL.hmsToDecHrs = (v,x)=> v+(x.mins||0)/60+(x.secs||0)/3600;
/* frequency */
SPECIAL.freqToPeriod = (v)=> v!==0 ? 1/v : NaN;
SPECIAL.periodToFreq = (v)=> v!==0 ? 1/v : NaN;
SPECIAL.bpmToMs = (v)=> v!==0 ? 60000/v : NaN;
SPECIAL.msToBpm = (v)=> v!==0 ? 60000/v : NaN;
SPECIAL.freqToWave = (v,x)=> v!==0 ? (x.speed??343)/v : NaN;
SPECIAL.waveToFreq = (v,x)=> v!==0 ? (x.speed??343)/v : NaN;
SPECIAL.samplesToFreq = (v,x)=> v!==0 ? (x.rate??44100)/v : NaN;
SPECIAL.freqToSamples = (v,x)=> v!==0 ? (x.rate??44100)/v : NaN;
/* pressure: gauge <-> absolute (ambient-pressure input, kPa) */
SPECIAL.gaugeToAbs = (v,x)=> v + (x.ambient??101.325);
SPECIAL.absToGauge = (v,x)=> v - (x.ambient??101.325);
/* density <-> specific gravity (reference-density input) */
SPECIAL.divByRef = (v,x)=> v / (x.ref??1000);
SPECIAL.mulByRef = (v,x)=> v * (x.ref??1000);
/* reciprocal (density <-> specific volume) */
SPECIAL.inv = (v)=> v!==0 ? 1/v : NaN;
/* API gravity <-> specific gravity (petroleum) */
SPECIAL.apiToSg = (v)=> 141.5/(v+131.5);
SPECIAL.sgToApi = (v)=> v!==0 ? 141.5/v - 131.5 : NaN;
/* flow / viscosity with density input */
SPECIAL.mulByDensity = (v,x)=> v * (x.density??1000);
SPECIAL.divByDensity = (v,x)=> v / (x.density??1000);
/* battery: mAh <-> Wh (voltage input) */
SPECIAL.mahToWh = (v,x)=> v * (x.voltage??3.7) / 1000;
SPECIAL.whToMah = (v,x)=> v * 1000 / (x.voltage??3.7);
/* magnetic flux <-> flux density (area input) */
SPECIAL.divByArea = (v,x)=> v / (x.area??1);
SPECIAL.mulByArea = (v,x)=> v * (x.area??1);
/* SciConvert (site3) site-specific special functions. Injected into SPECIAL. */
function _gcd(a,b){a=Math.abs(Math.round(a));b=Math.abs(Math.round(b));while(b){var t=a%b;a=b;b=t;}return a||1;}
function _f6(n){ if(!isFinite(n)) return '—'; return String(Math.round(n*1e6)/1e6); }
function _f3(n){ if(!isFinite(n)) return '—'; return String(Math.round(n*1e3)/1e3); }
function _trimNum(n){ if(!isFinite(n)) return '—'; return String(Math.round(n*1e8)/1e8); }

/* ---------- 21. Light / radiation ---------- */
SPECIAL.mulBySolidAngle = (v,x)=> v * (x.sr??1);
SPECIAL.divBySolidAngle = (v,x)=> v / (x.sr??1);

/* ---------- 22. Chemistry ---------- */
SPECIAL.molToGrams = (v,x)=> v * (x.mm??1);
SPECIAL.gramsToMol = (v,x)=> v / (x.mm??1);
SPECIAL.mgdlToMmol = (v,x)=> v * 10 / (x.mm??1);
SPECIAL.mmolToMgdl = (v,x)=> v * (x.mm??1) / 10;
SPECIAL.molarityToMolality = (v,x)=>{ const rho=(x.density??1)*1000, mm=(x.mm??1); const solvKg=(rho - v*mm)/1000; return solvKg>0 ? v/solvKg : NaN; };
SPECIAL.molalityToMolarity = (v,x)=>{ const rho=(x.density??1)*1000, mm=(x.mm??1); return v*rho/(1000 + v*mm); };
SPECIAL.phToActivity = (v)=> Math.pow(10,-v);
SPECIAL.activityToPh = (v)=> v>0 ? -Math.log10(v) : NaN;

/* ---------- 24. Cooking ---------- */
SPECIAL.usCupToG = (v,x)=> v * (x.density??1) * 236.5882365;
SPECIAL.gToUsCup = (v,x)=> v / ((x.density??1) * 236.5882365);
SPECIAL.metricCupToG = (v,x)=> v * (x.density??1) * 250;
SPECIAL.gToMetricCup = (v,x)=> v / ((x.density??1) * 250);
SPECIAL.usTbspToG = (v,x)=> v * (x.density??1) * 14.78676478125;
SPECIAL.gToUsTbsp = (v,x)=> v / ((x.density??1) * 14.78676478125);
SPECIAL.usTspToG = (v,x)=> v * (x.density??1) * 4.92892159375;
SPECIAL.gToUsTsp = (v,x)=> v / ((x.density??1) * 4.92892159375);
SPECIAL.bakerPctToWeight = (v,x)=> v/100 * (x.flour??1000);
SPECIAL.weightToBakerPct = (v,x)=> v / (x.flour??1000) * 100;
SPECIAL.saltPctToG = (v,x)=> v/100 * (x.batch??1000);
SPECIAL.gToSaltPct = (v,x)=> v / (x.batch??1000) * 100;

/* ---------- 25. Geometry ---------- */
SPECIAL.sqrt = (v)=> v>=0 ? Math.sqrt(v) : NaN;
SPECIAL.sqrtDivPi = (v)=> v>=0 ? Math.sqrt(v/Math.PI) : NaN;
SPECIAL.piTimesSq = (v)=> Math.PI*v*v;
SPECIAL.mulSqrt2 = (v)=> v*Math.SQRT2;
SPECIAL.divSqrt2 = (v)=> v/Math.SQRT2;
SPECIAL.sphereVol = (v)=> 4/3*Math.PI*Math.pow(v,3);
SPECIAL.sphereVolToR = (v)=> v>=0 ? Math.cbrt(3*v/(4*Math.PI)) : NaN;
SPECIAL.sphereSurf = (v)=> 4*Math.PI*v*v;
SPECIAL.sphereSurfToR = (v)=> v>=0 ? Math.sqrt(v/(4*Math.PI)) : NaN;
SPECIAL.cubeVol = (v)=> Math.pow(v,3);
SPECIAL.cubeRoot = (v)=> Math.cbrt(v);
SPECIAL.cubeSurf = (v)=> 6*v*v;
SPECIAL.cubeSurfToEdge = (v)=> v>=0 ? Math.sqrt(v/6) : NaN;
SPECIAL.aspectToH = (v,x)=> v * (x.ah??9) / (x.aw??16);
SPECIAL.aspectToW = (v,x)=> v * (x.aw??16) / (x.ah??9);

/* ---------- 26. Number bases (text tools) ---------- */
SPECIAL.decToBin = (t)=>{ const s=String(t).trim(); if(!/^-?\d+$/.test(s)) return 'Invalid decimal integer'; const v=parseInt(s,10); return (v<0?'-':'')+Math.abs(v).toString(2); };
SPECIAL.binToDec = (t)=>{ const s=String(t).trim(); if(!/^[01]+$/.test(s)) return 'Invalid binary number — use only 0 and 1'; return String(parseInt(s,2)); };
SPECIAL.decToHex = (t)=>{ const s=String(t).trim(); if(!/^-?\d+$/.test(s)) return 'Invalid decimal integer'; const v=parseInt(s,10); return (v<0?'-':'')+Math.abs(v).toString(16).toUpperCase(); };
SPECIAL.hexToDec = (t)=>{ const s=String(t).trim(); if(!/^[0-9a-fA-F]+$/.test(s)) return 'Invalid hexadecimal number'; return String(parseInt(s,16)); };
SPECIAL.decToOct = (t)=>{ const s=String(t).trim(); if(!/^-?\d+$/.test(s)) return 'Invalid decimal integer'; const v=parseInt(s,10); return (v<0?'-':'')+Math.abs(v).toString(8); };
SPECIAL.octToDec = (t)=>{ const s=String(t).trim(); if(!/^[0-7]+$/.test(s)) return 'Invalid octal number — use only digits 0–7'; return String(parseInt(s,8)); };
SPECIAL.binToHex = (t)=>{ const s=String(t).trim(); if(!/^[01]+$/.test(s)) return 'Invalid binary number — use only 0 and 1'; return parseInt(s,2).toString(16).toUpperCase(); };
SPECIAL.hexToBin = (t)=>{ const s=String(t).trim(); if(!/^[0-9a-fA-F]+$/.test(s)) return 'Invalid hexadecimal number'; return parseInt(s,16).toString(2); };
SPECIAL.binToOct = (t)=>{ const s=String(t).trim(); if(!/^[01]+$/.test(s)) return 'Invalid binary number — use only 0 and 1'; return parseInt(s,2).toString(8); };
SPECIAL.octToBin = (t)=>{ const s=String(t).trim(); if(!/^[0-7]+$/.test(s)) return 'Invalid octal number — use only digits 0–7'; return parseInt(s,8).toString(2); };
SPECIAL.octToHex = (t)=>{ const s=String(t).trim(); if(!/^[0-7]+$/.test(s)) return 'Invalid octal number — use only digits 0–7'; return parseInt(s,8).toString(16).toUpperCase(); };
SPECIAL.hexToOct = (t)=>{ const s=String(t).trim(); if(!/^[0-9a-fA-F]+$/.test(s)) return 'Invalid hexadecimal number'; return parseInt(s,16).toString(8); };
SPECIAL.intToBase = (t,ex)=>{ const s=String(t).trim(); const base=Math.round(ex.base??16); if(!/^-?\d+$/.test(s)) return 'Invalid decimal integer'; if(base<2||base>36) return 'Base must be between 2 and 36'; const v=parseInt(s,10); return (v<0?'-':'')+Math.abs(v).toString(base).toUpperCase(); };
SPECIAL.baseToInt = (t,ex)=>{ const s=String(t).trim(); const base=Math.round(ex.base??16); if(base<2||base>36) return 'Base must be between 2 and 36'; const re=new RegExp('^[0-9a-zA-Z]+$'); if(!re.test(s)) return 'Invalid number for base '+base; const v=parseInt(s,base); if(isNaN(v)) return 'Invalid number for base '+base; return String(v); };
SPECIAL.intToTwos = (t,ex)=>{ const s=String(t).trim(); const w=Math.round(ex.width??8); if(!/^-?\d+$/.test(s)) return 'Invalid signed integer'; if(w<1||w>32) return 'Width must be 1–32 bits'; const mask=(1n<<BigInt(w))-1n; return (BigInt(s)&mask).toString(2).padStart(w,'0'); };
SPECIAL.twosToInt = (t)=>{ const s=String(t).trim(); if(!/^[01]+$/.test(s)) return 'Invalid bit string — use only 0 and 1'; const w=s.length; let v=BigInt('0b'+s); if(s[0]==='1') v-= (1n<<BigInt(w)); return v.toString(); };
SPECIAL.binToGray = (t)=>{ const s=String(t).trim(); if(!/^[01]+$/.test(s)) return 'Invalid binary number — use only 0 and 1'; const b=parseInt(s,2); return (b^(b>>1)).toString(2).padStart(s.length,'0'); };
SPECIAL.grayToBin = (t)=>{ const s=String(t).trim(); if(!/^[01]+$/.test(s)) return 'Invalid Gray code — use only 0 and 1'; let g=parseInt(s,2), b=0; while(g){ b^=g; g>>=1; } return b.toString(2).padStart(s.length,'0'); };
SPECIAL.decToIeee32 = (t)=>{ const v=parseFloat(String(t).trim()); if(isNaN(v)) return 'Invalid number'; const dv=new DataView(new ArrayBuffer(4)); dv.setFloat32(0,v); return dv.getUint32(0).toString(2).padStart(32,'0'); };
SPECIAL.ieee32ToDec = (t)=>{ const s=String(t).trim(); if(!/^[01]{32}$/.test(s)) return 'Enter exactly 32 bits (0/1)'; const dv=new DataView(new ArrayBuffer(4)); dv.setUint32(0,parseInt(s,2)); return String(dv.getFloat32(0)); };

/* ---------- 27. Fractions, ratios, notation (text tools) ---------- */
function _parseFrac(s){ const m=String(s).trim().match(/^(-?\d+)\s*\/\s*(-?\d+)$/); if(!m) return null; const n=+m[1], d=+m[2]; if(d===0) return null; return [n,d]; }
function _reduce(n,d){ if(d<0){n=-n;d=-d;} const g=_gcd(n,d); return [n/g,d/g]; }
function _fracStr(n,d){ const r=_reduce(n,d); return r[1]===1 ? String(r[0]) : r[0]+'/'+r[1]; }
function _decToFrac(v){ const neg=v<0; v=Math.abs(v); if(v===Math.floor(v)) return (neg?'-':'')+String(v); let h1=1,h2=0,k1=0,k2=1,x=v; for(let i=0;i<30;i++){ const a=Math.floor(x); const h=a*h1+h2, k=a*k1+k2; if(k>1000000) break; h2=h1;h1=h;k2=k1;k1=k; const r=x-a; if(r<1e-12) break; x=1/r; } return (neg?'-':'')+_fracStr(h1,k1); }
SPECIAL.fracToDec = (t)=>{ const f=_parseFrac(t); if(!f) return 'Enter a fraction like 3/4'; return String(f[0]/f[1]); };
SPECIAL.decToFrac = (t)=>{ const v=parseFloat(String(t).trim()); if(isNaN(v)||!isFinite(v)) return 'Invalid decimal'; return _decToFrac(v); };
SPECIAL.repDecToFrac = (t)=>{ const m=String(t).trim().match(/^(-?)(\d*)\.?(\d*)\((\d+)\)$/); if(!m) return 'Enter a repeating decimal like 0.(3) or 0.1(6) — repeating digits in ( )'; const neg=m[1]==='-'; const ip=m[2]===''?0:parseInt(m[2],10); const non=m[3], rep=m[4]; const n=non.length, r=rep.length; const all=parseInt((non+rep)||'0',10), pre=parseInt(non||'0',10); const den=Math.pow(10,n+r)-Math.pow(10,n); const num=ip*den+(all-pre); return _fracStr(neg?-num:num, den); };
SPECIAL.fracToRepDec = (t)=>{ const f=_parseFrac(t); if(!f) return 'Enter a fraction like 1/3'; let n=Math.abs(f[0]), d=Math.abs(f[1]); const neg=(f[0]<0)!==(f[1]<0); const ip=Math.floor(n/d); let rem=n%d; if(rem===0) return (neg?'-':'')+String(ip); let digits=''; const seen={}; while(rem!==0 && !(rem in seen)){ seen[rem]=digits.length; rem*=10; digits+=Math.floor(rem/d); rem%=d; } if(rem===0) return (neg?'-':'')+ip+'.'+digits; const rs=seen[rem]; return (neg?'-':'')+ip+'.'+digits.slice(0,rs)+'('+digits.slice(rs)+')'; };
SPECIAL.mixedToImproper = (t)=>{ const m=String(t).trim().match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/); if(!m) return 'Enter a mixed number like 1 1/2'; const w=+m[1], n=+m[2], d=+m[3]; if(d===0) return 'Denominator cannot be 0'; return _fracStr((Math.abs(w)*d+n)*(w<0?-1:1), d); };
SPECIAL.improperToMixed = (t)=>{ const f=_parseFrac(t); if(!f) return 'Enter a fraction like 7/3'; let r=_reduce(f[0],f[1]); const neg=r[0]<0; const n=Math.abs(r[0]), d=r[1]; const w=Math.floor(n/d), rem=n%d; if(rem===0) return (neg?'-':'')+String(w); if(w===0) return (neg?'-':'')+rem+'/'+d; return (neg?'-':'')+w+' '+rem+'/'+d; };
SPECIAL.fracToPct = (t)=>{ const f=_parseFrac(t); if(!f) return 'Enter a fraction like 3/4'; return _trimNum(f[0]/f[1]*100)+'%'; };
SPECIAL.pctToFrac = (t)=>{ const s=String(t).trim().replace(/%$/,''); const v=parseFloat(s); if(isNaN(v)) return 'Enter a percentage like 37.5%'; return _decToFrac(v/100); };
SPECIAL.ratioToFrac = (t)=>{ const m=String(t).trim().match(/^(-?\d+)\s*:\s*(-?\d+)$/); if(!m||+m[2]===0) return 'Enter a ratio like 3:4'; return _fracStr(+m[1],+m[2]); };
SPECIAL.fracToRatio = (t)=>{ const f=_parseFrac(t); if(!f) return 'Enter a fraction like 6/8'; const r=_reduce(f[0],f[1]); return r[0]+':'+r[1]; };
SPECIAL.ratioToPctShares = (t)=>{ const m=String(t).trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/); if(!m) return 'Enter a two-part ratio like 3:2'; const a=+m[1], b=+m[2]; if(a+b===0) return 'Ratio parts cannot both be 0'; return _trimNum(a/(a+b)*100)+'% : '+_trimNum(b/(a+b)*100)+'%'; };
SPECIAL.pctSharesToRatio = (t)=>{ const m=String(t).trim().match(/^(\d+(?:\.\d+)?)\s*%?\s*:\s*(\d+(?:\.\d+)?)\s*%?$/); if(!m) return 'Enter percentage shares like 60% : 40%'; const A=Math.round(+m[1]*100), B=Math.round(+m[2]*100); if(A+B===0) return 'Shares cannot both be 0'; const g=_gcd(A,B); return (A/g)+':'+(B/g); };
function _expandNum(s){ s=String(s).trim().replace(/×\s*10\^?/i,'e').replace(/\s+/g,''); const m=s.match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i); if(!m) return null; const neg=m[1], intp=m[2], fracp=m[3]||'', exp=+(m[4]||'0'); const all=intp+fracp; const lead=(all.match(/^0*/) || [''])[0].length; let digits=all.slice(lead); if(digits==='') return '0'; let point=intp.length-lead+exp; if(point<=0) return neg+'0.'+'0'.repeat(-point)+digits; if(point>=digits.length) return neg+digits+'0'.repeat(point-digits.length); return neg+digits.slice(0,point)+'.'+digits.slice(point); }
SPECIAL.sciToDec = (t)=>{ const r=_expandNum(t); return r===null ? 'Enter scientific notation like 1.23e4' : r; };
SPECIAL.engToDec = (t)=>{ const r=_expandNum(t); return r===null ? 'Enter engineering notation like 1.23e6' : r; };
SPECIAL.decToSci = (t)=>{ const v=parseFloat(String(t).trim()); if(isNaN(v)||!isFinite(v)) return 'Invalid number'; if(v===0) return '0 × 10^0'; const neg=v<0, a=Math.abs(v); const e=Math.floor(Math.log10(a)); const mant=Math.round(a/Math.pow(10,e)*1e10)/1e10; return (neg?'-':'')+mant+' × 10^'+e; };
SPECIAL.decToEng = (t)=>{ const v=parseFloat(String(t).trim()); if(isNaN(v)||!isFinite(v)) return 'Invalid number'; if(v===0) return '0 × 10^0'; const neg=v<0, a=Math.abs(v); const e=Math.floor(Math.log10(a)/3)*3; const mant=Math.round(a/Math.pow(10,e)*1e10)/1e10; return (neg?'-':'')+mant+' × 10^'+e; };
const _ROMAN=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
SPECIAL.arabicToRoman = (t)=>{ const v=parseInt(String(t).trim(),10); if(isNaN(v)||v<1||v>3999) return 'Enter an integer from 1 to 3999'; let n=v,out=''; for(const p of _ROMAN){ while(n>=p[0]){ out+=p[1]; n-=p[0]; } } return out; };
SPECIAL.romanToArabic = (t)=>{ const s=String(t).trim().toUpperCase(); if(!/^[MDCLXVI]+$/.test(s)) return 'Invalid Roman numeral'; const map={M:1000,D:500,C:100,L:50,X:10,V:5,I:1}; let total=0,prev=0; for(let i=s.length-1;i>=0;i--){ const cur=map[s[i]]; if(cur<prev) total-=cur; else { total+=cur; prev=cur; } } if(total<1||total>3999||SPECIAL.arabicToRoman(String(total))!==s) return 'Invalid Roman numeral'; return String(total); };

/* ---------- 28. Coordinates ---------- */
SPECIAL.cart2ToPolar = (x,ex)=>{ const y=ex.y??0; return 'r = '+_f6(Math.hypot(x,y))+', θ = '+_f6(Math.atan2(y,x)*180/Math.PI)+'°'; };
SPECIAL.polarToCart2 = (r,ex)=>{ const th=(ex.theta??0)*Math.PI/180; return 'x = '+_f6(r*Math.cos(th))+', y = '+_f6(r*Math.sin(th)); };
SPECIAL.cart3ToCyl = (x,ex)=>{ const y=ex.y??0, z=ex.z??0; return 'ρ = '+_f6(Math.hypot(x,y))+', φ = '+_f6(Math.atan2(y,x)*180/Math.PI)+'°, z = '+_f6(z); };
SPECIAL.cylToCart3 = (rho,ex)=>{ const ph=(ex.phi??0)*Math.PI/180, z=ex.z??0; return 'x = '+_f6(rho*Math.cos(ph))+', y = '+_f6(rho*Math.sin(ph))+', z = '+_f6(z); };
SPECIAL.cart3ToSph = (x,ex)=>{ const y=ex.y??0, z=ex.z??0; const r=Math.hypot(x,y,z); return 'r = '+_f6(r)+', θ = '+_f6(r===0?0:Math.acos(z/r)*180/Math.PI)+'°, φ = '+_f6(Math.atan2(y,x)*180/Math.PI)+'°'; };
SPECIAL.sphToCart3 = (r,ex)=>{ const th=(ex.theta??0)*Math.PI/180, ph=(ex.phi??0)*Math.PI/180; return 'x = '+_f6(r*Math.sin(th)*Math.cos(ph))+', y = '+_f6(r*Math.sin(th)*Math.sin(ph))+', z = '+_f6(r*Math.cos(th)); };
SPECIAL.cylToSph = (rho,ex)=>{ const ph=ex.phi??0, z=ex.z??0; const r=Math.hypot(rho,z); return 'r = '+_f6(r)+', θ = '+_f6(Math.atan2(rho,z)*180/Math.PI)+'°, φ = '+_f6(ph)+'°'; };
SPECIAL.sphToCyl = (r,ex)=>{ const th=(ex.theta??0)*Math.PI/180, ph=ex.phi??0; return 'ρ = '+_f6(r*Math.sin(th))+', φ = '+_f6(ph)+'°, z = '+_f6(r*Math.cos(th)); };
SPECIAL.latLonToEcef = (lat,ex)=>{ const lon=ex.lon??0, h=ex.alt??0; const a=6378137, e2=0.00669437999014; const la=lat*Math.PI/180, lo=lon*Math.PI/180; const N=a/Math.sqrt(1-e2*Math.sin(la)*Math.sin(la)); const X=(N+h)*Math.cos(la)*Math.cos(lo), Y=(N+h)*Math.cos(la)*Math.sin(lo), Z=(N*(1-e2)+h)*Math.sin(la); return 'X = '+_f3(X)+' m, Y = '+_f3(Y)+' m, Z = '+_f3(Z)+' m'; };
SPECIAL.ecefToLatLon = (X,ex)=>{ const Y=ex.y??0, Z=ex.z??0; const a=6378137, e2=0.00669437999014; const lon=Math.atan2(Y,X); const p=Math.hypot(X,Y); let lat=Math.atan2(Z,p*(1-e2)); for(let i=0;i<10;i++){ const N=a/Math.sqrt(1-e2*Math.sin(lat)*Math.sin(lat)); const h=p/Math.cos(lat)-N; lat=Math.atan2(Z,p*(1-e2*N/(N+h))); } const N=a/Math.sqrt(1-e2*Math.sin(lat)*Math.sin(lat)); const h=p/Math.cos(lat)-N; return 'latitude = '+_f6(lat*180/Math.PI)+'°, longitude = '+_f6(lon*180/Math.PI)+'°, height = '+_f3(h)+' m'; };
function _utmForward(lat,lon){ const a=6378137, f=1/298.257223563, k0=0.9996; const e2=f*(2-f), ep2=e2/(1-e2); const zone=Math.floor((lon+180)/6)+1; const lon0=(zone-1)*6-180+3; const la=lat*Math.PI/180, lo=lon*Math.PI/180, lo0=lon0*Math.PI/180; const N=a/Math.sqrt(1-e2*Math.sin(la)*Math.sin(la)); const T=Math.tan(la)*Math.tan(la), C=ep2*Math.cos(la)*Math.cos(la), A=(lo-lo0)*Math.cos(la); const M=a*((1-e2/4-3*e2*e2/64-5*e2*e2*e2/256)*la-(3*e2/8+3*e2*e2/32+45*e2*e2*e2/1024)*Math.sin(2*la)+(15*e2*e2/256+45*e2*e2*e2/1024)*Math.sin(4*la)-(35*e2*e2*e2/3072)*Math.sin(6*la)); const E=k0*N*(A+(1-T+C)*Math.pow(A,3)/6+(5-18*T+T*T+72*C-58*ep2)*Math.pow(A,5)/120)+500000; let Nn=k0*(M+N*Math.tan(la)*(A*A/2+(5-T+9*C+4*C*C)*Math.pow(A,4)/24+(61-58*T+T*T+600*C-330*ep2)*Math.pow(A,6)/720)); if(lat<0) Nn+=10000000; return [E,Nn,zone,lat<0?'S':'N']; }
function _utmInverse(E,Nn,zone,north){ const a=6378137, f=1/298.257223563, k0=0.9996; const e2=f*(2-f), ep2=e2/(1-e2); const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2)); const x=E-500000; let y=Nn; if(!north) y-=10000000; const M=y/k0; const mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2*e2*e2/256)); const J1=3*e1/2-27*Math.pow(e1,3)/32, J2=21*e1*e1/16-55*Math.pow(e1,4)/32, J3=151*Math.pow(e1,3)/96, J4=1097*Math.pow(e1,4)/512; const fp=mu+J1*Math.sin(2*mu)+J2*Math.sin(4*mu)+J3*Math.sin(6*mu)+J4*Math.sin(8*mu); const C1=ep2*Math.cos(fp)*Math.cos(fp), T1=Math.tan(fp)*Math.tan(fp); const N1=a/Math.sqrt(1-e2*Math.sin(fp)*Math.sin(fp)); const R1=a*(1-e2)/Math.pow(1-e2*Math.sin(fp)*Math.sin(fp),1.5); const D=x/(N1*k0); const lat=fp-(N1*Math.tan(fp)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*Math.pow(D,4)/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*Math.pow(D,6)/720); const lon0=((zone-1)*6-180+3)*Math.PI/180; const lon=lon0+(D-(1+2*T1+C1)*Math.pow(D,3)/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*Math.pow(D,5)/120)/Math.cos(fp); return [lat*180/Math.PI, lon*180/Math.PI]; }
SPECIAL.latLonToUtm = (lat,ex)=>{ const lon=ex.lon??0; if(lat<-80||lat>84) return 'UTM is defined only between 80°S and 84°N'; const r=_utmForward(lat,lon); return 'Easting = '+_f3(r[0])+' m, Northing = '+_f3(r[1])+' m, Zone '+r[2]+r[3]; };
SPECIAL.utmToLatLon = (E,ex)=>{ const Nn=ex.northing??0, zone=Math.round(ex.zone??0), north=(ex.north??1)!==0; if(zone<1||zone>60) return 'Enter a UTM zone from 1 to 60'; const r=_utmInverse(E,Nn,zone,north); return 'latitude = '+_f6(r[0])+'°, longitude = '+_f6(r[1])+'°'; };
SPECIAL.latLonToMerc = (lat,ex)=>{ const lon=ex.lon??0; const R=6378137; if(lat<=-90||lat>=90) return 'Latitude must be between −90° and 90°'; const x=R*lon*Math.PI/180; const y=R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)); return 'x = '+_f3(x)+' m, y = '+_f3(y)+' m'; };
SPECIAL.mercToLatLon = (x,ex)=>{ const y=ex.y??0; const R=6378137; const lon=x/R*180/Math.PI; const lat=(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI; return 'latitude = '+_f6(lat)+'°, longitude = '+_f6(lon)+'°'; };
SPECIAL.decToDdm = (v)=>{ const neg=v<0, a=Math.abs(v); const d=Math.floor(a); const m=(a-d)*60; return (neg?'-':'')+d+'° '+_trimNum(Math.round(m*1000)/1000)+'′'; };
SPECIAL.ddmToDec = (v,ex)=>{ const m=ex.mins??0; return v<0 ? v-m/60 : v+m/60; };
function _qmul(a,b){ return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3], a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2], a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1], a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]]; }
function _axisQ(ax,deg){ const r=deg*Math.PI/360, s=Math.sin(r), c=Math.cos(r); return ax==='x'?[c,s,0,0]:ax==='y'?[c,0,s,0]:[c,0,0,s]; }
SPECIAL.eulerToQuat = (x,ex)=>{ const y=ex.y??0, z=ex.z??0, ord=Math.round(ex.order??2); const qx=_axisQ('x',x), qy=_axisQ('y',y), qz=_axisQ('z',z); let q; if(ord===1) q=_qmul(_qmul(qx,qy),qz); else if(ord===3) q=_qmul(_qmul(qy,qx),qz); else q=_qmul(_qmul(qz,qy),qx); return 'w = '+_f6(q[0])+', x = '+_f6(q[1])+', y = '+_f6(q[2])+', z = '+_f6(q[3]); };
function _quatToMatrix(w,x,y,z){ return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]; }
SPECIAL.quatToEuler = (w,ex)=>{ const x=ex.x??0, y=ex.y??0, z=ex.z??0, ord=Math.round(ex.order??2); const R=_quatToMatrix(w,x,y,z); const cl=(v)=>Math.max(-1,Math.min(1,v)); let X,Y,Z; if(ord===1){ Y=Math.asin(cl(R[0][2])); X=Math.atan2(R[1][2],R[2][2]); Z=Math.atan2(-R[0][1],R[0][0]); } else if(ord===3){ X=Math.asin(cl(-R[1][2])); Y=Math.atan2(-R[0][2],R[2][2]); Z=Math.atan2(R[1][0],R[1][1]); } else { Y=Math.asin(cl(-R[2][0])); X=Math.atan2(R[2][1],R[2][2]); Z=Math.atan2(R[1][0],R[0][0]); } return 'X = '+_f6(X*180/Math.PI)+'°, Y = '+_f6(Y*180/Math.PI)+'°, Z = '+_f6(Z*180/Math.PI)+'°'; };
SPECIAL.quatToMatrix = (w,ex)=>{ const x=ex.x??0, y=ex.y??0, z=ex.z??0; const R=_quatToMatrix(w,x,y,z); return R.map(r=>r.map(v=>_f6(v)).join('  ')).join('<br>'); };
SPECIAL.matrixToQuat = (m11,ex)=>{ const m=[[m11,ex.m12??0,ex.m13??0],[ex.m21??0,ex.m22??1,ex.m23??0],[ex.m31??0,ex.m32??0,ex.m33??1]]; const tr=m[0][0]+m[1][1]+m[2][2]; let w,x,y,z; if(tr>0){ const s=Math.sqrt(tr+1)*2; w=s/4; x=(m[2][1]-m[1][2])/s; y=(m[0][2]-m[2][0])/s; z=(m[1][0]-m[0][1])/s; } else if(m[0][0]>m[1][1]&&m[0][0]>m[2][2]){ const s=Math.sqrt(1+m[0][0]-m[1][1]-m[2][2])*2; w=(m[2][1]-m[1][2])/s; x=s/4; y=(m[0][1]+m[1][0])/s; z=(m[0][2]+m[2][0])/s; } else if(m[1][1]>m[2][2]){ const s=Math.sqrt(1+m[1][1]-m[0][0]-m[2][2])*2; w=(m[0][2]-m[2][0])/s; x=(m[0][1]+m[1][0])/s; y=s/4; z=(m[1][2]+m[2][1])/s; } else { const s=Math.sqrt(1+m[2][2]-m[0][0]-m[1][1])*2; w=(m[1][0]-m[0][1])/s; x=(m[0][2]+m[2][0])/s; y=(m[1][2]+m[2][1])/s; z=s/4; } return 'w = '+_f6(w)+', x = '+_f6(x)+', y = '+_f6(y)+', z = '+_f6(z); };

/* ---------- 29. Timestamps ---------- */
SPECIAL.unixToIso = (v)=>{ const d=new Date(v*1000); return isNaN(d)?'Invalid Unix time':d.toISOString(); };
SPECIAL.isoToUnix = (t)=>{ const ms=Date.parse(String(t).trim()); return isNaN(ms)?'Invalid ISO 8601 timestamp':String(Math.floor(ms/1000)); };
SPECIAL.unixMsToIso = (v)=>{ const d=new Date(v); return isNaN(d)?'Invalid Unix time':d.toISOString(); };
SPECIAL.isoToUnixMs = (t)=>{ const ms=Date.parse(String(t).trim()); return isNaN(ms)?'Invalid ISO 8601 timestamp':String(ms); };
SPECIAL.unixUsToIso = (v)=>{ const d=new Date(Math.floor(v/1000)); return isNaN(d)?'Invalid Unix time':d.toISOString(); };
SPECIAL.isoToUnixUs = (t)=>{ const ms=Date.parse(String(t).trim()); return isNaN(ms)?'Invalid ISO 8601 timestamp':String(ms*1000); };
SPECIAL.unixNsToIso = (t)=>{ let ns; try{ ns=BigInt(String(t).trim()); }catch(e){ return 'Invalid Unix nanoseconds'; } const ms=ns/1000000n; const d=new Date(Number(ms)); if(isNaN(d)) return 'Invalid Unix time'; const frac=String(Number(ns%1000000n)).padStart(6,'0'); const base=d.toISOString().replace(/\.\d{3}Z$/,''); return base+'.'+String(d.getUTCMilliseconds()).padStart(3,'0')+frac+'Z'; };
SPECIAL.isoToUnixNs = (t)=>{ const ms=Date.parse(String(t).trim()); return isNaN(ms)?'Invalid ISO 8601 timestamp (sub-millisecond precision is dropped)':String(BigInt(ms)*1000000n); };
SPECIAL.rfc2822ToIso = (t)=>{ const ms=Date.parse(String(t).trim()); return isNaN(ms)?'Invalid RFC 2822 date':new Date(ms).toISOString(); };
SPECIAL.isoToRfc2822 = (t)=>{ const ms=Date.parse(String(t).trim()); return isNaN(ms)?'Invalid ISO 8601 timestamp':new Date(ms).toUTCString(); };
SPECIAL.rfc3339ToLocal = (t,ex)=>{ const ms=Date.parse(String(t).trim()); if(isNaN(ms)) return 'Invalid RFC 3339 timestamp'; const off=ex.tz??0; const d=new Date(ms+off*3600000); const p=(n)=>String(n).padStart(2,'0'); const sign=off>=0?'+':'-'; const ao=Math.abs(off), oh=Math.floor(ao), om=Math.round((ao-oh)*60); return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+':'+p(d.getUTCSeconds())+' (UTC'+sign+p(oh)+':'+p(om)+')'; };
SPECIAL.localToRfc3339 = (t,ex)=>{ const m=String(t).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/); if(!m) return 'Enter local date-time like 2026-11-17 14:30:00'; const off=ex.tz??0; const sign=off>=0?'+':'-'; const ao=Math.abs(off), oh=Math.floor(ao), om=Math.round((ao-oh)*60); const p=(n)=>String(n).padStart(2,'0'); return m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+(m[6]||'00')+sign+p(oh)+':'+p(om); };
SPECIAL.filetimeToIso = (t)=>{ let ft; try{ ft=BigInt(String(t).trim()); }catch(e){ return 'Invalid Windows FILETIME'; } const ms=Number((ft-116444736000000000n)/10000n); const d=new Date(ms); return isNaN(d)?'Invalid Windows FILETIME':d.toISOString(); };
SPECIAL.isoToFiletime = (t)=>{ const ms=Date.parse(String(t).trim()); return isNaN(ms)?'Invalid ISO 8601 timestamp':String(BigInt(ms)*10000n+116444736000000000n); };
SPECIAL.ticksToIso = (t,ex)=>{ let tk; try{ tk=BigInt(String(t).trim()); }catch(e){ return 'Invalid .NET ticks'; } let ms=Number((tk-621355968000000000n)/10000n); if((ex.kind??0)===1){ const off=new Date(ms).getTimezoneOffset(); ms=ms+off*60000; } const d=new Date(ms); return isNaN(d)?'Invalid .NET ticks':d.toISOString(); };
SPECIAL.isoToTicks = (t)=>{ const ms=Date.parse(String(t).trim()); return isNaN(ms)?'Invalid ISO 8601 timestamp':String(BigInt(ms)*10000n+621355968000000000n); };
SPECIAL.ntpToIso = (v,ex)=>{ const era=ex.era??0; const unix=v+era*4294967296-2208988800; const d=new Date(unix*1000); return isNaN(d)?'Invalid NTP timestamp':d.toISOString(); };
SPECIAL.isoToNtp = (t)=>{ const ms=Date.parse(String(t).trim()); if(isNaN(ms)) return 'Invalid ISO 8601 timestamp'; let s=Math.floor(ms/1000)+2208988800; s=((s%4294967296)+4294967296)%4294967296; return String(s)+' (era 0, 1900–2036)'; };
SPECIAL.gpsToUtc = (week,ex)=>{ const sow=ex.sow??0, leap=ex.leap??18; const ms=(315964800+week*604800+sow-leap)*1000; const d=new Date(ms); return isNaN(d)?'Invalid GPS week/seconds':d.toISOString(); };
SPECIAL.utcToGps = (t,ex)=>{ const ms=Date.parse(String(t).trim()); if(isNaN(ms)) return 'Invalid ISO 8601 timestamp'; const leap=ex.leap??18; const gps=Math.floor(ms/1000)-315964800+leap; const week=Math.floor(gps/604800); return 'Week '+week+', '+Math.floor(gps-week*604800)+' s'; };

/* ---------- 30. Calendars ---------- */
function _gregToJdn(y,m,d){ const a=Math.floor((14-m)/12); const yy=y+4800-a; const mm=m+12*a-3; return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045; }
function _jdnToGreg(j){ const a=j+32044, b=Math.floor((4*a+3)/146097), c=a-Math.floor(146097*b/4), d=Math.floor((4*c+3)/1461), e=c-Math.floor(1461*d/4), m=Math.floor((5*e+2)/153); return [100*b+d-4800+Math.floor(m/10), m+3-12*Math.floor(m/10), e-Math.floor((153*m+2)/5)+1]; }
function _julToJdn(y,m,d){ const a=Math.floor((14-m)/12); const yy=y+4800-a; const mm=m+12*a-3; return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-32083; }
function _jdnToJul(j){ const c=j+32082, d=Math.floor((4*c+3)/1461), e=c-Math.floor(1461*d/4), m=Math.floor((5*e+2)/153); return [d-4800+Math.floor(m/10), m+3-12*Math.floor(m/10), e-Math.floor((153*m+2)/5)+1]; }
function _parseYmd(s){ const m=String(s).trim().match(/^(-?\d{1,4})-(\d{1,2})-(\d{1,2})$/); if(!m) return null; return [+m[1],+m[2],+m[3]]; }
function _fmtYmd(y,m,d){ const p=(n)=>String(n).padStart(2,'0'); return (y<0?'-':'')+String(Math.abs(y)).padStart(4,'0')+'-'+p(m)+'-'+p(d); }
function _fmtYmdArr(a){ return _fmtYmd(a[0],a[1],a[2]); }
SPECIAL.gregToJdn = (t)=>{ const g=_parseYmd(t); if(!g) return 'Enter a Gregorian date like 2026-11-17'; return String(_gregToJdn(g[0],g[1],g[2])); };
SPECIAL.jdnToGreg = (t)=>{ const j=parseInt(String(t).trim(),10); if(isNaN(j)) return 'Enter a Julian day number like 2461000'; return _fmtYmdArr(_jdnToGreg(j)); };
SPECIAL.gregToJulianCal = (t)=>{ const g=_parseYmd(t); if(!g) return 'Enter a Gregorian date like 2026-11-17'; return _fmtYmdArr(_jdnToJul(_gregToJdn(g[0],g[1],g[2]))); };
SPECIAL.julianCalToGreg = (t)=>{ const g=_parseYmd(t); if(!g) return 'Enter a Julian calendar date like 2026-11-04'; return _fmtYmdArr(_jdnToGreg(_julToJdn(g[0],g[1],g[2]))); };
function _isoWeek(y,m,d){ const date=new Date(Date.UTC(y,m-1,d)); const dow=(date.getUTCDay()+6)%7; const thu=new Date(date.getTime()); thu.setUTCDate(date.getUTCDate()-dow+3); const isoYear=thu.getUTCFullYear(); const jan4=new Date(Date.UTC(isoYear,0,4)); const j4dow=(jan4.getUTCDay()+6)%7; const w1thu=new Date(jan4.getTime()); w1thu.setUTCDate(4+(3-j4dow)); const week=1+Math.round((thu-w1thu)/604800000); return [isoYear,week,dow+1]; }
function _isoWeekToGreg(y,w,wd){ const jan4=new Date(Date.UTC(y,0,4)); const j4dow=(jan4.getUTCDay()+6)%7; const w1mon=new Date(jan4.getTime()); w1mon.setUTCDate(4-j4dow); const dt=new Date(w1mon.getTime()); dt.setUTCDate(w1mon.getUTCDate()+(w-1)*7+(wd-1)); return [dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate()]; }
SPECIAL.gregToIsoWeek = (t)=>{ const g=_parseYmd(t); if(!g) return 'Enter a Gregorian date like 2026-11-17'; const w=_isoWeek(g[0],g[1],g[2]); return w[0]+'-W'+String(w[1]).padStart(2,'0')+'-'+w[2]; };
SPECIAL.isoWeekToGreg = (t)=>{ const m=String(t).trim().match(/^(\d{4})-W(\d{1,2})(?:-(\d))?$/); if(!m) return 'Enter an ISO week date like 2026-W47-2'; return _fmtYmdArr(_isoWeekToGreg(+m[1],+m[2],m[3]?+m[3]:1)); };
SPECIAL.gregToOrdinal = (t)=>{ const g=_parseYmd(t); if(!g) return 'Enter a Gregorian date like 2026-11-17'; const doy=Math.floor((Date.UTC(g[0],g[1]-1,g[2])-Date.UTC(g[0],0,1))/86400000)+1; return g[0]+'-'+String(doy).padStart(3,'0'); };
SPECIAL.ordinalToGreg = (t)=>{ const m=String(t).trim().match(/^(\d{4})-(\d{1,3})$/); if(!m) return 'Enter an ordinal date like 2026-321'; const dt=new Date(Date.UTC(+m[1],0,1)); dt.setUTCDate(+m[2]); return _fmtYmdArr([dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate()]); };
/* Tabular Islamic (Kuwaiti algorithm) */
const _ISL_MONTHS=['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Ula','Jumada al-Akhirah','Rajab','Shaban','Ramadan','Shawwal','Dhu al-Qadah','Dhu al-Hijjah'];
function _islToJdn(y,m,d){ return d+Math.ceil(29.5*(m-1))+(y-1)*354+Math.floor((3+11*y)/30)+1948439; }
function _jdnToIsl(j){ let y=Math.max(1,Math.floor((j-1948439)/354.367)); while(_islToJdn(y+1,1,1)<=j) y++; while(_islToJdn(y,1,1)>j) y--; let m=1; while(m<12&&_islToJdn(y,m+1,1)<=j) m++; return [y,m,j-_islToJdn(y,m,1)+1]; }
function _parseCalDate(s,names){ const m1=String(s).trim().match(/^(-?\d{1,4})-(\d{1,2})-(\d{1,2})$/); if(m1) return [+m1[1],+m1[2],+m1[3]]; const m2=String(s).trim().match(/^(\d{1,2})\s+([A-Za-z \-']+)\s+(\d{1,4})(?:\s+AH)?$/); if(m2){ const idx=names.findIndex(n=>n.toLowerCase()===m2[2].trim().toLowerCase()); if(idx>=0) return [+m2[3],idx+1,+m2[1]]; } return null; }
SPECIAL.gregToIslamic = (t)=>{ const g=_parseYmd(t); if(!g) return 'Enter a Gregorian date like 2026-11-17'; const i=_jdnToIsl(_gregToJdn(g[0],g[1],g[2])); return _fmtYmdArr(i)+' ('+i[2]+' '+_ISL_MONTHS[i[1]-1]+' '+i[0]+' AH)'; };
SPECIAL.islamicToGreg = (t)=>{ const i=_parseCalDate(t,_ISL_MONTHS); if(!i||i[1]<1||i[1]>12) return 'Enter an Islamic date like 1447-06-26'; return _fmtYmdArr(_jdnToGreg(_islToJdn(i[0],i[1],i[2]))); };
/* Coptic / Ethiopian (arithmetic 13-month calendars) */
const _COPTIC_MONTHS=['Thout','Paopi','Hathor','Koiak','Tobi','Meshir','Paremhat','Parmouti','Pashons','Paoni','Epip','Mesori','Nasie'];
const _ETH_MONTHS=['Meskerem','Tikimt','Hidar','Tahsas','Tir','Yekatit','Megabit','Miyazya','Ginbot','Sene','Hamle','Nehasse','Pagume'];
const _COPTIC_EPOCH=_julToJdn(284,8,29), _ETH_EPOCH=_julToJdn(8,8,29);
function _arithToJdn(epoch,y,m,d){ return epoch-1+365*(y-1)+Math.floor(y/4)+30*(m-1)+d; }
function _jdnToArith(epoch,j){ let days=j-epoch+1; let y=Math.max(1,Math.floor(days/365.25)); while(_arithToJdn(epoch,y+1,1,1)<=j) y++; while(_arithToJdn(epoch,y,1,1)>j) y--; const doy=j-_arithToJdn(epoch,y,1,1)+1; const m=Math.min(13,Math.floor((doy-1)/30)+1); return [y,m,doy-30*(m-1)]; }
SPECIAL.gregToCoptic = (t)=>{ const g=_parseYmd(t); if(!g) return 'Enter a Gregorian date like 2026-11-17'; const c=_jdnToArith(_COPTIC_EPOCH,_gregToJdn(g[0],g[1],g[2])); return _fmtYmdArr(c)+' ('+c[2]+' '+_COPTIC_MONTHS[c[1]-1]+' '+c[0]+' AM)'; };
SPECIAL.copticToGreg = (t)=>{ const c=_parseCalDate(t,_COPTIC_MONTHS); if(!c||c[1]<1||c[1]>13) return 'Enter a Coptic date like 1743-03-08'; return _fmtYmdArr(_jdnToGreg(_arithToJdn(_COPTIC_EPOCH,c[0],c[1],c[2]))); };
SPECIAL.gregToEthiopian = (t)=>{ const g=_parseYmd(t); if(!g) return 'Enter a Gregorian date like 2026-11-17'; const e=_jdnToArith(_ETH_EPOCH,_gregToJdn(g[0],g[1],g[2])); return _fmtYmdArr(e)+' ('+e[2]+' '+_ETH_MONTHS[e[1]-1]+' '+e[0]+')'; };
SPECIAL.ethiopianToGreg = (t)=>{ const e=_parseCalDate(t,_ETH_MONTHS); if(!e||e[1]<1||e[1]>13) return 'Enter an Ethiopian date like 2019-03-08'; return _fmtYmdArr(_jdnToGreg(_arithToJdn(_ETH_EPOCH,e[0],e[1],e[2]))); };
/* Hebrew (standard lunisolar algorithm, fourmilab / Calendrical Calculations) */
const _HEB_EPOCH=347995.5;
function _hebLeap(y){ return ((7*y+1)%19)<7; }
function _hebMonths(y){ return _hebLeap(y)?13:12; }
function _hebDelay1(y){ const months=Math.floor((235*y-234)/19); const parts=12084+13753*months; let day=months*29+Math.floor(parts/25920); if((3*(day+1))%7<3) day++; return day; }
function _hebDelay2(y){ const last=_hebDelay1(y-1), present=_hebDelay1(y), next=_hebDelay1(y+1); return (next-present===356)?2:((present-last===382)?1:0); }
function _hebYearDays(y){ return _hebToJd(y+1,7,1)-_hebToJd(y,7,1); }
function _hebMonthDays(y,m){ if(m===2||m===4||m===6||m===10||m===13) return 29; if(m===12) return _hebLeap(y)?30:29; if(m===8) return (_hebYearDays(y)%10===5)?30:29; if(m===9) return (_hebYearDays(y)%10===3)?29:30; return 30; }
function _hebToJd(y,m,d){ let jd=_HEB_EPOCH+_hebDelay1(y)+_hebDelay2(y)+d+1; if(m<7){ for(let mon=7;mon<=_hebMonths(y);mon++) jd+=_hebMonthDays(y,mon); for(let mon=1;mon<m;mon++) jd+=_hebMonthDays(y,mon); } else { for(let mon=7;mon<m;mon++) jd+=_hebMonthDays(y,mon); } return jd; }
function _jdToHeb(jd){ jd=Math.floor(jd)+0.5; const count=Math.floor(((jd-_HEB_EPOCH)*98496)/35975351); let year=count-1; for(let i=count;_hebToJd(i,7,1)<=jd;i++) year++; let month; if(jd<_hebToJd(year,1,1)) month=7; else month=1; for(let i=month;jd>_hebToJd(year,i,_hebMonthDays(year,i));i++) month++; return [year,month,Math.floor(jd-_hebToJd(year,month,1)+1)]; }
function _hebMonthName(y,m){ const names={1:'Nisan',2:'Iyyar',3:'Sivan',4:'Tammuz',5:'Av',6:'Elul',7:'Tishrei',8:'Cheshvan',9:'Kislev',10:'Tevet',11:'Shevat',12:_hebLeap(y)?'Adar I':'Adar',13:'Adar II'}; return names[m]; }
function _hebMonthNames(y){ const n=[]; for(let m=1;m<=13;m++) n.push(_hebMonthName(y,m)); return n; }
SPECIAL.gregToHebrew = (t)=>{ const g=_parseYmd(t); if(!g) return 'Enter a Gregorian date like 2026-11-17'; const h=_jdToHeb(_gregToJdn(g[0],g[1],g[2])-0.5); return _fmtYmdArr(h)+' ('+h[2]+' '+_hebMonthName(h[0],h[1])+' '+h[0]+')'; };
SPECIAL.hebrewToGreg = (t)=>{ const m1=String(t).trim().match(/^(-?\d{1,4})-(\d{1,2})-(\d{1,2})$/); let h=null; if(m1) h=[+m1[1],+m1[2],+m1[3]]; else { const m2=String(t).trim().match(/^(\d{1,2})\s+([A-Za-z ]+)\s+(\d{1,4})$/); if(m2){ const names=_hebMonthNames(+m2[3]); const idx=names.findIndex(n=>n.toLowerCase()===m2[2].trim().toLowerCase()); if(idx>=0) h=[+m2[3],idx+1,+m2[1]]; } } if(!h||h[1]<1||h[1]>_hebMonths(h[0])) return 'Enter a Hebrew date like 5787-08-27'; return _fmtYmdArr(_jdnToGreg(Math.floor(_hebToJd(h[0],h[1],h[2])+0.5))); };
/* ISO 8601 durations (fixed units only) and clock durations */
SPECIAL.isoDurToSec = (t)=>{ const s=String(t).trim(); const m=s.match(/^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/); if(!m||s==='P'||s==='PT') return 'Enter a fixed-unit ISO 8601 duration like PT1H30M — years/months are not supported (they vary in length)'; return String((+m[1]||0)*604800+(+m[2]||0)*86400+(+m[3]||0)*3600+(+m[4]||0)*60+(+m[5]||0)); };
SPECIAL.secToIsoDur = (v)=>{ if(v<0||!isFinite(v)) return 'Enter a non-negative number of seconds'; let s=Math.floor(v); const w=Math.floor(s/604800); s-=w*604800; const d=Math.floor(s/86400); s-=d*86400; const h=Math.floor(s/3600); s-=h*3600; const m=Math.floor(s/60); s-=m*60; let out='P'; if(w) out+=w+'W'; if(d) out+=d+'D'; let tt=''; if(h) tt+=h+'H'; if(m) tt+=m+'M'; if(s||!tt) tt+=s+'S'; return out+'T'+tt; };
SPECIAL.clockToDecMin = (t)=>{ const m=String(t).trim().match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/); if(!m) return 'Enter a clock duration like 1:30:00 or 45:30'; return String(+m[1]*60+ +m[2]+(+m[3]||0)/60); };
SPECIAL.decMinToClock = (v)=>{ if(v<0||!isFinite(v)) return 'Enter a non-negative number of minutes'; const h=Math.floor(v/60), m=Math.floor(v%60), s=Math.round((v%1)*60); return h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); };

/* Site 4 (TextConvert) special functions. Injected into the engine's SPECIAL registry. */
/* ---------- generic helpers ---------- */
const TE = new TextEncoder(), TD = new TextDecoder();
function b64encBytes(u8){ let s=''; const CH=0x8000; for(let i=0;i<u8.length;i+=CH){ s+=String.fromCharCode.apply(null,u8.subarray(i,i+CH)); } return btoa(s); }
function b64encText(s){ return b64encBytes(TE.encode(s)); }
function b64decBytes(b64){ const bin=atob(String(b64).replace(/\s+/g,'')); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
function b64decText(b64){ return TD.decode(b64decBytes(b64)); }
function txtBlob(s,name){ return {blob:new Blob([s],{type:'text/plain'}),filename:name}; }
function outName(file,ext){ const b=(file.name||'file').replace(/\.[^.]*$/,'')||'converted'; return b+ext; }
function escXml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escHtml(s){ return escXml(s); }
function readText(file){ return file.text(); }
async function readBuf(file){ return new Uint8Array(await file.arrayBuffer()); }

/* ---------- CRC32 + ZIP (deflate via CompressionStream, store supported) ---------- */
const CRC_T = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=CRC_T[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
async function deflateRaw(u8){ const s=new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function inflateRaw(u8){ const s=new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function zipBuild(entries){
  const chunks=[], central=[]; let off=0;
  for(const e of entries){
    const nameU8=TE.encode(e.name);
    let data=e.data, method=0;
    if(!e.store){ data=await deflateRaw(e.data); method=8; }
    const crc=crc32(e.data);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true);
    lh.setUint16(8,method,true); lh.setUint16(10,0,true); lh.setUint16(12,0,true);
    lh.setUint32(14,crc,true); lh.setUint32(18,data.length,true); lh.setUint32(22,e.data.length,true);
    lh.setUint16(26,nameU8.length,true); lh.setUint16(28,0,true);
    chunks.push(lh.buffer,nameU8,data);
    central.push({nameU8,crc,method,csize:data.length,usize:e.data.length,off});
    off+=30+nameU8.length+data.length;
  }
  const cdStart=off; const cdParts=[];
  for(const c of central){
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true);
    ch.setUint16(8,0x0800,true); ch.setUint16(10,c.method,true); ch.setUint16(12,0,true); ch.setUint16(14,0,true);
    ch.setUint32(16,c.crc,true); ch.setUint32(20,c.csize,true); ch.setUint32(24,c.usize,true);
    ch.setUint16(28,c.nameU8.length,true);
    ch.setUint32(42,c.off,true);
    cdParts.push(ch.buffer,c.nameU8);
    off+=46+c.nameU8.length;
  }
  const eo=new DataView(new ArrayBuffer(22));
  eo.setUint32(0,0x06054b50,true); eo.setUint16(8,central.length,true); eo.setUint16(10,central.length,true);
  eo.setUint32(12,off-cdStart,true); eo.setUint32(16,cdStart,true);
  return new Blob([...chunks,...cdParts,eo.buffer],{type:'application/zip'});
}
async function zipRead(buf){
  const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
  let eocd=-1;
  for(let i=buf.length-22;i>=0;i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) throw new Error('Not a ZIP file.');
  const count=dv.getUint16(eocd+10,true); let cdOff=dv.getUint32(eocd+16,true);
  const out=new Map();
  for(let n=0;n<count;n++){
    if(dv.getUint32(cdOff,true)!==0x02014b50) throw new Error('Bad ZIP central directory.');
    const method=dv.getUint16(cdOff+10,true), csize=dv.getUint32(cdOff+20,true);
    const nameLen=dv.getUint16(cdOff+28,true), extraLen=dv.getUint16(cdOff+30,true), comLen=dv.getUint16(cdOff+32,true);
    const lhOff=dv.getUint32(cdOff+42,true);
    const name=TD.decode(buf.subarray(cdOff+46,cdOff+46+nameLen));
    const lhNameLen=dv.getUint16(lhOff+26,true), lhExtraLen=dv.getUint16(lhOff+28,true);
    const dataStart=lhOff+30+lhNameLen+lhExtraLen;
    const raw=buf.subarray(dataStart,dataStart+csize);
    let data;
    if(method===0) data=raw;
    else if(method===8) data=await inflateRaw(raw);
    else throw new Error('Unsupported ZIP compression method '+method+'.');
    out.set(name,data);
    cdOff+=46+nameLen+extraLen+comLen;
  }
  return out;
}

/* ---------- identifier word splitting ---------- */
function splitIdent(s){
  return String(s).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2')
    .split(/[^A-Za-z0-9]+/).filter(Boolean);
}
function capWord(w){ return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase(); }

/* ---------- 31. Letter case ---------- */
SPECIAL.txtLower=(t)=>String(t).toLowerCase();
SPECIAL.txtUpper=(t)=>String(t).toUpperCase();
SPECIAL.txtSentence=(t)=>String(t).toLowerCase().replace(/(^\s*[a-z]|[.!?]\s+[a-z])/g,m=>m.toUpperCase());
SPECIAL.txtTitle=(t)=>String(t).toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());
SPECIAL.txtAlt=(t)=>{ let i=0; return String(t).replace(/[A-Za-z]/g,c=>(i++%2?c.toUpperCase():c.toLowerCase())); };
SPECIAL.txtInvert=(t)=>String(t).replace(/[A-Za-z]/g,c=>c===c.toLowerCase()?c.toUpperCase():c.toLowerCase());
SPECIAL.txtCamel=(t)=>{ const w=splitIdent(t); return w.map((x,i)=>i===0?x.toLowerCase():capWord(x)).join(''); };
SPECIAL.txtPascal=(t)=>splitIdent(t).map(capWord).join('');
SPECIAL.txtSnake=(t)=>splitIdent(t).map(w=>w.toLowerCase()).join('_');
SPECIAL.txtScreaming=(t)=>splitIdent(t).map(w=>w.toUpperCase()).join('_');
SPECIAL.txtKebab=(t)=>splitIdent(t).map(w=>w.toLowerCase()).join('-');
SPECIAL.txtTrain=(t)=>splitIdent(t).map(capWord).join('-');
SPECIAL.txtDot=(t)=>splitIdent(t).map(w=>w.toLowerCase()).join('.');
SPECIAL.txtPath=(t)=>splitIdent(t).map(w=>w.toLowerCase()).join('/');
SPECIAL.txtCamelToWords=(t)=>splitIdent(t).map(w=>w.toLowerCase()).join(' ');
SPECIAL.txtSnakeToWords=(t)=>String(t).split('_').filter(Boolean).join(' ');
SPECIAL.txtKebabToWords=(t)=>String(t).split('-').filter(Boolean).join(' ');
SPECIAL.txtAcronymToTitle=(t)=>splitIdent(t).map(w=>/^[A-Z]+$/.test(w)&&w.length>1?w:capWord(w)).join(' ');
const TRANSLIT_MAP={'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a','æ':'ae','ç':'c','è':'e','é':'e','ê':'e','ë':'e','ì':'i','í':'i','î':'i','ï':'i','ð':'d','ñ':'n','ò':'o','ó':'o','ô':'o','õ':'o','ö':'o','ø':'o','ù':'u','ú':'u','û':'u','ü':'u','ý':'y','þ':'th','ÿ':'y','ß':'ss','ā':'a','ă':'a','ą':'a','ć':'c','č':'c','ď':'d','đ':'d','ē':'e','ĕ':'e','ė':'e','ę':'e','ě':'e','ĝ':'g','ğ':'g','ġ':'g','ģ':'g','ĥ':'h','ħ':'h','ĩ':'i','ī':'i','ĭ':'i','į':'i','ı':'i','ĳ':'ij','ĵ':'j','ķ':'k','ĺ':'l','ļ':'l','ľ':'l','ŀ':'l','ł':'l','ń':'n','ņ':'n','ň':'n','ŋ':'n','ō':'o','ŏ':'o','ő':'o','œ':'oe','ŕ':'r','ŗ':'r','ř':'r','ś':'s','ŝ':'s','ş':'s','š':'s','ţ':'t','ť':'t','ŧ':'t','ũ':'u','ū':'u','ŭ':'u','ů':'u','ű':'u','ų':'u','ŵ':'w','ŷ':'y','ź':'z','ż':'z','ž':'z','ș':'s','ț':'t','€':'EUR','£':'GBP','¥':'JPY'};
function transliterate(s){ return String(s).split('').map(c=>TRANSLIT_MAP[c]!==undefined?TRANSLIT_MAP[c]:(TRANSLIT_MAP[c.toLowerCase()]!==undefined?TRANSLIT_MAP[c.toLowerCase()].toUpperCase():c)).join(''); }
SPECIAL.txtSlugAscii=(t)=>transliterate(t).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
SPECIAL.txtSlugUnicode=(t)=>String(t).toLowerCase().replace(/[\s_]+/g,'-').replace(/[^\p{L}\p{N}-]+/gu,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'');

/* ---------- 32. Text layout ---------- */
SPECIAL.tabsToSpaces=(t,ex)=>String(t).replace(/\t/g,' '.repeat(Math.max(1,Math.round(ex.width??4))));
SPECIAL.spacesToTabs=(t,ex)=>{ const n=Math.max(1,Math.round(ex.width??4)); return String(t).replace(new RegExp(' {'+n+'}','g'),'\t'); };
SPECIAL.lfToCrlf=(t)=>String(t).replace(/\r\n/g,'\n').replace(/\n/g,'\r\n');
SPECIAL.crlfToLf=(t)=>String(t).replace(/\r\n/g,'\n');
SPECIAL.crToLf=(t)=>String(t).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
SPECIAL.lfToCr=(t)=>String(t).replace(/\r\n/g,'\n').replace(/\n/g,'\r');
SPECIAL.escapedToMultiline=(t)=>String(t).replace(/\\(n|t|r|\\|'|"|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})/g,(m,e)=>e==='n'?'\n':e==='t'?'\t':e==='r'?'\r':e==='\\'?'\\':e==="'"?"'":e==='"'?'"':e[0]==='u'?String.fromCodePoint(parseInt(e.replace(/[u{}]/g,''),16)):String.fromCharCode(parseInt(e.slice(1),16)));
SPECIAL.multilineToEscaped=(t)=>String(t).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t');
function splitDelim(s,delim){ const out=[]; let cur='',q=false; for(let i=0;i<s.length;i++){ const c=s[i]; if(c==='"'){ q=!q; cur+=c; } else if(c===delim&&!q){ out.push(cur.trim()); cur=''; } else cur+=c; } out.push(cur.trim()); return out.filter(x=>x!==''); }
SPECIAL.linesToCsv=(t)=>String(t).split(/\r?\n/).filter(x=>x.trim()!=='').join(', ');
SPECIAL.csvToLines=(t)=>splitDelim(String(t),',').join('\n');
SPECIAL.linesToSemicolon=(t)=>String(t).split(/\r?\n/).filter(x=>x.trim()!=='').join('; ');
SPECIAL.semicolonToLines=(t)=>splitDelim(String(t),';').join('\n');
SPECIAL.linesToWords=(t)=>String(t).split(/\r?\n/).filter(x=>x.trim()!=='').join(' ');
SPECIAL.wordsToLines=(t)=>String(t).split(/\s+/).filter(Boolean).join('\n');
SPECIAL.unwrapParas=(t)=>String(t).split(/\n\s*\n/).map(p=>p.replace(/\r?\n/g,' ').replace(/  +/g,' ').trim()).join('\n\n');
SPECIAL.wrapParas=(t,ex)=>{ const w=Math.max(10,Math.round(ex.width??80)); return String(t).split(/\n\s*\n/).map(p=>{ const words=p.replace(/\s+/g,' ').trim().split(' '); const lines=[]; let cur=''; for(const wd of words){ if((cur+' '+wd).trim().length>w&&cur){ lines.push(cur); cur=wd; } else cur=(cur?cur+' ':'')+wd; } if(cur) lines.push(cur); return lines.join('\n'); }).join('\n\n'); };
SPECIAL.spaceIndentToTab=(t,ex)=>{ const n=Math.max(1,Math.round(ex.width??4)); return String(t).split('\n').map(l=>l.replace(new RegExp('^( {'+n+'})+'),m=>'\t'.repeat(m.length/n))).join('\n'); };
SPECIAL.tabIndentToSpace=(t,ex)=>String(t).replace(/\t/g,' '.repeat(Math.max(1,Math.round(ex.width??4))));
SPECIAL.bulletsToNumbered=(t)=>{ let i=0; return String(t).split('\n').map(l=>/^\s*[•\-\*]\s/.test(l)?l.replace(/^(\s*)[•\-\*]\s/,(_,p)=>p+(++i)+'. '):l).join('\n'); };
SPECIAL.numberedToBullets=(t)=>String(t).split('\n').map(l=>l.replace(/^(\s*)\d+[.)]\s/,'$1• ')).join('\n');

/* ---------- 33. Encodings (text + file) ---------- */
SPECIAL.asciiToHex=(t)=>Array.from(TE.encode(t)).map(b=>b.toString(16).padStart(2,'0')).join('');
SPECIAL.hexToAscii=(t)=>{ const h=String(t).replace(/[^0-9a-fA-F]/g,''); const u=new Uint8Array(h.length/2); for(let i=0;i<u.length;i++) u[i]=parseInt(h.substr(i*2,2),16); return TD.decode(u); };
SPECIAL.utf8ToBinary=(t)=>Array.from(TE.encode(t)).map(b=>b.toString(2).padStart(8,'0')).join(' ');
SPECIAL.binaryToUtf8=(t)=>{ const bits=String(t).replace(/[^01]/g,''); const u=new Uint8Array(Math.ceil(bits.length/8)); for(let i=0;i<u.length;i++) u[i]=parseInt(bits.substr(i*8,8).padEnd(8,'0'),2); return TD.decode(u); };
SPECIAL.utf8ToDecBytes=(t)=>'['+Array.from(TE.encode(t)).join(', ')+']';
SPECIAL.decBytesToUtf8=(t)=>{ const nums=String(t).match(/\d+/g)||[]; return TD.decode(new Uint8Array(nums.map(n=>+n&255))); };
SPECIAL.utf8ToBase64=(t)=>b64encText(t);
SPECIAL.base64ToUtf8=(t)=>{ try{ return b64decText(t); }catch(e){ return 'Error: invalid Base64 input.'; } };
function utf16Encode(text,be){ const u16=new Uint16Array([...text].flatMap(c=>{ const cp=c.codePointAt(0); return cp>0xFFFF?[0xD800+((cp-0x10000)>>10),0xDC00+((cp-0x10000)&1023)]:[cp]; })); const out=new Uint8Array(u16.length*2); for(let i=0;i<u16.length;i++){ if(be){ out[i*2]=u16[i]>>8; out[i*2+1]=u16[i]&255; } else { out[i*2]=u16[i]&255; out[i*2+1]=u16[i]>>8; } } return out; }
function utf32Encode(text,be){ const cps=[...text].map(c=>c.codePointAt(0)); const out=new Uint8Array(cps.length*4); cps.forEach((cp,i)=>{ if(be){ out[i*4]=cp>>>24; out[i*4+1]=(cp>>>16)&255; out[i*4+2]=(cp>>>8)&255; out[i*4+3]=cp&255; } else { out[i*4]=cp&255; out[i*4+1]=(cp>>>8)&255; out[i*4+2]=(cp>>>16)&255; out[i*4+3]=cp>>>24; } }); return out; }
function utf32Decode(u8,be){ const cps=[]; for(let i=0;i+3<u8.length;i+=4){ const cp=be?((u8[i]<<24)|(u8[i+1]<<16)|(u8[i+2]<<8)|u8[i+3]):(u8[i]|(u8[i+1]<<8)|(u8[i+2]<<16)|(u8[i+3]<<24)); if(cp>=0&&cp<=0x10FFFF&&!(cp>=0xD800&&cp<=0xDFFF)) cps.push(cp); } return String.fromCodePoint(...cps); }
function utf16FileToUtf8(file,be){ return (async()=>{ const buf=await readBuf(file); const text=new TextDecoder(be?'utf-16be':'utf-16le').decode(buf); return txtBlob(text,outName(file,'.txt')); })(); }
SPECIAL.utf8ToUtf16le=async(file)=>({blob:new Blob([utf16Encode(await readText(file),false)]),filename:outName(file,'.txt')});
SPECIAL.utf16leToUtf8=(file)=>utf16FileToUtf8(file,false);
SPECIAL.utf8ToUtf16be=async(file)=>({blob:new Blob([utf16Encode(await readText(file),true)]),filename:outName(file,'.txt')});
SPECIAL.utf16beToUtf8=(file)=>utf16FileToUtf8(file,true);
SPECIAL.utf8ToUtf32le=async(file)=>({blob:new Blob([utf32Encode(await readText(file),false)]),filename:outName(file,'.txt')});
SPECIAL.utf32leToUtf8=async(file)=>txtBlob(utf32Decode(await readBuf(file),false),outName(file,'.txt'));
SPECIAL.utf8ToUtf32be=async(file)=>({blob:new Blob([utf32Encode(await readText(file),true)]),filename:outName(file,'.txt')});
SPECIAL.utf32beToUtf8=async(file)=>txtBlob(utf32Decode(await readBuf(file),true),outName(file,'.txt'));
SPECIAL.latin1ToUtf8=async(file)=>{ const buf=await readBuf(file); return txtBlob(new TextDecoder('iso-8859-1').decode(buf),outName(file,'.txt')); };
SPECIAL.utf8ToLatin1=async(file)=>{ const text=await readText(file); const u8=new Uint8Array([...text].map(c=>{ const cp=c.codePointAt(0); return cp<256?cp:63; })); return {blob:new Blob([u8]),filename:outName(file,'.txt'),note:'Characters outside Latin-1 were replaced with ?.'}; };
SPECIAL.win1252ToUtf8=async(file)=>{ const buf=await readBuf(file); return txtBlob(new TextDecoder('windows-1252').decode(buf),outName(file,'.txt')); };
const WIN1252_EXTRA={0x80:0x20AC,0x82:0x201A,0x83:0x0192,0x84:0x201E,0x85:0x2026,0x86:0x2020,0x87:0x2021,0x88:0x02C6,0x89:0x2030,0x8A:0x0160,0x8B:0x2039,0x8C:0x0152,0x8E:0x017D,0x91:0x2018,0x92:0x2019,0x93:0x201C,0x94:0x201D,0x95:0x2022,0x96:0x2013,0x97:0x2014,0x98:0x02DC,0x99:0x2122,0x9A:0x0161,0x9B:0x203A,0x9C:0x0153,0x9E:0x017E,0x9F:0x0178};
SPECIAL.utf8ToWin1252=async(file)=>{ const text=await readText(file); const rev={}; for(const k in WIN1252_EXTRA) rev[WIN1252_EXTRA[k]]=+k; const u8=new Uint8Array([...text].map(c=>{ const cp=c.codePointAt(0); if(cp<256) return cp; if(rev[cp]!==undefined) return rev[cp]; return 63; })); return {blob:new Blob([u8]),filename:outName(file,'.txt'),note:'Characters outside Windows-1252 were replaced with ?.'}; };

/* ---------- 34. Unicode / entities ---------- */
const NAMED_ENT={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;','©':'&copy;','®':'&reg;','™':'&trade;','€':'&euro;','£':'&pound;','¥':'&yen;','¢':'&cent;','§':'&sect;','°':'&deg;','±':'&plusmn;','×':'&times;','÷':'&divide;','µ':'&micro;','¶':'&para;','·':'&middot;','–':'&ndash;','—':'&mdash;','‘':'&lsquo;','’':'&rsquo;','“':'&ldquo;','”':'&rdquo;','…':'&hellip;','←':'&larr;','→':'&rarr;','↑':'&uarr;','↓':'&darr;','↔':'&harr;','≠':'&ne;','≤':'&le;','≥':'&ge;','∞':'&infin;','√':'&radic;','∑':'&sum;','π':'&pi;','α':'&alpha;','β':'&beta;','γ':'&gamma;','δ':'&delta;','λ':'&lambda;','Ω':'&Omega;','•':'&bull;','✓':'&check;','✔':'&check;','★':'&star;','♥':'&hearts;','♦':'&diams;','♣':'&clubs;','♠':'&spades;',' ':'&nbsp;'};
const NAMED_REV={}; for(const k in NAMED_ENT) NAMED_REV[NAMED_ENT[k]]=k;
SPECIAL.textToHtmlNamed=(t)=>String(t).split('').map(c=>NAMED_ENT[c]||(c.codePointAt(0)>127?'&#'+c.codePointAt(0)+';':c)).join('');
SPECIAL.htmlNamedToText=(t)=>String(t).replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g,(m,e)=>{ if(e[0]==='#') return e[1]==='x'?String.fromCodePoint(parseInt(e.slice(2),16)):String.fromCodePoint(parseInt(e.slice(1),10)); const full='&'+e+';'; return NAMED_REV[full]!==undefined?NAMED_REV[full]:m; });
SPECIAL.textToHtmlDec=(t)=>[...String(t)].map(c=>'&#'+c.codePointAt(0)+';').join('');
SPECIAL.htmlDecToText=(t)=>String(t).replace(/&#(\d+);/g,(m,n)=>String.fromCodePoint(+n));
SPECIAL.textToHtmlHex=(t)=>[...String(t)].map(c=>'&#x'+c.codePointAt(0).toString(16)+';').join('');
SPECIAL.htmlHexToText=(t)=>String(t).replace(/&#[xX]([0-9a-fA-F]+);/g,(m,n)=>String.fromCodePoint(parseInt(n,16)));
SPECIAL.textToCodepoints=(t)=>[...String(t)].map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ');
SPECIAL.codepointsToText=(t)=>{ const parts=String(t).match(/(?:U\+|0x)?[0-9a-fA-F]+/g)||[]; return String.fromCodePoint(...parts.map(p=>parseInt(p.replace(/^(U\+|0x)/i,''),p.toLowerCase().startsWith('u+')||p.startsWith('0x')?16:10)).filter(n=>n>=0&&n<=0x10FFFF)); };
SPECIAL.textToJsEscapes=(t)=>[...String(t)].map(c=>{ const cp=c.codePointAt(0); if(cp<32||cp>126){ return cp>0xFFFF?'\\u{'+cp.toString(16)+'}':'\\u'+cp.toString(16).padStart(4,'0'); } return c; }).join('');
SPECIAL.jsEscapesToText=(t)=>String(t).replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g,(m,a,b)=>String.fromCodePoint(parseInt(a||b,16)));
SPECIAL.textToPyEscapes=(t)=>[...String(t)].map(c=>{ const cp=c.codePointAt(0); if(cp<32||cp>126){ return cp>0xFFFF?'\\U'+cp.toString(16).padStart(8,'0'):'\\u'+cp.toString(16).padStart(4,'0'); } return c; }).join('');
SPECIAL.pyEscapesToText=(t)=>String(t).replace(/\\U([0-9a-fA-F]{8})|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g,(m,a,b,c)=>String.fromCodePoint(parseInt(a||b||c,16)));
SPECIAL.normNFC=(t)=>String(t).normalize('NFC');
SPECIAL.normNFD=(t)=>String(t).normalize('NFD');
SPECIAL.normNFKC=(t)=>String(t).normalize('NFKC');
SPECIAL.normNFKD=(t)=>String(t).normalize('NFKD');
SPECIAL.fullwidthToHalfwidth=(t)=>[...String(t)].map(c=>{ const cp=c.codePointAt(0); if(cp===0x3000) return ' '; if(cp>=0xFF01&&cp<=0xFF5E) return String.fromCharCode(cp-0xFEE0); return c; }).join('');
SPECIAL.halfwidthToFullwidth=(t)=>[...String(t)].map(c=>{ const cp=c.codePointAt(0); if(cp===32) return '　'; if(cp>=33&&cp<=126) return String.fromCharCode(cp+0xFEE0); return c; }).join('');
SPECIAL.transliterateAscii=(t)=>transliterate(t).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x00-\x7F]/g,'?');
const CTRL_NAMES={0:'␀',1:'␁',2:'␂',3:'␃',4:'␄',5:'␅',6:'␆',7:'␇',8:'␈',9:'␉',10:'␊',11:'␋',12:'␌',13:'␍',14:'␎',15:'␏',16:'␐',17:'␑',18:'␒',19:'␓',20:'␔',21:'␕',22:'␖',23:'␗',24:'␘',25:'␙',26:'␚',27:'␛',28:'␜',29:'␝',30:'␞',31:'␟',127:'␡'};
SPECIAL.visibleControls=(t)=>[...String(t)].map(c=>CTRL_NAMES[c.codePointAt(0)]||c).join('');

/* ---------- CSV / delimited helpers ---------- */
function csvParse(text,delim){
  delim=delim||',';
  const rows=[]; let row=[],cur='',q=false;
  const s=String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(q){ if(c==='"'){ if(s[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=c; }
    else if(c==='"') q=true;
    else if(c===delim){ row.push(cur); cur=''; }
    else if(c==='\n'){ row.push(cur); cur=''; rows.push(row); row=[]; }
    else cur+=c;
  }
  if(cur!==''||row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r=>!(r.length===1&&r[0]===''));
}
function csvStringify(rows,delim){
  delim=delim||',';
  return rows.map(r=>r.map(v=>{ const s=v===null||v===undefined?'':String(v); return /["\n\r]/.test(s)||s.includes(delim)?'"'+s.replace(/"/g,'""')+'"':s; }).join(delim)).join('\n');
}
function rowsToObjects(rows){
  if(!rows.length) return [];
  const h=rows[0];
  return rows.slice(1).map(r=>{ const o={}; h.forEach((k,i)=>o[k]=r[i]!==undefined?r[i]:''); return o; });
}
function objectsToRows(objs){
  const keys=[]; objs.forEach(o=>Object.keys(o).forEach(k=>{ if(!keys.includes(k)) keys.push(k); }));
  return [keys].concat(objs.map(o=>keys.map(k=>o[k]===undefined||o[k]===null?'':(typeof o[k]==='object'?JSON.stringify(o[k]):String(o[k])))));
}
function parseJsonSafe(t){ try{ return JSON.parse(t); }catch(e){ throw new Error('Invalid JSON: '+e.message); } }

/* ---------- YAML subset ---------- */
function yamlScalar(v){
  if(v===null||v===undefined) return 'null';
  if(typeof v==='number'||typeof v==='boolean') return String(v);
  if(typeof v==='string'){
    if(v===''||/[:#\[\]{},&*!?|>'"%@`]/.test(v)||/^\s|\s$/.test(v)||v==='true'||v==='false'||v==='null'||!isNaN(Number(v))) return JSON.stringify(v);
    return v;
  }
  return JSON.stringify(v);
}
function yamlStringify(v,indent){
  indent=indent||0; const pad='  '.repeat(indent);
  if(Array.isArray(v)){
    if(!v.length) return '[]';
    return v.map(it=>{ if(it&&typeof it==='object'){ const s=yamlStringify(it,indent+1); const lines=s.split('\n'); return pad+'- '+lines[0].replace(/^  /,'')+(lines.length>1?'\n'+lines.slice(1).join('\n'):''); } return pad+'- '+yamlScalar(it); }).join('\n');
  }
  if(v&&typeof v==='object'){
    const keys=Object.keys(v);
    if(!keys.length) return '{}';
    return keys.map(k=>{ const val=v[k]; if(val&&typeof val==='object'&&Object.keys(val).length){ return pad+k+':\n'+yamlStringify(val,indent+1); } if(Array.isArray(val)&&val.length){ return pad+k+':\n'+yamlStringify(val,indent+1); } return pad+k+': '+yamlScalar(val); }).join('\n');
  }
  return pad+yamlScalar(v);
}
function yamlParseScalar(s){
  s=s.trim();
  if(s===''||s==='~'||s==='null') return null;
  if(s==='true') return true; if(s==='false') return false;
  if(/^".*"$/.test(s)||/^'.*'$/.test(s)){ try{ return JSON.parse(s); }catch(e){ return s.slice(1,-1); } }
  if(s==='[]') return []; if(s==='{}') return {};
  if(/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return Number(s);
  return s;
}
function yamlParse(text){
  const lines=String(text).split(/\r?\n/).map(l=>l.replace(/#.*$/,'')).filter(l=>l.trim()!=='');
  if(!lines.length) return null;
  let pos=0;
  function indentOf(l){ return l.match(/^ */)[0].length; }
  function parseBlock(ind){
    const first=lines[pos];
    if(!first) return null;
    if(first.slice(ind).trimStart().startsWith('- ')||first.slice(ind).trim()==='-'){
      const arr=[];
      while(pos<lines.length&&indentOf(lines[pos])===ind&&(lines[pos].slice(ind).trimStart().startsWith('- ')||lines[pos].slice(ind).trim()==='-')){
        const rest=lines[pos].slice(ind+2);
        if(rest.trim()===''){ pos++; arr.push(pos<lines.length&&indentOf(lines[pos])>ind?parseBlock(indentOf(lines[pos])):null); }
        else if(/^[^:\n]+:\s/.test(rest)||/^[^:\n]+:$/.test(rest)||rest.trimStart().startsWith('- ')){
          lines.splice(pos,1,' '.repeat(ind+2)+rest.trimStart());
          arr.push(parseBlock(ind+2));
        }
        else { arr.push(yamlParseScalar(rest)); pos++; }
      }
      return arr;
    }
    const obj={};
    while(pos<lines.length&&indentOf(lines[pos])===ind){
      const line=lines[pos].slice(ind);
      const m=line.match(/^([^:\n]+):\s*(.*)$/);
      if(!m) { pos++; continue; }
      const key=m[1].trim().replace(/^['"]|['"]$/g,'');
      const val=m[2].trim();
      pos++;
      if(val===''){
        if(pos<lines.length&&indentOf(lines[pos])>ind){ obj[key]=parseBlock(indentOf(lines[pos])); }
        else obj[key]=null;
      } else if(val==='|'||val==='>'){
        const parts=[]; while(pos<lines.length&&indentOf(lines[pos])>ind){ parts.push(lines[pos].trim()); pos++; }
        obj[key]=parts.join(val==='|'?'\n':' ');
      } else obj[key]=yamlParseScalar(val);
    }
    return obj;
  }
  return parseBlock(indentOf(lines[0]));
}

/* ---------- XML helpers ---------- */
function xmlParse(t){
  const doc=new DOMParser().parseFromString(String(t),'text/xml');
  const err=doc.querySelector('parsererror');
  if(err) throw new Error('Invalid XML: '+err.textContent.slice(0,120));
  return doc;
}
function xmlNodeToJson(node){
  const obj={};
  for(const a of node.attributes||[]) obj['@'+a.name]=a.value;
  const kids=[...node.childNodes].filter(n=>n.nodeType===1);
  const text=[...node.childNodes].filter(n=>n.nodeType===3).map(n=>n.nodeValue).join('').trim();
  if(!kids.length){ return Object.keys(obj).length?(text?Object.assign(obj,{'#text':text}):obj):text; }
  for(const k of kids){
    const v=xmlNodeToJson(k);
    if(obj[k.tagName]!==undefined){ if(!Array.isArray(obj[k.tagName])) obj[k.tagName]=[obj[k.tagName]]; obj[k.tagName].push(v); }
    else obj[k.tagName]=v;
  }
  if(text) obj['#text']=text;
  return obj;
}
function jsonToXmlVal(v,name){
  if(v===null||v===undefined) return '<'+name+'/>';
  if(Array.isArray(v)) return v.map(it=>jsonToXmlVal(it,name)).join('');
  if(typeof v==='object'){
    let attrs='',inner='';
    for(const k of Object.keys(v)){
      if(k.startsWith('@')) attrs+=' '+k.slice(1)+'="'+escXml(v[k])+'"';
      else if(k==='#text') inner+=escXml(v[k]);
      else inner+=jsonToXmlVal(v[k],k);
    }
    return '<'+name+attrs+'>'+inner+'</'+name+'>';
  }
  return '<'+name+'>'+escXml(v)+'</'+name+'>';
}
function xmlNodeToYaml(node,ind){
  const pad='  '.repeat(ind);
  const attrs={}; for(const a of node.attributes||[]) attrs['@'+a.name]=a.value;
  const kids=[...node.childNodes].filter(n=>n.nodeType===1);
  const text=[...node.childNodes].filter(n=>n.nodeType===3).map(n=>n.nodeValue).join('').trim();
  if(!kids.length&&!Object.keys(attrs).length) return text||'';
  const obj={...attrs};
  for(const k of kids){ const v=xmlNodeToYaml(k,0); if(obj[k.tagName]!==undefined){ if(!Array.isArray(obj[k.tagName])) obj[k.tagName]=[obj[k.tagName]]; obj[k.tagName].push(v); } else obj[k.tagName]=v; }
  if(text) obj['#text']=text;
  return obj;
}
function rowsToHtmlTable(rows){
  if(!rows.length) return '<table></table>';
  let h='<table>\n<thead><tr>'+rows[0].map(c=>'<th>'+escHtml(c)+'</th>').join('')+'</tr></thead>\n<tbody>\n';
  for(const r of rows.slice(1)) h+='<tr>'+r.map(c=>'<td>'+escHtml(c)+'</td>').join('')+'</tr>\n';
  return h+'</tbody>\n</table>';
}
function rowsToMdTable(rows){
  if(!rows.length) return '';
  const head='| '+rows[0].join(' | ')+' |';
  const sep='| '+rows[0].map(()=>'---').join(' | ')+' |';
  const body=rows.slice(1).map(r=>'| '+r.join(' | ')+' |');
  return [head,sep,...body].join('\n');
}
function mdTableParse(text){
  const lines=String(text).split('\n').filter(l=>l.trim().startsWith('|'));
  if(lines.length<2) throw new Error('No Markdown table found.');
  const split=l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
  return [split(lines[0])].concat(lines.slice(2).map(split));
}
function htmlTableParse(text){
  const doc=new DOMParser().parseFromString(String(text),'text/html');
  const table=doc.querySelector('table');
  if(!table) throw new Error('No HTML table found.');
  return [...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(c=>c.textContent.trim()));
}

/* ---------- 35. JSON transformations ---------- */
SPECIAL.jsonToYaml=(t)=>yamlStringify(parseJsonSafe(t));
SPECIAL.yamlToJson=(t)=>JSON.stringify(yamlParse(t),null,2);
SPECIAL.jsonToXml=(t)=>{ const v=parseJsonSafe(t); return '<?xml version="1.0" encoding="UTF-8"?>\n'+(v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).map(k=>jsonToXmlVal(v[k],k)).join('\n'):jsonToXmlVal(v,'root')); };
SPECIAL.xmlToJson=(t)=>{ const doc=xmlParse(t); const root=doc.documentElement; const o={}; o[root.tagName]=xmlNodeToJson(root); return JSON.stringify(o,null,2); };
SPECIAL.jsonToCsv=(t)=>{ const v=parseJsonSafe(t); const arr=Array.isArray(v)?v:[v]; return csvStringify(objectsToRows(arr)); };
SPECIAL.jsonToTsv=(t)=>{ const v=parseJsonSafe(t); const arr=Array.isArray(v)?v:[v]; return csvStringify(objectsToRows(arr),'\t'); };
SPECIAL.jsonToHtmlTable=(t)=>{ const v=parseJsonSafe(t); const arr=Array.isArray(v)?v:[v]; return rowsToHtmlTable(objectsToRows(arr)); };
SPECIAL.jsonToMdTable=(t)=>{ const v=parseJsonSafe(t); const arr=Array.isArray(v)?v:[v]; return rowsToMdTable(objectsToRows(arr)); };
function flattenObj(v,prefix,out){ if(v&&typeof v==='object'&&!Array.isArray(v)){ for(const k of Object.keys(v)) flattenObj(v[k],prefix?prefix+'.'+k:k,out); } else if(Array.isArray(v)){ v.forEach((it,i)=>flattenObj(it,prefix+'.'+i,out)); } else out[prefix]=v; return out; }
SPECIAL.jsonFlatten=(t)=>JSON.stringify(flattenObj(parseJsonSafe(t),'',{}),null,2);
SPECIAL.jsonUnflatten=(t)=>{ const flat=parseJsonSafe(t); const out={}; for(const path of Object.keys(flat)){ const parts=path.split('.'); let cur=out; for(let i=0;i<parts.length-1;i++){ const p=parts[i], nx=parts[i+1]; if(cur[p]===undefined) cur[p]=/^\d+$/.test(nx)?[]:{}; cur=cur[p]; } cur[parts[parts.length-1]]=flat[path]; } return JSON.stringify(out,null,2); };
SPECIAL.jsonToNdjson=(t)=>{ const v=parseJsonSafe(t); const arr=Array.isArray(v)?v:[v]; return arr.map(x=>JSON.stringify(x)).join('\n'); };
SPECIAL.ndjsonToJson=(t)=>{ const arr=String(t).split('\n').filter(l=>l.trim()).map(l=>JSON.parse(l)); return JSON.stringify(arr,null,2); };
SPECIAL.jsonToKv=(t)=>{ const v=parseJsonSafe(t); if(!v||typeof v!=='object'||Array.isArray(v)) throw new Error('Enter a JSON object.'); return Object.keys(v).map(k=>k+'='+ (typeof v[k]==='object'?JSON.stringify(v[k]):String(v[k]))).join('\n'); };
SPECIAL.kvToJson=(t)=>{ const o={}; String(t).split('\n').forEach(l=>{ const i=l.indexOf('='); if(i>0) o[l.slice(0,i).trim()]=l.slice(i+1).trim(); }); return JSON.stringify(o,null,2); };
SPECIAL.jsonToQuery=(t)=>{ const v=parseJsonSafe(t); const p=new URLSearchParams(); for(const k of Object.keys(v)) p.set(k,typeof v[k]==='object'?JSON.stringify(v[k]):String(v[k])); return p.toString(); };
SPECIAL.queryToJson=(t)=>{ const q=String(t).replace(/^\?/,''); const o={}; new URLSearchParams(q).forEach((v,k)=>o[k]=v); return JSON.stringify(o,null,2); };
SPECIAL.jsonToJsLiteral=(t)=>{ const v=parseJsonSafe(t); return JSON.stringify(v,null,2).replace(/"([^"]+)":/g,'$1:'); };
SPECIAL.jsLiteralToJson=(t)=>{ let s=String(t).trim(); s=s.replace(/'([^'\\]*)'/g,'"$1"').replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g,'$1"$2":').replace(/,\s*([}\]])/g,'$1'); return JSON.stringify(JSON.parse(s),null,2); };
SPECIAL.jsonStringToText=(t)=>JSON.parse(String(t).trim());
SPECIAL.textToJsonString=(t)=>JSON.stringify(String(t));

/* ---------- 36. CSV / TSV / delimited ---------- */
SPECIAL.csvToJson=(t)=>JSON.stringify(rowsToObjects(csvParse(t)),null,2);
SPECIAL.tsvToJson=(t)=>JSON.stringify(rowsToObjects(csvParse(t,'\t')),null,2);
SPECIAL.csvToTsv=(t)=>csvStringify(csvParse(t),'\t');
SPECIAL.tsvToCsv=(t)=>csvStringify(csvParse(t,'\t'));
SPECIAL.csvToSemicolon=(t)=>csvStringify(csvParse(t),';');
SPECIAL.semicolonToCsv=(t)=>csvStringify(csvParse(t,';'));
SPECIAL.csvToPipe=(t)=>csvStringify(csvParse(t),'|');
SPECIAL.pipeToCsv=(t)=>csvStringify(csvParse(t,'|'));
SPECIAL.csvToHtmlTable=(t)=>rowsToHtmlTable(csvParse(t));
SPECIAL.htmlTableToCsv=(t)=>csvStringify(htmlTableParse(t));
SPECIAL.csvToMdTable=(t)=>rowsToMdTable(csvParse(t));
SPECIAL.mdTableToCsv=(t)=>csvStringify(mdTableParse(t));
SPECIAL.csvToXml=(t)=>{ const rows=rowsToObjects(csvParse(t)); return '<?xml version="1.0" encoding="UTF-8"?>\n<records>\n'+rows.map(r=>'  <record>'+Object.keys(r).map(k=>'<'+k.replace(/[^A-Za-z0-9_]/g,'_')+'>'+escXml(r[k])+'</'+k.replace(/[^A-Za-z0-9_]/g,'_')+'>').join('')+'</record>').join('\n')+'\n</records>'; };
SPECIAL.xmlRecordsToCsv=(t)=>{ const doc=xmlParse(t); const recs=[...doc.querySelectorAll('record')]; if(!recs.length) throw new Error('No <record> elements found.'); const keys=[]; const rows=recs.map(r=>{ const o={}; [...r.children].forEach(c=>{ if(!keys.includes(c.tagName)) keys.push(c.tagName); o[c.tagName]=c.textContent; }); return o; }); return csvStringify([keys].concat(rows.map(o=>keys.map(k=>o[k]||'')))); };
SPECIAL.csvToYaml=(t)=>yamlStringify(rowsToObjects(csvParse(t)));
SPECIAL.yamlRecordsToCsv=(t)=>{ const v=yamlParse(t); const arr=Array.isArray(v)?v:[v]; return csvStringify(objectsToRows(arr)); };
SPECIAL.csvToSqlInsert=(t,ex)=>{ const rows=rowsToObjects(csvParse(t)); return rows.map(r=>'INSERT INTO table ('+Object.keys(r).join(', ')+') VALUES ('+Object.values(r).map(v=>"'"+String(v).replace(/'/g,"''")+"'").join(', ')+');').join('\n'); };
SPECIAL.sqlInsertToCsv=(t)=>{ const rows=[]; const re=/INSERT\s+INTO\s+\S+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]*)\)/gi; let m; while((m=re.exec(t))){ const cols=m[1].split(',').map(s=>s.trim()); const vals=csvParse(m[2])[0]||[]; rows.push(vals.map(v=>v.replace(/^'|'$/g,'').replace(/''/g,"'"))); if(!rows[0]) rows.unshift(cols); else if(rows.length===1) rows.unshift(cols); } if(!rows.length) throw new Error('No INSERT statements found.'); return csvStringify(rows); };
SPECIAL.delimitedToFixed=(t,ex)=>{ const w=Math.max(1,Math.round(ex.width??10)); return csvParse(t).map(r=>r.map(c=>String(c).slice(0,w).padEnd(w,' ')).join('')).join('\n'); };
SPECIAL.fixedToDelimited=(t,ex)=>{ const w=Math.max(1,Math.round(ex.width??10)); return String(t).split('\n').map(l=>{ const cells=[]; for(let i=0;i<l.length;i+=w) cells.push(l.slice(i,i+w).trim()); return cells.join(','); }).join('\n'); };

/* ---------- TOML / INI / .env / properties / HOCON ---------- */
function tomlVal(v){
  if(typeof v==='string') return '"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
  if(typeof v==='boolean') return v?'true':'false';
  if(typeof v==='number') return String(v);
  if(Array.isArray(v)) return '['+v.map(tomlVal).join(', ')+']';
  if(v===null) return '""';
  return '"'+String(v)+'"';
}
function jsonToTomlStr(v){
  const lines=[]; const tables=[];
  for(const k of Object.keys(v)){
    if(v[k]&&typeof v[k]==='object'&&!Array.isArray(v[k])) tables.push([k,v[k]]);
    else lines.push(k+' = '+tomlVal(v[k]));
  }
  for(const [name,obj] of tables){ lines.push(''); lines.push('['+name+']'); for(const k of Object.keys(obj)) lines.push(k+' = '+tomlVal(obj[k])); }
  return lines.join('\n');
}
function tomlParse(t){
  const out={}; let cur=out;
  String(t).split('\n').forEach(line=>{
    line=line.trim(); if(!line||line.startsWith('#')) return;
    if(line.startsWith('[')&&line.endsWith(']')){ const path=line.slice(1,-1).split('.'); cur=out; path.forEach(p=>{ cur[p]=cur[p]||{}; cur=cur[p]; }); return; }
    const m=line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/); if(!m) return;
    let v=m[2].trim();
    if(v.startsWith('"')&&v.endsWith('"')){ try{ cur[m[1]]=JSON.parse(v); }catch(e){ cur[m[1]]=v.slice(1,-1); } }
    else if(v.startsWith("'")&&v.endsWith("'")) cur[m[1]]=v.slice(1,-1);
    else if(v==='true') cur[m[1]]=true; else if(v==='false') cur[m[1]]=false;
    else if(/^\[.*\]$/.test(v)){ try{ cur[m[1]]=JSON.parse(v); }catch(e){ cur[m[1]]=v; } }
    else if(!isNaN(Number(v))) cur[m[1]]=Number(v);
    else cur[m[1]]=v;
  });
  return out;
}
function iniParse(t){
  const out={}; let cur=out;
  String(t).split('\n').forEach(line=>{
    line=line.trim(); if(!line||line.startsWith(';')||line.startsWith('#')) return;
    const sec=line.match(/^\[(.+)\]$/);
    if(sec){ cur=out[sec[1].trim()]={}; return; }
    const m=line.match(/^([^=:]+)\s*[=:]\s*(.*)$/); if(m) cur[m[1].trim()]=m[2].trim();
  });
  return out;
}
function iniStringify(obj){
  const lines=[]; const top=[];
  for(const k of Object.keys(obj)){
    if(obj[k]&&typeof obj[k]==='object') { lines.push(''); lines.push('['+k+']'); for(const s of Object.keys(obj[k])) lines.push(s+' = '+obj[k][s]); }
    else top.push(k+' = '+obj[k]);
  }
  return top.concat(lines).join('\n').replace(/^\n/,'');
}

/* ---------- 37. XML / YAML / config ---------- */
SPECIAL.xmlToYaml=(t)=>{ const doc=xmlParse(t); const root=doc.documentElement; const o={}; o[root.tagName]=xmlNodeToYaml(root,0); return yamlStringify(o); };
SPECIAL.yamlToXml=(t)=>{ const v=yamlParse(t); const o=(v&&typeof v==='object')?v:{value:v}; return '<?xml version="1.0" encoding="UTF-8"?>\n'+Object.keys(o).map(k=>jsonToXmlVal(o[k],k)).join('\n'); };
SPECIAL.jsonToToml=(t)=>jsonToTomlStr(parseJsonSafe(t));
SPECIAL.tomlToJson=(t)=>JSON.stringify(tomlParse(t),null,2);
SPECIAL.yamlToToml=(t)=>jsonToTomlStr(yamlParse(t));
SPECIAL.tomlToYaml=(t)=>yamlStringify(tomlParse(t));
SPECIAL.iniToJson=(t)=>JSON.stringify(iniParse(t),null,2);
SPECIAL.jsonToIni=(t)=>iniStringify(parseJsonSafe(t));
SPECIAL.iniToYaml=(t)=>yamlStringify(iniParse(t));
SPECIAL.yamlToIni=(t)=>iniStringify(yamlParse(t));
SPECIAL.envToJson=(t)=>{ const o={}; String(t).split('\n').forEach(l=>{ l=l.trim(); if(!l||l.startsWith('#')) return; const i=l.indexOf('='); if(i>0){ let v=l.slice(i+1).trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); o[l.slice(0,i).trim()]=v; } }); return JSON.stringify(o,null,2); };
SPECIAL.jsonToEnv=(t)=>{ const v=parseJsonSafe(t); return Object.keys(v).map(k=>k+'='+ (typeof v[k]==='string'&&/[\s#"]/.test(v[k])?'"'+v[k].replace(/"/g,'\\"')+'"':String(v[k]))).join('\n'); };
SPECIAL.propertiesToJson=(t)=>{ const o={}; String(t).split('\n').forEach(l=>{ l=l.trim(); if(!l||l.startsWith('#')||l.startsWith('!')) return; const m=l.match(/^([^=:]+)\s*[=:]\s*(.*)$/); if(m) o[m[1].trim()]=m[2].trim().replace(/\\(.)/g,'$1'); }); return JSON.stringify(o,null,2); };
SPECIAL.jsonToProperties=(t)=>{ const v=parseJsonSafe(t); return Object.keys(v).map(k=>k+'='+String(v[k]).replace(/([=: #!\\])/g,'\\$1')).join('\n'); };
SPECIAL.hoconToJson=(t)=>{ let s=String(t).replace(/#.*$/gm,'').replace(/\/\/.*$/gm,''); s=s.replace(/([{,]\s*)([A-Za-z0-9_.-]+)\s*[:=]/g,'$1"$2":').replace(/:\s*([A-Za-z0-9_.\/-]+)/g,': "$1"').replace(/,\s*([}\]])/g,'$1'); return JSON.stringify(JSON.parse(s),null,2); };
SPECIAL.jsonToHocon=(t)=>{ const v=parseJsonSafe(t); function fmt(val,ind){ const pad='  '.repeat(ind); if(val&&typeof val==='object'&&!Array.isArray(val)){ return '{\n'+Object.keys(val).map(k=>pad+'  '+k+' = '+fmt(val[k],ind+1)).join('\n')+'\n'+pad+'}'; } if(Array.isArray(val)) return '['+val.map(x=>fmt(x,ind)).join(', ')+']'; if(typeof val==='string') return '"'+val.replace(/"/g,'\\"')+'"'; return String(val); } if(v&&typeof v==='object'&&!Array.isArray(v)) return Object.keys(v).map(k=>k+' = '+fmt(v[k],0)).join('\n'); return fmt(v,0); };
SPECIAL.xmlAttrsToChildren=(t)=>{ const doc=xmlParse(t); const ser=new XMLSerializer(); function conv(el){ for(const a of [...el.attributes]){ const child=doc.createElement(a.name); child.textContent=a.value; el.appendChild(child); el.removeAttribute(a.name); } [...el.children].forEach(conv); } conv(doc.documentElement); return ser.serializeToString(doc); };
SPECIAL.xmlChildrenToAttrs=(t)=>{ const doc=xmlParse(t); const ser=new XMLSerializer(); function conv(el){ for(const c of [...el.children]){ if(!c.children.length&&!c.attributes.length){ el.setAttribute(c.tagName,c.textContent); el.removeChild(c); } else conv(c); } } conv(doc.documentElement); return ser.serializeToString(doc); };
SPECIAL.xmlToTsv=(t)=>{ const doc=xmlParse(t); const recs=[...doc.documentElement.children]; if(!recs.length) throw new Error('No child record elements found.'); const keys=[]; const rows=recs.map(r=>{ const o={}; [...r.children].forEach(c=>{ if(!keys.includes(c.tagName)) keys.push(c.tagName); o[c.tagName]=c.textContent; }); return o; }); return csvStringify([keys].concat(rows.map(o=>keys.map(k=>o[k]||''))),'\t'); };
SPECIAL.tsvToXml=(t)=>{ const rows=rowsToObjects(csvParse(t,'\t')); return '<?xml version="1.0" encoding="UTF-8"?>\n<records>\n'+rows.map(r=>'  <record>'+Object.keys(r).map(k=>'<'+k.replace(/[^A-Za-z0-9_]/g,'_')+'>'+escXml(r[k])+'</'+k.replace(/[^A-Za-z0-9_]/g,'_')+'>').join('')+'</record>').join('\n')+'\n</records>'; };

/* ---------- 38. Spreadsheets (XLSX/ODS) ---------- */
function colLetter(n){ let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
function colIndex(ref){ const m=ref.match(/^([A-Z]+)(\d+)$/); if(!m) return 0; let n=0; for(const c of m[1]) n=n*26+(c.charCodeAt(0)-64); return n-1; }
function xlsxSheetXml(rows){
  let xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>\n';
  rows.forEach((row,ri)=>{
    xml+='<row r="'+(ri+1)+'">';
    row.forEach((v,ci)=>{
      const ref=colLetter(ci)+(ri+1);
      if(v===null||v===undefined||v==='') xml+='<c r="'+ref+'"/>';
      else if(!isNaN(Number(v))&&String(v).trim()!=='') xml+='<c r="'+ref+'"><v>'+v+'</v></c>';
      else xml+='<c r="'+ref+'" t="inlineStr"><is><t>'+escXml(v)+'</t></is></c>';
    });
    xml+='</row>\n';
  });
  return xml+'</sheetData></worksheet>';
}
async function xlsxBuild(rows){
  const entries=[
    {name:'[Content_Types].xml',data:TE.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')},
    {name:'_rels/.rels',data:TE.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')},
    {name:'xl/workbook.xml',data:TE.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>')},
    {name:'xl/_rels/workbook.xml.rels',data:TE.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')},
    {name:'xl/worksheets/sheet1.xml',data:TE.encode(xlsxSheetXml(rows))},
    {name:'xl/styles.xml',data:TE.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts><font><sz val="11"/><name val="Calibri"/></font></fonts><fills><fill><patternFill patternType="none"/></fill></fills><borders><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>')},
  ];
  return zipBuild(entries);
}
async function xlsxReadRows(file){
  const zip=await zipRead(await readBuf(file));
  const shared=[];
  if(zip.has('xl/sharedStrings.xml')){
    const doc=xmlParse(TD.decode(zip.get('xl/sharedStrings.xml')));
    [...doc.querySelectorAll('si')].forEach(si=>{ shared.push([...si.querySelectorAll('t')].map(t=>t.textContent).join('')); });
  }
  const sheetKey=[...zip.keys()].find(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if(!sheetKey) throw new Error('No worksheet found in this XLSX file.');
  const doc=xmlParse(TD.decode(zip.get(sheetKey)));
  const rows=[];
  [...doc.querySelectorAll('row')].forEach(row=>{
    const cells=[];
    [...row.querySelectorAll('c')].forEach(c=>{
      const idx=colIndex(c.getAttribute('r')||'A1');
      const t=c.getAttribute('t');
      let v='';
      if(t==='s'){ const si=c.querySelector('v'); v=si?shared[parseInt(si.textContent,10)]||'':''; }
      else if(t==='inlineStr'){ const is=c.querySelector('is'); v=is?[...is.querySelectorAll('t')].map(x=>x.textContent).join(''):''; }
      else { const vv=c.querySelector('v'); v=vv?vv.textContent:''; }
      cells[idx]=v;
    });
    rows.push(cells.map(v=>v===undefined?'':v));
  });
  return rows;
}
function odsContentXml(rows){
  let xml='<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Sheet1">\n';
  rows.forEach(row=>{
    xml+='<table:table-row>';
    row.forEach(v=>{
      if(v===null||v===undefined||v==='') xml+='<table:table-cell/>';
      else if(!isNaN(Number(v))&&String(v).trim()!=='') xml+='<table:table-cell office:value-type="float" office:value="'+v+'"><text:p>'+escXml(v)+'</text:p></table:table-cell>';
      else xml+='<table:table-cell office:value-type="string"><text:p>'+escXml(v)+'</text:p></table:table-cell>';
    });
    xml+='</table:table-row>\n';
  });
  return xml+'</table:table></office:spreadsheet></office:body></office:document-content>';
}
async function odsBuild(rows){
  const entries=[
    {name:'mimetype',data:TE.encode('application/vnd.oasis.opendocument.spreadsheet'),store:true},
    {name:'content.xml',data:TE.encode(odsContentXml(rows))},
    {name:'META-INF/manifest.xml',data:TE.encode('<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.spreadsheet" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/></manifest:manifest>')},
  ];
  return zipBuild(entries);
}
async function odsReadRows(file){
  const zip=await zipRead(await readBuf(file));
  if(!zip.has('content.xml')) throw new Error('No content.xml found in this ODS file.');
  const doc=xmlParse(TD.decode(zip.get('content.xml')));
  const rows=[];
  [...doc.querySelectorAll('table-row')].forEach(row=>{
    const cells=[];
    [...row.querySelectorAll('table-cell')].forEach(c=>{
      const rep=parseInt(c.getAttribute('table:number-columns-repeated')||'1',10);
      const txt=[...c.querySelectorAll('p')].map(p=>p.textContent).join(' ');
      for(let i=0;i<rep;i++) cells.push(txt);
    });
    rows.push(cells);
  });
  return rows;
}
async function rowsToXlsxFile(file,rows,ext){ return {blob:await xlsxBuild(rows),filename:outName(file,ext)}; }
SPECIAL.xlsxToCsv=async(file)=>txtBlob(csvStringify(await xlsxReadRows(file)),outName(file,'.csv'));
SPECIAL.csvToXlsx=async(file)=>rowsToXlsxFile(file,csvParse(await readText(file)),'.xlsx');
SPECIAL.xlsxToJson=async(file)=>txtBlob(JSON.stringify(rowsToObjects(await xlsxReadRows(file)),null,2),outName(file,'.json'));
SPECIAL.jsonToXlsx=async(file)=>{ const v=parseJsonSafe(await readText(file)); const arr=Array.isArray(v)?v:[v]; return rowsToXlsxFile(file,objectsToRows(arr),'.xlsx'); };
SPECIAL.tsvToXlsx=async(file)=>rowsToXlsxFile(file,csvParse(await readText(file),'\t'),'.xlsx');
SPECIAL.xlsxToTsv=async(file)=>txtBlob(csvStringify(await xlsxReadRows(file),'\t'),outName(file,'.tsv'));
SPECIAL.odsToCsv=async(file)=>txtBlob(csvStringify(await odsReadRows(file)),outName(file,'.csv'));
SPECIAL.csvToOds=async(file)=>({blob:await odsBuild(csvParse(await readText(file))),filename:outName(file,'.ods')});
SPECIAL.odsToJson=async(file)=>txtBlob(JSON.stringify(rowsToObjects(await odsReadRows(file)),null,2),outName(file,'.json'));
SPECIAL.jsonToOds=async(file)=>{ const v=parseJsonSafe(await readText(file)); const arr=Array.isArray(v)?v:[v]; return {blob:await odsBuild(objectsToRows(arr)),filename:outName(file,'.ods')}; };

/* ---------- 38. Schema / codegen (text) ---------- */
function schemaTypeToTs(t){
  if(!t) return 'any';
  if(typeof t==='string') return t;
  if(t.type==='string') return t.format==='date-time'?'string':'string';
  if(t.type==='integer'||t.type==='number') return 'number';
  if(t.type==='boolean') return 'boolean';
  if(t.type==='array') return (t.items?schemaTypeToTs(t.items):'any')+'[]';
  if(t.type==='object'||t.properties) return 'Record<string, any>';
  if(t.enum) return t.enum.map(e=>JSON.stringify(e)).join(' | ');
  if(t.$ref) return t.$ref.split('/').pop();
  return 'any';
}
SPECIAL.schemaToTs=(t)=>{
  const s=parseJsonSafe(t);
  const defs=s.definitions||s.$defs||{};
  const out=[];
  const emit=(name,sch)=>{
    const req=new Set(sch.required||[]);
    out.push('export interface '+name+' {');
    for(const k of Object.keys(sch.properties||{})){
      out.push('  '+k+(req.has(k)?'': '?')+': '+schemaTypeToTs(sch.properties[k])+';');
    }
    out.push('}');
  };
  for(const name of Object.keys(defs)) emit(name,defs[name]);
  if(s.properties) emit(s.title||'Root',s);
  if(!out.length) throw new Error('No object schema found.');
  return out.join('\n');
};
SPECIAL.tsToSchema=(t)=>{
  const props={}; const required=[];
  const body=String(t).replace(/export\s+(interface|type)\s+\w+\s*(=\s*)?\{?/,'').replace(/\}$/,'');
  body.split('\n').forEach(line=>{
    const m=line.match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)(\?)?\s*:\s*([^;,\n]+)/);
    if(!m) return;
    const type=m[3].trim();
    let js={};
    if(type==='string') js={type:'string'};
    else if(type==='number') js={type:'number'};
    else if(type==='boolean') js={type:'boolean'};
    else if(type.endsWith('[]')) js={type:'array',items:{type:type.slice(0,-2)==='string'?'string':type.slice(0,-2)==='number'?'number':'string'}};
    else if(type.includes('|')) js={enum:type.split('|').map(x=>x.trim().replace(/['"]/g,''))};
    else js={type:'object'};
    props[m[1]]=js;
    if(!m[2]) required.push(m[1]);
  });
  return JSON.stringify({type:'object',properties:props,required},null,2);
};
SPECIAL.schemaToPyDataclass=(t)=>{
  const s=parseJsonSafe(t);
  const name=(s.title||'Record').replace(/[^A-Za-z0-9_]/g,'')||'Record';
  const map={string:'str',integer:'int',number:'float',boolean:'bool',array:'list',object:'dict'};
  const lines=['from dataclasses import dataclass','', '@dataclass','class '+name+':'];
  const props=s.properties||{};
  if(!Object.keys(props).length) lines.push('    pass');
  for(const k of Object.keys(props)){
    const p=props[k];
    let py=map[p.type]||'str';
    if(p.type==='array') py='list['+(map[(p.items||{}).type]||'str')+']';
    if(p.type==='object') py='dict';
    lines.push('    '+k+': '+py+(p.description?'  # '+p.description:''));
  }
  return lines.join('\n');
};
function inferType(vals){
  const present=vals.filter(v=>v!==null&&v!==undefined&&v!=='');
  if(!present.length) return {type:'string'};
  if(present.every(v=>typeof v==='number'&&Number.isInteger(v))) return {type:'integer'};
  if(present.every(v=>typeof v==='number')) return {type:'number'};
  if(present.every(v=>typeof v==='boolean')) return {type:'boolean'};
  if(present.every(v=>typeof v==='string')) return {type:'string'};
  return {type:'string'};
}
SPECIAL.recordsToSchema=(t)=>{
  const v=parseJsonSafe(t); const arr=Array.isArray(v)?v:[v];
  const props={}; const keys=new Set();
  arr.forEach(o=>{ if(o&&typeof o==='object') Object.keys(o).forEach(k=>keys.add(k)); });
  keys.forEach(k=>{ props[k]=inferType(arr.map(o=>o?o[k]:undefined)); });
  return JSON.stringify({type:'object',properties:props},null,2);
};
function exampleFromSchema(s){
  if(!s||typeof s!=='object') return null;
  if(s.example!==undefined) return s.example;
  if(s.default!==undefined) return s.default;
  if(s.enum) return s.enum[0];
  switch(s.type){
    case 'string': return s.format==='email'?'user@example.com':s.format==='date-time'?'2026-01-01T00:00:00Z':'example';
    case 'integer': return 0;
    case 'number': return 0;
    case 'boolean': return true;
    case 'array': return s.items?[exampleFromSchema(s.items)]:[];
    case 'object': { const o={}; for(const k of Object.keys(s.properties||{})) o[k]=exampleFromSchema(s.properties[k]); return o; }
    default: return null;
  }
}
SPECIAL.schemaToExample=(t)=>JSON.stringify(exampleFromSchema(parseJsonSafe(t)),null,2);
function sqlTypeGuess(vals){
  const present=vals.filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='');
  if(!present.length) return 'TEXT';
  if(present.every(v=>/^-?\d+$/.test(String(v)))) return 'INTEGER';
  if(present.every(v=>/^-?\d+(\.\d+)?$/.test(String(v)))) return 'REAL';
  if(present.every(v=>/^\d{4}-\d{2}-\d{2}/.test(String(v)))) return 'DATE';
  return 'TEXT';
}
SPECIAL.csvToCreateTable=(t)=>{
  const rows=csvParse(t); if(!rows.length) throw new Error('Empty CSV.');
  const h=rows[0];
  const cols=h.map((k,i)=>'  '+k.replace(/[^A-Za-z0-9_]/g,'_')+' '+sqlTypeGuess(rows.slice(1).map(r=>r[i])));
  return 'CREATE TABLE table_name (\n'+cols.join(',\n')+'\n);';
};
SPECIAL.createTableToSchema=(t)=>{
  const m=String(t).match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\)\s*;/i);
  if(!m) throw new Error('No CREATE TABLE statement found.');
  const props={};
  m[2].split(',').forEach(part=>{
    const cm=part.trim().match(/^["`]?(\w+)["`]?\s+([A-Za-z]+)/);
    if(!cm||/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)/i.test(cm[1])) return;
    const ty=cm[2].toUpperCase();
    props[cm[1]]={type:/INT/.test(ty)?'integer':/REAL|FLOAT|DOUBLE|DECIMAL|NUMERIC/.test(ty)?'number':/BOOL/.test(ty)?'boolean':'string'};
  });
  return JSON.stringify({type:'object',title:m[1],properties:props},null,2);
};
SPECIAL.schemaToCreateTable=(t)=>{
  const s=parseJsonSafe(t);
  const name=(s.title||'table_name').replace(/[^A-Za-z0-9_]/g,'_');
  const map={string:'TEXT',integer:'INTEGER',number:'REAL',boolean:'BOOLEAN',array:'TEXT',object:'TEXT'};
  const cols=Object.keys(s.properties||{}).map(k=>'  '+k+' '+(map[s.properties[k].type]||'TEXT'));
  if(!cols.length) throw new Error('Schema has no properties.');
  return 'CREATE TABLE '+name+' (\n'+cols.join(',\n')+'\n);';
};
SPECIAL.recordsToSqlInsert=(t)=>{
  const v=parseJsonSafe(t); const arr=Array.isArray(v)?v:[v];
  return arr.map(r=>'INSERT INTO table ('+Object.keys(r).join(', ')+') VALUES ('+Object.values(r).map(x=>typeof x==='number'?' '+x:x===null?'NULL':"'"+String(x).replace(/'/g,"''")+"'").join(', ')+');').join('\n');
};
SPECIAL.arraysToObjects=(t)=>{
  const v=parseJsonSafe(t); if(!Array.isArray(v)||!v.length||!Array.isArray(v[0])) throw new Error('Enter a JSON array of arrays.');
  const h=v[0];
  return JSON.stringify(v.slice(1).map(r=>{ const o={}; h.forEach((k,i)=>o[k]=r[i]!==undefined?r[i]:null); return o; }),null,2);
};

/* ---------- 39. Markdown / markup ---------- */
function mdInline(s){
  let out=escHtml(s);
  out=out.replace(/`([^`]+)`/g,'<code>$1</code>');
  out=out.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>');
  out=out.replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/_([^_]+)_/g,'<em>$1</em>');
  out=out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img alt="$1" src="$2">');
  out=out.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>');
  return out;
}
function mdToHtmlStr(t){
  const lines=String(t).split('\n');
  let html='',inUl=false,inOl=false,inCode=false,inTable=false,tableRows=[];
  function closeLists(){ if(inUl){ html+='</ul>\n'; inUl=false; } if(inOl){ html+='</ol>\n'; inOl=false; } }
  function flushTable(){ if(!inTable) return; html+=rowsToHtmlTable(tableRows); tableRows=[]; inTable=false; }
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(line.trim().startsWith('```')){ if(inCode){ html+='</code></pre>\n'; inCode=false; } else { closeLists(); html+='<pre><code>'; inCode=true; } continue; }
    if(inCode){ html+=escHtml(line)+'\n'; continue; }
    const hm=line.match(/^(#{1,6})\s+(.*)$/);
    if(hm){ closeLists(); flushTable(); html+='<h'+hm[1].length+'>'+mdInline(hm[2])+'</h'+hm[1].length+'>\n'; continue; }
    if(/^\s*\|.*\|\s*$/.test(line)&&line.includes('|')){
      if(/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
      if(!inTable){ closeLists(); inTable=true; tableRows=[]; }
      tableRows.push(line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));
      continue;
    }
    flushTable();
    if(/^\s*[-*+]\s+\[([ xX])\]/.test(line)){ closeLists(); html+='<p>'+mdInline(line.replace(/^\s*[-*+]\s+\[([ xX])\]\s*/,(m,c)=>c.toLowerCase()==='x'?'☑ ':'☐ '))+'</p>\n'; continue; }
    const ulm=line.match(/^\s*[-*+]\s+(.*)$/);
    if(ulm){ if(inOl){ html+='</ol>\n'; inOl=false; } if(!inUl){ html+='<ul>\n'; inUl=true; } html+='<li>'+mdInline(ulm[1])+'</li>\n'; continue; }
    const olm=line.match(/^\s*\d+[.)]\s+(.*)$/);
    if(olm){ if(inUl){ html+='</ul>\n'; inUl=false; } if(!inOl){ html+='<ol>\n'; inOl=true; } html+='<li>'+mdInline(olm[1])+'</li>\n'; continue; }
    if(line.trim()===''){ closeLists(); continue; }
    closeLists();
    if(line.trim().startsWith('>')){ html+='<blockquote>'+mdInline(line.replace(/^\s*>\s?/,''))+'</blockquote>\n'; continue; }
    if(line.trim()==='---'||line.trim()==='***'){ html+='<hr>\n'; continue; }
    html+='<p>'+mdInline(line.trim())+'</p>\n';
  }
  closeLists(); flushTable();
  if(inCode) html+='</code></pre>\n';
  return html;
}
SPECIAL.mdToHtml=(t)=>mdToHtmlStr(t);
SPECIAL.htmlToMd=(t)=>{
  const doc=new DOMParser().parseFromString(String(t),'text/html');
  const out=[];
  function walk(node){
    for(const n of node.childNodes){
      if(n.nodeType===3){ out.push(n.nodeValue); continue; }
      if(n.nodeType!==1) continue;
      const tag=n.tagName.toLowerCase();
      const inner=(()=>{ const save=out.length; const tmp=[]; const old=out.splice(0); walk(n); const res=out.join(''); out.length=0; out.push(...old); return res; })();
      if(/^h[1-6]$/.test(tag)) out.push('\n'+'#'.repeat(+tag[1])+' '+inner.trim()+'\n');
      else if(tag==='p') out.push('\n'+inner.trim()+'\n');
      else if(tag==='strong'||tag==='b') out.push('**'+inner+'**');
      else if(tag==='em'||tag==='i') out.push('*'+inner+'*');
      else if(tag==='code') out.push('`'+inner+'`');
      else if(tag==='pre') out.push('\n```\n'+n.textContent+'\n```\n');
      else if(tag==='a') out.push('['+inner+']('+n.getAttribute('href')+')');
      else if(tag==='img') out.push('!['+(n.getAttribute('alt')||'')+']('+n.getAttribute('src')+')');
      else if(tag==='br') out.push('\n');
      else if(tag==='hr') out.push('\n---\n');
      else if(tag==='ul'){ out.push('\n'); [...n.children].forEach(li=>out.push('- '+li.textContent.trim()+'\n')); }
      else if(tag==='ol'){ out.push('\n'); [...n.children].forEach((li,i)=>out.push((i+1)+'. '+li.textContent.trim()+'\n')); }
      else if(tag==='li') out.push('- '+inner+'\n');
      else if(tag==='blockquote') out.push('\n> '+inner.trim()+'\n');
      else if(tag==='table'){ out.push('\n'+rowsToMdTable(htmlTableParse(n.outerHTML))+'\n'); }
      else out.push(inner);
    }
  }
  walk(doc.body);
  return out.join('').replace(/\n{3,}/g,'\n\n').trim();
};
SPECIAL.mdToPlain=(t)=>String(t).replace(/```[\s\S]*?```/g,'').replace(/`([^`]*)`/g,'$1').replace(/!\[([^\]]*)\]\([^)]+\)/g,'$1').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/^#{1,6}\s+/gm,'').replace(/^\s*[-*+]\s+/gm,'').replace(/^\s*\d+[.)]\s+/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1').replace(/\*([^*]+)\*/g,'$1').replace(/_([^_]+)_/g,'$1').replace(/^>\s?/gm,'').replace(/^---+$/gm,'').trim();
SPECIAL.plainToMd=(t)=>String(t).split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean).join('\n\n');
SPECIAL.mdTableToHtml=(t)=>rowsToHtmlTable(mdTableParse(t));
SPECIAL.htmlTableToMd=(t)=>rowsToMdTable(htmlTableParse(t));
SPECIAL.tsvToMdTable=(t)=>rowsToMdTable(csvParse(t,'\t'));
SPECIAL.mdTableToTsv=(t)=>csvStringify(mdTableParse(t),'\t');
SPECIAL.mdToBbcode=(t)=>{
  let s=String(t);
  s=s.replace(/^#{1,6}\s+(.*)$/gm,(m,h)=>'[size='+(18-0)+' ]'+h+'[/size]');
  s=s.replace(/\*\*([^*]+)\*\*/g,'[b]$1[/b]').replace(/__([^_]+)__/g,'[b]$1[/b]');
  s=s.replace(/\*([^*]+)\*/g,'[i]$1[/i]').replace(/_([^_]+)_/g,'[i]$1[/i]');
  s=s.replace(/`([^`]+)`/g,'[code]$1[/code]');
  s=s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'[url=$2]$1[/url]');
  s=s.replace(/^\s*[-*+]\s+(.*)$/gm,'[*]$1');
  s=s.replace(/^\s*\d+[.)]\s+(.*)$/gm,'[*]$1');
  return s;
};
SPECIAL.bbcodeToMd=(t)=>String(t).replace(/\[b\]([\s\S]*?)\[\/b\]/gi,'**$1**').replace(/\[i\]([\s\S]*?)\[\/i\]/gi,'*$1*').replace(/\[u\]([\s\S]*?)\[\/u\]/gi,'$1').replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,'[$2]($1)').replace(/\[url\]([\s\S]*?)\[\/url\]/gi,'[$1]($1)').replace(/\[img\]([\s\S]*?)\[\/img\]/gi,'![]($1)').replace(/\[code\]([\s\S]*?)\[\/code\]/gi,'`$1`').replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi,'> $1').replace(/\[list\]([\s\S]*?)\[\/list\]/gi,'$1').replace(/\[\*\]([^\n]*)/g,'- $1').replace(/\[size=\d+\]([\s\S]*?)\[\/size\]/gi,'## $1');
SPECIAL.bbcodeToHtml=(t)=>String(t).replace(/\[b\]([\s\S]*?)\[\/b\]/gi,'<strong>$1</strong>').replace(/\[i\]([\s\S]*?)\[\/i\]/gi,'<em>$1</em>').replace(/\[u\]([\s\S]*?)\[\/u\]/gi,'<u>$1</u>').replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,'<a href="$1">$2</a>').replace(/\[url\]([\s\S]*?)\[\/url\]/gi,'<a href="$1">$1</a>').replace(/\[img\]([\s\S]*?)\[\/img\]/gi,'<img src="$1" alt="">').replace(/\[code\]([\s\S]*?)\[\/code\]/gi,'<code>$1</code>').replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi,'<blockquote>$1</blockquote>').replace(/\[list\]([\s\S]*?)\[\/list\]/gi,(m,b)=>'<ul>'+b.replace(/\[\*\]([^\n]*)/g,'<li>$1</li>')+'</ul>');
SPECIAL.htmlToBbcode=(t)=>{ const md=SPECIAL.htmlToMd(t); return SPECIAL.mdToBbcode(md); };
SPECIAL.textileToHtml=(t)=>{
  const lines=String(t).split('\n'); const out=[]; let inUl=false;
  for(const line of lines){
    const hm=line.match(/^h([1-6])\.\s+(.*)$/);
    if(hm){ if(inUl){ out.push('</ul>'); inUl=false; } out.push('<h'+hm[1]+'>'+hm[2]+'</h'+hm[1]+'>'); continue; }
    if(/^\*\s+/.test(line)){ if(!inUl){ out.push('<ul>'); inUl=true; } out.push('<li>'+line.replace(/^\*\s+/,'')+'</li>'); continue; }
    if(inUl){ out.push('</ul>'); inUl=false; }
    if(line.trim()==='') continue;
    out.push('<p>'+line.replace(/\*([^*]+)\*/g,'<strong>$1</strong>').replace(/_([^_]+)_/g,'<em>$1</em>').replace(/"([^"]+)":(\S+)/g,'<a href="$2">$1</a>')+'</p>');
  }
  if(inUl) out.push('</ul>');
  return out.join('\n');
};
SPECIAL.asciidocToHtml=(t)=>{
  const lines=String(t).split('\n'); const out=[]; let inUl=false;
  for(const line of lines){
    const hm=line.match(/^(=+)\s+(.*)$/);
    if(hm){ if(inUl){ out.push('</ul>'); inUl=false; } const lvl=Math.min(6,hm[1].length); out.push('<h'+lvl+'>'+hm[2]+'</h'+lvl+'>'); continue; }
    if(/^\*\s+/.test(line)){ if(!inUl){ out.push('<ul>'); inUl=true; } out.push('<li>'+line.replace(/^\*\s+/,'')+'</li>'); continue; }
    if(inUl){ out.push('</ul>'); inUl=false; }
    if(line.trim()==='') continue;
    out.push('<p>'+line.replace(/\*([^*]+)\*/g,'<strong>$1</strong>').replace(/_([^_]+)_/g,'<em>$1</em>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/(\S+)\[([^\]]+)\]/g,'<a href="$1">$2</a>')+'</p>');
  }
  if(inUl) out.push('</ul>');
  return out.join('\n');
};
SPECIAL.rstToHtml=(t)=>{
  const lines=String(t).split('\n'); const out=[]; let inUl=false;
  for(let i=0;i<lines.length;i++){
    const line=lines[i]; const next=lines[i+1]||'';
    if(next.match(/^=+$/)&&line.trim()){ out.push('<h1>'+line.trim()+'</h1>'); i++; continue; }
    if(next.match(/^-+$/)&&line.trim()){ out.push('<h2>'+line.trim()+'</h2>'); i++; continue; }
    if(next.match(/^~+$/)&&line.trim()){ out.push('<h3>'+line.trim()+'</h3>'); i++; continue; }
    if(/^\*\s+/.test(line)||/^-\s+/.test(line)){ if(!inUl){ out.push('<ul>'); inUl=true; } out.push('<li>'+line.replace(/^[-*]\s+/,'')+'</li>'); continue; }
    if(inUl){ out.push('</ul>'); inUl=false; }
    if(line.trim()==='') continue;
    out.push('<p>'+line.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/``([^`]+)``/g,'<code>$1</code>').replace(/`([^`]+)`\s*<([^>]+)>/g,'<a href="$2">$1</a>')+'</p>');
  }
  if(inUl) out.push('</ul>');
  return out.join('\n');
};
SPECIAL.orgToMd=(t)=>{
  const lines=String(t).split('\n'); const out=[];
  for(const line of lines){
    const hm=line.match(/^(\*+)\s+(.*)$/);
    if(hm){ out.push('#'.repeat(hm[1].length)+' '+hm[2].replace(/^(TODO|DONE)\s+/,'')+''); continue; }
    if(/^\s*[-+]\s+/.test(line)){ out.push(line.replace(/^\s*[-+]\s+/,'- ')); continue; }
    out.push(line.replace(/\/([^\/]+)\//g,'*$1*').replace(/\*([^*]+)\*/g,'**$1**').replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g,'[$2]($1)').replace(/\[\[([^\]]+)\]\]/g,'[$1]($1)'));
  }
  return out.join('\n');
};
SPECIAL.mdHeadingsToOutline=(t)=>{
  return String(t).split('\n').filter(l=>/^#{1,6}\s/.test(l)).map(l=>{ const m=l.match(/^(#{1,6})\s+(.*)$/); return '  '.repeat(m[1].length-1)+'- '+m[2]; }).join('\n');
};
SPECIAL.outlineToMdHeadings=(t)=>{
  return String(t).split('\n').filter(l=>l.trim()).map(l=>{ const m=l.match(/^(\s*)(?:[-*•]|\d+[.)])?\s*(.*)$/); const depth=Math.floor((m[1].length)/2)+1; return '#'.repeat(Math.min(6,depth))+' '+m[2]; }).join('\n');
};
SPECIAL.mdTasksToJson=(t)=>{
  const tasks=[];
  String(t).split('\n').forEach(l=>{ const m=l.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/); if(m) tasks.push({done:m[1].toLowerCase()==='x',task:m[2].trim()}); });
  return JSON.stringify(tasks,null,2);
};
SPECIAL.jsonTasksToMd=(t)=>{
  const v=parseJsonSafe(t); const arr=Array.isArray(v)?v:[v];
  return arr.map(x=>'- ['+(x.done||x.completed||x.checked?'x':' ')+'] '+(x.task||x.title||x.text||'')).join('\n');
};

/* ---------- 40. Documents: PDF / DOCX / RTF / EPUB ---------- */
function pdfEscape(s){ return String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g,'?'); }
function buildPdf(pages){
  // pages: array of arrays of text lines (already wrapped)
  const objs=[];
  const fontObj=3, pagesObj=2;
  const pageObjs=[];
  let nextId=4;
  const contentIds=[];
  pages.forEach((lines)=>{
    const contentId=nextId++;
    contentIds.push(contentId);
    let stream='BT /F1 11 Tf 40 800 Td 14 TL\n';
    lines.forEach(l=>{ stream+='('+pdfEscape(l)+') Tj T*\n'; });
    stream+='ET';
    objs.push({id:contentId,body:'<< /Length '+TE.encode(stream).length+' >>\nstream\n'+stream+'\nendstream'});
    pageObjs.push({id:nextId++,contentId});
  });
  const catalog='<< /Type /Catalog /Pages '+pagesObj+' 0 R >>';
  const kids=pageObjs.map(p=>p.id+' 0 R').join(' ');
  const pagesBody='<< /Type /Pages /Kids ['+kids+'] /Count '+pageObjs.length+' >>';
  const fontBody='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  const all=[{id:1,body:catalog},{id:pagesObj,body:pagesBody},{id:fontObj,body:fontBody}];
  pageObjs.forEach(p=>all.push({id:p.id,body:'<< /Type /Page /Parent '+pagesObj+' 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '+fontObj+' 0 R >> >> /Contents '+p.contentId+' 0 R >>'}));
  objs.forEach(o=>all.push(o));
  all.sort((a,b)=>a.id-b.id);
  let pdf='%PDF-1.4\n'; const offsets={};
  for(const o of all){ offsets[o.id]=TE.encode(pdf).length; pdf+=o.id+' 0 obj\n'+o.body+'\nendobj\n'; }
  const xrefPos=TE.encode(pdf).length;
  const maxId=Math.max(...all.map(o=>o.id));
  pdf+='xref\n0 '+(maxId+1)+'\n0000000000 65535 f \n';
  for(let i=1;i<=maxId;i++) pdf+=String(offsets[i]||0).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(maxId+1)+' /Root 1 0 R >>\nstartxref\n'+xrefPos+'\n%%EOF';
  return new Blob([TE.encode(pdf)],{type:'application/pdf'});
}
function wrapTextLines(text,maxChars){
  const out=[];
  String(text).split('\n').forEach(raw=>{
    const words=raw.split(/\s+/).filter(Boolean);
    if(!words.length){ out.push(''); return; }
    let cur='';
    for(const w of words){
      if(w.length>maxChars){ if(cur) out.push(cur); for(let i=0;i<w.length;i+=maxChars) out.push(w.slice(i,i+maxChars)); cur=''; continue; }
      if((cur+' '+w).trim().length>maxChars){ out.push(cur); cur=w; } else cur=(cur?cur+' ':'')+w;
    }
    if(cur) out.push(cur);
  });
  return out;
}
function textToPdfPages(text){
  const lines=wrapTextLines(text,95);
  const pages=[];
  for(let i=0;i<lines.length;i+=48) pages.push(lines.slice(i,i+48));
  if(!pages.length) pages.push(['']);
  return pages;
}
function mdToPlainForPdf(t){ return SPECIAL.mdToPlain(t); }
function htmlToPlainForPdf(t){ const doc=new DOMParser().parseFromString(String(t),'text/html'); return doc.body?doc.body.innerText||doc.body.textContent:''; }
SPECIAL.textToPdf=async(file)=>({blob:buildPdf(textToPdfPages(await readText(file))),filename:outName(file,'.pdf')});
SPECIAL.htmlToPdf=async(file)=>({blob:buildPdf(textToPdfPages(htmlToPlainForPdf(await readText(file)))),filename:outName(file,'.pdf')});
SPECIAL.mdToPdf=async(file)=>({blob:buildPdf(textToPdfPages(mdToPlainForPdf(await readText(file)))),filename:outName(file,'.pdf')});
SPECIAL.imagesToPdf=async(file)=>{
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=()=>rej(new Error('Could not load this image.')); img.src=url; });
    const canvas=document.createElement('canvas');
    const maxW=540,maxH=760;
    let w=img.naturalWidth,h=img.naturalHeight;
    const scale=Math.min(1,maxW/w,maxH/h); w=Math.round(w*scale); h=Math.round(h*scale);
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
    const dataUrl=canvas.toDataURL('image/jpeg',0.92);
    const jpegBytes=b64decBytes(dataUrl.split(',')[1]);
    const x0=Math.round((595-w)/2), y0=Math.round((842-h)/2);
    const content='q '+w+' 0 0 '+h+' '+x0+' '+y0+' cm /Im1 Do Q';
    const parts=[]; let len=0;
    const pushStr=s=>{ const b=TE.encode(s); parts.push(b); len+=b.length; };
    const pushBytes=b=>{ parts.push(b); len+=b.length; };
    pushStr('%PDF-1.4\n');
    const offsets={};
    const obj=(id,body)=>{ offsets[id]=len; pushStr(id+' 0 obj\n'+body+'\nendobj\n'); };
    obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
    obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 5 0 R >> /Font << /F1 4 0 R >> >> /Contents 6 0 R >>');
    obj(4,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    offsets[5]=len;
    pushStr('5 0 obj\n<< /Type /XObject /Subtype /Image /Width '+w+' /Height '+h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpegBytes.length+' >>\nstream\n');
    pushBytes(jpegBytes);
    pushStr('\nendstream\nendobj\n');
    obj(6,'<< /Length '+TE.encode(content).length+' >>\nstream\n'+content+'\nendstream');
    const xrefPos=len;
    let xref='xref\n0 7\n0000000000 65535 f \n';
    for(let i=1;i<=6;i++) xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    xref+='trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n'+xrefPos+'\n%%EOF';
    pushStr(xref);
    return {blob:new Blob(parts,{type:'application/pdf'}),filename:outName(file,'.pdf')};
  } finally { URL.revokeObjectURL(url); }
};
function pdfNote(tool){
  return 'This converter cannot render PDF pages in a plain browser website.\n\n'
    +'A browser has no built-in PDF rasteriser, so "PDF pages to '+(tool==='png'?'PNG':'JPEG')+'" cannot run 100% locally the way the other tools on this site do.\n\n'
    +'Free desktop tools that do it:\n'
    +'  - pdftoppm (Poppler, free):  pdftoppm -'+tool+' input.pdf page\n'
    +'  - LibreOffice (free): open the PDF, File > Export As > Image, or use soffice --convert-to '+tool+'\n'
    +'  - Ghostscript (free):  gs -sDEVICE='+tool+'16m -r150 -o page-%d.'+tool+' input.pdf\n\n'
    +'Your original file was not changed. This note is the download instead of a fake conversion.';
}
SPECIAL.pdfToPngNote=async(file)=>txtBlob(pdfNote('png'),outName(file,'-pdf-to-png-note.txt'));
SPECIAL.pdfToJpegNote=async(file)=>txtBlob(pdfNote('jpeg'),outName(file,'-pdf-to-jpeg-note.txt'));
function findBytes(buf,needle,from){
  outer: for(let i=from||0;i+needle.length<=buf.length;i++){
    for(let j=0;j<needle.length;j++) if(buf[i+j]!==needle[j]) continue outer;
    return i;
  }
  return -1;
}
async function pdfExtractStreams(file){
  const buf=await readBuf(file);
  const blocks=[];
  const S=TE.encode('stream'), E=TE.encode('endstream');
  let pos=0;
  while(true){
    const si=findBytes(buf,S,pos);
    if(si<0) break;
    let start=si+S.length;
    if(buf[start]===13&&buf[start+1]===10) start+=2;
    else if(buf[start]===10||buf[start]===13) start+=1;
    const ei=findBytes(buf,E,start);
    if(ei<0) break;
    let end=ei;
    if(buf[end-1]===10) end--;
    if(buf[end-1]===13) end--;
    let data=buf.subarray(start,end);
    try{ data=await inflateRaw(data); }catch(e){ /* not flate: keep raw */ }
    blocks.push(data);
    pos=ei+E.length;
  }
  return blocks;
}
function unescPdf(s){ return s.replace(/\\([()\\])/g,'$1').replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t').replace(/\\([0-7]{1,3})/g,(m,o)=>String.fromCharCode(parseInt(o,8))); }
function pdfTextFromBlock(bytes){
  const s=TD.decode(bytes);
  const out=[];
  const tjRe=/\(((?:\\.|[^\\()])*)\)\s*Tj/g; let m;
  while((m=tjRe.exec(s))) out.push(unescPdf(m[1]));
  const tjArrRe=/\[([^\]]*)\]\s*TJ/g;
  while((m=tjArrRe.exec(s))){
    const parts=[]; const strRe=/\(((?:\\.|[^\\()])*)\)/g; let sm;
    while((sm=strRe.exec(m[1]))) parts.push(unescPdf(sm[1]));
    out.push(parts.join(''));
  }
  return out;
}
SPECIAL.pdfToText=async(file)=>{
  const blocks=await pdfExtractStreams(file);
  const texts=blocks.flatMap(b=>pdfTextFromBlock(b));
  if(!texts.length) return txtBlob('No extractable text was found in this PDF. It may be a scanned (image-only) PDF, which needs OCR.',outName(file,'.txt'));
  return txtBlob(texts.join('\n'),outName(file,'.txt'));
};
SPECIAL.pdfToJsonBlocks=async(file)=>{
  const blocks=await pdfExtractStreams(file);
  const result=[];
  blocks.forEach((bytes,page)=>{
    const s=TD.decode(bytes);
    const texts=pdfTextFromBlock(bytes);
    let x=0,y=0;
    const tmRe=/([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+Tm/g; let m;
    const positions=[];
    while((m=tmRe.exec(s))) positions.push({x:+m[5],y:+m[6]});
    texts.forEach((t,i)=>result.push({page:page+1,text:t,x:positions[i]?positions[i].x:null,y:positions[i]?positions[i].y:null}));
  });
  if(!result.length) return txtBlob(JSON.stringify({note:'No extractable text was found in this PDF. It may be a scanned (image-only) PDF, which needs OCR.',blocks:[]},null,2),outName(file,'.json'));
  return txtBlob(JSON.stringify(result,null,2),outName(file,'.json'));
};
/* ---------- DOCX ---------- */
function docxXmlFromParas(paras){
  // paras: [{text, bold?, italic?, heading?}] or {runs:[{text,bold,italic}], heading?}
  const body=paras.map(p=>{
    const runs=(p.runs||[{text:p.text||'',bold:p.bold,italic:p.italic}]).map(r=>{
      const props=(r.bold?'<w:b/>':'')+(r.italic?'<w:i/>':'');
      return '<w:r>'+(props?'<w:rPr>'+props+'</w:rPr>':'')+'<w:t xml:space="preserve">'+escXml(r.text)+'</w:t></w:r>';
    }).join('');
    const pPr=p.heading?'<w:pPr><w:pStyle w:val="Heading'+p.heading+'"/></w:pPr>':'';
    return '<w:p>'+pPr+runs+'</w:p>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>';
}
async function docxBuild(paras){
  const entries=[
    {name:'[Content_Types].xml',data:TE.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')},
    {name:'_rels/.rels',data:TE.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')},
    {name:'word/document.xml',data:TE.encode(docxXmlFromParas(paras))},
  ];
  return zipBuild(entries);
}
async function docxReadParas(file){
  const zip=await zipRead(await readBuf(file));
  if(!zip.has('word/document.xml')) throw new Error('No word/document.xml found in this DOCX file.');
  const doc=xmlParse(TD.decode(zip.get('word/document.xml')));
  const paras=[];
  [...doc.querySelectorAll('p')].forEach(p=>{
    const style=p.querySelector('pStyle');
    const heading=style?(/Heading(\d)/.exec(style.getAttribute('w:val')||'')||[])[1]:null;
    const runs=[...p.querySelectorAll('r')].map(r=>{
      const rPr=r.querySelector('rPr');
      return {text:[...r.querySelectorAll('t')].map(t=>t.textContent).join(''),bold:!!(rPr&&rPr.querySelector('b')),italic:!!(rPr&&rPr.querySelector('i'))};
    });
    paras.push({runs,heading:heading?+heading:null,text:runs.map(r=>r.text).join('')});
  });
  return paras;
}
function htmlToParas(html){
  const doc=new DOMParser().parseFromString(String(html),'text/html');
  const paras=[];
  function runsOf(el){
    const runs=[];
    el.childNodes.forEach(n=>{
      if(n.nodeType===3){ if(n.nodeValue) runs.push({text:n.nodeValue}); }
      else if(n.nodeType===1){
        const tag=n.tagName.toLowerCase();
        if(tag==='b'||tag==='strong') runs.push({text:n.textContent,bold:true});
        else if(tag==='i'||tag==='em') runs.push({text:n.textContent,italic:true});
        else if(tag==='br') runs.push({text:'\n'});
        else runsOf(n).forEach(r=>runs.push(r));
      }
    });
    return runs;
  }
  (doc.body?[...doc.body.children]:[]).forEach(el=>{
    const tag=el.tagName.toLowerCase();
    if(/^h[1-6]$/.test(tag)) paras.push({runs:runsOf(el),heading:+tag[1]});
    else if(tag==='p'||tag==='div') paras.push({runs:runsOf(el)});
    else if(tag==='li') paras.push({runs:[{text:'• '}].concat(runsOf(el))});
    else if(tag==='ul'||tag==='ol'){ [...el.children].forEach(li=>paras.push({runs:[{text:'• '}].concat(runsOf(li))})); }
    else paras.push({runs:runsOf(el)});
  });
  if(!paras.length&&doc.body) paras.push({runs:[{text:doc.body.textContent}]});
  return paras;
}
SPECIAL.textToDocx=async(file)=>({blob:await docxBuild(String(await readText(file)).split('\n').map(l=>({text:l}))),filename:outName(file,'.docx')});
SPECIAL.docxToText=async(file)=>txtBlob((await docxReadParas(file)).map(p=>p.text).join('\n'),outName(file,'.txt'));
SPECIAL.htmlToDocx=async(file)=>({blob:await docxBuild(htmlToParas(await readText(file))),filename:outName(file,'.docx')});
SPECIAL.docxToHtml=async(file)=>{
  const paras=await docxReadParas(file);
  const html=paras.map(p=>{
    const inner=p.runs.map(r=>{ let s=escHtml(r.text); if(r.bold) s='<strong>'+s+'</strong>'; if(r.italic) s='<em>'+s+'</em>'; return s; }).join('');
    return p.heading?'<h'+p.heading+'>'+inner+'</h'+p.heading+'>':'<p>'+inner+'</p>';
  }).join('\n');
  return txtBlob(html,outName(file,'.html'));
};
function mdToParas(md){
  const paras=[];
  String(md).split('\n').forEach(line=>{
    const hm=line.match(/^(#{1,6})\s+(.*)$/);
    if(hm){ paras.push({runs:[{text:hm[2]}],heading:hm[1].length}); return; }
    if(/^\s*[-*+]\s+/.test(line)){ paras.push({runs:[{text:'• '+line.replace(/^\s*[-*+]\s+/,'')}]}); return; }
    if(line.trim()==='') return;
    const runs=[]; let rest=line;
    const re=/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g; let last=0,m;
    while((m=re.exec(rest))){ if(m.index>last) runs.push({text:rest.slice(last,m.index)}); const tok=m[0]; if(tok.startsWith('**')) runs.push({text:tok.slice(2,-2),bold:true}); else if(tok.startsWith('*')) runs.push({text:tok.slice(1,-1),italic:true}); else runs.push({text:tok.slice(1,-1)}); last=m.index+tok.length; }
    if(last<rest.length) runs.push({text:rest.slice(last)});
    paras.push({runs});
  });
  return paras;
}
SPECIAL.mdToDocx=async(file)=>({blob:await docxBuild(mdToParas(await readText(file))),filename:outName(file,'.docx')});
SPECIAL.docxToMd=async(file)=>{
  const paras=await docxReadParas(file);
  const md=paras.map(p=>{
    const inner=p.runs.map(r=>{ let s=r.text; if(r.bold) s='**'+s+'**'; if(r.italic) s='*'+s+'*'; return s; }).join('');
    return p.heading?'#'.repeat(p.heading)+' '+inner:inner;
  }).join('\n');
  return txtBlob(md,outName(file,'.md'));
};
/* ---------- RTF ---------- */
function textToRtfStr(text){
  const body=String(text).split('\n').map(l=>[...l].map(c=>{ const cp=c.codePointAt(0); return cp>127?"\\u"+cp+"?":c.replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}'); }).join('')).join('\\par\n');
  return '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fswiss Helvetica;}}\n\\f0\\fs22\n'+body+'\n}';
}
SPECIAL.textToRtf=async(file)=>txtBlob(textToRtfStr(await readText(file)),outName(file,'.rtf'));
SPECIAL.rtfToText=async(file)=>{
  let s=await readText(file);
  s=s.replace(/\\u(\d+)\?/g,(m,n)=>String.fromCodePoint(+n));
  s=s.replace(/\\'([0-9a-fA-F]{2})/g,(m,h)=>String.fromCharCode(parseInt(h,16)));
  s=s.replace(/\\par\b/g,'\n').replace(/\\line\b/g,'\n').replace(/\\tab\b/g,'\t');
  s=s.replace(/\{\\fonttbl[\s\S]*?\}\s*/,'').replace(/\{\\colortbl[\s\S]*?\}\s*/,'');
  s=s.replace(/\\[a-z]+\d*\s?/g,'').replace(/[{}]/g,'');
  return txtBlob(s.replace(/\n{3,}/g,'\n\n').trim(),outName(file,'.txt'));
};
SPECIAL.htmlToRtf=async(file)=>{
  const paras=htmlToParas(await readText(file));
  const body=paras.map(p=>{
    const inner=p.runs.map(r=>{ let s=[...r.text].map(c=>{ const cp=c.codePointAt(0); return cp>127?"\\u"+cp+"?":c.replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}'); }).join(''); if(r.bold) s='\\b '+s+'\\b0 '; if(r.italic) s='\\i '+s+'\\i0 '; return s; }).join('');
    return (p.heading?'\\fs'+(44-p.heading*4)+' ':'' )+inner+'\\par\n';
  }).join('');
  return txtBlob('{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fswiss Helvetica;}}\n\\f0\\fs22\n'+body+'}',outName(file,'.rtf'));
};
SPECIAL.rtfToHtml=async(file)=>{
  let s=await readText(file);
  const paras=[];
  s=s.replace(/\\u(\d+)\?/g,(m,n)=>String.fromCodePoint(+n));
  s=s.replace(/\\'([0-9a-fA-F]{2})/g,(m,h)=>String.fromCharCode(parseInt(h,16)));
  s.split(/\\par\b/).forEach(chunk=>{
    let bold=false,italic=false,out='';
    const tokens=chunk.split(/(\\[a-z]+\d*\s?|[{}])/g);
    tokens.forEach(tok=>{
      if(tok==='\\b '||tok==='\\b'){ if(!bold){ out+='<strong>'; bold=true; } }
      else if(tok==='\\b0 '||tok==='\\b0'){ if(bold){ out+='</strong>'; bold=false; } }
      else if(tok==='\\i '||tok==='\\i'){ if(!italic){ out+='<em>'; italic=true; } }
      else if(tok==='\\i0 '||tok==='\\i0'){ if(italic){ out+='</em>'; italic=false; } }
      else if(/^\\[a-z]/.test(tok)||tok==='{'||tok==='}'){}
      else out+=escHtml(tok);
    });
    if(bold) out+='</strong>'; if(italic) out+='</em>';
    if(out.trim()) paras.push('<p>'+out+'</p>');
  });
  return txtBlob(paras.join('\n'),outName(file,'.html'));
};
/* ---------- EPUB ---------- */
SPECIAL.textToEpub=async(file)=>{
  const text=await readText(file);
  const title=(file.name||'Document').replace(/\.[^.]*$/,'')||'Document';
  const paras=String(text).split(/\n\s*\n/).map(p=>'<p>'+escHtml(p.trim().replace(/\n/g,' '))+'</p>').join('\n');
  const xhtml='<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+escXml(title)+'</title></head><body><h1>'+escXml(title)+'</h1>\n'+paras+'\n</body></html>';
  const opf='<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>'+escXml(title)+'</dc:title><dc:language>en</dc:language><dc:identifier id="bookid">urn:uuid:textconvert-'+Date.now()+'</dc:identifier></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="chap" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="chap"/></spine></package>';
  const ncx='<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:textconvert-'+Date.now()+'"/></head><docTitle><text>'+escXml(title)+'</text></docTitle><navMap><navPoint id="n1" playOrder="1"><navLabel><text>'+escXml(title)+'</text></navLabel><content src="chapter.xhtml"/></navPoint></navMap></ncx>';
  const container='<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
  const blob=await zipBuild([
    {name:'mimetype',data:TE.encode('application/epub+zip'),store:true},
    {name:'META-INF/container.xml',data:TE.encode(container)},
    {name:'OEBPS/content.opf',data:TE.encode(opf)},
    {name:'OEBPS/toc.ncx',data:TE.encode(ncx)},
    {name:'OEBPS/chapter.xhtml',data:TE.encode(xhtml)},
  ]);
  return {blob,filename:outName(file,'.epub')};
};
SPECIAL.epubToText=async(file)=>{
  const zip=await zipRead(await readBuf(file));
  const xhtmlKeys=[...zip.keys()].filter(k=>/\.(xhtml|html|htm)$/i.test(k)).sort();
  if(!xhtmlKeys.length) throw new Error('No XHTML chapters found in this EPUB file.');
  const texts=xhtmlKeys.map(k=>{
    const doc=new DOMParser().parseFromString(TD.decode(zip.get(k)),'text/html');
    return doc.body?doc.body.innerText||doc.body.textContent:'';
  });
  return txtBlob(texts.join('\n\n').replace(/\n{3,}/g,'\n\n').trim(),outName(file,'.txt'));
};

/* Site 5 (MediaConvert) special functions. Injected into SPECIAL by build_sites.py. */
async function _buf(f){ return new Uint8Array(await f.arrayBuffer()); }
function _base(name){ return (name||'file').replace(/\.[^.]*$/,'') || 'file'; }
function _out(blob, file, ext, note){ return {blob, filename: _base(file.name)+'.'+ext, note: note||undefined}; }
function _txtOut(text, file, ext, note){ return _out(new Blob([text],{type:'text/plain;charset=utf-8'}), file, ext, note); }
function _noteFile(file, title, body){
  const t = title + '\n' + '='.repeat(Math.min(title.length, 60)) + '\n\n' + body + '\n';
  return {blob: new Blob([t],{type:'text/plain;charset=utf-8'}), filename: _base(file.name)+'-NOTE.txt',
    note: 'This conversion cannot run in a web browser, so a note file was downloaded instead.'};
}
function _mkNote(title, body){ return async (file)=> _noteFile(file, title, body); }
const _NOTE_VIDEO = 'A web browser has no video codec encoder/decoder for this conversion.\n\nUse the free desktop tool HandBrake (https://handbrake.fr) or FFmpeg\n(https://ffmpeg.org) instead:\n  FFmpeg example:  ffmpeg -i input.mp4 output.webm\n\nThis site converts files 100% in your browser, so it can only do what\nbrowser APIs provide. Video transcoding needs a real codec, which browsers\ndo not expose.';
const _NOTE_AUDIO_ENC = 'A web browser has no encoder for this audio format.\n\nUse the free desktop tool Audacity (https://www.audacityteam.org)\n(File > Export Audio) or FFmpeg (https://ffmpeg.org):\n  FFmpeg example:  ffmpeg -i input.wav output.mp3\n\nDecoding into WAV works here because browsers can decode these formats;\nencoding them back out is not something browsers provide.';
const _NOTE_TIFF = 'TIFF is not decodable or encodable by web browsers (canvas and\ncreateImageBitmap do not support it).\n\nUse the free desktop tool GIMP (https://www.gimp.org) or ImageMagick\n(https://imagemagick.org):\n  ImageMagick example:  magick input.png output.tiff\n  ImageMagick example:  magick input.tiff output.png';
const _NOTE_ICO = 'ICO is not decodable or encodable by web browsers (canvas and\ncreateImageBitmap do not support it).\n\nUse the free desktop tool GIMP (https://www.gimp.org) or ImageMagick\n(https://imagemagick.org):\n  ImageMagick example:  magick input.png -define icon:auto-resize=256,128,64,48,32,16 output.ico';
const _NOTE_BROTLI = 'Brotli compression is not built into web browsers as a JavaScript API.\n\nUse the free desktop tool 7-Zip (https://www.7-zip.org) or the command-line\nbrotli tool (https://github.com/google/brotli):\n  brotli input.txt   (creates input.txt.br)\n  brotli -d input.txt.br';
const _NOTE_ZSTD = 'Zstandard compression is not built into web browsers as a JavaScript API.\n\nUse the free desktop tool 7-Zip (https://www.7-zip.org) or the command-line\nzstd tool (https://github.com/facebook/zstd):\n  zstd input.txt   (creates input.txt.zst)\n  zstd -d input.txt.zst';
const _NOTE_BZIP2 = 'BZIP2 compression is not built into web browsers as a JavaScript API\n(only gzip/deflate are available).\n\nUse the free desktop tool 7-Zip (https://www.7-zip.org) or the command-line\nbzip2 tool:\n  bzip2 input.txt   (creates input.txt.bz2)\n  bunzip2 input.txt.bz2';
const _NOTE_TARBZ2 = 'BZIP2 is not available in web browsers, so TAR.BZ2 archives cannot be\ncreated or extracted here.\n\nUse the free desktop tool 7-Zip (https://www.7-zip.org) or tar:\n  tar -cjf archive.tar.bz2 files...\n  tar -xjf archive.tar.bz2';
const _NOTE_TARXZ = 'XZ compression is not available in web browsers, so TAR.XZ archives cannot\nbe created or extracted here.\n\nUse the free desktop tool 7-Zip (https://www.7-zip.org) or tar:\n  tar -cJf archive.tar.xz files...\n  tar -xJf archive.tar.xz';

/* ---------- CRC32 / Adler32 ---------- */
const _CRC_T = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
function _crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=_CRC_T[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function _adler32(u8){ let a=1,b=0; for(let i=0;i<u8.length;i++){ a=(a+u8[i])%65521; b=(b+a)%65521; } return ((b<<16)|a)>>>0; }

/* ---------- image load / canvas ---------- */
async function _bitmap(file){
  try { return await createImageBitmap(file); }
  catch(e){
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((res, rej)=>{ img.onload=res; img.onerror=()=>rej(new Error('Could not decode this image file.')); img.src=url; });
      return img;
    } finally { URL.revokeObjectURL(url); }
  }
}
async function _canvasFromFile(file, maxDim){
  const bmp = await _bitmap(file);
  let w = bmp.width, h = bmp.height;
  if(!w || !h) throw new Error('Could not decode this image file.');
  if(maxDim && Math.max(w,h) > maxDim){ const s = maxDim/Math.max(w,h); w=Math.max(1,Math.round(w*s)); h=Math.max(1,Math.round(h*s)); }
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if(bmp.close) bmp.close();
  return c;
}
function _canvasBlob(c, type, q){ return new Promise((res,rej)=> c.toBlob(b=> b?res(b):rej(new Error('Encoding failed in this browser.')), type, q)); }
async function _reencode(file, mime, ext, q){
  let c = await _canvasFromFile(file);
  if(mime === 'image/jpeg'){ // flatten transparency on white
    const c2 = document.createElement('canvas'); c2.width=c.width; c2.height=c.height;
    const x = c2.getContext('2d'); x.fillStyle='#ffffff'; x.fillRect(0,0,c2.width,c2.height); x.drawImage(c,0,0); c = c2;
  }
  return _out(await _canvasBlob(c, mime, q), file, ext);
}
SPECIAL.pngToJpeg = (f)=> _reencode(f,'image/jpeg','jpg',0.92);
SPECIAL.jpegToPng = (f)=> _reencode(f,'image/png','png');
SPECIAL.pngToWebp = (f)=> _reencode(f,'image/webp','webp',0.92);
SPECIAL.webpToPng = (f)=> _reencode(f,'image/png','png');
SPECIAL.jpegToWebp = (f)=> _reencode(f,'image/webp','webp',0.92);
SPECIAL.webpToJpeg = (f)=> _reencode(f,'image/jpeg','jpg',0.92);
SPECIAL.bmpToPng = (f)=> _reencode(f,'image/png','png');
SPECIAL.bmpToJpeg = (f)=> _reencode(f,'image/jpeg','jpg',0.92);
SPECIAL.gifToPng = (f)=> _reencode(f,'image/png','png');
SPECIAL.indexedToRgba = (f)=> _reencode(f,'image/png','png');
function _bmpEncode(c){
  const w=c.width, h=c.height, d=c.getContext('2d').getImageData(0,0,w,h).data;
  const row = Math.floor((24*w+31)/32)*4, px = new Uint8Array(row*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const si=(y*w+x)*4, di=(h-1-y)*row+x*3; px[di]=d[si+2]; px[di+1]=d[si+1]; px[di+2]=d[si]; }
  const hdr = new DataView(new ArrayBuffer(54));
  const ws = (o,s)=>{ for(let i=0;i<s.length;i++) hdr.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,'BM'); hdr.setUint32(2, 54+px.length, true); hdr.setUint32(10, 54, true);
  hdr.setUint32(14, 40, true); hdr.setInt32(18, w, true); hdr.setInt32(22, h, true);
  hdr.setUint16(26, 1, true); hdr.setUint16(28, 24, true); hdr.setUint32(34, px.length, true);
  return new Blob([hdr.buffer, px], {type:'image/bmp'});
}
SPECIAL.pngToBmp = async (f)=> _out(_bmpEncode(await _canvasFromFile(f)), f, 'bmp');
SPECIAL.jpegToBmp = async (f)=> _out(_bmpEncode(await _canvasFromFile(f)), f, 'bmp');
SPECIAL.notePngTiff = _mkNote('PNG to TIFF — not possible in a browser', _NOTE_TIFF);
SPECIAL.noteTiffPng = _mkNote('TIFF to PNG — not possible in a browser', _NOTE_TIFF);
SPECIAL.noteJpegTiff = _mkNote('JPEG to TIFF — not possible in a browser', _NOTE_TIFF);
SPECIAL.noteTiffJpeg = _mkNote('TIFF to JPEG — not possible in a browser', _NOTE_TIFF);
SPECIAL.notePngIco = _mkNote('PNG to ICO — not possible in a browser', _NOTE_ICO);
SPECIAL.noteIcoPng = _mkNote('ICO to PNG — not possible in a browser', _NOTE_ICO);

/* ---------- PPM ---------- */
function _parsePpm(buf){
  let p = 0;
  const tok = ()=>{ while(p < buf.length){ const c = buf[p]; if(c===35){ while(p < buf.length && buf[p]!==10) p++; } else if(c===32||c===9||c===10||c===13){ p++; } else break; } let s=''; while(p < buf.length && buf[p]>32 && buf[p]!==35){ s += String.fromCharCode(buf[p++]); } return s; };
  const magic = tok(); if(magic!=='P6' && magic!=='P3') throw new Error('Not a PPM file (expected P3 or P6).');
  const w = parseInt(tok(),10), h = parseInt(tok(),10), max = parseInt(tok(),10);
  if(!w || !h || !max) throw new Error('Invalid PPM header.');
  if(magic==='P6'){ p++; const n = w*h*3, data = new Uint8Array(n); const scale = 255/max;
    for(let i=0;i<n;i++) data[i] = Math.min(255, Math.round(buf[p+i]*scale));
    return {w, h, data}; }
  const nums = []; let t; while((t = tok()) !== '') nums.push(parseInt(t,10));
  const data = new Uint8Array(w*h*3); const scale = 255/max;
  for(let i=0;i<w*h*3 && i<nums.length;i++) data[i] = Math.min(255, Math.round(nums[i]*scale));
  return {w, h, data};
}
SPECIAL.ppmToPng = async (f)=>{
  const {w, h, data} = _parsePpm(await _buf(f));
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const img = c.getContext('2d').createImageData(w,h);
  for(let i=0;i<w*h;i++){ img.data[i*4]=data[i*3]; img.data[i*4+1]=data[i*3+1]; img.data[i*4+2]=data[i*3+2]; img.data[i*4+3]=255; }
  c.getContext('2d').putImageData(img,0,0);
  return _out(await _canvasBlob(c,'image/png'), f, 'png');
};
SPECIAL.pngToPpm = async (f)=>{
  const c = await _canvasFromFile(f), d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  const out = new Uint8Array(c.width*c.height*3);
  for(let i=0;i<c.width*c.height;i++){ out[i*3]=d[i*4]; out[i*3+1]=d[i*4+1]; out[i*3+2]=d[i*4+2]; }
  const head = new TextEncoder().encode('P6\n'+c.width+' '+c.height+'\n255\n');
  const all = new Uint8Array(head.length+out.length); all.set(head); all.set(out, head.length);
  return _out(new Blob([all],{type:'image/x-portable-pixmap'}), f, 'ppm');
};

/* ---------- median-cut quantization + GIF LZW encoder ---------- */
function _medianCut(rgba, maxColors){
  const px = [];
  for(let i=0;i<rgba.length;i+=4) px.push([rgba[i],rgba[i+1],rgba[i+2]]);
  if(!px.length) return {palette:[[0,0,0]], indices:new Uint8Array(0)};
  let boxes = [px];
  while(boxes.length < maxColors){
    let bi=-1, br=-1;
    boxes.forEach((b,i)=>{ if(b.length<2) return; let mn=[255,255,255], mx=[0,0,0]; b.forEach(p=>{ for(let k=0;k<3;k++){ mn[k]=Math.min(mn[k],p[k]); mx[k]=Math.max(mx[k],p[k]); } }); const r=Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]); if(r>br){ br=r; bi=i; } });
    if(bi<0) break;
    const b = boxes[bi]; let mn=[255,255,255], mx=[0,0,0]; b.forEach(p=>{ for(let k=0;k<3;k++){ mn[k]=Math.min(mn[k],p[k]); mx[k]=Math.max(mx[k],p[k]); } });
    const ch = (mx[0]-mn[0]>=(mx[1]-mn[1]) && mx[0]-mn[0]>=(mx[2]-mn[2])) ? 0 : (mx[1]-mn[1]>=(mx[2]-mn[2]) ? 1 : 2);
    b.sort((a,b2)=>a[ch]-b2[ch]); const mid = Math.floor(b.length/2);
    boxes.splice(bi,1,b.slice(0,mid),b.slice(mid));
  }
  const palette = boxes.map(b=>{ let r=0,g=0,bl=0; b.forEach(p=>{ r+=p[0]; g+=p[1]; bl+=p[2]; }); const n=b.length||1; return [Math.round(r/n),Math.round(g/n),Math.round(bl/n)]; });
  const indices = new Uint8Array(px.length);
  px.forEach((p,i)=>{ let best=0, bd=1e9; palette.forEach((q,j)=>{ const d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2; if(d<bd){ bd=d; best=j; } }); indices[i]=best; });
  return {palette, indices};
}
function _lzwEncode(indices, minCodeSize){
  const clear = 1<<minCodeSize, eoi = clear+1;
  let out = [], cur=0, bits=0;
  const emit = (code, size)=>{ cur |= code<<bits; bits+=size; while(bits>=8){ out.push(cur&255); cur>>=8; bits-=8; } };
  let codeSize = minCodeSize+1, dict = new Map(), next = eoi+1;
  emit(clear, codeSize);
  let prefix = indices[0];
  for(let i=1;i<indices.length;i++){
    const k = indices[i], key = prefix*256+k;
    if(dict.has(key)){ prefix = dict.get(key); }
    else {
      emit(prefix, codeSize);
      dict.set(key, next++);
      if(next === (1<<codeSize) && codeSize < 12) codeSize++;
      else if(next > 4095){ emit(clear, codeSize); dict = new Map(); next = eoi+1; codeSize = minCodeSize+1; }
      prefix = k;
    }
  }
  emit(prefix, codeSize); emit(eoi, codeSize);
  if(bits>0) out.push(cur&255);
  return new Uint8Array(out);
}
function _gifEncode(frames, delays, loop=true){
  // frames: [{w,h,rgba}], delays in hundredths of a second. Global palette from frame 0.
  const w = frames[0].w, h = frames[0].h;
  const {palette} = _medianCut(frames[0].rgba, 256);
  const palSize = Math.max(2, Math.pow(2, Math.ceil(Math.log2(palette.length))));
  const gct = new Uint8Array(palSize*3);
  palette.forEach((p,i)=>{ gct[i*3]=p[0]; gct[i*3+1]=p[1]; gct[i*3+2]=p[2]; });
  const bytes = [];
  const push = (...b)=>{ bytes.push(...b); };
  const pushStr = (s)=>{ for(let i=0;i<s.length;i++) bytes.push(s.charCodeAt(i)); };
  const push16 = (v)=>{ bytes.push(v&255, (v>>8)&255); };
  pushStr('GIF89a'); push16(w); push16(h);
  bytes.push(0xF0 | (Math.log2(palSize)-1)); bytes.push(0); bytes.push(0);
  bytes.push(...gct);
  if(loop){ push(0x21,0xFF,11); pushStr('NETSCAPE2.0'); push(3,1); push16(0); push(0); }
  frames.forEach((fr, fi)=>{
    const {indices} = _medianCut(fr.rgba, 256); // per-frame indices vs global palette? recompute nearest to global palette:
    const idx = new Uint8Array(fr.rgba.length/4);
    for(let i=0;i<idx.length;i++){ const r=fr.rgba[i*4], g=fr.rgba[i*4+1], b=fr.rgba[i*4+2]; let best=0, bd=1e9; palette.forEach((q,j)=>{ const d=(r-q[0])**2+(g-q[1])**2+(b-q[2])**2; if(d<bd){ bd=d; best=j; } }); idx[i]=best; }
    void indices;
    push(0x21,0xF9,4, 0x04); push16(delays[fi]||10); push(0,0);
    push(0x2C); push16(0); push16(0); push16(w); push16(h); push(0);
    const minCode = Math.max(2, Math.ceil(Math.log2(Math.max(2, palette.length))));
    const lzw = _lzwEncode(idx, minCode);
    push(minCode);
    for(let o=0;o<lzw.length;o+=255){ const n=Math.min(255, lzw.length-o); push(n); for(let j=0;j<n;j++) push(lzw[o+j]); }
    push(0);
  });
  push(0x3B);
  return new Uint8Array(bytes);
}
SPECIAL.pngToGif = async (f)=>{
  const c = await _canvasFromFile(f);
  const rgba = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  const gif = _gifEncode([{w:c.width, h:c.height, rgba}], [10]);
  return _out(new Blob([gif],{type:'image/gif'}), f, 'gif');
};

/* ---------- manual PNG encoder (indexed + APNG) ---------- */
function _pngChunk(type, data){
  const out = new Uint8Array(12+data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for(let i=0;i<4;i++) out[4+i]=type.charCodeAt(i);
  out.set(data, 8); dv.setUint32(8+data.length, _crc32(out.subarray(4, 8+data.length)));
  return out;
}
async function _zlibDeflate(u8){
  const cs = new CompressionStream('deflate');
  const s = new Blob([u8]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function _pngIdat(w, h, rgba){
  const raw = new Uint8Array(h*(1+w*4));
  for(let y=0;y<h;y++){ raw[y*(1+w*4)]=0; raw.set(rgba.subarray(y*w*4,(y+1)*w*4), y*(1+w*4)+1); }
  return _zlibDeflate(raw);
}
async function _pngEncode(w, h, rgba, palette){
  const ihdr = new DataView(new ArrayBuffer(13));
  ihdr.setUint32(0,w); ihdr.setUint32(4,h); ihdr.setUint8(8,8);
  if(palette){ ihdr.setUint8(9,3); }
  else ihdr.setUint8(9,6);
  const sig = new Uint8Array([137,80,78,71,13,10,26,10]);
  const parts = [sig, _pngChunk('IHDR', new Uint8Array(ihdr.buffer))];
  let idat;
  if(palette){
    const plte = new Uint8Array(palette.length*3);
    palette.forEach((p,i)=>{ plte[i*3]=p[0]; plte[i*3+1]=p[1]; plte[i*3+2]=p[2]; });
    parts.push(_pngChunk('PLTE', plte));
    const idx = new Uint8Array(w*h);
    for(let i=0;i<w*h;i++){ const r=rgba[i*4], g=rgba[i*4+1], b=rgba[i*4+2]; let best=0, bd=1e9; palette.forEach((q,j)=>{ const d=(r-q[0])**2+(g-q[1])**2+(b-q[2])**2; if(d<bd){ bd=d; best=j; } }); idx[i]=best; }
    const raw = new Uint8Array(h*(1+w));
    for(let y=0;y<h;y++){ raw[y*(1+w)]=0; raw.set(idx.subarray(y*w,(y+1)*w), y*(1+w)+1); }
    idat = await _zlibDeflate(raw);
  } else {
    idat = await _pngIdat(w,h,rgba);
  }
  parts.push(_pngChunk('IDAT', idat));
  parts.push(_pngChunk('IEND', new Uint8Array(0)));
  const total = parts.reduce((a,p)=>a+p.length,0), all = new Uint8Array(total);
  let o=0; parts.forEach(p=>{ all.set(p,o); o+=p.length; });
  return all;
}

/* ---------- cat 42: pixels ---------- */
function _imgData(c){ return c.getContext('2d').getImageData(0,0,c.width,c.height); }
SPECIAL.imgToGray = async (f)=>{
  const c = await _canvasFromFile(f), ctx = c.getContext('2d'), img = _imgData(c), d = img.data;
  for(let i=0;i<d.length;i+=4){ const g = Math.round(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]); d[i]=d[i+1]=d[i+2]=g; }
  ctx.putImageData(img,0,0);
  return _out(await _canvasBlob(c,'image/png'), f, 'png');
};
SPECIAL.imgToThreshold = async (f, ex)=>{
  const t = ex.threshold ?? 128;
  const c = await _canvasFromFile(f), ctx = c.getContext('2d'), img = _imgData(c), d = img.data;
  for(let i=0;i<d.length;i+=4){ const g = 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; const v = g>=t?255:0; d[i]=d[i+1]=d[i+2]=v; }
  ctx.putImageData(img,0,0);
  return _out(await _canvasBlob(c,'image/png'), f, 'png');
};
SPECIAL.rgbaToRgb = async (f, ex)=>{
  const br = ex.r??255, bg = ex.g??255, bb = ex.b??255;
  const c = await _canvasFromFile(f), ctx = c.getContext('2d'), img = _imgData(c), d = img.data;
  for(let i=0;i<d.length;i+=4){ const a = d[i+3]/255; d[i]=Math.round(d[i]*a+br*(1-a)); d[i+1]=Math.round(d[i+1]*a+bg*(1-a)); d[i+2]=Math.round(d[i+2]*a+bb*(1-a)); d[i+3]=255; }
  ctx.putImageData(img,0,0);
  return _out(await _canvasBlob(c,'image/jpeg','jpg',0.92), f, 'jpg');
};
SPECIAL.rgbaToIndexed = async (f, ex)=>{
  const n = Math.max(2, Math.min(256, Math.round(ex.colors ?? 256)));
  const c = await _canvasFromFile(f), rgba = _imgData(c).data;
  const {palette} = _medianCut(rgba, n);
  const png = await _pngEncode(c.width, c.height, rgba, palette);
  return _out(new Blob([png],{type:'image/png'}), f, 'png', 'Indexed-colour PNG written with a '+palette.length+'-colour palette.');
};
SPECIAL.imgToRawRgba = async (f)=>{
  const c = await _canvasFromFile(f);
  return _out(new Blob([_imgData(c).data.buffer],{type:'application/octet-stream'}), f, 'rgba');
};
SPECIAL.imgToRawRgb = async (f)=>{
  const c = await _canvasFromFile(f), d = _imgData(c).data, out = new Uint8Array(c.width*c.height*3);
  for(let i=0;i<c.width*c.height;i++){ out[i*3]=d[i*4]; out[i*3+1]=d[i*4+1]; out[i*3+2]=d[i*4+2]; }
  return _out(new Blob([out],{type:'application/octet-stream'}), f, 'rgb');
};
SPECIAL.rawRgbaToPng = async (f, ex)=>{
  const w = Math.round(ex.width||16), h = Math.round(ex.height||16), buf = await _buf(f);
  if(buf.length < w*h*4) throw new Error('File is too small for '+w+'x'+h+' RGBA pixels ('+(w*h*4)+' bytes needed, got '+buf.length+').');
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const img = c.getContext('2d').createImageData(w,h); img.data.set(buf.subarray(0,w*h*4));
  c.getContext('2d').putImageData(img,0,0);
  return _out(await _canvasBlob(c,'image/png'), f, 'png');
};
SPECIAL.rawRgbToPng = async (f, ex)=>{
  const w = Math.round(ex.width||16), h = Math.round(ex.height||16), buf = await _buf(f);
  if(buf.length < w*h*3) throw new Error('File is too small for '+w+'x'+h+' RGB pixels ('+(w*h*3)+' bytes needed, got '+buf.length+').');
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const img = c.getContext('2d').createImageData(w,h);
  for(let i=0;i<w*h;i++){ img.data[i*4]=buf[i*3]; img.data[i*4+1]=buf[i*3+1]; img.data[i*4+2]=buf[i*3+2]; img.data[i*4+3]=255; }
  c.getContext('2d').putImageData(img,0,0);
  return _out(await _canvasBlob(c,'image/png'), f, 'png');
};
SPECIAL.imgToJsonMatrix = async (f)=>{
  const c = await _canvasFromFile(f), d = _imgData(c).data, rows = [];
  for(let y=0;y<c.height;y++){ const row=[]; for(let x=0;x<c.width;x++){ const i=(y*c.width+x)*4; row.push([d[i],d[i+1],d[i+2],d[i+3]]); } rows.push(row); }
  return _txtOut(JSON.stringify(rows), f, 'json');
};
SPECIAL.jsonMatrixToPng = async (f)=>{
  const rows = JSON.parse(await f.text());
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const img = c.getContext('2d').createImageData(w,h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const p=rows[y][x], i=(y*w+x)*4; img.data[i]=p[0]; img.data[i+1]=p[1]; img.data[i+2]=p[2]; img.data[i+3]= p.length>3?p[3]:255; }
  c.getContext('2d').putImageData(img,0,0);
  return _out(await _canvasBlob(c,'image/png'), f, 'png');
};
SPECIAL.imgToCsv = async (f)=>{
  const c = await _canvasFromFile(f), d = _imgData(c).data, lines = ['x,y,r,g,b,a'];
  for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++){ const i=(y*c.width+x)*4; lines.push(x+','+y+','+d[i]+','+d[i+1]+','+d[i+2]+','+d[i+3]); }
  return _txtOut(lines.join('\n'), f, 'csv');
};
SPECIAL.csvToPng = async (f, ex)=>{
  const w = Math.round(ex.width||16), h = Math.round(ex.height||16);
  const text = await f.text();
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const img = c.getContext('2d').createImageData(w,h);
  for(let i=0;i<w*h;i++){ img.data[i*4+3]=255; }
  text.split(/\r?\n/).forEach(line=>{
    const p = line.split(',').map(s=>s.trim()); if(p.length<6 || isNaN(+p[0])) return;
    const x=+p[0], y=+p[1]; if(x<0||y<0||x>=w||y>=h) return;
    const i=(y*w+x)*4; img.data[i]=+p[2]; img.data[i+1]=+p[3]; img.data[i+2]=+p[4]; img.data[i+3]=+p[5];
  });
  c.getContext('2d').putImageData(img,0,0);
  return _out(await _canvasBlob(c,'image/png'), f, 'png');
};
SPECIAL.imgToDataUrl = async (f)=>{
  const data = await _buf(f);
  let bin=''; const CH=0x8000;
  for(let i=0;i<data.length;i+=CH) bin += String.fromCharCode.apply(null, data.subarray(i,i+CH));
  const url = 'data:'+(f.type||'image/png')+';base64,'+btoa(bin);
  return _txtOut(url, f, 'txt');
};
SPECIAL.dataUrlToImg = async (f)=>{
  const text = (await f.text()).trim();
  const m = text.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if(!m) throw new Error('Not a data URL (expected data:<type>;base64,...).');
  const mime = m[1]||'image/png';
  const ext = (mime.split('/')[1]||'png').split('+')[0];
  let bytes;
  if(m[2]){ const bin = atob(m[3].replace(/\s/g,'')); bytes = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); }
  else bytes = new TextEncoder().encode(decodeURIComponent(m[3]));
  return _out(new Blob([bytes],{type:mime}), f, ext);
};
const _ASCII_RAMP = ' .:-=+*#%@';
SPECIAL.imgToAscii = async (f, ex)=>{
  const tw = Math.max(4, Math.round(ex.width||80));
  const c = await _canvasFromFile(f, tw*2);
  const w = tw, h = Math.max(1, Math.round(c.height * (tw/c.width) * 0.5));
  const c2 = document.createElement('canvas'); c2.width=w; c2.height=h;
  c2.getContext('2d').drawImage(c,0,0,w,h);
  const d = _imgData(c2).data, lines=[];
  for(let y=0;y<h;y++){ let s=''; for(let x=0;x<w;x++){ const i=(y*w+x)*4; const g=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; s += _ASCII_RAMP[Math.min(_ASCII_RAMP.length-1, Math.floor(g/256*_ASCII_RAMP.length))]; } lines.push(s); }
  return _txtOut(lines.join('\n'), f, 'txt');
};
SPECIAL.asciiToPng = async (f, ex)=>{
  const fs = Math.max(4, Math.round(ex.fontSize||16));
  const lines = (await f.text()).split(/\r?\n/);
  const w = Math.max(...lines.map(l=>l.length), 1);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d'); ctx.font = fs+'px monospace';
  const cw = ctx.measureText('M').width;
  c.width = Math.ceil(w*cw)+8; c.height = Math.ceil(lines.length*fs*1.2)+8;
  const x2 = c.getContext('2d');
  x2.fillStyle='#ffffff'; x2.fillRect(0,0,c.width,c.height);
  x2.fillStyle='#000000'; x2.font = fs+'px monospace'; x2.textBaseline='top';
  lines.forEach((l,i)=> x2.fillText(l, 4, 4+i*fs*1.2));
  return _out(await _canvasBlob(c,'image/png'), f, 'png');
};
SPECIAL.heightmapToMatrix = async (f, ex)=>{
  const scale = ex.scale ?? 1;
  const c = await _canvasFromFile(f), d = _imgData(c).data, lines=[];
  for(let y=0;y<c.height;y++){ const row=[]; for(let x=0;x<c.width;x++){ const i=(y*c.width+x)*4; row.push((0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])*scale); } lines.push(row.map(v=>+v.toFixed(3)).join(',')); }
  return _txtOut(lines.join('\n'), f, 'csv');
};
SPECIAL.matrixToHeightmap = async (f, ex)=>{
  const scale = ex.scale ?? 1;
  const rows = (await f.text()).trim().split(/\r?\n/).map(l=>l.split(/[,\s]+/).filter(Boolean).map(Number));
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const img = c.getContext('2d').createImageData(w,h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const g=Math.max(0,Math.min(255,Math.round(rows[y][x]/scale))); const i=(y*w+x)*4; img.data[i]=img.data[i+1]=img.data[i+2]=g; img.data[i+3]=255; }
  c.getContext('2d').putImageData(img,0,0);
  return _out(await _canvasBlob(c,'image/png'), f, 'png');
};
SPECIAL.imgToSvgPixels = async (f, ex)=>{
  const md = Math.max(4, Math.round(ex.maxDim||64));
  const c = await _canvasFromFile(f, md), d = _imgData(c).data;
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="'+c.width+'" height="'+c.height+'" viewBox="0 0 '+c.width+' '+c.height+'" shape-rendering="crispEdges">'];
  for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++){ const i=(y*c.width+x)*4; if(d[i+3]===0) continue;
    const hex = '#'+[d[i],d[i+1],d[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('');
    parts.push('<rect x="'+x+'" y="'+y+'" width="1" height="1" fill="'+hex+'"'+(d[i+3]<255?' fill-opacity="'+(d[i+3]/255).toFixed(3)+'"':'')+'/>'); }
  parts.push('</svg>');
  return _txtOut(parts.join('\n'), f, 'svg');
};

/* ---------- cat 43 + 44: colour text tools ---------- */
function _nums(t){ return String(t).split(/[,\s;]+/).filter(Boolean).map(Number); }
function _needNums(t, n, what){
  const v = _nums(t);
  if(v.length < n || v.some(isNaN)) throw new Error('Enter '+n+' numbers, e.g. '+what+'.');
  return v;
}
function _parseHex(t){
  let s = String(t).trim().replace(/^#/, '');
  if(s.length===3) s = s.split('').map(c=>c+c).join('');
  if(!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error('Enter a HEX colour like #FF5733.');
  return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)];
}
function _hex2(r,g,b){ return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase(); }
function _rgbStr(r,g,b){ return 'R '+Math.round(r)+', G '+Math.round(g)+', B '+Math.round(b); }
function _hslToRgb(h,s,l){
  h=((h%360)+360)%360; s/=100; l/=100;
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs(((h/60)%2)-1)), m=l-c/2;
  let r=0,g=0,b=0;
  if(h<60){ r=c; g=x; } else if(h<120){ r=x; g=c; } else if(h<180){ g=c; b=x; } else if(h<240){ g=x; b=c; } else if(h<300){ r=x; b=c; } else { r=c; b=x; }
  return [(r+m)*255,(g+m)*255,(b+m)*255];
}
function _rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn, l=(mx+mn)/2;
  let h=0, s=0;
  if(d!==0){ s = l>0.5 ? d/(2-mx-mn) : d/(mx+mn);
    if(mx===r) h=60*(((g-b)/d)%6); else if(mx===g) h=60*((b-r)/d+2); else h=60*((r-g)/d+4); }
  return [((h%360)+360)%360, s*100, l*100];
}
function _hsvToRgb(h,s,v){
  h=((h%360)+360)%360; s/=100; v/=100;
  const c=v*s, x=c*(1-Math.abs(((h/60)%2)-1)), m=v-c;
  let r=0,g=0,b=0;
  if(h<60){ r=c; g=x; } else if(h<120){ r=x; g=c; } else if(h<180){ g=c; b=x; } else if(h<240){ g=x; b=c; } else if(h<300){ r=x; b=c; } else { r=c; b=x; }
  return [(r+m)*255,(g+m)*255,(b+m)*255];
}
function _rgbToHsv(r,g,b){
  r/=255; g/=255; b/=255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  let h=0;
  if(d!==0){ if(mx===r) h=60*(((g-b)/d)%6); else if(mx===g) h=60*((b-r)/d+2); else h=60*((r-g)/d+4); }
  return [((h%360)+360)%360, mx===0?0:d/mx*100, mx*100];
}
const _srgbToLin = (c)=> c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
const _linToSrgb = (c)=> c<=0.0031308 ? c*12.92 : 1.055*Math.pow(c,1/2.4)-0.055;
const _XYZ_M = [[0.4124564,0.3575761,0.1804375],[0.2126729,0.7151522,0.0721750],[0.0193339,0.1191920,0.9503041]];
const _XYZ_MI = [[3.2404542,-1.5371385,-0.4985314],[-0.9692660,1.8760108,0.0415560],[0.0556434,-0.2040259,1.0572252]];
function _rgbToXyz(r,g,b){ const l=[_srgbToLin(r/255),_srgbToLin(g/255),_srgbToLin(b/255)]; return _XYZ_M.map(row=>row[0]*l[0]+row[1]*l[1]+row[2]*l[2]); }
function _xyzToRgb(x,y,z){ const l=_XYZ_MI.map(row=>row[0]*x+row[1]*y+row[2]*z); return l.map(v=>_linToSrgb(v)*255); }
const _LAB_WN=[0.95047,1.0,1.08883], _LAB_D=6/29;
function _labF(t){ return t>Math.pow(_LAB_D,3) ? Math.cbrt(t) : t/(3*_LAB_D*_LAB_D)+4/29; }
function _labFi(t){ return t>_LAB_D ? t*t*t : 3*_LAB_D*_LAB_D*(t-4/29); }
function _xyzToLab(x,y,z){ const fx=_labF(x/_LAB_WN[0]), fy=_labF(y/_LAB_WN[1]), fz=_labF(z/_LAB_WN[2]); return [116*fy-16, 500*(fx-fy), 200*(fy-fz)]; }
function _labToXyz(L,a,b){ const fy=(L+16)/116, fx=fy+a/500, fz=fy-b/200; return [_LAB_WN[0]*_labFi(fx), _LAB_WN[1]*_labFi(fy), _LAB_WN[2]*_labFi(fz)]; }
function _srgbToOklab(r,g,b){
  const l=[_srgbToLin(r/255),_srgbToLin(g/255),_srgbToLin(b/255)];
  const ll=0.4122214708*l[0]+0.5363325363*l[1]+0.0514459929*l[2];
  const mm=0.2119034982*l[0]+0.6806995451*l[1]+0.1073969566*l[2];
  const ss=0.0883024619*l[0]+0.2817188376*l[1]+0.6299787005*l[2];
  const lc=Math.cbrt(ll), mc=Math.cbrt(mm), sc=Math.cbrt(ss);
  return [0.2104542553*lc+0.7936177850*mc-0.0040720468*sc, 1.9779984951*lc-2.4285922050*mc+0.4505937099*sc, 0.0259040371*lc+0.7827717662*mc-0.8086757660*sc];
}
function _oklabToSrgb(L,a,b){
  const l_=L+0.3963377774*a+0.2158037573*b, m_=L-0.1055613458*a-0.0638541728*b, s_=L-0.0894841775*a-1.2914855480*b;
  const l=l_*l_*l_, m=m_*m_*m_, s=s_*s_*s_;
  return [(4.0767416621*l-3.3077115913*m+0.2309699292*s),( -1.2684380046*l+2.6097574011*m-0.3413193965*s),(-0.0041960863*l-0.7034186147*m+1.7076147010*s)].map(v=>_linToSrgb(v)*255);
}
SPECIAL.hexToRgb = (t)=>{ const [r,g,b]=_parseHex(t); return _rgbStr(r,g,b); };
SPECIAL.rgbToHex = (t)=>{ const [r,g,b]=_needNums(t,3,'255, 87, 51'); return _hex2(r,g,b); };
SPECIAL.rgbToHsl = (t)=>{ const [r,g,b]=_needNums(t,3,'255, 87, 51'); const [h,s,l]=_rgbToHsl(r,g,b); return 'H '+h.toFixed(1)+'°, S '+s.toFixed(1)+'%, L '+l.toFixed(1)+'%'; };
SPECIAL.hslToRgb = (t)=>{ const [h,s,l]=_needNums(t,3,'213, 100, 60'); const [r,g,b]=_hslToRgb(h,s,l); return _rgbStr(r,g,b); };
SPECIAL.rgbToHsv = (t)=>{ const [r,g,b]=_needNums(t,3,'255, 87, 51'); const [h,s,v]=_rgbToHsv(r,g,b); return 'H '+h.toFixed(1)+'°, S '+s.toFixed(1)+'%, V '+v.toFixed(1)+'%'; };
SPECIAL.hsvToRgb = (t)=>{ const [h,s,v]=_needNums(t,3,'16, 100, 100'); const [r,g,b]=_hsvToRgb(h,s,v); return _rgbStr(r,g,b); };
SPECIAL.srgbToLinear = (t)=>{ const [r,g,b]=_needNums(t,3,'255, 87, 51'); return [r,g,b].map(v=>_srgbToLin(v/255).toFixed(4)).join(', '); };
SPECIAL.linearToSrgb = (t)=>{ const [r,g,b]=_needNums(t,3,'1, 0.095, 0.033'); return _rgbStr(...[r,g,b].map(v=>_linToSrgb(v)*255)); };
SPECIAL.srgbToXyz = (t)=>{ const [r,g,b]=_needNums(t,3,'255, 255, 255'); const [x,y,z]=_rgbToXyz(r,g,b); return 'X '+x.toFixed(4)+', Y '+y.toFixed(4)+', Z '+z.toFixed(4); };
SPECIAL.xyzToSrgb = (t)=>{ const [x,y,z]=_needNums(t,3,'0.9505, 1, 1.089'); const [r,g,b]=_xyzToRgb(x,y,z); return _rgbStr(r,g,b); };
SPECIAL.xyzToLab = (t)=>{ const [x,y,z]=_needNums(t,3,'0.9505, 1, 1.089'); const [L,a,b]=_xyzToLab(x,y,z); return 'L '+L.toFixed(2)+', a '+a.toFixed(2)+', b '+b.toFixed(2); };
SPECIAL.labToXyz = (t)=>{ const [L,a,b]=_needNums(t,3,'53.24, 80.09, 67.2'); const [x,y,z]=_labToXyz(L,a,b); return 'X '+x.toFixed(4)+', Y '+y.toFixed(4)+', Z '+z.toFixed(4); };
SPECIAL.labToLch = (t)=>{ const [L,a,b]=_needNums(t,3,'53.24, 80.09, 67.2'); const C=Math.hypot(a,b); let h=Math.atan2(b,a)*180/Math.PI; if(h<0) h+=360; return 'L '+L.toFixed(2)+', C '+C.toFixed(2)+', h '+h.toFixed(1)+'°'; };
SPECIAL.lchToLab = (t)=>{ const [L,C,h]=_needNums(t,3,'53.24, 104.55, 39.99'); const rad=h*Math.PI/180; return 'L '+L.toFixed(2)+', a '+(C*Math.cos(rad)).toFixed(2)+', b '+(C*Math.sin(rad)).toFixed(2); };
SPECIAL.srgbToOklab = (t)=>{ const [r,g,b]=_needNums(t,3,'255, 255, 255'); const [L,a,bb]=_srgbToOklab(r,g,b); return 'L '+L.toFixed(4)+', a '+a.toFixed(4)+', b '+bb.toFixed(4); };
SPECIAL.oklabToSrgb = (t)=>{ const [L,a,b]=_needNums(t,3,'1, 0, 0'); const [r,g,bb]=_oklabToSrgb(L,a,b); return _rgbStr(r,g,bb); };
SPECIAL.oklabToOklch = (t)=>{ const [L,a,b]=_needNums(t,3,'0.6279, 0.2248, 0.1258'); const C=Math.hypot(a,b); let h=Math.atan2(b,a)*180/Math.PI; if(h<0) h+=360; return 'L '+L.toFixed(4)+', C '+C.toFixed(4)+', h '+h.toFixed(1)+'°'; };
SPECIAL.oklchToOklab = (t)=>{ const [L,C,h]=_needNums(t,3,'0.6279, 0.2577, 29.23'); const rad=h*Math.PI/180; return 'L '+L.toFixed(4)+', a '+(C*Math.cos(rad)).toFixed(4)+', b '+(C*Math.sin(rad)).toFixed(4); };
SPECIAL.rgbToCmyk = (t)=>{ const [r,g,b]=_needNums(t,3,'255, 87, 51'); const rn=r/255, gn=g/255, bn=b/255, k=1-Math.max(rn,gn,bn);
  if(k>=1) return 'C 0%, M 0%, Y 0%, K 100%';
  const c=(1-rn-k)/(1-k), m=(1-gn-k)/(1-k), y=(1-bn-k)/(1-k);
  return 'C '+(c*100).toFixed(1)+'%, M '+(m*100).toFixed(1)+'%, Y '+(y*100).toFixed(1)+'%, K '+(k*100).toFixed(1)+'%'; };
SPECIAL.cmykToRgb = (t)=>{ const [c,m,y,k]=_needNums(t,4,'0, 66, 68, 0'); return _rgbStr(255*(1-c/100)*(1-k/100), 255*(1-m/100)*(1-k/100), 255*(1-y/100)*(1-k/100)); };
/* cat 44 */
SPECIAL.rgbaToHex8 = (t)=>{ const [r,g,b,a]=_needNums(t,4,'255, 87, 51, 255'); return _hex2(r,g,b)+Math.max(0,Math.min(255,Math.round(a))).toString(16).padStart(2,'0').toUpperCase(); };
SPECIAL.hex8ToRgba = (t)=>{ let s=String(t).trim().replace(/^#/,''); if(!/^[0-9a-fA-F]{8}$/.test(s)) throw new Error('Enter an 8-digit HEX colour like #FF5733CC.');
  const v=[0,2,4,6].map(i=>parseInt(s.slice(i,i+2),16)); return 'R '+v[0]+', G '+v[1]+', B '+v[2]+', A '+v[3]; };
SPECIAL.hslaToRgba = (t)=>{ const [h,s,l,a]=_needNums(t,4,'213, 100, 60, 1'); const [r,g,b]=_hslToRgb(h,s,l); return _rgbStr(r,g,b)+', A '+a; };
SPECIAL.rgbaToHsla = (t)=>{ const [r,g,b,a]=_needNums(t,4,'255, 87, 51, 1'); const [h,s,l]=_rgbToHsl(r,g,b); return 'H '+h.toFixed(1)+'°, S '+s.toFixed(1)+'%, L '+l.toFixed(1)+'%, A '+a; };
SPECIAL.hwbToRgb = (t)=>{ const [h,w,b]=_needNums(t,3,'16, 0, 0'); const [r,g,bb]=_hsvToRgb(h, 100*(1-w/100-b/100), 100*(1-b/100)); return _rgbStr(r,g,bb); };
SPECIAL.rgbToHwb = (t)=>{ const [r,g,b]=_needNums(t,3,'255, 87, 51'); const [h]=_rgbToHsv(r,g,b); const mn=Math.min(r,g,b)/255, mx=Math.max(r,g,b)/255; return 'H '+h.toFixed(1)+'°, W '+(mn*100).toFixed(1)+'%, B '+((1-mx)*100).toFixed(1)+'%'; };
const _NAMED = {"aliceblue":"#F0F8FF","antiquewhite":"#FAEBD7","aqua":"#00FFFF","aquamarine":"#7FFFD4","azure":"#F0FFFF","beige":"#F5F5DC","bisque":"#FFE4C4","black":"#000000","blanchedalmond":"#FFEBCD","blue":"#0000FF","blueviolet":"#8A2BE2","brown":"#A52A2A","burlywood":"#DEB887","cadetblue":"#5F9EA0","chartreuse":"#7FFF00","chocolate":"#D2691E","coral":"#FF7F50","cornflowerblue":"#6495ED","cornsilk":"#FFF8DC","crimson":"#DC143C","cyan":"#00FFFF","darkblue":"#00008B","darkcyan":"#008B8B","darkgoldenrod":"#B8860B","darkgray":"#A9A9A9","darkgreen":"#006400","darkgrey":"#A9A9A9","darkkhaki":"#BDB76B","darkmagenta":"#8B008B","darkolivegreen":"#556B2F","darkorange":"#FF8C00","darkorchid":"#9932CC","darkred":"#8B0000","darksalmon":"#E9967A","darkseagreen":"#8FBC8F","darkslateblue":"#483D8B","darkslategray":"#2F4F4F","darkslategrey":"#2F4F4F","darkturquoise":"#00CED1","darkviolet":"#9400D3","deeppink":"#FF1493","deepskyblue":"#00BFFF","dimgray":"#696969","dimgrey":"#696969","dodgerblue":"#1E90FF","firebrick":"#B22222","floralwhite":"#FFFAF0","forestgreen":"#228B22","fuchsia":"#FF00FF","gainsboro":"#DCDCDC","ghostwhite":"#F8F8FF","gold":"#FFD700","goldenrod":"#DAA520","gray":"#808080","green":"#008000","greenyellow":"#ADFF2F","grey":"#808080","honeydew":"#F0FFF0","hotpink":"#FF69B4","indianred":"#CD5C5C","indigo":"#4B0082","ivory":"#FFFFF0","khaki":"#F0E68C","lavender":"#E6E6FA","lavenderblush":"#FFF0F5","lawngreen":"#7CFC00","lemonchiffon":"#FFFACD","lightblue":"#ADD8E6","lightcoral":"#F08080","lightcyan":"#E0FFFF","lightgoldenrodyellow":"#FAFAD2","lightgray":"#D3D3D3","lightgreen":"#90EE90","lightgrey":"#D3D3D3","lightpink":"#FFB6C1","lightsalmon":"#FFA07A","lightseagreen":"#20B2AA","lightskyblue":"#87CEFA","lightslategray":"#778899","lightslategrey":"#778899","lightsteelblue":"#B0C4DE","lightyellow":"#FFFFE0","lime":"#00FF00","limegreen":"#32CD32","linen":"#FAF0E6","magenta":"#FF00FF","maroon":"#800000","mediumaquamarine":"#66CDAA","mediumblue":"#0000CD","mediumorchid":"#BA55D3","mediumpurple":"#9370DB","mediumseagreen":"#3CB371","mediumslateblue":"#7B68EE","mediumspringgreen":"#00FA9A","mediumturquoise":"#48D1CC","mediumvioletred":"#C71585","midnightblue":"#191970","mintcream":"#F5FFFA","mistyrose":"#FFE4E1","moccasin":"#FFE4B5","navajowhite":"#FFDEAD","navy":"#000080","oldlace":"#FDF5E6","olive":"#808000","olivedrab":"#6B8E23","orange":"#FFA500","orangered":"#FF4500","orchid":"#DA70D6","palegoldenrod":"#EEE8AA","palegreen":"#98FB98","paleturquoise":"#AFEEEE","palevioletred":"#DB7093","papayawhip":"#FFEFD5","peachpuff":"#FFDAB9","peru":"#CD853F","pink":"#FFC0CB","plum":"#DDA0DD","powderblue":"#B0E0E6","purple":"#800080","rebeccapurple":"#663399","red":"#FF0000","rosybrown":"#BC8F8F","royalblue":"#4169E1","saddlebrown":"#8B4513","salmon":"#FA8072","sandybrown":"#F4A460","seagreen":"#2E8B57","seashell":"#FFF5EE","sienna":"#A0522D","silver":"#C0C0C0","skyblue":"#87CEEB","slateblue":"#6A5ACD","slategray":"#708090","slategrey":"#708090","snow":"#FFFAFA","springgreen":"#00FF7F","steelblue":"#4682B4","tan":"#D2B48C","teal":"#008080","thistle":"#D8BFD8","tomato":"#FF6347","turquoise":"#40E0D0","violet":"#EE82EE","wheat":"#F5DEB3","white":"#FFFFFF","whitesmoke":"#F5F5F5","yellow":"#FFFF00","yellowgreen":"#9ACD32"};
SPECIAL.namedToHex = (t)=>{ const n = String(t).trim().toLowerCase(); if(!_NAMED[n]) throw new Error('Unknown CSS named colour: '+t.trim()+'.'); return _NAMED[n]; };
SPECIAL.hexToNamed = (t)=>{ const [r,g,b]=_parseHex(t); const hex=_hex2(r,g,b); for(const [n,h] of Object.entries(_NAMED)) if(h===hex) return n; return 'No exact named colour matches '+hex+'.'; };
SPECIAL.divByRoot = (v,x)=> v/(x.root??16);
SPECIAL.mulByRoot = (v,x)=> v*(x.root??16);
SPECIAL.gplToJson = (t)=>{
  const out = [];
  String(t).split(/\r?\n/).forEach(line=>{
    const m = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+(.*))?$/);
    if(m) out.push({name:(m[4]||'').trim(), hex:_hex2(+m[1],+m[2],+m[3])});
  });
  if(!out.length) throw new Error('No colours found. Paste a GIMP .gpl palette.');
  return JSON.stringify(out, null, 2);
};
function _paletteFromJson(t){
  let arr; try { arr = JSON.parse(t); } catch(e){ throw new Error('Not valid JSON. Paste a JSON array of colours.'); }
  if(!Array.isArray(arr) || !arr.length) throw new Error('Expected a JSON array of colours.');
  return arr.map(c=>{
    if(typeof c === 'string') return {name:'', hex:_hex2(..._parseHex(c))};
    if(c.hex) return {name:c.name||'', hex:_hex2(..._parseHex(c.hex))};
    if(c.r!==undefined) return {name:c.name||'', hex:_hex2(c.r,c.g,c.b)};
    throw new Error('Each colour must be a hex string or an object with a hex field.');
  });
}
SPECIAL.jsonToGpl = (t)=>{
  const pal = _paletteFromJson(t);
  const lines = ['GIMP Palette','Name: Converted palette','Columns: 4','#'];
  pal.forEach(c=>{ const [r,g,b]=_parseHex(c.hex); lines.push(r+' '+g+' '+b+(c.name?' '+c.name:'')); });
  return lines.join('\n');
};
SPECIAL.aseToJson = async (f)=>{
  const buf = await _buf(f), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if(buf.length<12 || String.fromCharCode(...buf.subarray(0,4))!=='ASEF') throw new Error('Not an Adobe ASE palette file.');
  const nBlocks = dv.getUint32(8);
  let p = 12; const out = [];
  const readStr = ()=>{ const len = dv.getUint16(p); p+=2; let s=''; for(let i=0;i<len;i++){ const ch=dv.getUint16(p); p+=2; if(ch) s+=String.fromCharCode(ch); } return s; };
  for(let b=0;b<nBlocks && p+6<=buf.length;b++){
    const type = dv.getUint16(p), len = dv.getUint32(p+2); p+=6; const end = p+len;
    if(type===0x0001){
      const name = readStr();
      const model = String.fromCharCode(...buf.subarray(p,p+4)); p+=4;
      const vals = []; for(let i=0;i<4 && p+4<=end;i++){ vals.push(dv.getFloat32(p)); p+=4; }
      let hex;
      if(model==='RGB ') hex = _hex2(vals[0]*255, vals[1]*255, vals[2]*255);
      else if(model==='CMYK'){ const [c,m,y,k]=vals; hex=_hex2(255*(1-c)*(1-k),255*(1-m)*(1-k),255*(1-y)*(1-k)); }
      else if(model==='Gray'){ const g=Math.round(vals[0]*255); hex=_hex2(g,g,g); }
      else if(model==='LAB '){ const [x,y,z]=_labToXyz(vals[0]*100, vals[1]-128, vals[2]-128); const [r,g,bb]=_xyzToRgb(x,y,z); hex=_hex2(r,g,bb); }
      else continue;
      out.push({name, hex});
    }
    p = end;
  }
  if(!out.length) throw new Error('No colours found in this ASE file.');
  return _txtOut(JSON.stringify(out, null, 2), f, 'json');
};
SPECIAL.jsonToAse = async (f)=>{
  const pal = _paletteFromJson(await f.text());
  const blocks = [];
  pal.forEach(c=>{
    const [r,g,b] = _parseHex(c.hex);
    const name = c.name||c.hex;
    const nameBytes = new Uint8Array((name.length+1)*2);
    const ndv = new DataView(nameBytes.buffer);
    for(let i=0;i<name.length;i++) ndv.setUint16(i*2, name.charCodeAt(i));
    const body = new Uint8Array(2+nameBytes.length+4+12);
    const bdv = new DataView(body.buffer);
    bdv.setUint16(0, name.length+1);
    body.set(nameBytes, 2);
    body.set([82,71,66,32], 2+nameBytes.length); // 'RGB '
    bdv.setFloat32(2+nameBytes.length+4, r/255); bdv.setFloat32(2+nameBytes.length+8, g/255); bdv.setFloat32(2+nameBytes.length+12, b/255);
    const head = new Uint8Array(6); const hdv = new DataView(head.buffer);
    hdv.setUint16(0, 0x0001); hdv.setUint32(2, body.length);
    blocks.push(head, body);
  });
  const hdr = new Uint8Array(12); const hdv = new DataView(hdr.buffer);
  hdr.set([65,83,69,70]); hdv.setUint16(4,1); hdv.setUint16(6,0); hdv.setUint32(8, pal.length);
  const total = 12 + blocks.reduce((a,b)=>a+b.length,0), all = new Uint8Array(total);
  all.set(hdr); let o=12; blocks.forEach(b=>{ all.set(b,o); o+=b.length; });
  return _out(new Blob([all],{type:'application/octet-stream'}), f, 'ase');
};

/* ---------- cat 45 + 46: audio ---------- */
function _wavEncode(channels, sampleRate){
  const nCh = channels.length, n = channels[0].length, bytes = 44 + n*nCh*2;
  const buf = new ArrayBuffer(bytes), dv = new DataView(buf);
  const ws = (o,s)=>{ for(let i=0;i<s.length;i++) dv.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,'RIFF'); dv.setUint32(4, bytes-8, true); ws(8,'WAVE'); ws(12,'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nCh, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate*nCh*2, true);
  dv.setUint16(32, nCh*2, true); dv.setUint16(34, 16, true); ws(36,'data'); dv.setUint32(40, n*nCh*2, true);
  let o = 44;
  for(let i=0;i<n;i++) for(let c=0;c<nCh;c++){ const v = Math.max(-1, Math.min(1, channels[c][i])); dv.setInt16(o, Math.round(v*32767), true); o+=2; }
  return new Blob([buf], {type:'audio/wav'});
}
function _wavParse(buf){
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rs = (o,n)=>{ let s=''; for(let i=0;i<n;i++) s+=String.fromCharCode(buf[o+i]); return s; };
  if(rs(0,4)!=='RIFF' || rs(8,4)!=='WAVE') throw new Error('Not a WAV file.');
  let p=12, fmt=null, dataOff=0, dataLen=0;
  while(p+8 <= buf.length){
    const id = rs(p,4), size = dv.getUint32(p+4, true);
    if(id==='fmt '){ fmt = {audioFormat: dv.getUint16(p+8,true), channels: dv.getUint16(p+10,true), sampleRate: dv.getUint32(p+12,true), bits: dv.getUint16(p+22,true)}; }
    else if(id==='data'){ dataOff=p+8; dataLen=size; break; }
    p += 8 + size + (size%2);
  }
  if(!fmt || !dataLen) throw new Error('WAV file is missing its format or data chunk.');
  const n = Math.floor(dataLen / (fmt.bits/8) / fmt.channels);
  const samples = new Float32Array(n*fmt.channels);
  if(fmt.audioFormat===1){
    if(fmt.bits===16) for(let i=0;i<n*fmt.channels;i++) samples[i]=dv.getInt16(dataOff+i*2,true)/32768;
    else if(fmt.bits===8) for(let i=0;i<n*fmt.channels;i++) samples[i]=(buf[dataOff+i]-128)/128;
    else if(fmt.bits===24) for(let i=0;i<n*fmt.channels;i++){ const o=dataOff+i*3; let v=buf[o]|(buf[o+1]<<8)|(buf[o+2]<<16); if(v&0x800000) v-=0x1000000; samples[i]=v/8388608; }
    else if(fmt.bits===32) for(let i=0;i<n*fmt.channels;i++) samples[i]=dv.getInt32(dataOff+i*4,true)/2147483648;
    else throw new Error('Unsupported WAV bit depth: '+fmt.bits+'.');
  } else if(fmt.audioFormat===3){
    if(fmt.bits===32) for(let i=0;i<n*fmt.channels;i++) samples[i]=dv.getFloat32(dataOff+i*4,true);
    else if(fmt.bits===64) for(let i=0;i<n*fmt.channels;i++) samples[i]=dv.getFloat64(dataOff+i*8,true);
    else throw new Error('Unsupported float WAV bit depth: '+fmt.bits+'.');
  } else throw new Error('Unsupported WAV format (only PCM and float WAV are supported).');
  return {sampleRate: fmt.sampleRate, channels: fmt.channels, bits: fmt.bits, samples, frames: n};
}
function _deinterleave(samples, nCh){
  const out = []; const n = samples.length/nCh;
  for(let c=0;c<nCh;c++){ const ch = new Float32Array(n); for(let i=0;i<n;i++) ch[i]=samples[i*nCh+c]; out.push(ch); }
  return out;
}
async function _decodeAudio(file){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) throw new Error('This browser cannot decode audio.');
  const ctx = new AC();
  try { return await ctx.decodeAudioData(await file.arrayBuffer()); }
  finally { if(ctx.close) ctx.close(); }
}
async function _decodedToWav(file){
  let ab;
  try { ab = await _decodeAudio(file); }
  catch(e){ throw new Error('Could not decode this audio file in this browser ('+e.message+').'); }
  const chs = []; for(let c=0;c<ab.numberOfChannels;c++) chs.push(ab.getChannelData(c));
  return _out(_wavEncode(chs, ab.sampleRate), file, 'wav');
}
SPECIAL.mp3ToWav = _decodedToWav;
SPECIAL.flacToWav = _decodedToWav;
SPECIAL.oggToWav = _decodedToWav;
SPECIAL.opusToWav = _decodedToWav;
SPECIAL.aacToWav = _decodedToWav;
SPECIAL.webmToWav = _decodedToWav;
SPECIAL.noteWavMp3 = _mkNote('WAV to MP3 — not possible in a browser', _NOTE_AUDIO_ENC + '\n\nMP3 encoding needs an encoder like LAME, which browsers do not include.');
SPECIAL.noteWavFlac = _mkNote('WAV to FLAC — not possible in a browser', _NOTE_AUDIO_ENC + '\n\nFLAC encoding is not provided by browsers.');
SPECIAL.noteWavOgg = _mkNote('WAV to Ogg Vorbis — not possible in a browser', _NOTE_AUDIO_ENC + '\n\nVorbis encoding is not provided by browsers.');
SPECIAL.noteWavAac = _mkNote('WAV to AAC in M4A — not possible in a browser', _NOTE_AUDIO_ENC + '\n\nAAC encoding is not provided by browsers.');
function _aiffEncode(channels, sampleRate){
  const nCh=channels.length, n=channels[0].length, dataLen=n*nCh*2;
  const buf=new ArrayBuffer(54+dataLen + (dataLen%2)), dv=new DataView(buf);
  const ws=(o,s)=>{ for(let i=0;i<s.length;i++) dv.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,'FORM'); dv.setUint32(4, buf.byteLength-8, true); ws(8,'AIFF');
  ws(12,'COMM'); dv.setUint32(16, 18, true);
  dv.setUint16(20, nCh, true); dv.setUint32(22, n, true); dv.setUint16(26, 16, true);
  // 80-bit extended float sample rate
  const sr = sampleRate; let e = 0, m = sr; while(m >= 2){ m/=2; e++; } while(m < 1){ m*=2; e--; }
  dv.setUint16(28, e+16383, true);
  const hi = Math.floor(m*Math.pow(2,31)), lo = Math.floor((m*Math.pow(2,31)-hi)*Math.pow(2,32));
  dv.setUint32(30, hi, true); dv.setUint32(34, lo, true);
  ws(38,'SSND'); dv.setUint32(42, 8+dataLen, true); dv.setUint32(46, 0, true); dv.setUint32(50, 0, true);
  let o=54;
  for(let i=0;i<n;i++) for(let c=0;c<nCh;c++){ const v=Math.max(-1,Math.min(1,channels[c][i])); dv.setInt16(o, Math.round(v*32767), false); o+=2; }
  return new Blob([buf], {type:'audio/aiff'});
}
function _aiffParse(buf){
  const dv=new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rs=(o,n)=>{ let s=''; for(let i=0;i<n;i++) s+=String.fromCharCode(buf[o+i]); return s; };
  if(rs(0,4)!=='FORM' || (rs(8,4)!=='AIFF' && rs(8,4)!=='AIFC')) throw new Error('Not an AIFF file.');
  let p=12, nCh=0, frames=0, bits=16, dataOff=0, dataLen=0, sampleRate=44100;
  while(p+8<=buf.length){
    const id=rs(p,4), size=dv.getUint32(p+4,true);
    if(id==='COMM'){ nCh=dv.getUint16(p+8,true); frames=dv.getUint32(p+10,true); bits=dv.getUint16(p+14,true);
      const exp=dv.getUint16(p+16,true)-16383, hi=dv.getUint32(p+18,true); sampleRate=Math.round(hi/Math.pow(2,32)*Math.pow(2,exp+1)); }
    else if(id==='SSND'){ dataOff=p+16; dataLen=size-8; break; }
    p += 8+size+(size%2);
  }
  if(!dataOff) throw new Error('AIFF file has no sound data.');
  const n=Math.min(frames, Math.floor(dataLen/(bits/8)/nCh));
  const samples=new Float32Array(n*nCh);
  if(bits===16) for(let i=0;i<n*nCh;i++) samples[i]=dv.getInt16(dataOff+i*2,false)/32768;
  else if(bits===8) for(let i=0;i<n*nCh;i++) samples[i]=(buf[dataOff+i]-128)/128;
  else if(bits===24) for(let i=0;i<n*nCh;i++){ const o=dataOff+i*3; let v=(buf[o]<<16)|(buf[o+1]<<8)|buf[o+2]; if(v&0x800000) v-=0x1000000; samples[i]=v/8388608; }
  else throw new Error('Unsupported AIFF bit depth: '+bits+'.');
  return {sampleRate, channels:nCh, samples, frames:n};
}
SPECIAL.aiffToWav = async (f)=>{
  const a = _aiffParse(await _buf(f));
  return _out(_wavEncode(_deinterleave(a.samples, a.channels), a.sampleRate), f, 'wav');
};
SPECIAL.wavToAiff = async (f)=>{
  const w = _wavParse(await _buf(f));
  return _out(_aiffEncode(_deinterleave(w.samples, w.channels), w.sampleRate), f, 'aif');
};
function _auParse(buf){
  const dv=new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rs=(o,n)=>{ let s=''; for(let i=0;i<n;i++) s+=String.fromCharCode(buf[o+i]); return s; };
  if(rs(0,4)!=='.snd') throw new Error('Not a Sun AU file.');
  const off=dv.getUint32(4,false), enc=dv.getUint32(12,false), rate=dv.getUint32(16,false), nCh=dv.getUint32(20,false);
  const n=Math.floor((buf.length-off)/(enc===3?2:enc===2?1:enc===4?3:2)/nCh);
  const samples=new Float32Array(n*nCh);
  if(enc===3) for(let i=0;i<n*nCh;i++) samples[i]=dv.getInt16(off+i*2,false)/32768;
  else if(enc===2) for(let i=0;i<n*nCh;i++) samples[i]=(buf[off+i]-128)/128;
  else if(enc===4) for(let i=0;i<n*nCh;i++){ const o=off+i*3; let v=(buf[o]<<16)|(buf[o+1]<<8)|buf[o+2]; if(v&0x800000) v-=0x1000000; samples[i]=v/8388608; }
  else throw new Error('Unsupported AU encoding: '+enc+' (only 8/16/24-bit linear PCM).');
  return {sampleRate:rate, channels:nCh, samples, frames:n};
}
function _auEncode(channels, sampleRate){
  const nCh=channels.length, n=channels[0].length, dataLen=n*nCh*2;
  const buf=new ArrayBuffer(24+dataLen), dv=new DataView(buf);
  const ws=(o,s)=>{ for(let i=0;i<s.length;i++) dv.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,'.snd'); dv.setUint32(4,24,false); dv.setUint32(8,dataLen,false); dv.setUint32(12,3,false);
  dv.setUint32(16,sampleRate,false); dv.setUint32(20,nCh,false);
  let o=24;
  for(let i=0;i<n;i++) for(let c=0;c<nCh;c++){ const v=Math.max(-1,Math.min(1,channels[c][i])); dv.setInt16(o, Math.round(v*32767), false); o+=2; }
  return new Blob([buf], {type:'audio/basic'});
}
SPECIAL.auToWav = async (f)=>{
  const a = _auParse(await _buf(f));
  return _out(_wavEncode(_deinterleave(a.samples, a.channels), a.sampleRate), f, 'wav');
};
SPECIAL.wavToAu = async (f)=>{
  const w = _wavParse(await _buf(f));
  return _out(_auEncode(_deinterleave(w.samples, w.channels), w.sampleRate), f, 'au');
};
function _cafParse(buf){
  const dv=new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rs=(o,n)=>{ let s=''; for(let i=0;i<n;i++) s+=String.fromCharCode(buf[o+i]); return s; };
  if(rs(0,4)!=='caff') throw new Error('Not a CAF file.');
  let p=8, sampleRate=44100, nCh=1, bits=16, dataOff=0, dataLen=0, fmt=0;
  while(p+12<=buf.length){
    const id=rs(p,4); const size=Number(dv.getBigUint64(p+4,false));
    if(id==='desc'){ sampleRate=dv.getFloat64(p+12,false); fmt=rs(p+20,4); nCh=dv.getUint32(p+28,false); bits=dv.getUint32(p+32,false); }
    else if(id==='data'){ dataOff=p+16; dataLen=size-4; break; }
    p += 12+size;
  }
  if(!dataOff) throw new Error('CAF file has no audio data.');
  if(fmt!=='lpcm') throw new Error('Only PCM CAF files are supported (this one is '+fmt+').');
  const n=Math.floor(dataLen/(bits/8)/nCh);
  const samples=new Float32Array(n*nCh);
  if(bits===16) for(let i=0;i<n*nCh;i++) samples[i]=dv.getInt16(dataOff+i*2,false)/32768;
  else if(bits===8) for(let i=0;i<n*nCh;i++) samples[i]=(buf[dataOff+i]-128)/128;
  else if(bits===24) for(let i=0;i<n*nCh;i++){ const o=dataOff+i*3; let v=(buf[o]<<16)|(buf[o+1]<<8)|buf[o+2]; if(v&0x800000) v-=0x1000000; samples[i]=v/8388608; }
  else if(bits===32) for(let i=0;i<n*nCh;i++) samples[i]=dv.getFloat32(dataOff+i*4,false);
  else throw new Error('Unsupported CAF bit depth: '+bits+'.');
  return {sampleRate:Math.round(sampleRate), channels:nCh, samples, frames:n};
}
function _cafEncode(channels, sampleRate){
  const nCh=channels.length, n=channels[0].length, dataLen=n*nCh*2;
  const buf=new ArrayBuffer(8+12+32+12+4+dataLen), dv=new DataView(buf);
  const ws=(o,s)=>{ for(let i=0;i<s.length;i++) dv.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,'caff'); dv.setUint16(4,1,false); dv.setUint16(6,0,false);
  ws(8,'desc'); dv.setBigUint64(12, BigInt(32), false);
  dv.setFloat64(20, sampleRate, false); ws(28,'lpcm'); dv.setUint32(32,0,false);
  dv.setUint32(36,nCh,false); dv.setUint32(40,16,false);
  ws(52,'data'); dv.setBigUint64(56, BigInt(4+dataLen), false); dv.setUint32(64,0,false);
  let o=68;
  for(let i=0;i<n;i++) for(let c=0;c<nCh;c++){ const v=Math.max(-1,Math.min(1,channels[c][i])); dv.setInt16(o, Math.round(v*32767), false); o+=2; }
  return new Blob([buf], {type:'audio/x-caf'});
}
SPECIAL.cafToWav = async (f)=>{
  const a = _cafParse(await _buf(f));
  return _out(_wavEncode(_deinterleave(a.samples, a.channels), a.sampleRate), f, 'wav');
};
SPECIAL.wavToCaf = async (f)=>{
  const w = _wavParse(await _buf(f));
  return _out(_cafEncode(_deinterleave(w.samples, w.channels), w.sampleRate), f, 'caf');
};
SPECIAL.rawPcmToWav = async (f, ex)=>{
  const rate = Math.round(ex.rate||44100), nCh = Math.round(ex.channels||1), bits = Math.round(ex.bits||16);
  const buf = await _buf(f);
  const bytesPer = bits/8, n = Math.floor(buf.length/bytesPer/nCh);
  if(!n) throw new Error('File is too small for the given format.');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const samples = new Float32Array(n*nCh);
  for(let i=0;i<n*nCh;i++){
    if(bits===16) samples[i]=dv.getInt16(i*2,true)/32768;
    else if(bits===8) samples[i]=(buf[i]-128)/128;
    else if(bits===24){ const o=i*3; let v=buf[o]|(buf[o+1]<<8)|(buf[o+2]<<16); if(v&0x800000) v-=0x1000000; samples[i]=v/8388608; }
    else if(bits===32) samples[i]=dv.getFloat32(i*4,true);
    else throw new Error('Supported bit depths: 8, 16, 24, 32.');
  }
  return _out(_wavEncode(_deinterleave(samples, nCh), rate), f, 'wav');
};
SPECIAL.wavToRawPcm = async (f)=>{
  const w = _wavParse(await _buf(f));
  const n = w.frames*w.channels, out = new Int16Array(n);
  for(let i=0;i<n;i++) out[i]=Math.max(-32768, Math.min(32767, Math.round(w.samples[i]*32767)));
  return _out(new Blob([out.buffer],{type:'application/octet-stream'}), f, 'pcm');
};
async function _recordAudioBuffer(ab, mime){
  if(typeof MediaRecorder==='undefined') throw new Error('MediaRecorder is not available in this browser.');
  if(mime && !MediaRecorder.isTypeSupported(mime)) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    const src = ctx.createBufferSource(); src.buffer = ab;
    const dest = ctx.createMediaStreamDestination(); src.connect(dest);
    const rec = new MediaRecorder(dest.stream, mime?{mimeType:mime}:undefined);
    const chunks = [];
    const done = new Promise((res, rej)=>{ rec.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); }; rec.onstop=()=>res(new Blob(chunks,{type:rec.mimeType})); rec.onerror=()=>rej(new Error('Recording failed.')); });
    await ctx.resume(); src.start(); rec.start(250);
    await new Promise(r=>{ src.onended=r; setTimeout(r, (ab.duration+0.5)*1000); });
    if(rec.state!=='inactive') rec.stop();
    return await done;
  } finally { if(ctx.close) ctx.close(); }
}
SPECIAL.wavToWebmOpus = async (f)=>{
  let ab; try { ab = await _decodeAudio(f); } catch(e){ throw new Error('Could not decode this WAV file in this browser.'); }
  const blob = await _recordAudioBuffer(ab, 'audio/webm;codecs=opus');
  if(!blob) throw new Error('This browser cannot record WebM Opus audio.');
  return _out(blob, f, 'webm');
};
SPECIAL.wavToOggOpus = async (f)=>{
  let ab; try { ab = await _decodeAudio(f); } catch(e){ throw new Error('Could not decode this WAV file in this browser.'); }
  const blob = await _recordAudioBuffer(ab, 'audio/ogg;codecs=opus');
  if(!blob) return _noteFile(f, 'WAV to Ogg Opus — not supported by this browser',
    'This browser\'s MediaRecorder does not support Ogg Opus output (it supports WebM Opus instead).\n\nUse Audacity (https://www.audacityteam.org) or FFmpeg (https://ffmpeg.org):\n  ffmpeg -i input.wav -c:a libopus output.ogg');
  return _out(blob, f, 'ogg');
};
/* cat 46: signals */
SPECIAL.stereoToMono = async (f)=>{
  const ab = await _decodeAudio(f);
  const n = ab.length, out = new Float32Array(n);
  const chs = []; for(let c=0;c<ab.numberOfChannels;c++) chs.push(ab.getChannelData(c));
  for(let i=0;i<n;i++){ let s=0; chs.forEach(ch=>s+=ch[i]); out[i]=s/chs.length; }
  return _out(_wavEncode([out], ab.sampleRate), f, 'wav');
};
SPECIAL.monoToStereo = async (f)=>{
  const ab = await _decodeAudio(f);
  const m = ab.getChannelData(0);
  return _out(_wavEncode([m, m.slice()], ab.sampleRate), f, 'wav');
};
SPECIAL.multiToStereo = async (f)=>{
  const ab = await _decodeAudio(f);
  const n = ab.length, nCh = ab.numberOfChannels;
  const chs = []; for(let c=0;c<nCh;c++) chs.push(ab.getChannelData(c));
  const L = new Float32Array(n), R = new Float32Array(n);
  for(let i=0;i<n;i++){
    let l=0, r=0;
    if(nCh>=1){ l+=chs[0][i]; r+=chs[0][i]*0; }
    if(nCh>=2){ l+=0; r+=chs[1][i]; }
    if(nCh>=3){ l+=0.7071*chs[2][i]; r+=0.7071*chs[2][i]; }
    if(nCh>=4){ l+=0.5*chs[3][i]; r+=0.5*chs[3][i]; }
    if(nCh>=5){ l+=0.5*chs[4][i]; r+=0.5*chs[4][i]; }
    if(nCh>=6){ l+=0.5*chs[5][i]; r+=0.5*chs[5][i]; }
    L[i]=l; R[i]=r;
  }
  return _out(_wavEncode([L,R], ab.sampleRate), f, 'wav');
};
function _pcmConvertBytes(buf, bits, fn){
  const bytesPer = bits/8, n = Math.floor(buf.length/bytesPer), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const vals = new Float64Array(n);
  for(let i=0;i<n;i++){
    if(bits===16) vals[i]=dv.getInt16(i*2,true);
    else if(bits===8) vals[i]=buf[i];
    else if(bits===24){ const o=i*3; let v=buf[o]|(buf[o+1]<<8)|(buf[o+2]<<16); if(v&0x800000) v-=0x1000000; vals[i]=v; }
    else if(bits===32) vals[i]=dv.getFloat32(i*4,true);
    else throw new Error('Supported bit depths: 8, 16, 24, 32.');
  }
  return fn(vals, n);
}
SPECIAL.interleavedToPlanar = async (f, ex)=>{
  const nCh = Math.max(1, Math.round(ex.channels||2)), bits = Math.round(ex.bits||16);
  const buf = await _buf(f);
  const out = _pcmConvertBytes(buf, bits, (vals, n)=>{
    const per = Math.floor(n/nCh), bytesPer = bits/8, res = new Uint8Array(per*nCh*bytesPer);
    for(let c=0;c<nCh;c++) for(let i=0;i<per;i++){ const v=vals[i*nCh+c]; const o=(c*per+i)*bytesPer;
      if(bits===16){ res[o]=v&255; res[o+1]=(v>>8)&255; }
      else if(bits===8){ res[o]=v&255; }
      else if(bits===24){ res[o]=v&255; res[o+1]=(v>>8)&255; res[o+2]=(v>>16)&255; }
      else if(bits===32){ new DataView(res.buffer).setFloat32(o, v, true); } }
    return res;
  });
  return _out(new Blob([out],{type:'application/octet-stream'}), f, 'pcm');
};
SPECIAL.planarToInterleaved = async (f, ex)=>{
  const nCh = Math.max(1, Math.round(ex.channels||2)), bits = Math.round(ex.bits||16);
  const buf = await _buf(f);
  const out = _pcmConvertBytes(buf, bits, (vals, n)=>{
    const per = Math.floor(n/nCh), bytesPer = bits/8, res = new Uint8Array(per*nCh*bytesPer);
    for(let c=0;c<nCh;c++) for(let i=0;i<per;i++){ const v=vals[c*per+i]; const o=(i*nCh+c)*bytesPer;
      if(bits===16){ res[o]=v&255; res[o+1]=(v>>8)&255; }
      else if(bits===8){ res[o]=v&255; }
      else if(bits===24){ res[o]=v&255; res[o+1]=(v>>8)&255; res[o+2]=(v>>16)&255; }
      else if(bits===32){ new DataView(res.buffer).setFloat32(o, v, true); } }
    return res;
  });
  return _out(new Blob([out],{type:'application/octet-stream'}), f, 'pcm');
};
SPECIAL.s16ToF32 = async (f)=>{
  const buf = await _buf(f), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Float32Array(Math.floor(buf.length/2));
  for(let i=0;i<out.length;i++) out[i]=dv.getInt16(i*2,true)/32768;
  return _out(new Blob([out.buffer],{type:'application/octet-stream'}), f, 'pcm');
};
SPECIAL.f32ToS16 = async (f)=>{
  const buf = await _buf(f), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Int16Array(Math.floor(buf.length/4));
  for(let i=0;i<out.length;i++) out[i]=Math.max(-32768, Math.min(32767, Math.round(dv.getFloat32(i*4,true)*32767)));
  return _out(new Blob([out.buffer],{type:'application/octet-stream'}), f, 'pcm');
};
SPECIAL.s24ToF32 = async (f)=>{
  const buf = await _buf(f);
  const out = new Float32Array(Math.floor(buf.length/3));
  for(let i=0;i<out.length;i++){ const o=i*3; let v=buf[o]|(buf[o+1]<<8)|(buf[o+2]<<16); if(v&0x800000) v-=0x1000000; out[i]=v/8388608; }
  return _out(new Blob([out.buffer],{type:'application/octet-stream'}), f, 'pcm');
};
SPECIAL.f32ToS24 = async (f)=>{
  const buf = await _buf(f), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = Math.floor(buf.length/4), out = new Uint8Array(n*3);
  for(let i=0;i<n;i++){ let v=Math.max(-8388608, Math.min(8388607, Math.round(dv.getFloat32(i*4,true)*8388607))); if(v<0) v+=0x1000000; out[i*3]=v&255; out[i*3+1]=(v>>8)&255; out[i*3+2]=(v>>16)&255; }
  return _out(new Blob([out],{type:'application/octet-stream'}), f, 'pcm');
};
SPECIAL.u8ToS16 = async (f)=>{
  const buf = await _buf(f), out = new Int16Array(buf.length);
  for(let i=0;i<buf.length;i++) out[i]=(buf[i]-128)*256;
  return _out(new Blob([out.buffer],{type:'application/octet-stream'}), f, 'pcm');
};
SPECIAL.s16ToU8 = async (f)=>{
  const buf = await _buf(f), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Uint8Array(Math.floor(buf.length/2));
  for(let i=0;i<out.length;i++) out[i]=Math.max(0, Math.min(255, Math.round(dv.getInt16(i*2,true)/256)+128));
  return _out(new Blob([out],{type:'application/octet-stream'}), f, 'pcm');
};
SPECIAL.leToBe = async (f, ex)=> _endianSwap(f, ex.bits||16);
SPECIAL.beToLe = async (f, ex)=> _endianSwap(f, ex.bits||16);
async function _endianSwap(f, bits){
  const buf = await _buf(f), bytesPer = Math.max(1, Math.round(bits||16)/8), out = new Uint8Array(buf);
  for(let i=0;i+bytesPer<=buf.length;i+=bytesPer){ for(let j=0;j<bytesPer/2;j++){ const t=out[i+j]; out[i+j]=out[i+bytesPer-1-j]; out[i+bytesPer-1-j]=t; } }
  return _out(new Blob([out],{type:'application/octet-stream'}), f, 'pcm');
}
SPECIAL.resampleWav = async (f, ex)=>{
  const target = Math.round(ex.rate||48000);
  const w = _wavParse(await _buf(f));
  const chs = _deinterleave(w.samples, w.channels);
  const ratio = target/w.sampleRate, n2 = Math.max(1, Math.round(w.frames*ratio));
  const out = chs.map(ch=>{
    const o = new Float32Array(n2);
    for(let i=0;i<n2;i++){ const pos=i/ratio, i0=Math.floor(pos), frac=pos-i0; const a=ch[i0]||0, b=ch[Math.min(ch.length-1,i0+1)]||0; o[i]=a+(b-a)*frac; }
    return o;
  });
  return _out(_wavEncode(out, target), f, 'wav');
};
SPECIAL.jsonArrayToWav = async (f, ex)=>{
  const rate = Math.round(ex.rate||44100);
  const arr = JSON.parse(await f.text());
  if(!Array.isArray(arr) || !arr.length) throw new Error('Expected a JSON array of sample values.');
  const ch = new Float32Array(arr.map(Number));
  return _out(_wavEncode([ch], rate), f, 'wav');
};
SPECIAL.wavToJsonArray = async (f)=>{
  const w = _wavParse(await _buf(f));
  const arr = Array.from(w.samples, v=>+v.toFixed(6));
  return _txtOut(JSON.stringify(arr), f, 'json');
};
SPECIAL.ampToDb = (v)=> v>0 ? 20*Math.log10(v) : -Infinity;
SPECIAL.dbToAmp = (v)=> Math.pow(10, v/20);
SPECIAL.powerToDb = (v)=> v>0 ? 10*Math.log10(v) : -Infinity;
SPECIAL.dbToPower = (v)=> Math.pow(10, v/10);

/* ---------- cat 47: subtitles + timecodes ---------- */
function _srtTime(sec){
  sec = Math.max(0, sec);
  const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), s = Math.floor(sec%60), ms = Math.round((sec-Math.floor(sec))*1000);
  const p = (n,l)=>String(n).padStart(l,'0');
  return p(h,2)+':'+p(m,2)+':'+p(s,2)+','+p(ms===1000?0:ms,3);
}
function _vttTime(sec){ return _srtTime(sec).replace(',', '.'); }
function _parseTimecode(t){
  const m = String(t).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if(!m) return null;
  const h=+(m[1]||0), mi=+m[2], s=+m[3], frac=m[4]? +('0.'+m[4]) : 0;
  return h*3600+mi*60+s+frac;
}
function _parseSrt(text){
  const cues = [];
  String(text).replace(/\r\n?/g,'\n').split(/\n\s*\n/).forEach(block=>{
    const lines = block.split('\n').filter(l=>l.trim()!=='');
    if(lines.length<2) return;
    let ti = 0;
    if(/^\d+$/.test(lines[0].trim())) ti = 1;
    const m = lines[ti] && lines[ti].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if(!m) return;
    const start = _parseTimecode(m[1].replace(',','.')), end = _parseTimecode(m[2].replace(',','.'));
    if(start===null || end===null) return;
    cues.push({start, end, text: lines.slice(ti+1).join('\n')});
  });
  return cues;
}
function _cuesToSrt(cues){ return cues.map((c,i)=> (i+1)+'\n'+_srtTime(c.start)+' --> '+_srtTime(c.end)+'\n'+c.text).join('\n\n') + (cues.length?'\n':''); }
function _cuesToVtt(cues){ return 'WEBVTT\n\n' + cues.map(c=> _vttTime(c.start)+' --> '+_vttTime(c.end)+'\n'+c.text).join('\n\n') + (cues.length?'\n':''); }
function _parseVtt(text){
  const t = String(text).replace(/\r\n?/g,'\n').replace(/^WEBVTT[^\n]*\n/,'');
  const cues = [];
  t.split(/\n\s*\n/).forEach(block=>{
    const lines = block.split('\n').filter(l=>l.trim()!=='');
    if(!lines.length) return;
    let ti = 0;
    if(lines[0].indexOf('-->')<0) ti = 1;
    const m = lines[ti] && lines[ti].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if(!m) return;
    const start=_parseTimecode(m[1]), end=_parseTimecode(m[2]);
    if(start===null||end===null) return;
    cues.push({start, end, text: lines.slice(ti+1).join('\n').replace(/<[^>]+>/g,'')});
  });
  return cues;
}
function _stripAssTags(s){ return s.replace(/\{[^}]*\}/g,'').replace(/\\N/g,'\n').replace(/\\n/g,'\n').replace(/\\h/g,' '); }
function _assTimeToSec(t){
  const m = String(t).trim().match(/^(\d+):(\d{2}):(\d{2})[.:](\d{1,2})$/);
  if(!m) return null;
  return +m[1]*3600 + +m[2]*60 + +m[3] + +m[4]/100;
}
function _parseAss(text){
  const cues = [];
  String(text).replace(/\r\n?/g,'\n').split('\n').forEach(line=>{
    if(!/^Dialogue:/i.test(line)) return;
    const body = line.slice(9);
    const parts = body.split(',');
    if(parts.length<10) return;
    const start=_assTimeToSec(parts[1]), end=_assTimeToSec(parts[2]);
    if(start===null||end===null) return;
    cues.push({start, end, text:_stripAssTags(parts.slice(9).join(','))});
  });
  return cues;
}
function _cuesToAss(cues){
  const head = '[Script Info]\nTitle: Converted subtitles\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  const fmt = (s)=>{ const h=Math.floor(s/3600), m=Math.floor(s%3600/60), ss=Math.floor(s%60), cc=Math.round((s-Math.floor(s))*100); return h+':'+String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0')+'.'+String(cc).padStart(2,'0'); };
  return head + cues.map(c=> 'Dialogue: 0,'+fmt(c.start)+','+fmt(c.end)+',Default,,0,0,0,,'+c.text.replace(/\n/g,'\\N')).join('\n') + (cues.length?'\n':'');
}
function _cuesToSsa(cues){
  const head = '[Script Info]\nTitle: Converted subtitles\nScriptType: v4.00\nPlayResX: 1280\nPlayResY: 720\n\n[V4 Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding\nStyle: Default,Arial,20,16777215,0,0,0,0,0,1,2,0,2,10,10,10,0,1\n\n[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  const fmt = (s)=>{ const h=Math.floor(s/3600), m=Math.floor(s%3600/60), ss=Math.floor(s%60), cc=Math.round((s-Math.floor(s))*100); return h+':'+String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0')+'.'+String(cc).padStart(2,'0'); };
  return head + cues.map(c=> 'Dialogue: Marked=0,'+fmt(c.start)+','+fmt(c.end)+',Default,,0,0,0,,'+c.text.replace(/\n/g,'\\N')).join('\n') + (cues.length?'\n':'');
}
SPECIAL.srtToVtt = (t)=>{ const c=_parseSrt(t); if(!c.length) throw new Error('No SRT cues found.'); return _cuesToVtt(c); };
SPECIAL.vttToSrt = (t)=>{ const c=_parseVtt(t); if(!c.length) throw new Error('No WebVTT cues found.'); return _cuesToSrt(c); };
SPECIAL.assToSrt = (t)=>{ const c=_parseAss(t); if(!c.length) throw new Error('No ASS Dialogue lines found.'); return _cuesToSrt(c); };
SPECIAL.srtToAss = (t)=>{ const c=_parseSrt(t); if(!c.length) throw new Error('No SRT cues found.'); return _cuesToAss(c); };
SPECIAL.ssaToAss = (t)=>{ const c=_parseAss(t); if(!c.length) throw new Error('No SSA Dialogue lines found.'); return _cuesToAss(c); };
SPECIAL.assToSsa = (t)=>{ const c=_parseAss(t); if(!c.length) throw new Error('No ASS Dialogue lines found.'); return _cuesToSsa(c); };
SPECIAL.ttmlToVtt = (t)=>{
  const cues = [];
  const re = /<p[^>]*\bbegin="([^"]+)"[^>]*\bend="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  const parseTt = (s)=>{ s=String(s).trim(); if(/^\d+(\.\d+)?s$/.test(s)) return parseFloat(s); if(/^\d+(\.\d+)?$/.test(s)) return parseFloat(s); return _parseTimecode(s.replace(/(\d),(\d)/,'$1.$2')); };
  while((m=re.exec(t))){ const s=parseTt(m[1]), e=parseTt(m[2]); if(s===null||e===null) continue; cues.push({start:s, end:e, text:m[3].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim()}); }
  if(!cues.length) throw new Error('No TTML <p> cues found.');
  return _cuesToVtt(cues);
};
SPECIAL.vttToTtml = (t)=>{
  const c=_parseVtt(t); if(!c.length) throw new Error('No WebVTT cues found.');
  const esc = (s)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const body = c.map(x=> '    <p begin="'+_vttTime(x.start)+'" end="'+_vttTime(x.end)+'">'+esc(x.text)+'</p>').join('\n');
  return '<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en">\n  <body>\n    <div>\n'+body+'\n    </div>\n  </body>\n</tt>';
};
SPECIAL.lrcToSrt = (t, ex)=>{
  const finalDur = ex.finalDur ?? 5;
  const lines = [];
  String(t).split(/\r?\n/).forEach(line=>{
    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if(m) lines.push({t: +m[1]*60 + +m[2], text: m[3].trim()});
  });
  if(!lines.length) throw new Error('No LRC lines found (expected [mm:ss.xx] text).');
  const cues = lines.map((l,i)=>({start:l.t, end: i+1<lines.length ? lines[i+1].t : l.t+finalDur, text:l.text}));
  return _cuesToSrt(cues);
};
SPECIAL.srtToLrc = (t)=>{
  const c=_parseSrt(t); if(!c.length) throw new Error('No SRT cues found.');
  return c.map(x=>{ const m=Math.floor(x.start/60), s=x.start%60; return '['+String(m).padStart(2,'0')+':'+s.toFixed(2).padStart(5,'0')+']'+x.text.replace(/\n/g,' '); }).join('\n');
};
SPECIAL.srtToText = (t)=>{ const c=_parseSrt(t); if(!c.length) throw new Error('No SRT cues found.'); return c.map(x=>x.text).join('\n'); };
SPECIAL.vttToText = (t)=>{ const c=_parseVtt(t); if(!c.length) throw new Error('No WebVTT cues found.'); return c.map(x=>x.text).join('\n'); };
SPECIAL.srtToJson = (t)=>{ const c=_parseSrt(t); if(!c.length) throw new Error('No SRT cues found.'); return JSON.stringify(c.map(x=>({start:+x.start.toFixed(3), end:+x.end.toFixed(3), text:x.text})), null, 2); };
SPECIAL.jsonToSrt = (t)=>{
  let arr; try { arr=JSON.parse(t); } catch(e){ throw new Error('Not valid JSON. Expected [{"start":0,"end":2,"text":"..."}].'); }
  if(!Array.isArray(arr) || !arr.length) throw new Error('Expected a JSON array of cues.');
  return _cuesToSrt(arr.map(c=>({start:+c.start, end:+c.end, text:String(c.text||'')})));
};
SPECIAL.vttToJson = (t)=>{ const c=_parseVtt(t); if(!c.length) throw new Error('No WebVTT cues found.'); return JSON.stringify(c.map(x=>({start:+x.start.toFixed(3), end:+x.end.toFixed(3), text:x.text})), null, 2); };
SPECIAL.jsonToVtt = (t)=>{
  let arr; try { arr=JSON.parse(t); } catch(e){ throw new Error('Not valid JSON. Expected [{"start":0,"end":2,"text":"..."}].'); }
  if(!Array.isArray(arr) || !arr.length) throw new Error('Expected a JSON array of cues.');
  return _cuesToVtt(arr.map(c=>({start:+c.start, end:+c.end, text:String(c.text||'')})));
};
SPECIAL.framesToNdf = (v, ex)=>{
  const fps = ex.fps ?? 24, f = Math.max(0, Math.round(v));
  const ff = f % fps, s = Math.floor(f/fps)%60, m = Math.floor(f/fps/60)%60, h = Math.floor(f/fps/3600);
  const p = (n)=>String(n).padStart(2,'0');
  return p(h)+':'+p(m)+':'+p(s)+':'+p(ff);
};
SPECIAL.ndfToFrames = (t, ex)=>{
  const fps = ex.fps ?? 24;
  const m = String(t).trim().match(/^(\d+):(\d+):(\d+):(\d+)$/);
  if(!m) throw new Error('Enter a timecode like 01:00:00:00 (HH:MM:SS:FF).');
  return String(((+m[1]*3600 + +m[2]*60 + +m[3])*fps + +m[4]));
};
SPECIAL.framesToDf = (v)=>{
  const f = Math.max(0, Math.round(v));
  const fpsN = 30, df = 2;
  const fpm = 60*fpsN - df, fp10 = 10*fpm + df;
  const tenMin = Math.floor(f/fp10);
  let rem = f - tenMin*fp10;
  const mins = Math.floor(rem/fpm);
  rem -= mins*fpm;
  const totalMin = tenMin*10 + mins;
  const dropped = df*(totalMin - Math.floor(totalMin/10));
  const nominal = tenMin*10*60*fpsN + mins*60*fpsN + rem + dropped;
  const ff = nominal%fpsN, s = Math.floor(nominal/fpsN)%60, m = Math.floor(nominal/fpsN/60)%60, h = Math.floor(nominal/fpsN/3600);
  const p = (n)=>String(n).padStart(2,'0');
  return p(h)+':'+p(m)+':'+p(s)+';'+p(ff);
};
SPECIAL.dfToFrames = (t)=>{
  const m = String(t).trim().match(/^(\d+):(\d+):(\d+)[;:](\d+)$/);
  if(!m) throw new Error('Enter a drop-frame timecode like 01:00:00;00 (HH:MM:SS;FF).');
  const totalMin = +m[1]*60 + +m[2];
  const nominal = ((+m[1]*3600 + +m[2]*60 + +m[3])*30 + +m[4]);
  const dropped = 2*(totalMin - Math.floor(totalMin/10));
  return String(nominal - dropped);
};

/* ---------- cat 48: video ---------- */
SPECIAL.noteMp4Webm = _mkNote('MP4 to WebM — not possible in a browser', _NOTE_VIDEO + '\n\nFFmpeg example:  ffmpeg -i input.mp4 -c:v libvpx-vp9 -c:a libopus output.webm');
SPECIAL.noteWebmMp4 = _mkNote('WebM to MP4 — not possible in a browser', _NOTE_VIDEO + '\n\nFFmpeg example:  ffmpeg -i input.webm -c:v libx264 -c:a aac output.mp4');
SPECIAL.noteMovMp4 = _mkNote('MOV to MP4 — not possible in a browser', _NOTE_VIDEO + '\n\nFFmpeg example:  ffmpeg -i input.mov -c copy output.mp4');
SPECIAL.noteAviMp4 = _mkNote('AVI to MP4 — not possible in a browser', _NOTE_VIDEO + '\n\nFFmpeg example:  ffmpeg -i input.avi -c:v libx264 -c:a aac output.mp4');
SPECIAL.noteMkvMp4 = _mkNote('MKV to MP4 — not possible in a browser', _NOTE_VIDEO + '\n\nFFmpeg example:  ffmpeg -i input.mkv -c:v libx264 -c:a aac output.mp4');
SPECIAL.noteGifMp4 = _mkNote('Animated GIF to MP4 — not possible in a browser', _NOTE_VIDEO + '\n\nFFmpeg example:  ffmpeg -i input.gif -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" output.mp4');
SPECIAL.noteMp4AudioMp3 = _mkNote('MP4 audio to MP3 — not possible in a browser', _NOTE_AUDIO_ENC + '\n\nFFmpeg example:  ffmpeg -i input.mp4 -vn -c:a libmp3lame output.mp3');
SPECIAL.noteWavImgMp4 = _mkNote('WAV + still image to MP4 — not possible in a browser', _NOTE_VIDEO + '\n\nFFmpeg example:  ffmpeg -loop 1 -i image.png -i audio.wav -c:v libx264 -tune stillimage -c:a aac -shortest output.mp4');
async function _loadVideo(file){
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await new Promise((res, rej)=>{ v.onloadedmetadata=res; v.onerror=()=>rej(new Error('Could not load this video file in this browser.')); });
  return {v, url};
}
async function _sampleVideoFrames(file, fps, maxW, maxFrames){
  const {v, url} = await _loadVideo(file);
  try {
    if(!isFinite(v.duration) || v.duration<=0) throw new Error('Could not read this video\'s duration.');
    const total = Math.min(v.duration, maxFrames/fps);
    const n = Math.max(1, Math.floor(total*fps));
    const scale = Math.min(1, maxW/(v.videoWidth||maxW));
    const w = Math.max(2, Math.round((v.videoWidth||320)*scale)), h = Math.max(2, Math.round((v.videoHeight||240)*scale));
    const c = document.createElement('canvas'); c.width=w; c.height=h;
    const ctx = c.getContext('2d'), frames = [];
    for(let i=0;i<n;i++){
      v.currentTime = Math.min(v.duration-0.05, i/fps);
      await new Promise(res=>{ v.onseeked=res; setTimeout(res, 300); });
      ctx.drawImage(v, 0, 0, w, h);
      frames.push({w, h, rgba: ctx.getImageData(0,0,w,h).data});
    }
    return {frames, delay: Math.round(100/fps)};
  } finally { URL.revokeObjectURL(url); }
}
async function _videoToGif(file, fps){
  const {frames, delay} = await _sampleVideoFrames(file, fps||10, 320, 150);
  const gif = _gifEncode(frames, frames.map(()=>delay));
  return _out(new Blob([gif],{type:'image/gif'}), file, 'gif',
    frames.length>=150 ? 'Only the first 15 seconds were converted (150 frames).' : undefined);
}
SPECIAL.mp4ToGif = (f)=> _videoToGif(f, 10);
SPECIAL.webmToGif = (f)=> _videoToGif(f, 10);
function _gifDelays(buf){
  const delays = [];
  for(let i=0;i+6<buf.length;i++){
    if(buf[i]===0x21 && buf[i+1]===0xF9 && buf[i+2]===0x04){ delays.push(buf[i+4] | (buf[i+5]<<8)); }
  }
  return delays.length? delays : [10];
}
async function _sampleAnimatedImage(file, maxFrames){
  // Play the animated image in an <img> and sample its frames over time.
  const buf = await _buf(file);
  const isGif = buf[0]===0x47 && buf[1]===0x49 && buf[2]===0x46;
  let delays = [10];
  if(isGif) delays = _gifDelays(buf);
  else { // APNG: parse fcTL delays
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const d = [];
    let p = 8;
    while(p+8<=buf.length){ const len=dv.getUint32(p), type=String.fromCharCode(...buf.subarray(p+4,p+8));
      if(type==='fcTL' && p+8+26<=buf.length){ const num=dv.getUint16(p+8+20), den=dv.getUint16(p+8+22)||100; d.push(Math.max(1, Math.round(num/den*100))); }
      p += 12+len; }
    if(d.length) delays = d;
  }
  const total = delays.reduce((a,b)=>a+b,0)/100;
  const dur = Math.min(total, 30);
  const n = Math.max(1, Math.min(maxFrames||60, Math.round(dur*10)));
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((res, rej)=>{ img.onload=res; img.onerror=()=>rej(new Error('Could not decode this image file.')); img.src=url; });
  const scale = Math.min(1, 320/Math.max(img.width,1));
  const w = Math.max(2, Math.round(img.width*scale)), h = Math.max(2, Math.round(img.height*scale));
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const ctx = c.getContext('2d'), frames = [];
  for(let i=0;i<n;i++){
    ctx.clearRect(0,0,w,h); ctx.drawImage(img, 0, 0, w, h);
    frames.push({w, h, rgba: ctx.getImageData(0,0,w,h).data});
    await new Promise(r=>setTimeout(r, dur/n*1000));
  }
  URL.revokeObjectURL(url);
  return {frames, delay: Math.round(1000/(n/dur))/10, duration: dur};
}
async function _recordCanvas(canvas, fps, seconds, mime){
  if(typeof MediaRecorder==='undefined') throw new Error('MediaRecorder is not available in this browser.');
  const stream = canvas.captureStream(fps);
  const mimeOk = mime && MediaRecorder.isTypeSupported(mime) ? mime : undefined;
  const rec = new MediaRecorder(stream, mimeOk?{mimeType:mimeOk}:undefined);
  const chunks = [];
  const done = new Promise((res, rej)=>{ rec.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); }; rec.onstop=()=>res(new Blob(chunks,{type:rec.mimeType})); rec.onerror=()=>rej(new Error('Recording failed.')); });
  rec.start(250);
  await new Promise(r=>setTimeout(r, seconds*1000));
  if(rec.state!=='inactive') rec.stop();
  return done;
}
SPECIAL.gifToWebm = async (f)=>{
  const {frames, delay, duration} = await _sampleAnimatedImage(f, 100);
  const c = document.createElement('canvas'); c.width=frames[0].w; c.height=frames[0].h;
  const ctx = c.getContext('2d');
  const put = (fr)=>{ const img = new ImageData(new Uint8ClampedArray(fr.rgba), fr.w, fr.h); ctx.putImageData(img, 0, 0); };
  put(frames[0]);
  const fps = Math.max(2, Math.min(30, Math.round(100/delay)));
  const recP = _recordCanvas(c, fps, duration, 'video/webm;codecs=vp9');
  const step = 1000/fps;
  for(let t=0; t<duration*1000; t+=step){ const fi = Math.min(frames.length-1, Math.floor(t/1000*fps)); put(frames[fi]); await new Promise(r=>setTimeout(r, step)); }
  const blob = await recP;
  return _out(blob, f, 'webm');
};
SPECIAL.webpAnimToGif = async (f)=>{
  const c = await _canvasFromFile(f);
  const rgba = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  const gif = _gifEncode([{w:c.width, h:c.height, rgba}], [10]);
  return _out(new Blob([gif],{type:'image/gif'}), f, 'gif',
    'Only the first frame was converted: browsers cannot extract the individual frames of an animated WebP.');
};
SPECIAL.gifToWebpAnim = async (f)=>{
  const c = await _canvasFromFile(f);
  const blob = await _canvasBlob(c, 'image/webp', 0.92);
  return _out(blob, f, 'webp',
    'Only the first frame was converted: browsers cannot encode animated WebP.');
};
SPECIAL.apngToGif = async (f)=>{
  const {frames, delay} = await _sampleAnimatedImage(f, 100);
  const gif = _gifEncode(frames, frames.map(()=>delay));
  return _out(new Blob([gif],{type:'image/gif'}), f, 'gif');
};
SPECIAL.gifToApng = async (f)=>{
  const {frames} = await _sampleAnimatedImage(f, 60);
  const w = frames[0].w, h = frames[0].h;
  const ihdr = new DataView(new ArrayBuffer(13));
  ihdr.setUint32(0,w); ihdr.setUint32(4,h); ihdr.setUint8(8,8); ihdr.setUint8(9,6);
  const chunks = [new Uint8Array([137,80,78,71,13,10,26,10]), _pngChunk('IHDR', new Uint8Array(ihdr.buffer))];
  const actl = new DataView(new ArrayBuffer(8));
  actl.setUint32(0, frames.length); actl.setUint32(4, 0);
  chunks.push(_pngChunk('acTL', new Uint8Array(actl.buffer)));
  let seq = 0;
  for(let i=0;i<frames.length;i++){
    const fctl = new DataView(new ArrayBuffer(26));
    fctl.setUint32(0, seq++); fctl.setUint32(4, w); fctl.setUint32(8, h);
    fctl.setUint32(12, 0); fctl.setUint32(16, 0);
    fctl.setUint16(20, 10); fctl.setUint16(22, 100);
    fctl.setUint8(24, 0); fctl.setUint8(25, 0);
    chunks.push(_pngChunk('fcTL', new Uint8Array(fctl.buffer)));
    const idat = await _pngIdat(w, h, frames[i].rgba);
    if(i===0){ chunks.push(_pngChunk('IDAT', idat)); }
    else {
      const fd = new Uint8Array(4+idat.length); const fdv = new DataView(fd.buffer);
      fdv.setUint32(0, seq++); fd.set(idat, 4);
      chunks.push(_pngChunk('fdAT', fd));
    }
  }
  chunks.push(_pngChunk('IEND', new Uint8Array(0)));
  const total = chunks.reduce((a,p)=>a+p.length,0), all = new Uint8Array(total);
  let o=0; chunks.forEach(p=>{ all.set(p,o); o+=p.length; });
  return _out(new Blob([all],{type:'image/png'}), f, 'png');
};
SPECIAL.mp4AudioToWav = async (f)=>{
  try { return await _decodedToWav(f); }
  catch(e){ return _noteFile(f, 'MP4 audio to WAV — could not decode in this browser',
    'This browser could not decode the audio track of this MP4 file.\n\nUse the free desktop tool Audacity (https://www.audacityteam.org) or FFmpeg (https://ffmpeg.org):\n  ffmpeg -i input.mp4 -vn -c:a pcm_s16le output.wav'); }
};
async function _frameToPngBlob(fr){
  const c = document.createElement('canvas'); c.width=fr.w; c.height=fr.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(fr.rgba), fr.w, fr.h), 0, 0);
  return _canvasBlob(c, 'image/png');
}
async function _pngZipFrames(f){
  const es = await _zipRead(await _buf(f));
  const pngs = es.filter(e=>/\.png$/i.test(e.name) && !e.name.endsWith('/')).sort((a,b)=>a.name.localeCompare(b.name));
  if(!pngs.length) throw new Error('No PNG files found in this ZIP (upload a ZIP of PNG frames).');
  const frames = [];
  for(const e of pngs){
    const c = await _canvasFromFile(new Blob([e.data], {type:'image/png'}));
    frames.push({w:c.width, h:c.height, rgba:c.getContext('2d').getImageData(0,0,c.width,c.height).data});
  }
  return frames;
}
SPECIAL.pngZipToGif = async (f, ex)=>{
  const fps = Math.max(1, Math.min(30, Math.round(ex.fps||10)));
  const frames = await _pngZipFrames(f);
  const gif = _gifEncode(frames, frames.map(()=>Math.round(100/fps)));
  return _out(new Blob([gif],{type:'image/gif'}), f, 'gif');
};
SPECIAL.gifToPngZip = async (f)=>{
  const {frames} = await _sampleAnimatedImage(f, 100);
  const entries = [];
  for(let i=0;i<frames.length;i++) entries.push({name:'frame-'+String(i+1).padStart(3,'0')+'.png', data:new Uint8Array(await (await _frameToPngBlob(frames[i])).arrayBuffer())});
  return _out(new Blob([await _zipWrite(entries)],{type:'application/zip'}), f, 'zip');
};
SPECIAL.pngZipToWebm = async (f, ex)=>{
  const fps = Math.max(1, Math.min(30, Math.round(ex.fps||10)));
  const frames = await _pngZipFrames(f);
  const c = document.createElement('canvas'); c.width=frames[0].w; c.height=frames[0].h;
  const ctx = c.getContext('2d');
  const put = (fr)=> ctx.putImageData(new ImageData(new Uint8ClampedArray(fr.rgba), fr.w, fr.h), 0, 0);
  put(frames[0]);
  const dur = frames.length/fps;
  const recP = _recordCanvas(c, fps, dur, 'video/webm;codecs=vp9');
  const step = 1000/fps;
  for(let t=0; t<dur*1000; t+=step){ put(frames[Math.min(frames.length-1, Math.floor(t/1000*fps))]); await new Promise(r=>setTimeout(r, step)); }
  return _out(await recP, f, 'webm');
};
SPECIAL.webmToPngZip = async (f)=>{
  const {frames} = await _sampleVideoFrames(f, 10, 640, 100);
  const entries = [];
  for(let i=0;i<frames.length;i++) entries.push({name:'frame-'+String(i+1).padStart(3,'0')+'.png', data:new Uint8Array(await (await _frameToPngBlob(frames[i])).arrayBuffer())});
  return _out(new Blob([await _zipWrite(entries)],{type:'application/zip'}), f, 'zip');
};

/* ---------- cat 49: web / developer formats ---------- */
function _b64encode(u8){ let bin=''; const CH=0x8000; for(let i=0;i<u8.length;i+=CH) bin += String.fromCharCode.apply(null, u8.subarray(i,i+CH)); return btoa(bin); }
function _b64decode(s){ const bin = atob(String(s).replace(/\s/g,'')); const u8 = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); return u8; }
SPECIAL.textToUrlEnc = (t)=> encodeURIComponent(t);
SPECIAL.urlEncToText = (t)=> decodeURIComponent(t);
SPECIAL.b64ToB64url = (t)=> String(t).trim().replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
SPECIAL.b64urlToB64 = (t)=>{ let s=String(t).trim().replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; return s; };
SPECIAL.binToB64 = async (f)=> _txtOut(_b64encode(await _buf(f)), f, 'txt');
SPECIAL.b64ToBin = async (f)=>{
  let bytes;
  try { bytes = _b64decode(await f.text()); } catch(e){ throw new Error('Not valid Base64 text.'); }
  return _out(new Blob([bytes],{type:'application/octet-stream'}), f, 'bin');
};
SPECIAL.binToHex = async (f)=>{
  const buf = await _buf(f), lines = [];
  for(let o=0;o<buf.length;o+=16){
    const row = buf.subarray(o, o+16);
    lines.push(String(o).padStart(8,'0') + '  ' + Array.from(row, b=>b.toString(16).padStart(2,'0')).join(' '));
  }
  return _txtOut(lines.join('\n') || '(empty file)', f, 'txt');
};
SPECIAL.hexToBin = async (f)=>{
  const hex = (await f.text()).replace(/[^0-9a-fA-F]/g, '');
  if(hex.length%2) throw new Error('Hex dump has an odd number of digits.');
  const out = new Uint8Array(hex.length/2);
  for(let i=0;i<out.length;i++) out[i]=parseInt(hex.substr(i*2,2),16);
  return _out(new Blob([out],{type:'application/octet-stream'}), f, 'bin');
};
SPECIAL.binToCArray = async (f)=>{
  const buf = await _buf(f), name = _base(f.name).replace(/[^A-Za-z0-9_]/g,'_')||'data';
  const lines = ['unsigned char '+name+'[] = {'];
  for(let o=0;o<buf.length;o+=12){ lines.push('  '+Array.from(buf.subarray(o,o+12), b=>'0x'+b.toString(16).padStart(2,'0')).join(', ')+','); }
  lines.push('};', 'unsigned int '+name+'_len = '+buf.length+';');
  return _txtOut(lines.join('\n'), f, 'h');
};
SPECIAL.cArrayToBin = async (f)=>{
  const text = await f.text();
  const m = text.match(/\{([\s\S]*?)\}/);
  if(!m) throw new Error('No { ... } array found in this file.');
  const nums = m[1].match(/(0x[0-9a-fA-F]+|\d+)/g);
  if(!nums) throw new Error('No numbers found inside { }.');
  const out = new Uint8Array(nums.map(s=> s.startsWith('0x')||s.startsWith('0X') ? parseInt(s,16) : parseInt(s,10)));
  return _out(new Blob([out],{type:'application/octet-stream'}), f, 'bin');
};
SPECIAL.binToUint8 = async (f)=>{
  const buf = await _buf(f);
  const lines = ['const data = new Uint8Array(['];
  for(let o=0;o<buf.length;o+=12){ lines.push('  '+Array.from(buf.subarray(o,o+12)).join(', ')+','); }
  lines.push(']);');
  return _txtOut(lines.join('\n'), f, 'js');
};
SPECIAL.uint8ToBin = async (f)=>{
  const text = await f.text();
  const m = text.match(/\[([\s\S]*?)\]/);
  if(!m) throw new Error('No [ ... ] array found in this file.');
  const nums = m[1].match(/(0x[0-9a-fA-F]+|-?\d+)/g);
  if(!nums) throw new Error('No numbers found inside [ ].');
  const out = new Uint8Array(nums.map(s=> (s.startsWith('0x')||s.startsWith('0X') ? parseInt(s,16) : parseInt(s,10)) & 255));
  return _out(new Blob([out],{type:'application/octet-stream'}), f, 'bin');
};
SPECIAL.svgToDataUrl = async (f)=>{
  const svg = await f.text();
  return _txtOut('data:image/svg+xml,'+encodeURIComponent(svg), f, 'txt');
};
SPECIAL.dataUrlToSvg = (t)=>{
  const s = String(t).trim();
  const m = s.match(/^data:image\/svg\+xml(;base64)?,(.*)$/s);
  if(!m) throw new Error('Not an SVG data URL (expected data:image/svg+xml,...).');
  return m[1] ? new TextDecoder().decode(_b64decode(m[2])) : decodeURIComponent(m[2]);
};
SPECIAL.cssToJs = (t)=>{
  const obj = {};
  String(t).split(';').forEach(decl=>{
    const i = decl.indexOf(':'); if(i<0) return;
    const prop = decl.slice(0,i).trim(), val = decl.slice(i+1).trim();
    if(!prop || !val) return;
    obj[prop.replace(/-([a-z])/g, (_,c)=>c.toUpperCase())] = val;
  });
  if(!Object.keys(obj).length) throw new Error('No CSS declarations found (expected "property: value; ...").');
  return '{\n' + Object.entries(obj).map(([k,v])=> '  '+k+": '"+v.replace(/'/g,"\\'")+"',").join('\n') + '\n}';
};
SPECIAL.jsToCss = (t)=>{
  const obj = {};
  const body = String(t).replace(/^\s*\{/, '').replace(/\}\s*$/, '');
  body.split(/[\n,]+/).forEach(line=>{
    const m = line.match(/^\s*['"]?([A-Za-z0-9_$]+)['"]?\s*:\s*['"](.*?)['"]\s*$/);
    if(m) obj[m[1]] = m[2];
  });
  if(!Object.keys(obj).length) throw new Error('No style object entries found (expected { backgroundColor: "red", ... }).');
  return Object.entries(obj).map(([k,v])=> k.replace(/([A-Z])/g, '-$1').toLowerCase() + ': ' + v + ';').join('\n');
};
function _harEntries(t){
  let har; try { har = JSON.parse(t); } catch(e){ throw new Error('Not valid JSON. Paste a HAR archive.'); }
  const entries = har.log && har.log.entries;
  if(!Array.isArray(entries) || !entries.length) throw new Error('No requests found in this HAR file.');
  return entries;
}
SPECIAL.harToCsv = async (f)=>{
  const entries = _harEntries(await f.text());
  const esc = (s)=> '"'+String(s??'').replace(/"/g,'""')+'"';
  const lines = ['method,url,status,size,time_ms'];
  entries.forEach(e=> lines.push([e.request.method, esc(e.request.url), e.response.status, e.response.content && e.response.content.size, Math.round(e.time)].join(',')));
  return _txtOut(lines.join('\n'), f, 'csv');
};
SPECIAL.harToJson = async (f)=>{
  const entries = _harEntries(await f.text());
  const out = entries.map(e=>({method:e.request.method, url:e.request.url, status:e.response.status, size:e.response.content&&e.response.content.size, time:Math.round(e.time)}));
  return _txtOut(JSON.stringify(out, null, 2), f, 'json');
};
SPECIAL.jsonContactsToVcard = (t)=>{
  let arr; try { arr = JSON.parse(t); } catch(e){ throw new Error('Not valid JSON. Expected [{"name":"...","email":"..."}].'); }
  if(!Array.isArray(arr)) arr = [arr];
  if(!arr.length) throw new Error('No contacts found.');
  const cards = arr.map(c=>{
    const lines = ['BEGIN:VCARD','VERSION:3.0'];
    if(c.name) lines.push('FN:'+c.name);
    if(c.firstName || c.lastName) lines.push('N:'+(c.lastName||'')+';'+(c.firstName||'')+';;;');
    if(c.org) lines.push('ORG:'+c.org);
    if(c.title) lines.push('TITLE:'+c.title);
    if(c.email) lines.push('EMAIL:'+c.email);
    if(c.phone) lines.push('TEL:'+c.phone);
    if(c.url) lines.push('URL:'+c.url);
    if(c.address) lines.push('ADR:;;'+c.address+';;;;');
    if(c.note) lines.push('NOTE:'+c.note);
    lines.push('END:VCARD');
    return lines.join('\n');
  });
  return cards.join('\n');
};
SPECIAL.vcardToJson = (t)=>{
  const out = [];
  String(t).split(/BEGIN:VCARD/i).forEach(block=>{
    if(!/END:VCARD/i.test(block)) return;
    const c = {};
    block.split(/\r?\n/).forEach(line=>{
      const m = line.match(/^([A-Za-z]+)(?:;[^:]*)?:(.*)$/);
      if(!m) return;
      const k = m[1].toUpperCase(), v = m[2].trim();
      if(k==='FN') c.name = v;
      else if(k==='EMAIL') c.email = v;
      else if(k==='TEL') c.phone = v;
      else if(k==='ORG') c.org = v;
      else if(k==='TITLE') c.title = v;
      else if(k==='URL') c.url = v;
      else if(k==='NOTE') c.note = v;
      else if(k==='ADR') c.address = v.split(';').filter(Boolean).join(', ');
      else if(k==='N'){ const p=v.split(';'); c.lastName=p[0]; c.firstName=p[1]; }
    });
    if(Object.keys(c).length) out.push(c);
  });
  if(!out.length) throw new Error('No vCard contacts found.');
  return JSON.stringify(out, null, 2);
};

/* ---------- cat 50: archives ---------- */
async function _inflateRaw(u8){ const s=new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function _deflateRaw(u8){ const s=new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function _zipRead(buf){
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for(let i=buf.length-22;i>=Math.max(0, buf.length-65557);i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) throw new Error('Not a ZIP archive (end-of-central-directory record not found).');
  const n = dv.getUint16(eocd+10, true);
  let p = dv.getUint32(eocd+16, true);
  const entries = [];
  for(let k=0;k<n;k++){
    if(dv.getUint32(p,true)!==0x02014b50) throw new Error('Corrupt ZIP central directory.');
    const method = dv.getUint16(p+10,true), crc = dv.getUint32(p+16,true);
    const compSize = dv.getUint32(p+20,true), size = dv.getUint32(p+24,true);
    const nameLen = dv.getUint16(p+28,true), extraLen = dv.getUint16(p+30,true), comLen = dv.getUint16(p+32,true);
    const lho = dv.getUint32(p+42,true);
    const name = new TextDecoder().decode(buf.subarray(p+46, p+46+nameLen));
    const lhNameLen = dv.getUint16(lho+26,true), lhExtraLen = dv.getUint16(lho+28,true);
    const dataOff = lho+30+lhNameLen+lhExtraLen;
    const comp = buf.subarray(dataOff, dataOff+compSize);
    let data;
    if(method===0) data = comp.slice();
    else if(method===8) data = await _inflateRaw(comp);
    else throw new Error('Unsupported ZIP compression method '+method+' for "'+name+'".');
    if(data.length!==size) throw new Error('Size mismatch in ZIP entry "'+name+'".');
    entries.push({name, data, crc, size, compSize, method});
    p += 46+nameLen+extraLen+comLen;
  }
  return entries;
}
async function _zipWrite(entries){
  const local = [], central = [];
  let offset = 0;
  for(const e of entries){
    const nameB = new TextEncoder().encode(e.name);
    const crc = _crc32(e.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, e.data.length, true); lh.setUint32(22, e.data.length, true);
    lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    local.push(new Uint8Array(lh.buffer), nameB, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, e.data.length, true); ch.setUint32(24, e.data.length, true);
    ch.setUint16(28, nameB.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30+nameB.length+e.data.length;
  }
  const cdSize = central.reduce((a,p)=>a+p.length,0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(eocd.buffer)];
  const total = parts.reduce((a,p)=>a+p.length,0), all = new Uint8Array(total);
  let o=0; parts.forEach(p=>{ all.set(p,o); o+=p.length; });
  return all;
}
function _tarRead(buf){
  const dec = new TextDecoder();
  const entries = [];
  let p = 0, longName = null;
  const oct = (o,n)=>{ const s = dec.decode(buf.subarray(o, o+n)).replace(/\0.*$/,'').trim(); return s? parseInt(s,8) : 0; };
  while(p+512 <= buf.length){
    const name = dec.decode(buf.subarray(p, p+100)).replace(/\0.*$/,'');
    if(!name) break;
    const size = oct(p+124, 12), type = String.fromCharCode(buf[p+156]||48);
    const prefix = dec.decode(buf.subarray(p+345, p+500)).replace(/\0.*$/,'');
    const fullName = (prefix? prefix+'/' : '') + name;
    const dataOff = p+512, data = buf.subarray(dataOff, dataOff+size);
    if(type==='L'){ longName = dec.decode(data).replace(/\0.*$/,''); }
    else if(type==='0' || type==='\0' || type===''){ entries.push({name: longName||fullName, data: data.slice()}); longName=null; }
    else if(type==='x' || type==='g'){ /* extended header: skip */ }
    p = dataOff + Math.ceil(size/512)*512;
  }
  return entries;
}
function _tarWrite(entries){
  const parts = [];
  const enc = new TextEncoder();
  entries.forEach(e=>{
    const hdr = new Uint8Array(512);
    const put = (o, s, n)=>{ const b = enc.encode(s); hdr.set(b.subarray(0,n), o); };
    const putOct = (o, v, n)=>{ put(o, v.toString(8).padStart(n-1,'0'), n); };
    let name = e.name;
    if(name.length>100){ const i = name.lastIndexOf('/', 100); if(i>0){ put(345, name.slice(0,i), 155); name = name.slice(i+1); } }
    put(0, name, 100); putOct(100, 0o644, 8); putOct(108, 0, 8); putOct(116, 0, 8);
    putOct(124, e.data.length, 12); putOct(136, Math.floor(Date.now()/1000), 12);
    hdr.set([32,32,32,32,32,32,32,32], 148);
    put(156, '0', 1); put(257, 'ustar', 6); put(263, '00', 2);
    let sum = 0; hdr.forEach(b=>sum+=b);
    put(148, sum.toString(8).padStart(6,'0')+'\0 ', 8);
    parts.push(hdr, e.data, new Uint8Array((512 - e.data.length%512)%512));
  });
  parts.push(new Uint8Array(1024));
  const total = parts.reduce((a,p)=>a+p.length,0), all = new Uint8Array(total);
  let o=0; parts.forEach(p=>{ all.set(p,o); o+=p.length; });
  return all;
}
async function _gunzip(u8){ const s=new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function _gzip(u8){ const s=new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip')); return new Uint8Array(await new Response(s).arrayBuffer()); }
SPECIAL.zipToTar = async (f)=>{ const es = await _zipRead(await _buf(f)); const files = es.filter(e=>!e.name.endsWith('/')); return _out(new Blob([_tarWrite(files.map(e=>({name:e.name, data:e.data})))],{type:'application/x-tar'}), f, 'tar'); };
SPECIAL.tarToZip = async (f)=>{ const es = _tarRead(await _buf(f)); return _out(new Blob([await _zipWrite(es)],{type:'application/zip'}), f, 'zip'); };
SPECIAL.zipToTargz = async (f)=>{ const es = await _zipRead(await _buf(f)); const files = es.filter(e=>!e.name.endsWith('/')); return _out(new Blob([await _gzip(_tarWrite(files.map(e=>({name:e.name, data:e.data}))))],{type:'application/gzip'}), f, 'tar.gz'); };
SPECIAL.targzToZip = async (f)=>{ const es = _tarRead(await _gunzip(await _buf(f))); return _out(new Blob([await _zipWrite(es)],{type:'application/zip'}), f, 'zip'); };
SPECIAL.tarToTargz = async (f)=>{ const b = await _buf(f); _tarRead(b); return _out(new Blob([await _gzip(b)],{type:'application/gzip'}), f, 'tar.gz'); };
SPECIAL.targzToTar = async (f)=>{ const b = await _gunzip(await _buf(f)); _tarRead(b); return _out(new Blob([b],{type:'application/x-tar'}), f, 'tar'); };
SPECIAL.noteZipTarbz2 = _mkNote('ZIP to TAR.BZ2 — not possible in a browser', _NOTE_TARBZ2);
SPECIAL.noteTarbz2Zip = _mkNote('TAR.BZ2 to ZIP — not possible in a browser', _NOTE_TARBZ2);
SPECIAL.noteZipTarxz = _mkNote('ZIP to TAR.XZ — not possible in a browser', _NOTE_TARXZ);
SPECIAL.noteTarxzZip = _mkNote('TAR.XZ to ZIP — not possible in a browser', _NOTE_TARXZ);
SPECIAL.fileToGzip = async (f)=>{ const b = await _gzip(await _buf(f)); return _out(new Blob([b],{type:'application/gzip'}), f, 'gz'); };
SPECIAL.gzipToFile = async (f)=>{ const b = await _gunzip(await _buf(f)); return _out(new Blob([b],{type:'application/octet-stream'}), f, 'bin', 'Decompressed. Rename the file to its original name and extension.'); };
SPECIAL.noteBrotli = _mkNote('File to Brotli — not possible in a browser', _NOTE_BROTLI);
SPECIAL.noteBrotliDec = _mkNote('Brotli to original file — not possible in a browser', _NOTE_BROTLI);
SPECIAL.noteZstd = _mkNote('File to Zstandard — not possible in a browser', _NOTE_ZSTD);
SPECIAL.noteZstdDec = _mkNote('Zstandard to original file — not possible in a browser', _NOTE_ZSTD);
SPECIAL.noteBzip2 = _mkNote('File to BZIP2 — not possible in a browser', _NOTE_BZIP2);
SPECIAL.noteBzip2Dec = _mkNote('BZIP2 to original file — not possible in a browser', _NOTE_BZIP2);
SPECIAL.zipToJsonManifest = async (f)=>{
  const es = await _zipRead(await _buf(f));
  return _txtOut(JSON.stringify(es.map(e=>({name:e.name, size:e.size, compressedSize:e.compSize})), null, 2), f, 'json');
};
SPECIAL.tarToCsvManifest = async (f)=>{
  const es = _tarRead(await _buf(f));
  const lines = ['name,size,type,mtime'];
  // mtime not retained by reader; re-read headers for it
  const buf = await _buf(f), dec = new TextDecoder();
  const oct = (o,n)=>{ const s = dec.decode(buf.subarray(o,o+n)).replace(/\0.*$/,'').trim(); return s? parseInt(s,8) : 0; };
  let p=0, i=0;
  while(p+512<=buf.length && i<es.length){
    const size = oct(p+124,12), type = String.fromCharCode(buf[p+156]||48), mtime = oct(p+136,12);
    if(type==='0' || type==='\0' || type===''){ lines.push('"'+es[i].name.replace(/"/g,'""')+'",'+es[i].data.length+',file,'+mtime); i++; }
    p += 512 + Math.ceil(size/512)*512;
  }
  return _txtOut(lines.join('\n'), f, 'csv');
};


/* ---------- conversion core ---------- */
function convert(t, v, ex){
  if(t.kind === 'mul') return v * t.params.f;
  if(t.kind === 'affine') return t.params.a * v + t.params.b;
  const fn = SPECIAL[t.params.fn];
  if(!fn) return NaN;
  return fn(v, ex || {});
}
function convertText(t, text, ex){
  const fn = SPECIAL[t.params.fn];
  if(!fn) return '';
  return fn(text, ex || {});
}
async function convertFile(t, file, ex){
  const fn = SPECIAL[t.params.fn];
  if(!fn) throw new Error('Tool not implemented in this browser.');
  return fn(file, ex || {});
}
function isPaceOut(t){ return t.params.fn === 'speedToPace'; }
function isPaceIn(t){ return t.params.fn === 'paceToSpeed'; }


/* ---------- render categories (page-aware) ---------- */
function renderCats(){
  if($('#catGrid')){
    $('#catGrid').innerHTML = CATS.map(c=>{
      const n = TOOLS.filter(t=>t.cat===c.key).length;
      return `<div class="cat" onclick="setCat('${c.key}')"><h3>${c.name}</h3><p>${c.desc}</p><div class="n">${n} converters →</div></div>`;
    }).join('');
  }
  if($('#filters')){
    const pills = [{key:'all',name:'All 1000'}].concat(CATS);
    $('#filters').innerHTML = pills.map(c=>`<button data-cat="${c.key}" class="${curCat===c.key?'on':''}" onclick="setCat('${c.key}')">${c.name}</button>`).join('') + `<span class="count" id="toolCount"></span>`;
  }
  if($('#popChips')){
    const pop = (typeof POP !== 'undefined') ? POP : [];
    $('#popChips').innerHTML = pop.map(id=>{ const t=TOOLS.find(x=>x.id===id); return t ? `<button onclick="openTool(${id})">${t.name}</button>` : ''; }).join('');
  }
}

/* ---------- render tool grid + pagination (page-aware) ---------- */
function renderTools(){
  if(!$('#toolGrid')) return;
  const q = curQuery.trim().toLowerCase();
  const list = TOOLS.filter(t=>{
    if(curCat!=='all' && t.cat!==curCat) return false;
    if(!q) return true;
    return (t.name+' '+t.from+' '+t.to+' '+t.cat+' '+CATS.find(c=>c.key===t.cat).name).toLowerCase().includes(q);
  });
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if(curPage > pages) curPage = pages;
  const start = total ? (curPage-1)*PAGE_SIZE : 0;
  const pageList = list.slice(start, start + PAGE_SIZE);
  const tc = $('#toolCount'); if(tc) tc.textContent = total + ' tools';
  const em = $('#emptyMsg'); if(em) em.style.display = total ? 'none' : 'block';
  $('#toolGrid').innerHTML = pageList.map(t=>{
    const c = CATS.find(x=>x.key===t.cat);
    const tag = t.inputType === 'text' ? '✎ Text' : t.inputType === 'file' ? '📁 File' : c.name;
    return `<div class="tool" onclick="openTool(${t.id})"><div class="num">#${String(t.id).padStart(4,'0')}</div><h3>${t.name}</h3><div class="conv"><b>${t.fromSym}</b> → <b>${t.toSym}</b></div><span class="cat-tag">${tag}</span></div>`;
  }).join('');
  renderPager(total, pages, start);
}
function renderPager(total, pages, start){
  const pg = $('#pager');
  if(!pg) return;
  if(!total){ pg.innerHTML = ''; return; }
  const end = Math.min(total, start + PAGE_SIZE);
  let nums = [];
  if(pages <= 7){ for(let i=1;i<=pages;i++) nums.push(i); }
  else {
    nums.push(1);
    if(curPage > 3) nums.push('…');
    for(let p=Math.max(2,curPage-1); p<=Math.min(pages-1,curPage+1); p++) nums.push(p);
    if(curPage < pages-2) nums.push('…');
    nums.push(pages);
  }
  const btns = nums.map(n => n==='…' ? `<button disabled>…</button>` : `<button class="${n===curPage?'on':''}" onclick="goPage(${n})">${n}</button>`).join('');
  pg.innerHTML = `<span class="pg-info">Showing ${start+1}–${end} of ${total} tools</span><div class="pg-btns"><button onclick="goPage(${curPage-1})" ${curPage===1?'disabled':''}>‹ Prev</button>${btns}<button onclick="goPage(${curPage+1})" ${curPage===pages?'disabled':''}>Next ›</button></div>`;
}
function goPage(p){ curPage = p; renderTools(); const t=document.getElementById('tools'); if(t) t.scrollIntoView({behavior:'smooth'}); }
function setCat(k){
  if(!$('#toolGrid')){
    location.href = 'tools.html?cat=' + encodeURIComponent(k);
    return;
  }
  curCat = (k==='all') ? 'all' : +k; curPage = 1;
  $$('#filters button').forEach(b=>b.classList.toggle('on', b.dataset.cat===String(curCat)));
  renderTools();
  const t=document.getElementById('tools'); if(t) t.scrollIntoView({behavior:'smooth'});
}
function scrollToTools(){
  const t=document.getElementById('tools');
  if(t){ t.scrollIntoView({behavior:'smooth'}); return; }
  location.href = 'tools.html' + (curQuery ? '?q=' + encodeURIComponent(curQuery) : '');
}

/* ---------- converter modal ---------- */
function extraInputs(t){
  const ins = (t.params && t.params.inputs) || [];
  if(!ins.length) return '';
  return ins.map(inp=>`<div class="fld"><label>${inp[1]} (${inp[3]})</label><input type="number" step="any" data-ex="${inp[0]}" value="${inp[2]}"></div>`).join('');
}
function openTool(id){
  const t = TOOLS.find(x=>x.id===id); if(!t) return;
  curTool = t;
  $('#mCat').textContent = CATS.find(c=>c.key===t.cat).name;
  $('#mTitle').textContent = t.name;
  $('#mFromTo').textContent = t.from + ' (' + t.fromSym + ')  →  ' + t.to + ' (' + t.toSym + ')';
  const mode = t.inputType || 'number';
  const isDmsIn = t.params.fn === 'dmsToDec';
  const isHmsIn = t.params.fn === 'hmsToDecHrs';
  let body = '';
  if(mode === 'text'){
    body = `<div class="fld"><label>Input — ${t.from}</label><textarea id="mText" rows="6" placeholder="Type or paste your ${t.from.toLowerCase()} here…"></textarea></div>`
      + extraInputs(t)
      + `<div class="fld"><label>Output — ${t.to}</label><textarea id="mTextOut" rows="6" readonly placeholder="Converted ${t.to.toLowerCase()} will appear here…"></textarea></div>`;
  } else if(mode === 'file'){
    body = `<div class="fld"><label>Choose a file — ${t.from}</label><input id="mFile" type="file"></div>`
      + extraInputs(t)
      + `<div class="copyrow"><button class="copy" id="mConvertBtn" onclick="doFileConvert()">⬇ Convert &amp; Download</button></div><div class="formula" id="mFileMsg" style="display:none"></div>`;
  } else {
    const mainLabel = isDmsIn ? 'Degrees' : isHmsIn ? 'Hours' : t.from + ' (' + t.fromSym + ')';
    const mainHint = isPaceIn(t) ? 'Tip: type a pace as 5.5 or as 5:30.' : (t.params.fn==='decHrsToHms' ? 'Example: 2.5 = 2h 30m 0s.' : '');
    body = `<div class="fld"><label>${mainLabel}</label><input id="mVal" type="${isPaceIn(t)?'text':'number'}" step="any" value="1">${mainHint?`<div class="hint">${mainHint}</div>`:''}</div>`
      + extraInputs(t)
      + `<div class="swaprow"><button id="mSwap" onclick="swapTool()">⇄ Swap direction</button></div>`
      + `<div class="result"><div class="lbl" id="mResLbl">RESULT</div><div class="val" id="mRes">—</div></div>`
      + `<div class="copyrow"><button class="copy" id="mCopy" onclick="copyResult()">📋 Copy Result</button></div>`;
  }
  $('#mInputs').innerHTML = body;
  $('#mFormula').textContent = 'Formula: ' + t.formula;
  const sw = $('#mSwap'); if(sw) sw.style.display = findReverse(t) ? '' : 'none';
  $('#modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  if(mode === 'text'){
    $('#mText').addEventListener('input', doTextConvert);
    $('#mText').focus();
  } else if(mode === 'file'){
    $('#mFile').addEventListener('change', ()=>{ const m=$('#mFileMsg'); if(m){ m.style.display='none'; m.textContent=''; } });
  } else {
    doConvert();
    $$('#mInputs input').forEach(i=>i.addEventListener('input', doConvert));
    $('#mVal').focus(); $('#mVal').select();
  }
}
function findReverse(t){ return TOOLS.find(x=>x.from===t.to && x.to===t.from); }
function swapTool(){
  const r = findReverse(curTool); if(!r) return;
  openTool(r.id);
  const out = $('#mRes') && $('#mRes').dataset.raw;
  if(out !== undefined && out !== ''){ const mv=$('#mVal'); if(mv) mv.value = out; }
  doConvert();
}
function readExtras(){
  const ex = {};
  $$('#mInputs input[data-ex]').forEach(i=>{ ex[i.dataset.ex] = parseFloat(i.value); });
  return ex;
}
function doConvert(){
  if(!curTool) return;
  const t = curTool;
  const raw = $('#mVal').value;
  const v = isPaceIn(t) ? parsePace(raw) : parseFloat(raw);
  const out = convert(t, v, readExtras());
  const resEl = $('#mRes');
  if(typeof out === 'string'){ resEl.innerHTML = out; resEl.dataset.raw = out; }
  else if(isPaceOut(t)){ resEl.innerHTML = fmtPace(out) + ' <small>' + t.toSym + '</small>'; resEl.dataset.raw = fmtPace(out); }
  else { resEl.innerHTML = fmt(out) + ' <small>' + t.toSym + '</small>'; resEl.dataset.raw = String(out); }
  $('#mResLbl').textContent = 'RESULT — ' + t.to.toUpperCase();
}
function doTextConvert(){
  if(!curTool) return;
  const t = curTool;
  const txt = $('#mText').value;
  let out = '';
  try { out = convertText(t, txt, readExtras()); }
  catch(e){ out = 'Error: ' + e.message; }
  $('#mTextOut').value = (out === undefined || out === null) ? '' : String(out);
}
async function doFileConvert(){
  if(!curTool) return;
  const t = curTool;
  const f = $('#mFile').files && $('#mFile').files[0];
  const msg = $('#mFileMsg'), btn = $('#mConvertBtn');
  if(!f){ msg.style.display='block'; msg.textContent = 'Please choose a file first.'; return; }
  btn.disabled = true; btn.textContent = 'Converting…';
  try {
    const res = await convertFile(t, f, readExtras());
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url; a.download = res.filename || ('converted-' + f.name);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    msg.style.display='block'; msg.textContent = 'Done — your file "' + (res.filename || ('converted-' + f.name)) + '" is downloading.' + (res.note ? ' ' + res.note : '');
  } catch(e){
    msg.style.display='block'; msg.textContent = 'Could not convert this file: ' + e.message;
  }
  btn.disabled = false; btn.textContent = '⬇ Convert & Download';
}
function copyResult(){
  const t = curTool; if(!t) return;
  let txt = '';
  if((t.inputType||'number') === 'text'){ txt = $('#mTextOut').value; }
  else { txt = ($('#mRes').dataset.raw || '') + ' ' + t.toSym; }
  const done = ()=>{ const b=$('#mCopy'); if(!b) return; b.textContent='✓ Copied!'; b.classList.add('done'); setTimeout(()=>{ b.textContent='📋 Copy Result'; b.classList.remove('done'); },1600); };
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done).catch(()=>{ fallbackCopy(txt); done(); }); }
  else { fallbackCopy(txt); done(); }
}
function fallbackCopy(txt){ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(e){} document.body.removeChild(ta); }
function closeModal(){ $('#modal').classList.remove('open'); document.body.style.overflow=''; }
$('#modal').addEventListener('click', e=>{ if(e.target.id==='modal') closeModal(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

/* ---------- search ---------- */
function bindSearch(id){
  const el = $(id); if(!el) return;
  el.addEventListener('input', ()=>{ curQuery = el.value; curPage = 1; renderTools(); });
  el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ scrollToTools(); } });
}
bindSearch('#heroSearch');
bindSearch('#toolSearch');

/* ---------- faq ---------- */
$$('.faq-q').forEach(b=>b.addEventListener('click', ()=>{
  const it = b.parentElement, open = it.classList.contains('open');
  $$('.faq-item.open').forEach(o=>o.classList.remove('open'));
  if(!open) it.classList.add('open');
}));


/* ---------- init (multi-page) ---------- */
(function(){
  const params = new URLSearchParams(location.search);
  const cat = params.get('cat');
  if(cat !== null && cat !== '' && (cat === 'all' || CATS.some(c=>String(c.key)===cat))){
    curCat = (cat === 'all') ? 'all' : +cat;
  }
  const q = params.get('q');
  if(q !== null && q !== ''){
    curQuery = q;
    const s = $('#toolSearch') || $('#heroSearch');
    if(s) s.value = q;
  }
  renderCats();
  renderTools();
  const toolId = params.get('tool');
  if(toolId){
    const t = TOOLS.find(x=>String(x.id)===toolId);
    if(t) openTool(t.id);
  }
})();
