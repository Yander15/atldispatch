// tools/build.js
// Builds DispatchTool.html from data/scheme.txt and writes version.json
// Mobile-first kiosk: docked keypad, Dashboard button, ATL Machine mapping, no History tab

const fs = require('fs');
const path = require('path');

// ---------- Helpers ----------
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
    const parts = line.split('*'); if (parts.length < 4) continue;
    const bin = String(parts[0] || "").trim();
    const machine = String(parts[1] || "").trim();
    const zipsPart = String(parts[3] || "").trim();
    if (!bin || !isDigits(bin, bin.length)) continue;
    const tokens = zipsPart.split(',');
    for (let j = 0; j < tokens.length; j++) {
      const tok = String(tokens[j] || "").trim(); if (!tok) continue;
      const range = normalizeTokenToRange(tok); if (!range) continue;
      const a = range.zip_start, b = range.zip_end;
      rows.push({
        zip_start: a, zip_end: b, bin: bin, machine: machine, note: "",
        zip11_start: a + "00000" + "0",
        zip11_end:   b + "99999" + "9"
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
function b64encodeUtf8(str) { return Buffer.from(str, 'utf8').toString('base64'); }

// ---------- HTML builder ----------
function buildDispatchHTML(b64csv) {
  let html = '';
  html += '<!doctype html>\n<meta charset="utf-8">\n<title>Dispatch Command Center - Offline</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n';
  html += '<style>\n';
  html += ':root{--bg:#0f1115;--fg:#e8eaf0;--muted:#9aa3b2;--card:#171a21;--line:#2a2f3a;--accent:#7aa2ff;--green:#1fbf75;--orange:#ff9f40;--blue:#4ea1ff}\n';
  html += 'html,body{height:100%}\n';
  html += 'body{margin:0;background:var(--bg);color:var(--fg);font:18px system-ui,-apple-system,"Segoe UI",Roboto;overscroll-behavior:none;touch-action:manipulation}\n';
  html += '.shell{min-height:100svh;display:flex;flex-direction:column}\n';
  html += '.bar{position:sticky;top:0;z-index:5;background:rgba(15,17,21,.9);backdrop-filter:saturate(180%) blur(8px);padding:10px 12px;border-bottom:1px solid var(--line)}\n';
  html += '.title{font-size:18px;font-weight:700} .muted{color:var(--muted);font-size:12px}\n';

  // compact tabs and header
  html += '.tabs{display:flex;gap:8px;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch;padding:8px 0;margin:6px 0}\n';
  html += '.tabs::-webkit-scrollbar{display:none}\n';
  html += '.tab{flex:0 0 auto;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:#1a1f2b;cursor:pointer}\n';
  html += '.tab.active{background:#1f2a3f;border-color:#4d6cff}\n';
  html += '.wrap{flex:1 1 auto;width:100%;max-width:1200px;margin:0 auto;padding:12px;overscroll-behavior:contain}\n';
  html += '.card{border:1px solid var(--line);border-radius:14px;background:var(--card);padding:14px;margin:12px 0}\n';
  html += '.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}\n';
  html += 'input[type=text]{font:22px system-ui;letter-spacing:1px;width:100%;padding:14px;border-radius:12px;border:1px solid var(--line);background:#101521;color:var(--fg)}\n';
  html += 'button{font:18px;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:#1c2230;color:var(--fg);cursor:pointer}\n';
  html += '.big{font-size:64px;font-weight:900;letter-spacing:.5px}\n';
  html += '.site-CHA{color:var(--green)} .site-ATL{color:var(--blue)} .site-MCO{color:var(--orange)}\n';
  html += '#out{display:none}\n';
  html += '.table{width:100%;border-collapse:collapse}\n';
  html += '.table th,.table td{border:1px solid var(--line);padding:10px;text-align:left}\n';
  html += '.store{display:flex;gap:12px;flex-wrap:wrap;align-items:center}\n';
  html += '.badge{display:inline-flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;text-decoration:none;line-height:1;white-space:nowrap;border:1px solid rgba(255,255,255,.08)}\n';
  html += '.badge svg{display:block;flex:0 0 auto} .badge .txt{display:flex;flex-direction:column}\n';
  html += '.badge .sup{font-size:12px;opacity:.9} .badge .main{font-size:18px;font-weight:700;letter-spacing:.2px}\n';
  html += '.badge.play{background:#121212;color:#fff} .badge.appstore{background:#000;color:#fff}\n';
  html += '.pill{padding:8px 10px;border-radius:999px;border:1px solid var(--line);background:#121827}\n';
  html += '.topbar-actions{display:flex;gap:8px;align-items:center;flex-wrap:nowrap}\n';
  html += '@media (max-width:600px){.topbar-actions .linkbtn,.topbar-actions button{font-size:14px;padding:8px 10px;border-radius:10px}}\n';
  html += 'a.linkbtn{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:var(--fg);background:#1c2230;border:1px solid var(--line);padding:10px 14px;border-radius:12px}\n';
  html += 'a.linkbtn:hover{filter:brightness(1.08)}\n';

  // kiosk layout for large screens
  html += '.pane{max-width:1200px;margin:0 auto}\n';
  html += '.kiosk{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}\n';
  html += '@media (max-width:900px){.kiosk{grid-template-columns:1fr}}\n';

  // keypad grid and dock
  html += '.keypad{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr);gap:10px;height:100%}\n';
  html += '.key{display:flex;align-items:center;justify-content:center;height:100%;font-size:clamp(22px,3.8vh,34px);border-radius:12px;border:1px solid var(--line);background:#131826}\n';
  html += '.keypad-dock{display:block}\n';
  html += '@media (max-width:900px){\n';
  html += '  .keypad-dock{position:fixed;left:0;right:0;bottom:0;background:rgba(13,18,26,.96);backdrop-filter:saturate(160%) blur(6px);border-top:1px solid var(--line);padding:12px env(safe-area-inset-right) calc(12px + env(safe-area-inset-bottom)) env(safe-area-inset-left);height:52svh;z-index:9}\n';
  html += '  body.has-dock .wrap{padding-bottom:55svh}\n';
  html += '  #zip{font-size:clamp(22px,3.6vh,36px)} #go{font-size:clamp(18px,3.0vh,28px)} .big{font-size:clamp(40px,7.5vh,80px)}\n';
  html += '}\n';
  html += 'body.fullscreen .keypad-dock{height:66svh}\n';
  html += 'body.fullscreen.has-dock .wrap{padding-bottom:69svh}\n';

  // toast
  html += '#toast{position:fixed;left:50%;top:12%;transform:translateX(-50%);background:rgba(20,25,36,.95);border:1px solid var(--line);border-radius:16px;padding:16px 20px;z-index:9999;display:none;box-shadow:0 14px 40px rgba(0,0,0,.45);font-size:clamp(24px,6.2vh,52px);font-weight:800;letter-spacing:.4px;text-align:center}\n';
  html += '@media (max-width:600px){.pill{padding:6px 8px;font-size:11px}}\n';
  html += '</style>\n';

  // Single scheme payload
  html += `<script id="scheme_b64" type="text/plain">${b64csv}</script>\n`;

  // Shell start
  html += '<div class="shell">\n';

  // App chrome with Dashboard link and tabs (no History)
  html += '<div class="bar"><div class="row" style="justify-content:space-between;"><div class="title">Dispatch Command Center</div><div class="topbar-actions"><a class="linkbtn" id="homeBtn" href="./" title="Back to Dashboard">Dashboard</a><button id="fsBtn" title="Fullscreen">Fullscreen</button></div></div><div class="tabs"><div class="tab active" data-tab="lookup">Lookup</div><div class="tab" data-tab="bin">BIN Ranges</div><div class="tab" data-tab="apps">Apps</div></div></div>\n';

  html += '<div class="wrap">\n';

  // Toast element
  html += '<div id="toast" aria-live="polite"></div>\n';

  // Lookup pane
  html += '<div class="card pane" id="pane-lookup" style="display:block">';
  html +=   '<div class="kiosk">';
  html +=     '<div>';
  html +=       '<div class="row"><input id="zip" inputmode="numeric" maxlength="11" placeholder="Enter 5, 9, or 11 digits"><button id="go">Lookup</button><span class="muted pill">Tip: use the on-screen keypad</span></div>';
  html +=       '<div id="out" class="card" style="margin-top:12px"></div>';
  html +=     '</div>';
  html +=     '<div class="keypad-dock"><div class="keypad" id="pad"></div></div>';
  html +=   '</div>';
  html += '</div>\n';

  // BIN pane
  html += '<div class="card pane" id="pane-bin" style="display:none"><div class="row"><input id="binInput" inputmode="numeric" placeholder="Enter BIN or ZIP"><button id="binGo">Show Ranges</button></div><div id="binOut" class="card" style="display:none;margin-top:12px"></div></div>\n';

  // Apps pane
  html += '<div class="card pane" id="pane-apps" style="display:none"><div style="font-weight:600;margin-bottom:8px">Scanner Apps</div><div class="store">';
  html += '<a class="badge play" href="https://play.google.com/store/apps/details?id=com.solvoj.imb.android.app" target="_blank" rel="noopener" aria-label="Get it on Google Play"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><polygon points="2,4 18,13 2,22" fill="#34A853"/><polygon points="2,4 12,13 2,13" fill="#FBBC05"/><polygon points="2,22 12,13 2,13" fill="#EA4335"/><polygon points="12,13 18,9.5 18,16.5" fill="#4285F4"/></svg><span class="txt"><span class="sup">Get it on</span><span class="main">Google Play</span></span></a>';
  html += '<a class="badge appstore" href="https://apps.apple.com/us/app/imb-scanner-app/id1635182953" target="_blank" rel="noopener" aria-label="Download on the App Store"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"><path d="M16.365 1.43c.06.79-.29 1.56-.8 2.2-.53.65-1.4 1.16-2.26 1.09-.07-.8.31-1.6.82-2.21.52-.63 1.44-1.14 2.24-1.08zM20.8 17.53c-.4.93-.88 1.83-1.51 2.64-.8 1.09-1.82 2.32-3.16 2.33-1.33.01-1.67-.75-3.11-.75-1.44 0-1.82.73-3.13.76-1.32.03-2.33-1.18-3.14-2.27-1.71-2.3-3.02-6.5-1.26-9.34.86-1.4 2.4-2.29 4.07-2.31 1.27-.03 2.47.85 3.11.85.63 0 2.15-1.05 3.63-.9.62.03 2.37.25 3.49 1.96-3.08 1.64-2.58 5.91.91 6.03z" fill="#fff"/></svg><span class="txt"><span class="sup">Download on the</span><span class="main">App Store</span></span></a>';
  html += '</div></div>\n';

  html += '</div><!-- /wrap -->\n';
  html += '</div><!-- /shell -->\n';

  // App logic
  html += '<script>\n';
  html += 'var SCHEME=[];\n';

  // Tabs
  html += '(function(){var tabs=document.getElementsByClassName("tab");function show(id){for(var i=0;i<tabs.length;i++){var t=tabs[i];var active=t.getAttribute("data-tab")===id;t.className=active?"tab active":"tab";var p=document.getElementById("pane-"+t.getAttribute("data-tab"));if(p)p.style.display=active?"block":"none";}}for(var i=0;i<tabs.length;i++){tabs[i].onclick=(function(t){return function(){show(t.getAttribute("data-tab"));};})(tabs[i]);}})();\n';

  // Utils
  html += 'function clearNode(el){while(el.firstChild)el.removeChild(el.firstChild);} \n';
  html += 'function siteLabelForBin(b){b=parseInt(b,10);if(isNaN(b))return"";if(b>=5&&b<=17)return"CHA "+b; if(b>=18&&b<=32)return"ATL "+b; if(b>=33&&b<=36)return"MCO "+b; return "BIN "+b;}\n';
  html += 'function siteClassForBin(b){b=parseInt(b,10);if(b>=5&&b<=17)return"site-CHA"; if(b>=18&&b<=32)return"site-ATL"; if(b>=33&&b<=36)return"site-MCO"; return ""}\n';
  html += 'function parseCSV(t){var CR=String.fromCharCode(13),LF=String.fromCharCode(10);t=String(t||"");t=t.replace(new RegExp(CR,"g"),"");var lines=t.trim().split(LF);if(!lines.length)return[];var header=lines.shift().split(",");var idx={},i;for(i=0;i<header.length;i++){idx[header[i].trim()]=i;}var need=["zip_start","zip_end","bin","machine","note","zip11_start","zip11_end"];for(i=0;i<need.length;i++){if(!(need[i] in idx))throw new Error("Missing column: "+need[i]);}var rows=[],j;for(j=0;j<lines.length;j++){var l=lines[j];if(!l)continue;var c=l.split(",");rows.push({zip_start:c[idx.zip_start],zip_end:c[idx.zip_end],bin:c[idx.bin],machine:c[idx.machine],note:c[idx.note]||"",zip11_start:c[idx.zip11_start],zip11_end:c[idx.zip11_end]});}rows.sort(function(a,b){return a.zip11_start<b.zip11_start?-1:1});return rows;}\n';
  html += 'function norm11(x){var d=String(x||""),only="";for(var i=0;i<d.length;i++){var ch=d.charCodeAt(i);if(ch>=48&&ch<=57)only+=d.charAt(i);}if(only.length!==5&&only.length!==9&&only.length!==11)return null;var s=(only+"00000000000").slice(0,11);var e=(only+"99999999999").slice(0,11);return{d:only,start:s,end:e};}\n';
  html += 'function bsearch(a,s){var lo=0,hi=a.length-1,ans=-1;while(lo<=hi){var mid=(lo+hi)>>1;if(a[mid].zip11_start<=s){ans=mid;lo=mid+1;}else{hi=mid-1;}}return ans;}\n';

  // Machine mapping for ATL BINs
  html += 'function machineLabelForBin(b){b=parseInt(b,10);switch(b){case 19:return "Machine 4";case 21:return "Machine 5";case 22:return "Machine 6";case 23:return "Machine 7";case 20:return "Machine 9";case 24:return "Machine 10";case 25:return "Machine 11";case 26:return "Machine 12";case 27:return "Machine 13";case 28:return "Machine 14";case 29:return "Machine 15";case 30:return "Machine 16";case 31:return "Machine 17";case 32:return "Machine 18";default:return null;}}\n';

  // Toast helper
  html += 'function showToast(msg, ms){var t=document.getElementById("toast");t.textContent=msg;t.style.display="block";clearTimeout(showToast._t);showToast._t=setTimeout(function(){t.style.display="none";}, ms||5000);} \n';

  // Load CSV
  html += '(function(){var csv=decodeURIComponent(escape(atob(document.getElementById("scheme_b64").textContent)));SCHEME=parseCSV(csv);})();\n';

  // Fullscreen toggle + body class + Esc-to-dashboard when not fullscreen
  html += '(function(){var b=document.getElementById("fsBtn");function setFS(){document.body.classList.toggle("fullscreen", !!document.fullscreenElement);}document.addEventListener("fullscreenchange", setFS);document.addEventListener("keydown",function(e){if(e.key==="Escape" && !document.fullscreenElement){location.href="./";}});b.onclick=function(){var d=document.documentElement;if(!document.fullscreenElement){(d.requestFullscreen||d.webkitRequestFullscreen||d.msRequestFullscreen).call(d);}else{(document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen).call(document);} };setFS();})();\n';

  // Mobile dock padding toggle + focus handling
  html += '(function(){function setDock(){var has=window.matchMedia("(max-width: 900px)").matches;document.body.classList.toggle("has-dock", has);}window.addEventListener("resize",setDock,{passive:true});setDock();var zip=document.getElementById("zip");zip.addEventListener("focus",function(){setTimeout(function(){try{zip.scrollIntoView({block:"center"});}catch(e){}},150);});})();\n';

  // Build keypad
  html += '(function(){var pad=document.getElementById("pad");var keys=["1","2","3","4","5","6","7","8","9","CLR","0","ENTER"];for(var i=0;i<keys.length;i++){var k=document.createElement("button");k.className="key";k.textContent=keys[i];pad.appendChild(k);}})();\n';

  // Lookup UI + toast result + Enter key support
  html += '(function(){var zip=document.getElementById("zip");var out=document.getElementById("out");function render(row){out.style.display="block";clearNode(out);if(!row){out.textContent="No match. Verify ZIP.";showToast("No match",3000);return;}var b=parseInt(row.bin,10);var site=siteLabelForBin(b);var cls=siteClassForBin(b);var h=document.createElement("div");h.className="big "+cls;h.textContent=site;out.appendChild(h);var d=document.createElement("div");d.className="muted";d.textContent="BIN "+row.bin+" • ZIP "+row.zip_start+" to "+row.zip_end;out.appendChild(d);try{if(navigator.vibrate)navigator.vibrate(50);}catch(e){}var m=machineLabelForBin(b);var toast=m? (site+" • "+m+" (B"+b+")") : (site+" • BIN "+row.bin);showToast(toast,5000);}document.getElementById("go").onclick=function(){var r=lookup(zip.value);render(r);zip.value="";};document.getElementById("pad").onclick=function(e){var t=e.target;if(t.tagName!=="BUTTON")return;var v=t.textContent;if(v==="ENTER"){var r=lookup(zip.value);render(r);zip.value="";return;}if(v==="CLR"){zip.value="";return;}if(zip.value.length>=11)return;zip.value+=v;};zip.addEventListener("keydown",function(e){if(e.key==="Enter"){document.getElementById("go").click();}});function lookup(z){if(!SCHEME.length)return null;var n=norm11(z);if(!n)return null;var tries=[];if(n.d.length===11)tries.push(n);if(n.d.length>=9){var n9=norm11(n.d.slice(0,9));if(n9)tries.push(n9);}var n5=norm11(n.d.slice(0,5));if(n5)tries.push(n5);for(var t=0;t<tries.length;t++){var tt=tries[t];var i=bsearch(SCHEME,tt.start);for(var k=Math.max(0,i-12);k<=Math.min(SCHEME.length-1,i+12);k++){var row=SCHEME[k];if(tt.start>=row.zip11_start&&tt.end<=row.zip11_end)return row;}}var ii=bsearch(SCHEME,n.start);for(var kk=Math.max(0,ii-12);kk<=Math.min(SCHEME.length-1,ii+12);kk++){var r2=SCHEME[kk];if(n.start>=r2.zip11_start&&n.start<=r2.zip11_end)return r2;}return null;}})();\n';

  // BIN ranges pane logic
  html += '(function(){var binGo=document.getElementById("binGo");var binIn=document.getElementById("binInput");var out=document.getElementById("binOut");binGo.onclick=function(){var raw=(binIn.value||"").trim();var digits=raw.replace(/\\D+/g,"");var b=null;if(digits.length===5||digits.length===9||digits.length===11){var row=(function(z){var n=norm11(z);if(!n)return null;var ii=(function(a,s){var lo=0,hi=a.length-1,ans=-1;while(lo<=hi){var mid=(lo+hi)>>1;if(a[mid].zip11_start<=s){ans=mid;lo=mid+1;}else{hi=mid-1;}}return ans;})(SCHEME,n.start);for(var kk=Math.max(0,ii-12);kk<=Math.min(SCHEME.length-1,ii+12);kk++){var r2=SCHEME[kk];if(n.start>=r2.zip11_start&&n.start<=r2.zip11_end)return r2;}return null;})(digits);if(row)b=parseInt(row.bin,10);}if(b==null)b=parseInt(digits,10);out.style.display="block";clearNode(out);if(isNaN(b)){out.textContent="Enter a BIN or a ZIP.";return;}var tbl=document.createElement("table");tbl.className="table";tbl.innerHTML="<thead><tr><th>Label</th><th>ZIP Start</th><th>ZIP End</th><th>Note</th></tr></thead>";var tb=document.createElement("tbody");var count=0;for(var i=0;i<SCHEME.length;i++){var r=SCHEME[i];if(parseInt(r.bin,10)===b){var tr=document.createElement("tr");var lab=(b>=5&&b<=17?("CHA "+r.bin):(b>=18&&b<=32?("ATL "+r.bin):(b>=33&&b<=36?("MCO "+r.bin):("BIN "+r.bin))));tr.innerHTML="<td>"+lab+"</td><td>"+r.zip_start+"</td><td>"+r.zip_end+"</td><td>"+(r.note||"")+"</td>";tb.appendChild(tr);count++;}}if(!count){out.textContent="No rows for that BIN.";return;}tbl.appendChild(tb);out.appendChild(tbl);};})();\n';

  html += '</script>\n';
  return html;
}

// ---------- Build process ----------
const schemePath = path.join(process.cwd(), 'data', 'scheme.txt');
if (!fs.existsSync(schemePath)) {
  console.error('data/scheme.txt not found. Upload a scheme file to data/ and commit.');
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

// Write output HTML
fs.writeFileSync(path.join(process.cwd(), 'DispatchTool.html'), html, 'utf8');
console.log('DispatchTool.html generated with', rows.length, 'rows.');

// Write version.json for dashboard badge
const nowIso = new Date().toISOString();
const version = { built: nowIso, rows: rows.length };
fs.writeFileSync(path.join(process.cwd(), 'version.json'), JSON.stringify(version, null, 2), 'utf8');
console.log('version.json written:', version);
