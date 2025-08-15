// tools/build.js
const fs = require('fs');
const path = require('path');

// Helpers
function replaceAll(str, find, repl) {
  let out = String(str), idx;
  while ((idx = out.indexOf(find)) !== -1) out = out.slice(0, idx) + repl + out.slice(idx + find.length);
  return out;
}
function expand3To5(a, b) { return [a + "00", b + "99"]; }
function isDigits(str, count) {
  if (String(str).length !== count) return false;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    if (ch < 48 || ch > 57) return false;
  }
  return true;
}
function normalizeTokenToRange(token) {
  token = String(token || "").trim();
  if (!token) return null;
  const dash = token.indexOf('-');
  if (dash !== -1) {
    const A = String(token.slice(0, dash)).trim();
    const B = String(token.slice(dash + 1)).trim();
    if (isDigits(A, 5) && isDigits(B, 5)) return { zip_start: A, zip_end: B };
    if (isDigits(A, 3) && isDigits(B, 3)) {
      const [s, t] = expand3To5(A, B);
      return { zip_start: s.padStart(5, '0'), zip_end: t.padStart(5, '0') };
    }
    return null;
  } else {
    if (isDigits(token, 5)) return { zip_start: token, zip_end: token };
    if (isDigits(token, 3)) {
      const [s2, t2] = expand3To5(token, token);
      return { zip_start: s2.padStart(5, '0'), zip_end: t2.padStart(5, '0') };
    }
    return null;
  }
}
function parseSchemeToRows(text) {
  const rows = [];
  let txt = String(text || "");
  const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  txt = replaceAll(txt, CR, "");
  const lines = txt.split(LF);
  for (let i = 0; i < lines.length; i++) {
    let line = String(lines[i] || "").trim();
    if (!line) continue;
    if (line.charAt(0) === '"' && line.charAt(line.length - 1) === '"') line = line.slice(1, -1);
    const parts = line.split('*');
    if (parts.length < 4) continue;
    const bin = String(parts[0] || "").trim();
    const machine = String(parts[1] || "").trim();
    const zipsPart = String(parts[3] || "").trim();
    if (!bin || !isDigits(bin, bin.length)) continue;
    const tokens = zipsPart.split(',');
    for (let j = 0; j < tokens.length; j++) {
      const tok = String(tokens[j] || "").trim();
      if (!tok) continue;
      const range = normalizeTokenToRange(tok);
      if (!range) continue;
      const a = range.zip_start, b = range.zip_end;
      rows.push({
        zip_start: a,
        zip_end: b,
        bin: bin,
        machine: machine,
        note: "",
        zip11_start: a + "00000" + "0",
        zip11_end: b + "99999" + "9"
      });
    }
  }
  const seen = {}, out = [];
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    const key = [r.zip_start, r.zip_end, r.bin, r.machine].join('|');
    if (seen[key]) continue;
    seen[key] = true;
    out.push(r);
  }
  out.sort(function(a, b) {
    const bn = Number(a.bin) - Number(b.bin);
    if (bn !== 0) return bn;
    if (a.zip_start !== b.zip_start) return a.zip_start < b.zip_start ? -1 : 1;
    return a.zip_end < b.zip_end ? -1 : 1;
  });
  return out;
}
function toCSV(rows) {
  const header = ["zip_start", "zip_end", "bin", "machine", "note", "zip11_start", "zip11_end"];
  const lines = [header.join(',')];
  const LF = String.fromCharCode(10);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    lines.push([r.zip_start, r.zip_end, r.bin, r.machine, r.note, r.zip11_start, r.zip11_end].join(','));
  }
  return lines.join(LF);
}
function b64encodeUtf8(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

// Build single file HTML that mirrors your browser build
function buildDispatchHTML(b64csv) {
  let html = '';
  html += '<!doctype html>\n<meta charset="utf-8">\n<title>Dispatch Command Center — Offline</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n';
  html += '<style>\n';
  html += ':root{--bg:#0f1115;--fg:#e8eaf0;--muted:#9aa3b2;--card:#171a21;--line:#2a2f3a;--accent:#7aa2ff;--green:#1fbf75;--orange:#ff9f40;--blue:#4ea1ff}\n';
  html += 'html,body{height:100%}body{margin:0;background:var(--bg);color:var(--fg);font:18px system-ui,-apple-system,"Segoe UI",Roboto}\n';
  html += '.bar{position:sticky;top:0;z-index:5;background:rgba(15,17,21,.85);backdrop-filter:saturate(180%) blur(8px);padding:10px 12px;border-bottom:1px solid var(--line)}\n';
  html += '.title{font-size:18px;font-weight:700} .muted{color:var(--muted);font-size:12px}\n';
  html += '.tabs{display:flex;gap:8px;overflow:auto;padding:8px 0}\n';
  html += '.tab{padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:#1a1f2b;cursor:pointer;white-space:nowrap}\n';
  html += '.tab.active{background:#1f2a3f;border-color:#4d6cff}\n';
  html += '.wrap{padding:14px;max-width:1000px;margin:0 auto}\n';
  html += '.card{border:1px solid var(--line);border-radius:14px;background:var(--card);padding:14px;margin:14px 0}\n';
  html += '.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}\n';
  html += 'input[type=text]{font:22px system-ui;letter-spacing:1px;width:260px;padding:12px;border-radius:12px;border:1px solid var(--line);background:#101521;color:var(--fg)}\n';
  html += 'button{font:18px;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:#1c2230;color:var(--fg);cursor:pointer}\n';
  html += '.big{font-size:64px;font-weight:900;letter-spacing:.5px}\n';
  html += '.site-CHA{color:var(--green)} .site-ATL{color:var(--blue)} .site-MCO{color:var(--orange)}\n';
  html += '#out{display:none}\n';
  html += '.keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}\n';
  html += '.key{font-size:22px;padding:18px;border-radius:12px;border:1px solid var(--line);background:#131826}\n';
  html += '.table{width:100%;border-collapse:collapse}\n';
  html += '.table th,.table td{border:1px solid var(--line);padding:10px;text-align:left}\n';
  html += '.store{display:flex;gap:12px;flex-wrap:wrap;align-items:center}\n';
  html += '.badge{display:inline-flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;text-decoration:none;line-height:1;white-space:nowrap;border:1px solid rgba(255,255,255,.08)}\n';
  html += '.badge svg{display:block;flex:0 0 auto} .badge .txt{display:flex;flex-direction:column}\n';
  html += '.badge .sup{font-size:12px;opacity:.9} .badge .main{font-size:18px;font-weight:700;letter-spacing:.2px}\n';
  html += '.badge.play{background:#121212;color:#fff} .badge.appstore{background:#000;color:#fff}\n';
  html += '.pill{padding:8px 10px;border-radius:999px;border:1px solid var(--line);background:#121827}\n';
  html += '.topbar-actions{display:flex;gap:8px;align-items:center}\n';
  html += '</style>\n';

  // Single scheme blob here - place it once
  html += `<script id="scheme_b64" type="text/plain">${b64csv}</script>\n`;

  html += '<div class="bar"><div class="row" style="justify-content:space-between;"><div class="title">Dispatch Command Center</div><div class="topbar-actions"><button id="fsBtn" title="Fullscreen">Fullscreen</button></div></div><div class="tabs"><div class="tab active" data-tab="lookup">Lookup</div><div class="tab" data-tab="bin">BIN Ranges</div><div class="tab" data-tab="history">History</div><div class="tab" data-tab="apps">Apps</div></div></div>\n';
  html += '<div class="wrap">\n';
  html += '<div class="card pane" id="pane-lookup" style="display:block"><div class="row"><input id="zip" inputmode="numeric" maxlength="11" placeholder="Enter 5, 9, or 11 digits"><button id="go">Lookup</button><span class="muted pill">Tip: use the on-screen keypad</span></div><div class="keypad" id="pad"></div><div id="out" class="card" style="margin-top:12px"></div></div>\n';
  html += '<div class="card pane" id="pane-bin" style="display:none"><div class="row"><input id="binInput" inputmode="numeric" placeholder="Enter BIN or ZIP"><button id="binGo">Show Ranges</button></div><div id="binOut" class="card" style="display:none;margin-top:12px"></div></div>\n';
  html += '<div class="card pane" id="pane-history" style="display:none"><div class="row"><button id="histClear">Clear History</button><button id="histExport" disabled>Export CSV</button></div><div id="histWrap" style="margin-top:12px"></div></div>\n';
  html += '<div class="card pane" id="pane-apps" style="display:none"><div style="font-weight:600;margin-bottom:8px">Scanner Apps</div><div class="store">';
  html += '<a class="badge play" href="https://play.google.com/store/apps/details?id=com.solvoj.imb.android.app" target="_blank" rel="noopener" aria-label="Get it on Google Play"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><polygon points="2,4 18,13 2,22" fill="#34A853"/><polygon points="2,4 12,13 2,13" fill="#FBBC05"/><polygon points="2,22 12,13 2,13" fill="#EA4335"/><polygon points="12,13 18,9.5 18,16.5" fill="#4285F4"/></svg><span class="txt"><span class="sup">Get it on</span><span class="main">Google Play</span></span></a>';
  html += '<a class="badge appstore" href="https://apps.apple.com/us/app/imb-scanner-app/id1635182953" target="_blank" rel="noopener" aria-label="Download on the App Store"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"><path d="M16.365 1.43c.06.79-.29 1.56-.8 2.2-.53.65-1.4 1.16-2.26 1.09-.07-.8.31-1.6.82-2.21.52-.63 1.44-1.14 2.24-1.08zM20.8 17.53c-.4.93-.88 1.83-1.51 2.64-.8 1.09-1.82 2.32-3.16 2.33-1.33.01-1.67-.75-3.11-.75-1.44 0-1.82.73-3.13.76-1.32.03-2.33-1.18-3.14-2.27-1.71-2.3-3.02-6.5-1.26-9.34.86-1.4 2.4-2.29 4.07-2.31 1.27-.03 2.47.85 3.11.85.63 0 2.15-1.05 3.63-.9.62.03 2.37.25 3.49 1.96-3.08 1.64-2.58 5.91.91 6.03z" fill="#fff"/></svg><span class="txt"><span class="sup">Download on the</span><span class="main">App Store</span></span></a>';
  html += '</div></div>\n';

  // App logic
  html += '<script>\n';
  html += 'var SCHEME=[],HISTORY=[];\n';
  html += '(function(){var tabs=document.getElementsByClassName("tab");function show(id){for(var i=0;i<tabs.length;i++){var t=tabs[i];var active=t.getAttribute("data-tab")===id;t.className=active?"tab active":"tab";var p=document.getElementById("pane-"+t.getAttribute("data-tab"));if(p)p.style.display=active?"block":"none";}}for(var i=0;i<tabs.length;i++){tabs[i].onclick=(function(t){return function(){show(t.getAttribute("data-tab"));};})(tabs[i]);}})();\n';
  html += 'function clearNode(el){while(el.firstChild)el.removeChild(el.firstChild);} \n';
  html += 'function siteLabelForBin(b){b=parseInt(b,10);if(isNaN(b))return"";if(b>=5&&b<=17)return"CHA "+b; if(b>=18&&b<=32)return"ATL "+b; if(b>=33&&b<=36)return"MCO "+b; return "BIN "+b;}\n';
  html += 'function siteClassForBin(b){b=parseInt(b,10);if(b>=5&&b<=17)return"site-CHA"; if(b>=18&&b<=32)return"site-ATL"; if(b>=33&&b<=36)return"site-MCO"; return ""}\n';
  html += 'function parseCSV(t){var CR=String.fromCharCode(13),LF=String.fromCharCode(10);t=String(t||"");t=t.replace(new RegExp(CR,"g"),"");var lines=t.trim().split(LF);if(!lines.length)return[];var header=lines.shift().split(",");var idx={},i;for(i=0;i<header.length;i++){idx[header[i].trim()]=i;}var need=["zip_start","zip_end","bin","machine","note","zip11_start","zip11_end"];for(i=0;i<need.length;i++){if(!(need[i] in idx))throw new Error("Missing column: "+need[i]);}var rows=[],j;for(j=0;j<lines.length;j++){var l=lines[j];if(!l)continue;var c=l.split(",");rows.push({zip_start:c[idx.zip_start],zip_end:c[idx.zip_end],bin:c[idx.bin],machine:c[idx.machine],note:c[idx.note]||"",zip11_start:c[idx.zip11_start],zip11_end:c[idx.zip11_end]});}rows.sort(function(a,b){return a.zip11_start<b.zip11_start?-1:1});return rows;}\n';
  html += 'function norm11(x){var d=String(x||""),only="";for(var i=0;i<d.length;i++){var ch=d.charCodeAt(i);if(ch>=48&&ch<=57)only+=d.charAt(i);}if(only.length!==5&&only.length!==9&&only.length!==11)return null;var s=(only+"00000000000").slice(0,11);var e=(only+"99999999999").slice(0,11);return{d:only,start:s,end:e};}\n';
  html += 'function bsearch(a,s){var lo=0,hi=a.length-1,ans=-1;while(lo<=hi){var mid=(lo+hi)>>1;if(a[mid].zip11_start<=s){ans=mid;lo=mid+1;}else{hi=mid-1;}}return ans;}\n';
  html += 'function lookup(zip){if(!SCHEME.length)return null;var n=norm11(zip);if(!n)return null;var tries=[];if(n.d.length===11)tries.push(n);if(n.d.length>=9){var n9=norm11(n.d.slice(0,9));if(n9)tries.push(n9);}var n5=norm11(n.d.slice(0,5));if(n5)tries.push(n5);for(var t=0;t<tries.length;t++){var tt=tries[t];var i=bsearch(SCHEME,tt.start);for(var k=Math.max(0,i-12);k<=Math.min(SCHEME.length-1,i+12);k++){var row=SCHEME[k];if(tt.start>=row.zip11_start&&tt.end<=row.zip11_end)return row;}}var ii=bsearch(SCHEME,n.start);for(var kk=Math.max(0,ii-12);kk<=Math.min(SCHEME.length-1,ii+12);kk++){var r2=SCHEME[kk];if(n.start>=r2.zip11_start&&n.start<=r2.zip11_end)return r2;}return null;}\n';
  html += '(function(){var csv=decodeURIComponent(escape(atob(document.getElementById("scheme_b64").textContent)));SCHEME=parseCSV(csv);})();\n';
  html += '(function(){var b=document.getElementById("fsBtn");b.onclick=function(){var d=document.documentElement;if(!document.fullscreenElement){if(d.requestFullscreen)d.requestFullscreen();}else{if(document.exitFullscreen)document.exitFullscreen();}}})();\n';
  html += '(function(){var pad=document.getElementById("pad");var keys=["1","2","3","4","5","6","7","8","9","CLR","0","ENTER"];for(var i=0;i<keys.length;i++){var k=document.createElement("button");k.className="key";k.textContent=keys[i];pad.appendChild(k);}})();\n';
  html += '(function(){var zip=document.getElementById("zip");var out=document.getElementById("out");function render(row){out.style.display="block";clearNode(out);if(!row){out.textContent="No match. Verify ZIP.";return;}var b=parseInt(row.bin,10);var site=siteLabelForBin(b);var cls=siteClassForBin(b);var h=document.createElement("div");h.className="big "+cls;h.textContent=site;out.appendChild(h);var d=document.createElement("div");d.className="muted";d.textContent="BIN "+row.bin+" • ZIP "+row.zip_start+" to "+row.zip_end;out.appendChild(d);try{if(navigator.vibrate)navigator.vibrate(50);}catch(e){}HISTORY.unshift({ts:Date.now(),zip:zip.value,site:site,bin:row.bin,range:row.zip_start+"-"+row.zip_end});updateHistory();}\n';
  html += 'document.getElementById("go").onclick=function(){var r=lookup(zip.value);render(r);zip.value="";};\n';
  html += 'document.getElementById("pad").onclick=function(e){var t=e.target;if(t.tagName!=="BUTTON")return;var v=t.textContent;if(v==="ENTER"){var r=lookup(zip.value);render(r);zip.value="";return;}if(v==="CLR"){zip.value="";return;}if(zip.value.length>=11)return;zip.value+=v;};})();\n';
  html += '(function(){var binGo=document.getElementById("binGo");var binIn=document.getElementById("binInput");var out=document.getElementById("binOut");binGo.onclick=function(){var raw=(binIn.value||"").trim();var digits=raw.replace(/\\D+/g,"");var b=null;if(digits.length===5||digits.length===9||digits.length===11){var row=lookup(digits);if(row)b=parseInt(row.bin,10);}if(b==null)b=parseInt(digits,10);out.style.display="block";clearNode(out);if(isNaN(b)){out.textContent="Enter a BIN or a ZIP.";return;}var tbl=document.createElement("table");tbl.className="table";tbl.innerHTML="<thead><tr><th>Label</th><th>ZIP Start</th><th>ZIP End</th><th>Note</th></tr></thead>";var tb=document.createElement("tbody");var count=0;for(var i=0;i<SCHEME.length;i++){var r=SCHEME[i];if(parseInt(r.bin,10)===b){var tr=document.createElement("tr");tr.innerHTML="<td>"+siteLabelForBin(r.bin)+"</td><td>"+r.zip_start+"</td><td>"+r.zip_end+"</td><td>"+(r.note||"")+"</td>";tb.appendChild(tr);count++;}}if(!count){out.textContent="No rows for that BIN.";return;}tbl.appendChild(tb);out.appendChild(tbl);};})();\n';
  html += 'function updateHistory(){var w=document.getElementById("histWrap");var exp=document.getElementById("histExport");var clr=document.getElementById("histClear");clearNode(w);if(!HISTORY.length){exp.disabled=true;w.innerHTML="<div class=\\"muted\\">No lookups yet.</div>";return;}exp.disabled=false;var tbl=document.createElement("table");tbl.className="table";tbl.innerHTML="<thead><tr><th>Time</th><th>ZIP</th><th>Label</th><th>BIN</th><th>Range</th></tr></thead>";var tb=document.createElement("tbody");for(var i=0;i<Math.min(HISTORY.length,200);i++){var r=HISTORY[i];var dt=new Date(r.ts);var tr=document.createElement("tr");tr.innerHTML="<td>"+dt.toLocaleString()+"</td><td>"+r.zip+"</td><td>"+r.site+"</td><td>"+r.bin+"</td><td>"+r.range+"</td>";tb.appendChild(tr);}tbl.appendChild(tb);w.appendChild(tbl);clr.onclick=function(){HISTORY=[];updateHistory();};exp.onclick=function(){var lines=["time,zip,label,bin,range"];for(var j=0;j<HISTORY.length;j++){var rr=HISTORY[j];lines.push([new Date(rr.ts).toISOString(),rr.zip,rr.site,rr.bin,rr.range].join(","));}var csv=lines.join("\\n");var blob=new Blob([csv],{type:"text/csv;charset=utf-8"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="lookup_history.csv";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(url);a.remove();},800);};}\n';
  html += '</script>\n';
  html += '</div>\n';
  return html;
}

// Build
const schemePath = path.join(process.cwd(), 'data', 'scheme.txt');
if (!fs.existsSync(schemePath)) {
  console.error('data/scheme.txt not found. The workflow did not extract the issue body.');
  process.exit(1);
}
const scm = fs.readFileSync(schemePath, 'utf8');
const rows = parseSchemeToRows(scm);
if (!rows.length) {
  console.error('No rows parsed. Check input format.');
  process.exit(2);
}
const csv = toCSV(rows);
const b64 = b64encodeUtf8(csv);
const html = buildDispatchHTML(b64);
fs.writeFileSync(path.join(process.cwd(), 'DispatchTool.html'), html, 'utf8');
console.log('DispatchTool.html generated with', rows.length, 'rows.');

// Write a tiny version file for the dashboard badge
const nowIso = new Date().toISOString();
const version = { built: nowIso, rows: rows.length };
fs.writeFileSync(path.join(process.cwd(), 'version.json'), JSON.stringify(version, null, 2), 'utf8');
console.log('version.json written:', version);

