/**
 * The configure page: one HTML document, inline CSS and vanilla JS, no dependencies.
 *
 * Layout is a single centred column. The configuration lives only in D1 on the Worker; the browser keeps nothing and is
 * turned into an install token by POSTing to /api/config/encode on this same origin; nothing the
 * user types ever leaves that origin except through the tracker OAuth helpers, which forward to
 * the provider the user picked.
 */
import { BRAND_LOGO } from '../brand';
import { DEFAULT_CONFIG } from '../config/schema';

const LANGUAGES = [
  'en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'es-MX', 'it-IT', 'pt-BR', 'pt-PT', 'nl-NL', 'sv-SE', 'da-DK', 'nb-NO',
  'fi-FI', 'pl-PL', 'cs-CZ', 'hu-HU', 'ro-RO', 'el-GR', 'tr-TR', 'ru-RU', 'uk-UA', 'ar-SA', 'he-IL', 'hi-IN', 'ja-JP',
  'ko-KR', 'zh-CN', 'zh-TW', 'th-TH', 'vi-VN', 'id-ID',
];

const AGE_CAPS: Array<[string, string]> = [
  ['', 'No cap'],
  ['G', 'G'], ['PG', 'PG'], ['PG-13', 'PG-13'], ['R', 'R'], ['NC-17', 'NC-17'],
  ['TV-Y', 'TV-Y'], ['TV-Y7', 'TV-Y7'], ['TV-G', 'TV-G'], ['TV-PG', 'TV-PG'], ['TV-14', 'TV-14'], ['TV-MA', 'TV-MA'],
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function options(list: Array<[string, string]>): string {
  return list.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
}

const PROVIDER_OPTS: Array<[string, string]> = [['tmdb', 'TMDB'], ['tvdb', 'TVDB'], ['cinemeta', 'Cinemeta'], ['tvmaze', 'TVmaze']];
const ANIME_OPTS: Array<[string, string]> = [['mal', 'MyAnimeList'], ['anilist', 'AniList'], ['kitsu', 'Kitsu'], ['tmdb', 'TMDB'], ['tvdb', 'TVDB']];

// ---------------------------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------------------------

const CSS = `
:root { --fg:#f3f3f3; --bg:#0a0a0a; --mute:#9d9d9d; --line:#2b2b2b; --faint:#1d1d1d; --accent:#eeeeee; color-scheme:dark; }
* { box-sizing:border-box; letter-spacing:0!important; }
[hidden] { display:none!important; }
html,body { margin:0; min-height:100%; background:var(--bg); color:var(--fg); }
body { font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; -webkit-font-smoothing:antialiased; letter-spacing:-.015em; }
main { max-width:960px; margin:auto; padding:0 28px 48px; }
header { padding-top:26px; position:sticky; top:0; z-index:5; background:var(--bg); }
.brand-row { display:flex; justify-content:space-between; align-items:center; gap:24px; }
.brand { display:flex; align-items:center; gap:9px; }
.brand img { width:28px; height:28px; }
.wordmark { font-size:27px; font-weight:600; line-height:1; letter-spacing:-1.2px; margin:0; }
.header-actions { display:flex; align-items:center; gap:14px; }
.account { position:relative; }
.account:empty { display:none; }
.chip { display:inline-flex; align-items:center; gap:9px; padding:5px 12px 5px 5px; border:1px solid var(--line); border-radius:9px; background:#101010; color:var(--fg); font-size:13px; font-weight:500; line-height:1; }
.chip:hover, .chip[aria-expanded=true] { background:#181818; border-color:#3a3a3a; }
.chip .chev { color:var(--mute); font-size:10px; margin-left:-2px; }
.chip.cta { padding:8px 14px; color:var(--mute); }
.chip.cta:hover { color:var(--fg); }
.avatar { width:26px; height:26px; border-radius:6px; background:var(--accent); color:#111; font-weight:700; font-size:12px; display:inline-grid; place-items:center; letter-spacing:0; }
.avatar.big { width:36px; height:36px; font-size:15px; }
.popover { position:absolute; right:0; top:calc(100% + 10px); min-width:250px; background:#131313; border:1px solid var(--line); border-radius:14px; padding:8px; box-shadow:0 24px 60px #000c; z-index:30; }
.popover[hidden] { display:none; }
.pop-user { display:flex; align-items:center; gap:12px; padding:10px 10px 12px; border-bottom:1px solid var(--line); margin-bottom:6px; }
.pop-user strong { display:block; font-size:14px; font-weight:600; }
.pop-user small { display:block; font-size:12px; color:var(--mute); margin-top:3px; }
.popover [role=menuitem] { display:block; width:100%; text-align:left; padding:10px 10px; border-radius:9px; background:none; border:0; color:var(--fg); font-size:13px; }
.popover [role=menuitem]:hover { background:#1e1e1e; }
#menu-btn { display:none; }
#drawer-backdrop { position:fixed; inset:0; background:#000a; z-index:55; backdrop-filter:blur(3px); opacity:0; transition:opacity .25s ease; }
#drawer-backdrop.open { opacity:1; }
#drawer { position:fixed; top:0; right:0; bottom:0; width:min(330px,88vw); background:#0e0e0e; border-left:1px solid var(--line); z-index:60; padding:22px 18px 26px; display:flex; flex-direction:column; gap:20px; transform:translateX(100%); transition:transform .28s cubic-bezier(.2,.8,.2,1); overflow-y:auto; }
#drawer.open { transform:none; }
#drawer[hidden], #drawer-backdrop[hidden] { display:none; }
.drawer-head { display:flex; justify-content:space-between; align-items:center; }
.drawer-head .wordmark { font-size:22px; font-weight:600; letter-spacing:-.8px; }
#drawer-close { width:36px; height:36px; border-radius:9px; border:1px solid var(--line); background:#151515; color:var(--fg); font-size:13px; }
#drawer-account { display:flex; align-items:center; gap:12px; padding:12px; border:1px solid var(--line); border-radius:14px; background:#121212; }
#drawer-account:empty { display:none; }
#drawer-account .meta { flex:1; min-width:0; }
#drawer-account strong { display:block; font-size:14px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#drawer-account small { display:block; font-size:12px; color:var(--mute); margin-top:2px; }
#drawer-account .q { padding:0; font-size:12px; }
.drawer-nav { display:flex; flex-direction:column; gap:3px; }
.drawer-nav button { display:flex; align-items:center; justify-content:space-between; width:100%; text-align:left; padding:13px 14px; border-radius:11px; background:none; border:0; color:var(--mute); font-size:16px; font-weight:500; }
.drawer-nav button:after { content:'›'; color:#5a5a5a; font-size:18px; }
.drawer-nav button.active { background:#1b1b1b; color:var(--fg); }
.drawer-nav button[hidden] { display:none; }
.drawer-mode { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 4px; }
.drawer-mode .t { margin:0; color:var(--mute); font-size:12px; }
.seg { display:inline-flex; border:1px solid var(--line); border-radius:9px; overflow:hidden; background:#101010; }
.seg button { padding:9px 14px; background:none; border:0; color:var(--mute); font-size:13px; }
.seg button[aria-pressed=true] { background:#222; color:var(--fg); }

.locked > .t, .locked > .key-row .t, .locked .n { color:#7a7a7a; }
.locked input:not([type=checkbox]), .locked textarea { opacity:.5; }
.need-tag { display:inline-flex; align-items:center; gap:6px; margin:8px 0 0; padding:4px 9px; white-space:nowrap; border:1px dashed #3a3a3a; border-radius:6px; background:none; color:var(--mute); font-size:11px; line-height:1.2; }
.need-tag:after { content:'→'; }
.need-tag:hover { color:var(--fg); border-color:#5a5a5a; }
.checks label.locked { color:#6f6f6f; }
.checks label .need-tag { margin:0 0 0 auto; padding:2px 7px; font-size:10px; }
.item.locked .n { color:#6f6f6f; }
.item .need-tag { margin:0; }
.key-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px; }
.key-row .t { margin:0; }
.pill { font-size:11px; padding:3px 8px; border-radius:6px; border:1px solid #333; color:var(--mute); line-height:1.2; }
.pill.on { color:#111; background:var(--accent); border-color:var(--accent); }
.key-link { display:inline-block; margin-top:8px; font-size:12px; color:var(--mute); text-decoration:none; }
.key-link:hover { color:var(--fg); }
.reqs { margin:0 0 12px; }
.req { display:inline-block; margin:0 14px 6px 0; font-size:12px; color:var(--mute); }
.req.on { color:var(--fg); }
.tabs-row { display:flex; align-items:center; gap:16px; margin-top:22px; padding-bottom:16px; }
.tabs-row .tabs { flex:1 1 auto; min-width:0; margin:0; padding:0; }
.tabs-row .mode { flex:none; }
#setup-gate { position:fixed; inset:0; z-index:100; background:var(--bg); display:flex; align-items:center; justify-content:center; padding:24px; overflow:auto; }
#setup-gate[hidden] { display:none; }
#setup-form { width:100%; max-width:380px; }
#setup-form .brand { margin-bottom:18px; }
#setup-form h2 { margin-bottom:8px; }
#setup-form input { width:100%; }
#setup-submit { width:100%; background:var(--accent); color:#141414; border:1px solid #ffffff; padding:11px 16px; border-radius:8px; font-weight:650; margin-top:4px; }
#login-gate { position:fixed; inset:0; z-index:100; background:var(--bg); display:flex; align-items:center; justify-content:center; padding:24px; }
#login-gate[hidden] { display:none; }
#login-form { width:100%; max-width:360px; }
#login-form .brand { margin-bottom:18px; }
#login-form input { width:100%; }
#login-submit { width:100%; background:var(--accent); color:#141414; border:1px solid #ffffff; padding:11px 16px; border-radius:8px; font-weight:650; }
.mode { display:inline-flex; border:1px solid #eeeeee29; border-radius:6px; overflow:hidden; }
.mode label { cursor:pointer; }
.mode input { position:absolute; opacity:0; pointer-events:none; }
.mode span { display:block; padding:6px 11px; font-size:12px; color:#969696; }
.mode input:checked + span { color:var(--accent); background:#eeeeee0b; }
.mode input:focus-visible + span { outline:1px solid var(--accent); }
[data-advanced][hidden] { display:none; }
.mode-note { font-size:12px; color:var(--mute); margin:-8px 0 18px; }
#draft-status { font-size:12px; color:var(--mute); }
button { appearance:none; font:inherit; font-size:13px; font-weight:550; border:1px solid #393939; border-radius:8px; background:#1e1e1e; color:var(--fg); padding:11px 17px; cursor:pointer; transition:background .18s,border-color .18s,box-shadow .18s,transform .18s; }
button:hover { background:#2d2d2d; border-color:#5d5d5d; box-shadow:0 3px 12px #0003; }
button:active:not(:disabled) { transform:translateY(1px); }
button:disabled { opacity:.4; cursor:default; }
.tabs { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; margin-top:22px; padding:0 0 16px; border-bottom:0; }
.tabs button { flex:none; background:none; border:1px solid transparent; border-radius:6px; padding:7px 11px; color:#969696; }
.tabs button:hover { color:var(--fg); background:#171717; }
.tabs button[aria-selected=true] { color:var(--accent); background:#eeeeee0b; border-color:#eeeeee29; }
.workspace { padding-top:24px; }
section { margin:0; }
section + section { margin-top:36px; padding-top:16px; border-top:0; }
h2 { font-size:22px; font-weight:500; letter-spacing:-.6px; line-height:1.3; margin:0 0 18px; }
h2 small { display:none; }
h3 { font-size:15px; font-weight:500; letter-spacing:-.2px; margin:24px 0 14px; }
.section-content { min-width:0; }
.section-content > :first-child { margin-top:0; }
.f { margin-bottom:18px; min-width:0; }
label.t { display:block; font-size:14px; font-weight:500; margin-bottom:10px; }
input[type=text],input[type=password],input[type=number],input[type=url],select,textarea { width:100%; min-width:0; min-height:38px; font:inherit; color:inherit; background:#0d0d0d; border:1px solid #383838; border-radius:6px; padding:8px 11px; margin:0; outline:none; appearance:none; }
input::placeholder,textarea::placeholder { color:#717171; }
input:hover,select:hover,textarea:hover { border-color:#606060; }
input:focus,select:focus,textarea:focus { border-color:#b3b3b3; }
:focus-visible { outline:2px solid #c9c9c9; outline-offset:4px; }
.sel { position:relative; }
.sel:after { content:'⌄'; position:absolute; right:12px; top:6px; pointer-events:none; color:var(--mute); }
select { padding-right:36px; }
textarea { min-height:76px; resize:vertical; font-size:14px; line-height:1.6; }
.two { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 20px; }
.row { display:flex; flex-wrap:wrap; align-items:flex-end; gap:12px; }
.row > .f { flex:1; min-width:140px; }
.hint,.note { font-size:14px; line-height:1.65; color:var(--mute); margin:6px 0 16px; max-width:740px; }
button.q { border:0; background:none; color:#bbb; padding:0; text-decoration:underline; text-underline-offset:4px; }
a { color:var(--fg); text-underline-offset:4px; }
#s-general .section-content { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.setting-row { display:flex; flex-direction:column; justify-content:space-between; gap:16px; min-height:0; padding:18px; background:#171717; border:1px solid #353535; border-radius:10px; }
.setting-row label.t { font-size:15px; font-weight:500; letter-spacing:-.2px; margin-bottom:6px; }
.setting-row .hint { margin:0; }
.setting-row .f { margin:0; }
.setting-row input { font-size:15px; min-height:38px; }
#s-age { grid-column:1 / -1; display:grid; grid-template-columns:1fr minmax(200px,320px); gap:4px 24px; align-items:center; margin:0; padding:18px; border:1px solid #353535; border-radius:10px; background:#111; }
#s-age h2 { font-size:15px; font-weight:500; letter-spacing:-.2px; margin:0; }
#s-age .f { grid-column:2; grid-row:1 / span 2; margin:0; }
#s-age .f > label { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
#s-age .note { margin:0; grid-column:1; max-width:420px; }
#s-meta .section-content,#s-jellyfin .section-content,#s-search .section-content { padding:0; }
.list { display:grid; gap:4px; border:0; border-radius:6px; margin:0 0 24px; overflow:hidden; }
.item { display:flex; align-items:center; gap:14px; padding:10px 12px; border:0; border-radius:6px; background:#161616; }
.item:last-child { border:0; }
.item .n { flex:1; min-width:0; }
.item .n small { display:block; font-size:12px; color:var(--mute); }
.item.off .n { color:#808080; }
.ud { display:flex; gap:4px; }
.ud button { padding:3px; width:34px; height:34px; color:#ccc; flex:none; }
input[type=checkbox] { appearance:none; width:34px; height:20px; border:1px solid #484848; border-radius:20px; background:#272727; margin:0; cursor:pointer; flex:none; position:relative; transition:background .18s,border-color .18s; }
input[type=checkbox]:before { content:''; position:absolute; width:12px; height:12px; border-radius:3px; background:#a8a8a8; top:3px; left:3px; transition:transform .18s,background .18s; }
input[type=checkbox]:checked { background:var(--accent); border-color:var(--accent); }
input[type=checkbox]:checked:before { background:#191919; transform:translateX(14px); }
.checks { display:flex; flex-wrap:wrap; gap:12px 24px; margin:0 0 24px; }
.checks label { display:inline-flex; align-items:center; gap:9px; font-size:14px; cursor:pointer; }
#scrobble { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
#scrobble label { border:1px solid #353535; border-radius:6px; background:#141414; padding:14px; }
#scrobble label:has(:checked) { border-color:#eeeeee44; background:#eeeeee08; }
.service-card { border:1px solid #343434; border-radius:8px; margin:12px 0; background:#141414; }
.service-card summary { display:flex; justify-content:space-between; align-items:center; padding:14px 18px; list-style:none; cursor:pointer; font-size:15px; }
.service-card summary::-webkit-details-marker { display:none; }
.service-card summary:after { content:'+'; color:#aaa; font-size:22px; font-weight:300; }
.service-card[open] summary:after { content:'−'; }
.service-card[open] summary { border-bottom:0; }
.svc { padding:18px; }
#s-addons .section-content > .f { border:1px solid #343434; border-radius:8px; padding:18px; background:#141414; }
#s-addons .b { display:flex; justify-content:flex-end; margin-top:12px; }
.gname { font-size:14px; color:#a9a9a9; padding:18px 0 10px; }
.status,.probe { font-size:13px; color:var(--mute); margin:10px 0; white-space:pre-line; }
.status:empty { display:none; }
.status.on { color:var(--fg); }
.probe div { padding:8px 0; border-bottom:1px solid var(--line); }
.out { margin-bottom:20px; border:1px solid #353535; padding:18px; border-radius:8px; background:#141414; }
.out .u { font:12px/1.6 ui-monospace,monospace; overflow-wrap:anywhere; padding:14px; border:1px solid #363636; border-radius:5px; background:#0d0d0d; max-height:110px; overflow:auto; }
.out .u:empty:before { content:'Preparing your link…'; color:var(--mute); }
.out .b { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-top:12px; font-size:13px; }
.mono,.code { font-family:ui-monospace,monospace; overflow-wrap:anywhere; }
.code { font-size:26px; letter-spacing:.12em; }
input[type=text],input[type=password],input[type=number],input[type=url],select { min-height:44px; }
input:focus,select:focus,textarea:focus { box-shadow:0 0 0 3px #ffffff0c; }
.hint,.note,.status,.probe,.item .n { overflow-wrap:anywhere; }
.setting-row,#s-age { border-radius:8px; }
.item { min-height:58px; }
.item:hover { background:#1d1d1d; }
.ud { flex:none; }
.service-card summary { min-height:54px; gap:16px; }
.service-card summary:hover { background:#1b1b1b; }
.service-card summary:after { flex:none; width:16px; text-align:center; }
#profiles .f { display:block; }
#profiles .check { display:flex; align-items:center; gap:10px; margin:12px 0; }
#profiles > .svc { border-top:1px solid var(--line); padding:20px 0; }
#s-tracking .section-content > .b { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:22px; }
.out .u { user-select:all; }
.out .b > span { min-height:20px; }
header { background:#0a0a0af5; backdrop-filter:blur(16px); }
.workspace { padding-top:30px; }
h2 { font-weight:600; }
.setting-row,#s-age,.out,.service-card,#s-addons .section-content > .f { background:#131313; border-color:#2e2e2e; }
.setting-row { padding:22px; gap:24px; }
.setting-row:focus-within,#s-age:focus-within { border-color:#666666; }
input[type=text],input[type=password],input[type=number],input[type=url],select,textarea { background:#0d0d0d; border-color:#323232; border-radius:8px; padding:12px 14px; font-size:14px; min-height:46px; }
input:focus,select:focus,textarea:focus { border-color:#aaaaaa; box-shadow:0 0 0 3px #eeeeee0c; }
:focus-visible { outline-color:var(--accent); }
.list { border-color:#2e2e2e; border-radius:8px; }
.item { background:#131313; border-color:#2a2a2a; padding:13px 15px; }
.item:hover { background:#1d1d1d; }
.ud { gap:2px; }
.ud button { background:transparent; border-color:transparent; color:#999999; font-size:18px; }
.ud button:hover:not(:disabled) { color:var(--accent); background:#eeeeee0b; border-color:#eeeeee29; }
.ud button:disabled { opacity:.22; }
.out .u { background:#0b0b0b; border-color:#292929; color:#b5b5b5; border-radius:6px; }
.out .b [data-copy] { background:var(--accent); color:#141414; border-color:var(--accent); min-width:88px; }
.service-card summary { padding:18px 20px; }
.service-card summary:after { font-size:19px; color:var(--accent); }
.service-card summary:hover { background:#202020; }
#draft-status { font-size:11px; }
#draft-status:not(:empty):before { content:''; display:inline-block; height:5px; width:5px; border-radius:1.5px; background:var(--accent); margin-right:8px; }
.select-control { position:relative; min-width:0; }
.select-control > select { display:none; }
.sel:has(.select-control):after { display:none; }
.select-trigger { width:100%; min-height:46px; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 14px; background:#0d0d0d; border-color:#323232; text-align:left; font-size:14px; font-weight:400; }
.select-trigger:after { content:''; width:7px; height:7px; border-right:1.5px solid #a4a4a4; border-bottom:1.5px solid #a4a4a4; transform:rotate(45deg); margin:0 3px 4px 10px; flex:none; }
.select-trigger[aria-expanded=true] { border-color:#aaaaaa; box-shadow:0 0 0 3px #eeeeee0c; }
.select-menu { position:fixed; inset:auto; margin:0; padding:6px; border:1px solid #424242; border-radius:8px; background:#1b1b1b; color:var(--fg); box-shadow:0 18px 55px #0009; overflow:auto; z-index:20; }
.select-menu [role=option] { display:flex; justify-content:space-between; align-items:center; width:100%; text-align:left; background:transparent; border:0; border-radius:5px; padding:10px 12px; min-height:40px; font-weight:400; }
.select-menu [role=option]:hover,.select-menu [role=option]:focus { background:#2e2e2e; outline:none; box-shadow:none; }
.select-menu [aria-selected=true] { color:var(--accent); background:#eeeeee09; }
.select-menu [aria-selected=true]:after { content:'✓'; margin-left:12px; }
.select-menu,.out .u,textarea { scrollbar-width:thin; scrollbar-color:#494949 transparent; }
.tabs button { position:relative; min-height:40px; border-radius:6px; font-weight:500; }
.tabs button[aria-selected=true] { background:#242424; border-color:transparent; box-shadow:none; }
.setting-row,.out,.service-card { box-shadow:none; border-color:#222; }
.setting-row { border-color:#282828; }
.hint,.note { font-size:13px; line-height:1.75; }
.service-card { transition:border-color .18s; }
.service-card[open] { border-color:#484848; }
.service-card summary:after { content:''; width:7px; height:7px; border-right:1.5px solid #aaa; border-bottom:1.5px solid #aaa; transform:rotate(45deg); margin:0 4px 4px 12px; transition:transform .18s; }
.service-card[open] summary:after { content:''; transform:rotate(225deg); margin-bottom:0; }
.select-trigger:after { transition:transform .18s; }
.select-trigger[aria-expanded=true]:after { transform:rotate(225deg); margin-bottom:0; }
.select-menu [role=option] { gap:12px; }
.catalog-toolbar { display:flex; align-items:center; gap:16px; margin:22px 0 4px; }
.catalog-toolbar input { flex:1; width:100%; min-width:0; }
#catalog-count { color:var(--mute); font:12px ui-monospace,monospace; white-space:nowrap; }
#catalog-empty { color:var(--mute); text-align:center; padding:36px 20px; }
.item:focus-within { background:#202020; }
.tabs button:hover { box-shadow:none; }
.item .n { font-size:14px; }
.item .n small { margin-top:3px; font-size:11px; }
.ud button { width:36px; height:36px; border-radius:6px; }
.ud button:hover:not(:disabled) { border-color:transparent; box-shadow:none; background:#ffffff0b; }
input[type=text],input[type=password],input[type=number],input[type=url],textarea,.select-trigger { border-color:#292929; background:#111; }
.setting-row:focus-within,#s-age:focus-within { border-color:#383838; }
.out .u { border:0; padding:16px; line-height:1.8; }
.service-card summary { font-weight:500; }
.service-card .svc { padding-top:8px; }
.profile-settings { margin:8px 0 28px; padding:0; }
.profile-settings > summary,#profiles details > summary { display:flex; justify-content:space-between; align-items:center; gap:16px; list-style:none; cursor:pointer; min-height:48px; padding:12px 14px; background:#171717; border-radius:6px; font-size:14px; }
.profile-settings > summary::-webkit-details-marker,#profiles details > summary::-webkit-details-marker { display:none; }
.profile-settings > summary:after,#profiles details > summary:after { content:''; width:6px; height:6px; border-right:1.5px solid #999; border-bottom:1.5px solid #999; transform:rotate(45deg); margin-right:4px; flex:none; }
.profile-settings[open] > summary:after,#profiles details[open] > summary:after { transform:rotate(225deg); }
.profile-settings > .note { margin:14px 0; }
#profiles > .svc { border:0; background:#111; border-radius:8px; padding:20px; margin:12px 0; }
#profiles .check { font-size:13px; padding:6px 0; }
#profile-add { margin-top:10px; }
#s-jellyfin .section-content > .two { margin-bottom:8px; }
@media(min-width:701px) { #s-tracking .two { grid-template-columns:minmax(0,1fr) minmax(0,1.2fr); } }
@media(max-width:700px) { input[type=text],input[type=password],input[type=number],input[type=url],textarea,.select-trigger { font-size:16px; } #scrobble label { padding:12px 9px; gap:7px; font-size:12px; } }
@media(prefers-reduced-motion:reduce) { *,*:before { transition:none!important; } }
@media(max-width:700px) { main { padding:0 20px 40px; } header { padding-top:24px; } .wordmark { font-size:26px; letter-spacing:-1px; } .brand { gap:10px; } .brand img { width:27px; height:27px; } .header-actions { gap:10px; } #account, #menu-btn { display:inline-flex; flex-direction:column; justify-content:center; align-items:center; gap:4px; width:42px; height:42px; border:1px solid var(--line); border-radius:10px; background:#101010; } #menu-btn span { display:block; width:16px; height:1.5px; background:var(--fg); border-radius:1px; transition:transform .2s ease, opacity .2s ease; } #menu-btn[aria-expanded=true] span:nth-child(1) { transform:translateY(5.5px) rotate(45deg); } #menu-btn[aria-expanded=true] span:nth-child(2) { opacity:0; } #menu-btn[aria-expanded=true] span:nth-child(3) { transform:translateY(-5.5px) rotate(-45deg); } header { padding-bottom:14px; } .workspace { padding-top:18px; } .workspace { padding-top:22px; } h2 { font-size:22px; } #s-general .section-content,.two { grid-template-columns:1fr; } .setting-row { min-height:0; padding:18px; } #s-age { display:block; padding:18px; } #s-age .note { margin:10px 0 0; } #s-age .f { margin-top:18px; } #scrobble { grid-template-columns:repeat(2,minmax(0,1fr)); } #s-meta .section-content,#s-jellyfin .section-content,#s-search .section-content { padding:20px; } .svc { padding:20px; } }
@media(max-width:700px) { #s-meta .section-content,#s-jellyfin .section-content,#s-search .section-content { padding:0; } }
`;

// ---------------------------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------------------------

function body(): string {
  return `
<main>
<div id="setup-gate" hidden><form id="setup-form" autocomplete="on"><div class="brand"><img src="/logo.svg?v=rill" alt=""><h1 class="wordmark">rill</h1></div><h2>Create your account</h2><p class="note">One account protects this page and signs you in from Jellyfin apps. Your settings are stored on your Worker and follow you to every device.</p><div class="f"><label class="t" for="setup-user">Username</label><input type="text" id="setup-user" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required></div><div class="f"><label class="t" for="setup-pass">Password</label><input type="password" id="setup-pass" name="password" autocomplete="new-password" minlength="8" required><p class="hint">At least 8 characters.</p></div><div class="f"><label class="t" for="setup-pass2">Confirm password</label><input type="password" id="setup-pass2" autocomplete="new-password" minlength="8" required></div><button type="submit" id="setup-submit">Create account</button><p class="status" id="setup-status" role="alert"></p></form></div>
<div id="login-gate" hidden><form id="login-form" autocomplete="on"><div class="brand"><img src="/logo.svg?v=rill" alt=""><h1 class="wordmark">rill</h1></div><p class="note">Sign in with your Jellyfin username and password to open your settings.</p><div class="f"><label class="t" for="login-user">Username</label><input type="text" id="login-user" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required></div><div class="f"><label class="t" for="login-pass">Password</label><input type="password" id="login-pass" name="password" autocomplete="current-password" required></div><button type="submit" id="login-submit">Sign in</button><p class="status" id="login-status" role="alert"></p></form></div>
<header>
  <div class="brand-row"><div class="brand"><img src="/logo.svg?v=rill" alt=""><h1 class="wordmark">rill</h1></div><div class="header-actions"><span id="draft-status" role="status" hidden>Saved on this device</span><div id="account" class="account"></div><button type="button" id="menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><span></span><span></span><span></span></button></div></div>
  <div class="tabs-row">
  <nav class="tabs" role="tablist" aria-label="Configuration sections">
    ${[['general','General'],['addons','Addons'],['jellyfin','Jellyfin'],['meta','Metadata'],['catalogs','Catalogs'],['tracking','Scrobbling'],['install','Connect']].map(([id,label],i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-tab="${id}"${id==='meta'||id==='catalogs'||id==='tracking'?' data-advanced':''}>${label}</button>`).join('')}
  </nav>
  <div class="mode" role="group" aria-label="Settings mode"><label><input type="radio" name="mode" value="simple" id="mode-simple"><span>Simple</span></label><label><input type="radio" name="mode" value="advanced" id="mode-advanced"><span>Advanced</span></label></div>
  </div>
</header>
<div id="drawer-backdrop" hidden></div>
<aside id="drawer" hidden aria-label="Menu">
  <div class="drawer-head"><div class="brand"><img src="/logo.svg?v=rill" alt=""><span class="wordmark">rill</span></div><button type="button" id="drawer-close" aria-label="Close menu">✕</button></div>
  <div id="drawer-account"></div>
  <nav id="drawer-nav" class="drawer-nav" aria-label="Sections"></nav>
  <div class="drawer-mode"><span class="t">Mode</span><div class="seg" role="group" aria-label="Settings mode"><button type="button" data-mode="simple" aria-pressed="false">Simple</button><button type="button" data-mode="advanced" aria-pressed="false">Advanced</button></div></div>
</aside>
<div class="workspace"><div id="panels">


<section id="s-general">
  <h2><small>1</small>General</h2>
  <div class="setting-row"><div><label class="t" for="name">Display name</label><p class="hint">The server name shown in your apps.</p></div><div class="f"><input type="text" id="name" data-k="name" autocomplete="off" spellcheck="false"></div></div>
  <div class="setting-row"><div><label class="t" for="language">Language</label><p class="hint">For titles, descriptions and artwork.</p></div><div class="f"><input type="text" id="language" data-k="language" list="langs" autocomplete="off" spellcheck="false" placeholder="en-US"><datalist id="langs">${LANGUAGES.map((l) => `<option value="${l}">`).join('')}</datalist></div></div>
</section>

<section id="s-meta">
  <h2><small>2</small>Metadata</h2>
  <h3>API keys</h3>
  <p class="note">Everything below that needs a key stays locked until you add it. Free sources such as Cinemeta, Metahub, TVmaze and the anime sites work without keys.</p>
  <div class="two">
    <div class="f"><div class="key-row"><label class="t" for="k-tmdb">TMDB</label><span class="pill" data-key-status="tmdb">Not set</span></div><input type="password" id="k-tmdb" data-k="keys.tmdb" class="key" autocomplete="off"><a class="key-link" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">Get a TMDB key ↗</a></div>
    <div class="f"><div class="key-row"><label class="t" for="k-tvdb">TVDB</label><span class="pill" data-key-status="tvdb">Not set</span></div><input type="password" id="k-tvdb" data-k="keys.tvdb" class="key" autocomplete="off"><a class="key-link" href="https://thetvdb.com/api-information" target="_blank" rel="noopener">Get a TVDB key ↗</a></div>
    <div class="f"><div class="key-row"><label class="t" for="k-fanart">Fanart.tv</label><span class="pill" data-key-status="fanart">Not set</span></div><input type="password" id="k-fanart" data-k="keys.fanart" class="key" autocomplete="off"><a class="key-link" href="https://fanart.tv/get-an-api-key/" target="_blank" rel="noopener">Get a Fanart.tv key ↗</a></div>
    <div class="f"><div class="key-row"><label class="t" for="k-rpdb">RPDB</label><span class="pill" data-key-status="rpdb">Not set</span></div><input type="password" id="k-rpdb" data-k="keys.rpdb" class="key" autocomplete="off"><a class="key-link" href="https://ratingposterdb.com/" target="_blank" rel="noopener">Get a RPDB key ↗</a></div>
    <div class="f"><div class="key-row"><label class="t" for="k-mdblist">MDBList</label><span class="pill" data-key-status="mdblist">Not set</span></div><input type="password" id="k-mdblist" data-k="keys.mdblist" class="key" autocomplete="off"><a class="key-link" href="https://mdblist.com/preferences/" target="_blank" rel="noopener">Get a MDBList key ↗</a></div>
  </div>
  <p class="hint"><button class="q" type="button" id="show-keys">Show keys</button> Keys are stored on your Worker and forwarded only to their providers.</p>
  <h3>Providers</h3>
  <div class="two">
    <div class="f"><label class="t" for="p-movie">Movies</label><div class="sel"><select id="p-movie" data-k="providers.movie">${options(PROVIDER_OPTS)}</select></div></div>
    <div class="f"><label class="t" for="p-series">Series</label><div class="sel"><select id="p-series" data-k="providers.series">${options(PROVIDER_OPTS)}</select></div></div>
    <div class="f"><label class="t" for="p-anime">Anime</label><div class="sel"><select id="p-anime" data-k="providers.anime">${options(ANIME_OPTS)}</select></div></div>
  </div>
  <p class="note">Where movie, series and anime details come from. Cinemeta always fills in anything the chosen provider lacks.</p>
  <h3>Artwork priority</h3>
  <p class="note">Ticked sources are used, top first. Locked sources are skipped until their key exists.</p>
  <label class="t">Posters</label>
  <div class="list" data-order="artwork.posters" data-options="tmdb,fanart,tvdb,rpdb,metahub"></div>
  <label class="t">Backgrounds</label>
  <div class="list" data-order="artwork.backgrounds" data-options="tmdb,fanart,tvdb,metahub"></div>
  <label class="t">Logos</label>
  <div class="list" data-order="artwork.logos" data-options="fanart,tmdb,tvdb,metahub"></div>
</section>

<section id="s-catalogs">
  <h2><small>3</small>Catalogs</h2>
  <p class="note">Choose catalogs and arrange their order in your apps.</p>
  <div id="catalog-picker">
  <div class="catalog-toolbar"><input type="text" id="catalog-filter" aria-label="Filter catalogs" placeholder="Search catalogs" autocomplete="off" spellcheck="false"><span id="catalog-count" role="status"></span></div>
  <div id="catalogs"></div>
  <p id="catalog-empty" hidden>No matching catalogs.</p>
  <p class="status" id="cat-status"></p>
  </div>
  <h3>Your lists</h3>
  <div class="two">
    <div class="f" data-needs="mdblist"><label class="t" for="l-mdblist">MDBList list ids</label><textarea id="l-mdblist" data-lines="lists.mdblist" placeholder="one per line" spellcheck="false"></textarea><p class="hint">Needs the MDBList key above.</p></div>
    <div class="f" data-needs="trakt"><label class="t" for="l-trakt">Trakt list ids</label><textarea id="l-trakt" data-lines="lists.trakt" placeholder="user/list-slug, one per line" spellcheck="false"></textarea><p class="hint">Requires a Trakt client ID.</p></div>
    <div class="f" data-needs="publicmetadb"><label class="t" for="l-pmdb">PublicMetaDB list IDs</label><textarea id="l-pmdb" data-lines="lists.publicmetadb" placeholder="one per line" spellcheck="false"></textarea></div>
    <div class="f" data-needs="publicmetadb"><label class="t" for="l-pmdb-picks">PublicMetaDB pick IDs</label><textarea id="l-pmdb-picks" data-lines="lists.publicmetadbPicks" placeholder="one per line" spellcheck="false"></textarea></div>
    <div class="f" data-needs="tmdb"><label class="t" for="l-tmdb-collections">TMDB collections</label><textarea id="l-tmdb-collections" data-lines="lists.tmdbCollections" placeholder="Collection links or IDs, one per line"></textarea></div>
    <div class="f" data-needs="tvdb"><label class="t" for="l-tvdb">TVDB lists</label><textarea id="l-tvdb" data-lines="lists.tvdb" placeholder="List links or IDs, one per line" spellcheck="false"></textarea></div>
    <div class="f"><label class="t" for="l-letterboxd">Letterboxd lists and watchlists</label><textarea id="l-letterboxd" data-lines="lists.letterboxd" placeholder="List or watchlist links, one per line" spellcheck="false"></textarea></div>
    <div class="f"><label class="t" for="l-flixpatrol">FlixPatrol regions</label><textarea id="l-flixpatrol" data-lines="lists.flixpatrol" placeholder="global&#10;romania&#10;united-states" spellcheck="false"></textarea><p class="hint">One region per line. Available charts appear above.</p></div>
  </div>
  <h3>MovieLens</h3>
  <div class="two">
    <div class="f"><label class="t" for="ml-user">Username</label><input id="ml-user" data-k="movieLens.username" autocomplete="off"></div>
    <div class="f"><label class="t" for="ml-pass">Password</label><input id="ml-pass" type="password" data-k="movieLens.password" autocomplete="off"></div>
    <label class="check"><input type="checkbox" data-k="movieLens.syncRatings">Import ratings daily from connected Trakt, Simkl and MDBList accounts</label>
    <div class="b"><button type="button" id="ml-sync">Import ratings now</button><button type="button" id="ml-status">Check last import</button></div>
    <div class="f"><label class="t" for="ml-csv">Import an IMDb ratings CSV</label><input id="ml-csv" type="file" accept=".csv,text/csv"></div>
    <span id="ml-result" class="hint" role="status"></span>
  </div>
  <h3>Custom catalogs</h3>
  <p class="note">Build discovery lists or combine existing catalogs in the order you choose.</p>
  <div id="custom-catalogs"></div>
  <button type="button" id="add-custom-catalog">Add catalog</button>
  <h3>Recommendations</h3>
  <p class="note">Optional AI recommendations use your viewing history with the provider you choose. Provider charges apply when a taste profile or recommendation list is generated.</p>
  <div id="rec-req" class="reqs"></div>
  <label class="check"><input type="checkbox" data-k="recommendations.enabled">Enable recommendations</label>
  <label class="check"><input type="checkbox" data-k="recommendations.aiSearch">Enable AI search with the prefix “ai:”</label>
  <p class="hint">For example: ai: thoughtful science fiction about first contact. Each uncached request uses your chosen AI provider.</p>
  <div class="two">
    <div class="f"><label class="t" for="rec-provider">Provider</label><select id="rec-provider" data-k="recommendations.provider"><option value="gemini">Gemini</option><option value="openrouter">OpenRouter</option></select></div>
    <div class="f"><label class="t" for="rec-sources">Viewing history</label><select id="rec-sources" data-k="recommendations.sources"><option value="both">Simkl and MDBList</option><option value="simkl">Simkl</option><option value="mdblist">MDBList</option><option value="primary">Primary tracker</option></select><p class="hint">Local playback history is included. Independent profiles use only their own history.</p></div>
    <div class="f"><label class="t" for="rec-key">API key</label><input id="rec-key" type="password" data-k="recommendations.apiKey" autocomplete="off"></div>
    <div class="f"><label class="t" for="rec-model">Model</label><input id="rec-model" data-k="recommendations.model" placeholder="Your provider's model name"></div>
    <div class="f"><label class="t" for="rec-reasoning">Reasoning effort</label><select id="rec-reasoning" data-k="recommendations.reasoning"><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
    <div class="f"><label class="t" for="rec-order">Order</label><select id="rec-order" data-k="recommendations.order"><option value="balanced">Balance rating and audience</option><option value="suggested">Suggested order</option><option value="popular">Most popular</option><option value="acclaimed">Highest rated</option></select></div>
    <div class="f"><label class="t" for="rec-hours">Refresh</label><select id="rec-hours" data-k="recommendations.refreshHours"><option value="6">Every 6 hours</option><option value="12">Every 12 hours</option><option value="24">Daily</option></select></div>
    <div class="f"><label class="t" for="rec-votes">Minimum votes</label><input id="rec-votes" type="number" min="0" data-k="recommendations.minVotes"></div>
    <div class="f"><label class="t" for="rec-stalled">Unfinished titles</label><select id="rec-stalled" data-k="recommendations.stalledWeight"><option value="ignore">Ignore inactivity</option><option value="note">Treat inactivity neutrally</option><option value="mild">Weak sign of disinterest</option><option value="dislike">Treat inactivity as dislike</option></select></div>
    <div class="f"><label class="t" for="rec-days">Days before considering a title inactive</label><input id="rec-days" type="number" min="7" data-k="recommendations.staleDays"></div>
  </div>
  <label class="check"><input type="checkbox" data-k="recommendations.webSearch">Search for recent releases</label>
  <div class="b"><button type="button" id="prepare-recommendations">Prepare recommendations</button><button type="button" id="rebuild-recommendations">Rebuild from history</button><button type="button" id="check-recommendations">Check progress</button><span id="rec-status" class="hint" role="status"></span></div>
</section>

<section id="s-addons">
  <h2><small>4</small>Addons</h2>
  <p class="note">Paste Stremio addon manifest links, one per line. Catalogs and details come from your metadata addons, with Cinemeta filling in automatically. Streams and subtitles come from the addons below.</p>
  <p class="mode-note" id="addons-mode-note">Simple mode. Switch to <strong>Advanced</strong> at the top for scrobbling, API keys, anime lists, custom catalogs and AI recommendations.</p>
  <div class="f">
    <label class="t" for="a-catalog">Catalogs</label>
    <textarea id="a-catalog" data-lines="addons.catalog" placeholder="https://…/manifest.json" spellcheck="false"></textarea>
    <div class="b"><button type="button" data-probe="addons.catalog">Check</button></div>
    <div class="probe" data-probe-out="addons.catalog"></div>
  </div>
  <div id="addon-catalog-picker" hidden><h3>Your catalogs</h3><p class="note">Turn catalogs on or off and drag them into the order your apps should show.</p></div>
  <div class="f">
    <label class="t" for="a-meta">Metadata</label>
    <textarea id="a-meta" data-lines="addons.meta" placeholder="https://…/manifest.json" spellcheck="false"></textarea>
    <div class="b"><button type="button" data-probe="addons.meta">Check</button></div>
    <div class="probe" data-probe-out="addons.meta"></div>
  </div>
  <div class="f">
    <label class="t" for="a-stream">Streams</label>
    <textarea id="a-stream" data-lines="addons.stream" placeholder="https://…/manifest.json" spellcheck="false"></textarea>
    <div class="b"><button type="button" data-probe="addons.stream">Check</button></div>
    <div class="probe" data-probe-out="addons.stream"></div>
  </div>
  <div class="f">
    <label class="t" for="a-subtitle">Subtitles</label>
    <textarea id="a-subtitle" data-lines="addons.subtitle" placeholder="https://…/manifest.json" spellcheck="false"></textarea>
    <div class="b"><button type="button" data-probe="addons.subtitle">Check</button></div>
    <div class="probe" data-probe-out="addons.subtitle"></div>
  </div>
</section>

<section id="s-tracking">
  <h2><small>5</small>Scrobbling</h2>
  <div class="b"><button type="button" id="delivery-check">Check delivery status</button><button type="button" id="delivery-retry" hidden>Retry failed updates</button></div><p class="status" id="delivery-status" aria-live="polite"></p>
  <div class="two">
    <div class="f"><label class="t" for="tr-primary">Primary tracker</label><div class="sel"><select id="tr-primary" data-k="trackers.primary"><option value="off">Off</option><option value="trakt">Trakt</option><option value="simkl">Simkl</option><option value="mdblist">MDBList</option><option value="mal">MyAnimeList</option><option value="anilist">AniList</option></select></div><p class="hint">Used for continue watching and watched status.</p></div>
    <div class="f"><label class="t">Also scrobble to</label>
      <div class="checks" id="scrobble">
        <label data-needs="trakt"><input type="checkbox" data-arr="trackers.scrobbleTo" value="trakt"> Trakt</label>
        <label data-needs="simkl"><input type="checkbox" data-arr="trackers.scrobbleTo" value="simkl"> Simkl</label>
        <label data-needs="mdblist"><input type="checkbox" data-arr="trackers.scrobbleTo" value="mdblist"> MDBList</label>
        <label data-needs="publicmetadb"><input type="checkbox" data-arr="trackers.scrobbleTo" value="publicmetadb"> PublicMetaDB</label>
        <label data-needs="mal"><input type="checkbox" data-arr="trackers.scrobbleTo" value="mal"> MyAnimeList</label>
        <label data-needs="anilist"><input type="checkbox" data-arr="trackers.scrobbleTo" value="anilist"> AniList</label>
      </div>
    </div>
  </div>

  <p class="note">Progress is sent when playback changes. If the player closes without reporting a stop, recent progress may be lost.</p>
  <details class="service-card"><summary>Media types per service</summary><div class="svc">
    ${[['trakt','Trakt'],['simkl','Simkl'],['mdblist','MDBList'],['publicmetadb','PublicMetaDB'],['mal','MyAnimeList'],['anilist','AniList']].map(([key,label]) => `<h3>${label}</h3><div class="checks"><label><input type="checkbox" data-k="trackers.media.${key}.movie"> Movies</label><label><input type="checkbox" data-k="trackers.media.${key}.series"> Series</label></div>`).join('')}
  </div></details>
  <div class="svc" id="svc-trakt">
    <h3>Trakt</h3>
    <p class="note">Create an app at trakt.tv/oauth/applications with redirect <span class="mono">urn:ietf:wg:oauth:2.0:oob</span>, then paste its id and secret.</p>
    <div class="two">
      <div class="f"><label class="t" for="trakt-id">Client id</label><input type="text" id="trakt-id" data-ui="trakt.clientId" autocomplete="off" spellcheck="false"></div>
      <div class="f"><label class="t" for="trakt-secret">Client secret</label><input type="password" id="trakt-secret" data-ui="trakt.clientSecret" autocomplete="off"></div>
    </div>
    <div class="row"><button type="button" id="trakt-connect">Connect</button><button type="button" id="trakt-refresh">Refresh token</button><button type="button" id="trakt-disconnect">Disconnect</button></div>
    <p class="hint">Refresh here when your token expires, then replace the install link in your player. Playback never rotates credentials in the background.</p>
    <div id="trakt-code" hidden><div class="code" id="trakt-usercode"></div><p class="note">Enter the code at <a id="trakt-verify" target="_blank" rel="noopener"></a>. This page keeps checking until Trakt confirms.</p></div>
    <p class="status" id="trakt-status"></p>
  </div>

  <div class="svc"><h3>MDBList &amp; PublicMetaDB</h3><p class="note">MDBList uses the key in Metadata. PublicMetaDB receives stopped positions and watched changes; choose another service for your library history.</p><div class="f"><label class="t" for="k-publicmetadb">PublicMetaDB API key</label><input type="password" id="k-publicmetadb" data-k="keys.publicmetadb" autocomplete="off"></div></div>
  <div class="svc" id="svc-simkl">
    <h3>Simkl</h3>
    <p class="note">Create an app at simkl.com/settings/developer and paste its client id.</p>
    <div class="f"><label class="t" for="simkl-id">Client id</label><input type="text" id="simkl-id" data-ui="simkl.clientId" autocomplete="off" spellcheck="false"></div>
    <div class="row"><button type="button" id="simkl-connect">Connect</button><button type="button" id="simkl-disconnect">Disconnect</button></div>
    <div id="simkl-code" hidden><div class="code" id="simkl-usercode"></div><p class="note">Enter the code at <a id="simkl-verify" target="_blank" rel="noopener"></a>. This page keeps checking until Simkl confirms.</p></div>
    <p class="status" id="simkl-status"></p>
  </div>

  <div class="svc" id="svc-mal">
    <h3>MyAnimeList</h3>
    <p class="note">Create an API client at myanimelist.net/apiconfig (type: other). Open the authorisation page, approve, then paste the <span class="mono">code</span> from the address you land on.</p>
    <div class="two">
      <div class="f"><label class="t" for="mal-id">Client id</label><input type="text" id="mal-id" data-ui="mal.clientId" autocomplete="off" spellcheck="false"></div>
      <div class="f"><label class="t" for="mal-redirect">Redirect URI (only if your app has one)</label><input type="text" id="mal-redirect" data-ui="mal.redirectUri" autocomplete="off" spellcheck="false"></div>
    </div>
    <div class="row"><button type="button" id="mal-open">Open authorisation page</button></div>
    <p class="hint mono" id="mal-url"></p>
    <div class="row"><div class="f"><label class="t" for="mal-code">Authorisation code</label><input type="text" id="mal-code" autocomplete="off" spellcheck="false"></div><div class="f" style="flex:0"><button type="button" id="mal-exchange">Exchange</button></div></div>
    <div class="row"><button type="button" id="mal-disconnect">Disconnect</button></div>
    <p class="status" id="mal-status"></p>
  </div>

  <div class="svc" id="svc-anilist">
    <h3>AniList</h3>
    <p class="note">Create a client at anilist.co/settings/developer with redirect <span class="mono">https://anilist.co/api/v2/oauth/pin</span>. Open the link, approve, and paste the token AniList shows you.</p>
    <div class="f"><label class="t" for="anilist-id">Client id</label><input type="text" id="anilist-id" data-ui="anilist.clientId" autocomplete="off" spellcheck="false"></div>
    <p class="hint"><a id="anilist-link" target="_blank" rel="noopener">Open AniList authorisation page</a></p>
    <div class="row"><div class="f"><label class="t" for="anilist-token">Access token</label><input type="password" id="anilist-token" autocomplete="off"></div><div class="f" style="flex:0"><button type="button" id="anilist-save">Save</button></div></div>
    <div class="row"><button type="button" id="anilist-disconnect">Disconnect</button></div>
    <p class="status" id="anilist-status"></p>
  </div>
</section>

<section id="s-search">
  <h2><small>6</small>Search</h2>
  <label class="t">Providers</label>
  <div class="checks">
    <label data-needs="tmdb"><input type="checkbox" data-arr="search.providers" value="tmdb"> TMDB</label>
    <label data-needs="tvdb"><input type="checkbox" data-arr="search.providers" value="tvdb"> TVDB</label>
    <label><input type="checkbox" data-arr="search.providers" value="cinemeta"> Cinemeta</label>
    <label><input type="checkbox" data-arr="search.providers" value="mal"> MyAnimeList</label>
    <label><input type="checkbox" data-arr="search.providers" value="anilist"> AniList</label>
    <label><input type="checkbox" data-arr="search.providers" value="kitsu"> Kitsu</label>
  </div>
  <div class="checks"><label><input type="checkbox" data-k="search.includeAdult"> Include adult titles</label></div>
</section>

<section id="s-age">
  <h2><small>7</small>Age cap</h2>
  <div class="f"><label class="t" for="agecap">Highest allowed rating</label><div class="sel"><select id="agecap" data-k="ageCap">${options(AGE_CAPS)}</select></div></div>
  <p class="note">Hide titles above this rating. PG-13 also allows TV-14. Unrated titles remain visible.</p>
</section>

<section id="s-jellyfin">
  <h2><small>8</small>Jellyfin</h2>
  <div class="two">
    <div class="f"><label class="t" for="jf-user">Username</label><input type="text" id="jf-user" data-k="jellyfin.username" autocomplete="off" spellcheck="false"></div>
    <div class="f"><label class="t" for="jf-pass">Password</label><input type="password" id="jf-pass" data-k="jellyfin.password" autocomplete="off"></div>
    <div class="f"><label class="t" for="jf-max">Max sources per title</label><input type="number" id="jf-max" data-k="jellyfin.maxSources" min="1" max="200"></div>
  </div>
  <details class="profile-settings"><summary>Profiles</summary><p class="note">Profiles use the same password. Share your watch history or keep it separate.</p><div id="profiles"></div><button type="button" id="profile-add">Add profile</button></details>
  <label class="t">Home screen rows</label>
  <div class="list" data-order="jellyfin.home" data-options="resume,nextup,latest,upcoming"></div>
</section>

<section id="s-install">
  <h2><small>9</small>Connect your apps</h2><p class="note">Copy a link into your player. These links contain your configuration and credentials; keep them private. After changing settings, copy the updated link into your apps.</p>
  <div class="out"><label class="t">Stremio manifest</label><div class="u" id="url-stremio"></div><div class="b"><button type="button" data-copy="url-stremio">Copy</button><span></span></div></div>
  <div class="out"><label class="t">Stremio deep link</label><div class="u" id="url-deeplink"></div><div class="b"><button type="button" data-copy="url-deeplink">Copy</button><a id="open-deeplink" href="#">Open in Stremio</a><span></span></div></div>
  <div class="out"><label class="t">Jellyfin server</label><div class="u" id="url-jellyfin"></div><div class="b"><button type="button" data-copy="url-jellyfin">Copy</button><span id="jf-hint"></span></div></div>
  <p class="status" id="enc-status"></p>
  <h3>Load an existing config</h3>
  <div class="row"><div class="f"><input type="text" id="load-input" placeholder="Paste an install URL or a token" autocomplete="off" spellcheck="false"></div><div class="f" style="flex:0"><button type="button" id="load-btn">Load</button></div></div>
  <p class="status" id="load-status"></p>
  <p class="hint"><button class="q" type="button" id="reset-btn">Start over with defaults</button></p>
</section>

</div></div>
<div hidden><span id="summary-catalogs"></span><span id="summary-addons"></span><span id="summary-tracker"></span></div>
</main>`;
}

// ---------------------------------------------------------------------------------------------
// Client script (no template literals inside, so it can live in one)
// ---------------------------------------------------------------------------------------------

const JS = String.raw`
(function () {
  'use strict';
  var DEFAULTS = __DEFAULTS__;
  var ORIGIN = location.origin;
  var LABELS = {
    tmdb: 'TMDB', fanart: 'Fanart.tv', tvdb: 'TVDB', rpdb: 'RPDB', metahub: 'Metahub',
    resume: 'Continue watching', nextup: 'Next up', latest: 'Recently added', upcoming: 'Upcoming'
  };

  // Consistent section rails: heading on the left, working controls on the right.
  document.querySelectorAll('#panels > section').forEach(function(section) {
    if (section.id === 's-age') return;
    var heading = section.querySelector('h2');
    var content = document.createElement('div');
    content.className = 'section-content';
    Array.from(section.childNodes).forEach(function(node) {
      if (node !== heading) content.appendChild(node);
    });
    section.appendChild(content);
  });
  document.querySelector('#s-general .section-content').appendChild(document.getElementById('s-age'));
  // Group existing controls without recreating inputs or losing their values.
  var groups = { general:['general'], meta:['meta','search'], catalogs:['catalogs'], addons:['addons'], tracking:['tracking'], jellyfin:['jellyfin'], install:['install'] };
  Object.keys(groups).forEach(function(key) {
    var panel = document.createElement('div');
    panel.id = 'panel-' + key;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'tab-' + key);
    panel.tabIndex = 0;
    groups[key].forEach(function(id) { panel.appendChild(document.getElementById('s-' + id)); });
    document.getElementById('panels').appendChild(panel);
  });
  document.querySelectorAll('#s-tracking > .section-content > .svc').forEach(function(service) {
    var details = document.createElement('details');
    details.className = 'service-card';
    var summary = document.createElement('summary');
    var title = service.querySelector('h3');
    summary.textContent = title.textContent;
    title.remove();
    service.parentNode.insertBefore(details, service);
    details.appendChild(summary);
    details.appendChild(service);
  });
  function applyMode() {
    var advanced = !!cfg.advanced;
    document.getElementById('mode-' + (advanced ? 'advanced' : 'simple')).checked = true;
    all('[data-advanced]').forEach(function(tab) { tab.hidden = !advanced; });
    var note = document.getElementById('addons-mode-note'); if (note) note.hidden = advanced;
    var picker = document.getElementById('catalog-picker'), simpleHost = document.getElementById('addon-catalog-picker'), advancedHost = document.getElementById('s-catalogs').querySelector('.section-content') || document.getElementById('s-catalogs');
    if (advanced) { if (picker.parentNode !== advancedHost) advancedHost.insertBefore(picker, advancedHost.querySelector('h3')); }
    else if (picker.parentNode !== simpleHost) simpleHost.appendChild(picker);
    simpleHost.hidden = advanced;
    var current = all('[data-tab]').filter(function(t) { return t.getAttribute('aria-selected') === 'true'; })[0];
    if (current && current.hidden) { location.hash = 'general'; selectTab('general', false); }
    if (typeof renderDrawerNav === 'function' && document.getElementById('drawer-nav').children.length) renderDrawerNav();
  }
  function selectTab(key, focus) {
    if (!groups[key]) key = 'general';
    var target = document.getElementById('tab-' + key);
    if (target && target.hidden) key = 'general';
    all('[data-tab]').forEach(function(tab) {
      var active = tab.dataset.tab === key;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById('panel-' + tab.dataset.tab).hidden = !active;
      if (active && focus) { tab.focus(); tab.scrollIntoView({block:'nearest',inline:'nearest'}); }
    });
  }
  all('[data-tab]').forEach(function(tab, index, tabs) {
    tab.addEventListener('click', function() { location.hash = tab.dataset.tab; selectTab(tab.dataset.tab, false); });
    tab.addEventListener('keydown', function(e) {
      var next = e.key === 'ArrowRight' ? (index+1)%tabs.length : e.key === 'ArrowLeft' ? (index+tabs.length-1)%tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length-1 : -1;
      if (next < 0) return;
      e.preventDefault(); location.hash = tabs[next].dataset.tab; selectTab(tabs[next].dataset.tab, true);
    });
  });
  window.addEventListener('hashchange', function() { selectTab(location.hash.slice(1), false); });
  selectTab(location.hash.slice(1), false);

  // ---- state -------------------------------------------------------------------------------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function merge(base, over) {
    if (!isObj(over)) return base;
    var out = clone(base);
    Object.keys(over).forEach(function (k) {
      if (isObj(base[k]) && isObj(over[k])) out[k] = merge(base[k], over[k]);
      else if (over[k] !== undefined) out[k] = clone(over[k]);
    });
    return out;
  }
  // Nothing is persisted in the browser: the Worker's database is the only copy of the configuration.
  var memory = {};
  function ssGet(key) { return memory[key] || null; }
  function ssSet(key, val) { memory[key] = val; }

  var cfg = clone(DEFAULTS);
  if (['Luma', 'Titan', 'Frame', 'Noma', 'Vanta'].indexOf(cfg.name) !== -1) cfg.name = 'Rill';
  var ui = merge({ trakt: { clientId: '', clientSecret: '' }, simkl: { clientId: '' }, mal: { clientId: '', redirectUri: '' }, anilist: { clientId: '' } }, null);
  var catDefs = [];
  var token = '';

  function get(path, obj) {
    var cur = obj || cfg;
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function set(path, value, obj) {
    var cur = obj || cfg;
    var parts = path.split('.');
    for (var i = 0; i < parts.length - 1; i++) { if (!isObj(cur[parts[i]])) cur[parts[i]] = {}; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = value;
  }

  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === false || attrs[k] == null) {}
      else n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function move(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return arr; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; return arr; }
  function when(ms) { return ms ? new Date(ms).toLocaleString() : ''; }

  // ---- network (same origin only) ---------------------------------------------------------------
  function api(path, body) {
    return fetch(ORIGIN + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok && !data.error) data.error = 'Request failed (' + r.status + ').';
        return data;
      });
    }).catch(function () { return { error: 'Network error.' }; });
  }

  // ---- change pipeline ----------------------------------------------------------------------------
  var encTimer = null, catTimer = null, lastCatKey = '';
  function catalogKey() {
    return JSON.stringify([cfg.advanced, cfg.keys, cfg.addons, cfg.lists, cfg.customCatalogs, cfg.movieLens, cfg.recommendations, cfg.providers, cfg.language, cfg.ageCap, trackerFingerprint()]);
  }
  function trackerFingerprint() {
    var t = cfg.trackers;
    return [t.primary, t.scrobbleTo.join(','), !!(t.trakt && t.trakt.accessToken), !!(t.simkl && t.simkl.accessToken), !!(t.mal && t.mal.accessToken), !!(t.anilist && t.anilist.accessToken)];
  }
  function updateSummary() {
    $('summary-catalogs').textContent = cfg.catalogs.filter(function(c) { return c.enabled; }).length;
    $('summary-addons').textContent = cfg.addons.stream.length;
    $('summary-tracker').textContent = {off:'Off',trakt:'Trakt',simkl:'Simkl',mdblist:'MDBList',mal:'MyAnimeList',anilist:'AniList'}[cfg.trackers.primary] || 'Off';
  }
  function changed() {
    cfg.revision=Math.max(Date.now(),(cfg.revision || 0)+1);
    updateSummary();
    refreshNeeds();
    $('draft-status').textContent = account.signedIn ? 'Saving…' : '';
    clearTimeout(encTimer);
    encTimer = setTimeout(encode, 400);
    if (catalogKey() !== lastCatKey) { clearTimeout(catTimer); catTimer = setTimeout(loadCatalogs, 900); }
    if (account.signedIn && account.loaded) { clearTimeout(saveTimer); saveTimer = setTimeout(saveRemote, 800); }
  }

  // ---- owner account: settings live in D1 and follow you across devices ----------------------
  var account = { durable: false, exists: false, signedIn: false, loaded: false, username: '' }, saveTimer = null, wantedTab = location.hash.slice(1);
  function adoptServerConfig(config) {
    if (!config) return;
    var key = cfg.installationKey;
    cfg = merge(DEFAULTS, config);
    if (!cfg.installationKey) cfg.installationKey = key;
    lastCatKey = ''; account.loaded = true;
    renderAll(); encode(); loadCatalogs();
    if (wantedTab) { location.hash = wantedTab; selectTab(wantedTab, false); wantedTab = ''; }
    $('draft-status').textContent = 'Synced with your server';
  }
  var activePop = null;
  document.addEventListener('click', function (e) { if (activePop && !activePop.pop.hidden && !activePop.host.contains(e.target)) activePop.close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && activePop && !activePop.pop.hidden) { activePop.close(); activePop.chip.focus(); } });
  function initial(name) { return (name || '?').trim().charAt(0).toUpperCase() || '?'; }
  function statusText() { return $('draft-status').textContent || ''; }
  function renderAccount() {
    var host = $('account'), side = $('drawer-account'); clear(host); clear(side);
    if (account.durable && account.signedIn) {
      var chip = el('button', { type: 'button', class: 'chip', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, [
        el('span', { class: 'avatar', 'aria-hidden': 'true', text: initial(account.username) }), el('span', { text: account.username }), el('span', { class: 'chev', 'aria-hidden': 'true', text: '▾' })]);
      var pop = el('div', { class: 'popover', role: 'menu', hidden: true });
      function openPop(open) { pop.hidden = !open; chip.setAttribute('aria-expanded', String(open)); if (open) { clear(pop);
        pop.appendChild(el('div', { class: 'pop-user' }, [el('span', { class: 'avatar big', 'aria-hidden': 'true', text: initial(account.username) }), el('div', {}, [el('strong', { text: account.username }), el('small', { text: statusText() })])]));
        pop.appendChild(el('button', { type: 'button', role: 'menuitem', text: 'Log out', onclick: function () { openPop(false); logout(); } })); } }
      chip.addEventListener('click', function (e) { e.stopPropagation(); openPop(pop.hidden); });
      activePop = { pop: pop, chip: chip, host: host, close: function () { openPop(false); } };
      host.appendChild(chip); host.appendChild(pop);
      side.appendChild(el('span', { class: 'avatar big', 'aria-hidden': 'true', text: initial(account.username) }));
      side.appendChild(el('div', { class: 'meta' }, [el('strong', { text: account.username }), el('small', { text: statusText() })]));
      side.appendChild(el('button', { type: 'button', class: 'q', text: 'Log out', onclick: function () { closeDrawer(); logout(); } }));
    }
    $('login-gate').hidden = !(account.exists && !account.signedIn);
    if (!$('login-gate').hidden) $('login-user').focus();
    var firstRun = account.durable && !account.exists;
    $('setup-gate').hidden = !firstRun;
    if (firstRun) { $('setup-user').value = $('setup-user').value || (cfg.jellyfin.username !== 'rill' ? cfg.jellyfin.username : ''); $('setup-user').focus(); }
  }
  $('setup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var status = $('setup-status'), user = $('setup-user').value.trim(), pass = $('setup-pass').value;
    if (!/^[a-z0-9._-]{1,32}$/i.test(user)) { status.textContent = 'Username: letters, numbers, dot, dash or underscore.'; return; }
    if (pass.length < 8) { status.textContent = 'Use at least 8 characters.'; return; }
    if (pass !== $('setup-pass2').value) { status.textContent = 'Passwords do not match.'; return; }
    status.textContent = 'Creating…';
    cfg.jellyfin.username = user; cfg.jellyfin.password = pass;
    saveRemote().then(function (r) {
      if (r.error) { status.textContent = r.error; return; }
      status.textContent = ''; $('setup-pass').value = ''; $('setup-pass2').value = '';
      account.exists = true; account.signedIn = true; account.loaded = true; account.username = r.username || user;
      fillInputs(); renderInstall(); renderAccount(); $('draft-status').textContent = 'Saved to your server';
    });
  });

  // ---- mobile drawer --------------------------------------------------------------------------------
  var drawer = $('drawer'), backdrop = $('drawer-backdrop'), drawerTimer = null;
  function openDrawer() {
    clearTimeout(drawerTimer); renderDrawerNav(); renderAccount();
    drawer.hidden = false; backdrop.hidden = false; $('menu-btn').setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () { drawer.classList.add('open'); backdrop.classList.add('open'); });
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    drawer.classList.remove('open'); backdrop.classList.remove('open'); $('menu-btn').setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    clearTimeout(drawerTimer); drawerTimer = setTimeout(function () { drawer.hidden = true; backdrop.hidden = true; }, 300);
  }
  function renderDrawerNav() {
    var nav = $('drawer-nav'); clear(nav);
    all('[data-tab]').forEach(function (tab) {
      var item = el('button', { type: 'button', class: tab.getAttribute('aria-selected') === 'true' ? 'active' : '', text: tab.textContent, hidden: tab.hidden || undefined,
        onclick: function () { location.hash = tab.dataset.tab; selectTab(tab.dataset.tab, false); closeDrawer(); window.scrollTo({ top: 0 }); } });
      nav.appendChild(item);
    });
    all('.seg [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.mode === 'advanced') === !!cfg.advanced)); });
  }
  $('menu-btn').addEventListener('click', function () { drawer.hidden ? openDrawer() : closeDrawer(); });
  $('drawer-close').addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) closeDrawer(); });
  all('.seg [data-mode]').forEach(function (b) { b.addEventListener('click', function () { cfg.advanced = b.dataset.mode === 'advanced'; changed(); applyMode(); renderDrawerNav(); }); });
  function saveRemote() {
    return api('/api/account/save', { config: cfg }).then(function (r) {
      if (r.error) { $('draft-status').textContent = r.error; return r; }
      $('draft-status').textContent = 'Saved to your server';
      if (r.config && r.config.installationKey) cfg.installationKey = r.config.installationKey;
      if (r.token) { token = r.token; renderInstall(); }
      return r;
    });
  }
  function logout() {
    clearTimeout(saveTimer);
    api('/api/account/logout').then(function () { account.signedIn = false; account.loaded = false; account.username = ''; cfg = clone(DEFAULTS); token = ''; lastCatKey = ''; renderAll(); renderAccount(); });
  }
  $('login-form').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('login-submit').click(); } });
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var status = $('login-status'); status.textContent = 'Signing in…';
    api('/api/account/login', { username: $('login-user').value, password: $('login-pass').value }).then(function (r) {
      if (r.error) { status.textContent = r.error; return; }
      status.textContent = ''; $('login-pass').value = '';
      account.signedIn = true; account.username = r.username || '';
      adoptServerConfig(r.config);
      renderAccount();
    });
  });
  function uiChanged() { renderAuthLinks(); }

  function encode() {
    $('enc-status').textContent = '';
    return api('/api/config/encode', cfg).then(function (r) {
      if (r.error || !r.token) { $('enc-status').textContent = r.error || 'Could not build the install URL.'; return; }
      token = r.token;
      renderInstall();
    });
  }

  function renderInstall() {
    if (!token) return;
    var base = ORIGIN + '/' + token;
    $('url-stremio').textContent = base + '/manifest.json';
    $('url-deeplink').textContent = 'stremio://' + base.replace(/^https?:\/\//, '') + '/manifest.json';
    $('open-deeplink').href = $('url-deeplink').textContent;
    $('url-jellyfin').textContent = base + '/jellyfin';
    $('jf-hint').textContent = 'Sign in as “' + cfg.jellyfin.username + '”' + (cfg.jellyfin.password ? ' with your password.' : ' with no password.');
  }

  // ---- catalogs --------------------------------------------------------------------------------------
  function loadCatalogs() {
    lastCatKey = catalogKey();
    $('cat-status').textContent = 'Loading catalogs…';
    api('/api/catalogs', cfg).then(function (r) {
      if (r.error && !(r.catalogs && r.catalogs.length)) { $('cat-status').textContent = r.error; return; }
      catDefs = Array.isArray(r.catalogs) ? r.catalogs : [];
      renderProfiles();
      if(!$('custom-catalogs').contains(document.activeElement)) renderCustomCatalogs();
      $('cat-status').textContent = catDefs.length ? '' : 'No catalogs available with the current settings.';
      reconcileCatalogs();
      renderCatalogs();
      changed();
    });
  }
  function catKey(c) { return c.type + ':' + c.id; }
  function reconcileCatalogs() {
    var known = {};
    catDefs.forEach(function (d) { known[catKey(d)] = d; });
    var kept = cfg.catalogs.slice();
    var have = {};
    kept.forEach(function (c) { have[catKey(c)] = true; if(known[catKey(c)] && !c.name) c.name = known[catKey(c)].name; });
    catDefs.forEach(function (d) { if (!have[catKey(d)]) kept.push({ id: d.id, type: d.type, enabled: true, name: d.name }); });
    cfg.catalogs = kept;
  }
  function renderCatalogs() {
    var root = $('catalogs');
    clear(root);
    if (!catDefs.length) { filterCatalogs(); return; }
    var defs = {};
    catDefs.forEach(function (d) { defs[catKey(d)] = d; });
    var groups = [], byName = {};
    cfg.catalogs.forEach(function (c, idx) {
      var d = defs[catKey(c)]; if (!d) return;
      var g = d.group || 'Catalogs';
      if (!byName[g]) { byName[g] = []; groups.push(g); }
      byName[g].push(idx);
    });
    groups.forEach(function (g) {
      var idxs = byName[g];
      var box = el('div', { class: 'group' }, [el('div', { class: 'gname', text: g }), null]);
      var list = el('div', { class: 'list' });
      idxs.forEach(function (idx, pos) {
        var c = cfg.catalogs[idx], d = defs[catKey(c)];
        var cb = el('input', { type: 'checkbox', 'aria-label': 'Enable ' + d.name });
        cb.checked = !!c.enabled;
        cb.addEventListener('change', function () { c.enabled = cb.checked; row.className = 'item' + (c.enabled ? '' : ' off'); changed(); });
        var sub = d.type + (d.needs ? ' · needs ' + (Array.isArray(d.needs) ? d.needs.join(', ') : d.needs) : '');
        var name = el('div', { class: 'n' }, [document.createTextNode(d.name), el('small', { text: sub })]);
        var up = el('button', { type: 'button', text: '↑', title: 'Move ' + d.name + ' up', 'aria-label': 'Move ' + d.name + ' up', disabled: pos === 0, onclick: function () { swapCatalog(idxs[pos], idxs[pos - 1]); } });
        var dn = el('button', { type: 'button', text: '↓', title: 'Move ' + d.name + ' down', 'aria-label': 'Move ' + d.name + ' down', disabled: pos === idxs.length - 1, onclick: function () { swapCatalog(idxs[pos], idxs[pos + 1]); } });
        var row = el('div', { class: 'item' + (c.enabled ? '' : ' off') }, [cb, name, el('div', { class: 'ud' }, [up, dn])]);
        list.appendChild(row);
      });
      box.appendChild(list);
      root.appendChild(box);
    });
    filterCatalogs();
  }
  function filterCatalogs() {
    var query = $('catalog-filter').value.trim().toLowerCase();
    var total = 0, visible = 0;
    all('#catalogs .group').forEach(function(group) {
      var matches = 0;
      all('.item', group).forEach(function(row) {
        var text = group.querySelector('.gname').textContent + ' ' + row.querySelector('.n').textContent;
        row.hidden = !text.toLowerCase().includes(query);
        total++; if (!row.hidden) { visible++; matches++; }
      });
      group.hidden = matches === 0;
    });
    $('catalog-count').textContent = query ? visible + ' / ' + total : total + ' catalogs';
    $('catalog-empty').hidden = !query || visible > 0 || total === 0;
  }
  $('catalog-filter').addEventListener('input', filterCatalogs);
  function renderCustomCatalogs() {
    var root=$('custom-catalogs');clear(root);
    (cfg.customCatalogs || []).forEach(function(c,index) {
      var box=el('div',{class:'group'});
      function field(label,key,options) {
        var input=options?el('select'):el('input',{type:'text'});
        if(options) options.forEach(function(o){input.appendChild(el('option',{value:o[0],text:o[1]}));});
        input.value=c[key] || '';
        input.setAttribute('aria-label',label);
        input.addEventListener(options?'change':'input',function(){c[key]=input.value;if(key==='provider'){c.params={};c.sources=[];}if(key==='provider'||key==='type')renderCustomCatalogs();changed();});
        box.appendChild(el('label',{class:'f'},[el('span',{class:'t',text:label}),input]));
      }
      field('Name','name');
      field('Source','provider',[['tmdb','TMDB'],['tvdb','TVDB'],['mal','MyAnimeList'],['anilist','AniList'],['movielens','MovieLens'],['simkl','Simkl'],['merged','Combine catalogs']]);
      field('Media','type',[['movie','Movies'],['series','Series'],['anime','Anime']]);
      c.params=c.params || {};
      if(c.provider==='merged') {
        var select=el('select',{'aria-label':'Catalog to add'});
        select.appendChild(el('option',{value:'',text:'Choose a catalog'}));
        catDefs.filter(function(d){return d.id.indexOf('merged.')!==0&&!(d.extra || []).some(function(e){return e.name==='search'&&e.isRequired;});}).forEach(function(d){select.appendChild(el('option',{value:d.type+'|'+d.id,text:d.name+' ('+d.type+')'}));});
        select.addEventListener('change',function(){if(!select.value)return;var parts=select.value.split('|');c.sources=c.sources || [];if(!c.sources.some(function(s){return s.id===parts[1]&&s.type===parts[0];}))c.sources.push({type:parts[0],id:parts[1]});renderCustomCatalogs();changed();});
        box.appendChild(select);
        (c.sources || []).forEach(function(s,i){var def=catDefs.find(function(d){return d.id===s.id&&d.type===s.type;});var genre=el('input',{type:'text','aria-label':'Source genre or filter',value:s.genre||'',placeholder:'Optional genre or filter value'});genre.addEventListener('input',function(){s.genre=genre.value;changed();});box.appendChild(genre);box.appendChild(el('div',{class:'b'},[el('span',{text:(i+1)+'. '+(def?def.name:s.id)}),el('button',{type:'button',text:'Up',onclick:function(){move(c.sources,i,-1);renderCustomCatalogs();changed();}}),el('button',{type:'button',text:'Remove',onclick:function(){c.sources.splice(i,1);renderCustomCatalogs();changed();}})]));});
      } else {
        var prompt=el('input',{type:'text','aria-label':'Describe this catalog',placeholder:'Describe the movies or series you want'}),aiStatus=el('span',{class:'hint',role:'status'});
        var generateButton=el('button',{type:'button',text:'Generate filters with AI',onclick:async function(){if(!prompt.value.trim())return;generateButton.disabled=true;aiStatus.textContent='Generating filters…';var provider=c.provider,type=c.type;try{var r=await api('/api/catalogs/generate',{config:cfg,query:prompt.value,provider:provider,type:type});if(r.error){aiStatus.textContent=r.error;return;}if(c.provider!==provider||c.type!==type||!cfg.customCatalogs.includes(c)){aiStatus.textContent='Catalog changed. Generate again with the new settings.';return;}c.params=r.catalog.params;c.name=r.catalog.name;renderCustomCatalogs();changed();}finally{generateButton.disabled=false;}}});
        box.appendChild(el('div',{class:'f'},[prompt,generateButton,aiStatus]));
        var fields={simkl:[['Genre','genre'],['Format','type'],['Country','country'],['Network','network'],['Year','year'],['Sort','sort']],tmdb:[['Sort','sort_by'],['Genres','with_genres'],['Released from','primary_release_date.gte'],['Released until','primary_release_date.lte'],['Minimum rating','vote_average.gte'],['Minimum votes','vote_count.gte'],['Language','with_original_language'],['Country','with_origin_country'],['Streaming providers','with_watch_providers'],['Streaming region','watch_region'],['Keywords','with_keywords'],['Networks','with_networks']],tvdb:[['Country','country'],['Language','lang'],['Genre','genre'],['Year','year'],['Sort','sort'],['Direction','sortType'],['Status','status']],mal:[['Search','q'],['Genres','genres'],['Status','status'],['Format','type'],['Minimum score','min_score'],['From date','start_date'],['Until date','end_date'],['Sort','order_by'],['Direction','sort']],anilist:[['Search','search'],['Genres','genre_in'],['Excluded genres','genre_not_in'],['Tags','tag_in'],['Format','format'],['Status','status'],['Season','season'],['Year','seasonYear'],['Sort','sort'],['Minimum score','averageScore_greater']],movielens:[['Sort','sortBy'],['Direction','sortDirection'],['From year','minYear'],['Until year','maxYear'],['Minimum popularity','minPop'],['Tags','tag'],['Genre','genre']]};
        if(c.provider==='tmdb'&&c.type!=='movie')fields.tmdb=fields.tmdb.map(function(f){return [f[0],f[1].replace('primary_release_date','first_air_date')];});
        Object.keys(c.params).forEach(function(key){if(!(fields[c.provider]||[]).some(function(f){return f[1]===key;}))fields[c.provider].push([key,key]);});
        (fields[c.provider] || []).forEach(function(f){var input=el('input',{type:'text','aria-label':f[0],value:c.params[f[1]] || ''});input.addEventListener('input',function(){if(input.value)c.params[f[1]]=input.value;else delete c.params[f[1]];changed();});box.appendChild(el('label',{class:'f'},[el('span',{class:'t',text:f[0]}),input]));});
      }
      box.appendChild(el('button',{type:'button',text:'Remove catalog',onclick:function(){cfg.customCatalogs.splice(index,1);renderCustomCatalogs();changed();}}));
      root.appendChild(box);
    });
  }
  $('add-custom-catalog').addEventListener('click',function(){cfg.customCatalogs=cfg.customCatalogs || [];cfg.customCatalogs.push({id:crypto.randomUUID(),name:'My catalog',provider:'tmdb',type:'movie',params:{}});renderCustomCatalogs();changed();});
  var recommendationPoll;
  function recommendationProgress(r){
    clearTimeout(recommendationPoll);var job=r.job;
    $('rec-status').textContent=r.error||(!job?'No generation recorded yet.':job.status==='failed'?job.error:job.status==='done'?(Object.values(job.counts).some(function(n){return n>0;})?'Recommendations are ready.':'No matches yet. Add viewing history or lower the minimum votes.'):'Preparing recommendations: '+job.position+' of 3 sections. You can close this page.');
    if(job&&job.status==='pending')recommendationPoll=setTimeout(function(){api('/api/recommendations/status',{config:cfg,id:job.id}).then(recommendationProgress);},5000);
  }
  ['prepare','rebuild'].forEach(function(action){$(action+'-recommendations').addEventListener('click',function(){var button=this;button.disabled=true;$('rec-status').textContent='Queuing recommendations…';api('/api/recommendations/generate',{config:cfg,rebuild:action==='rebuild'}).then(recommendationProgress).finally(function(){button.disabled=false;});});});
  $('check-recommendations').addEventListener('click',function(){api('/api/recommendations/status',cfg).then(recommendationProgress);});
  function movieLensResult(r){var s=r.status||{};$('ml-result').textContent=r.error||s.error||(s.checkedAt?'Last checked '+new Date(s.checkedAt).toLocaleString()+'. ':'')+(s.successCount!==undefined?s.successCount+' imported, '+s.alreadyRatedCount+' already rated, '+s.errorCount+' rejected.':s.checkedAt?'No changed ratings.':'No import recorded yet.');}
  ['sync','status'].forEach(function(action){$('ml-'+action).addEventListener('click',function(){var button=this;button.disabled=true;$('ml-result').textContent=action==='sync'?'Importing ratings…':'Checking…';api('/api/movielens/'+action,cfg).then(movieLensResult).finally(function(){button.disabled=false;});});});
  $('ml-csv').addEventListener('change',async function(){var file=this.files[0];if(!file)return;if(file.size>5000000){$('ml-result').textContent='Choose a file smaller than 5 MB.';return;}this.disabled=true;try{movieLensResult(await api('/api/movielens/import',{config:cfg,csv:await file.text()}));}finally{this.disabled=false;this.value='';}});
  renderCustomCatalogs();
  function swapCatalog(a, b) { var t = cfg.catalogs[a]; cfg.catalogs[a] = cfg.catalogs[b]; cfg.catalogs[b] = t; renderCatalogs(); changed(); }

  // ---- ordered pick lists ---------------------------------------------------------------------------
  // ---- requirements: lock anything that needs a key or account until it exists ----------------------
  var NEEDS = {
    tmdb: { label: 'TMDB key', tab: 'meta', field: 'k-tmdb', ok: function () { return !!cfg.keys.tmdb; } },
    tvdb: { label: 'TVDB key', tab: 'meta', field: 'k-tvdb', ok: function () { return !!cfg.keys.tvdb; } },
    fanart: { label: 'Fanart.tv key', tab: 'meta', field: 'k-fanart', ok: function () { return !!cfg.keys.fanart; } },
    rpdb: { label: 'RPDB key', tab: 'meta', field: 'k-rpdb', ok: function () { return !!cfg.keys.rpdb; } },
    mdblist: { label: 'MDBList key', tab: 'meta', field: 'k-mdblist', ok: function () { return !!cfg.keys.mdblist; } },
    publicmetadb: { label: 'PublicMetaDB key', tab: 'tracking', field: 'k-publicmetadb', ok: function () { return !!cfg.keys.publicmetadb; } },
    trakt: { label: 'Trakt account', tab: 'tracking', field: 'trakt-id', ok: function () { return !!(cfg.trackers.trakt && cfg.trackers.trakt.accessToken); } },
    simkl: { label: 'Simkl account', tab: 'tracking', field: 'simkl-id', ok: function () { return !!(cfg.trackers.simkl && cfg.trackers.simkl.accessToken); } },
    mal: { label: 'MyAnimeList account', tab: 'tracking', field: 'mal-id', ok: function () { return !!(cfg.trackers.mal && cfg.trackers.mal.accessToken); } },
    anilist: { label: 'AniList account', tab: 'tracking', field: 'anilist-id', ok: function () { return !!(cfg.trackers.anilist && cfg.trackers.anilist.accessToken); } },
    ai: { label: 'AI key and model', tab: 'catalogs', field: 'rec-key', ok: function () { var r = cfg.recommendations || {}; return !!(r.apiKey && r.model); } }
  };
  var OPTION_NEEDS = { tmdb: 'tmdb', tvdb: 'tvdb', fanart: 'fanart', rpdb: 'rpdb' };
  function needOk(n) { var d = NEEDS[n]; return !d || !!d.ok(); }
  function needTag(n, short) {
    var d = NEEDS[n];
    return el('button', { type: 'button', class: 'need-tag', title: 'Needs ' + d.label, text: short ? (/account$/.test(d.label) ? 'Connect' : 'Add key') : 'Needs ' + d.label, onclick: function (e) {
      e.preventDefault(); e.stopPropagation(); location.hash = d.tab; selectTab(d.tab, false);
      var f = $(d.field); if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); }
    } });
  }
  function lockSelect(select, needFor, hintFor) {
    if (!select) return;
    Array.from(select.options).forEach(function (o) {
      if (!o.dataset.label) o.dataset.label = o.textContent;
      var n = needFor(o.value); o.disabled = !!n && !needOk(n);
      o.textContent = o.dataset.label + (o.disabled ? ' · needs ' + NEEDS[n].label.replace(' account', '').replace(' key', ' key') : '');
    });
    var wrap = select.closest('.f'), hint = wrap.querySelector('.need-hint'), cur = select.options[select.selectedIndex];
    if (cur && cur.disabled) { if (!hint) { hint = el('p', { class: 'hint need-hint' }); wrap.appendChild(hint); } hint.textContent = hintFor(cur.value); }
    else if (hint) hint.remove();
    if (select._picker) select._picker.sync();
  }
  function refreshNeeds() {
    all('[data-needs]').forEach(function (node) {
      var n = node.getAttribute('data-needs'), ok = needOk(n);
      node.classList.toggle('locked', !ok);
      var tag = node.querySelector(':scope > .need-tag');
      if (!ok && !tag) node.appendChild(needTag(n, node.tagName === 'LABEL'));
      if (ok && tag) tag.remove();
      all('input[type=checkbox]', node).forEach(function (i) { i.disabled = !ok; });
    });
    ['p-movie', 'p-series'].forEach(function (id) { lockSelect($(id), function (v) { return OPTION_NEEDS[v]; }, function (v) { return (LABELS[v] || v) + ' needs a key. Cinemeta is used until you add one.'; }); });
    lockSelect($('p-anime'), function (v) { return OPTION_NEEDS[v]; }, function (v) { return (LABELS[v] || v) + ' needs a key. MyAnimeList is used until you add one.'; });
    lockSelect($('tr-primary'), function (v) { return v === 'off' ? null : v; }, function (v) { return 'Connect ' + NEEDS[v].label.replace(' account', '') + ' below to use it as your primary tracker.'; });
    all('[data-order]').forEach(renderOrder);
    all('[data-key-status]').forEach(function (pill) { var on = !!cfg.keys[pill.getAttribute('data-key-status')]; pill.textContent = on ? 'Set' : 'Not set'; pill.classList.toggle('on', on); });
    var req = $('rec-req');
    if (req) { clear(req); [['ai', 'AI key and model'], ['tmdb', 'TMDB key']].forEach(function (r) { var ok = needOk(r[0]); req.appendChild(el('span', { class: 'req' + (ok ? ' on' : ''), text: (ok ? '✓ ' : '○ ') + r[1] })); }); }
  }

  function renderOrder(box) {
    var path = box.getAttribute('data-order');
    var opts = box.getAttribute('data-options').split(',');
    var chosen = (get(path) || []).filter(function (v) { return opts.indexOf(v) >= 0; });
    var rest = opts.filter(function (v) { return chosen.indexOf(v) < 0; });
    clear(box);
    chosen.concat(rest).forEach(function (v, i) {
      var on = i < chosen.length;
      var need = OPTION_NEEDS[v], locked = !!need && !needOk(need);
      var cb = el('input', { type: 'checkbox', 'aria-label': 'Enable ' + (LABELS[v] || v), disabled: locked });
      cb.checked = on;
      cb.addEventListener('change', function () {
        var arr = chosen.slice();
        if (cb.checked) arr.push(v); else arr.splice(arr.indexOf(v), 1);
        set(path, arr); renderOrder(box); changed();
      });
      var up = el('button', { type: 'button', text: '↑', title: 'Move up', 'aria-label': 'Move ' + (LABELS[v] || v) + ' up', disabled: !on || i === 0, onclick: function () { set(path, move(chosen.slice(), i, -1)); renderOrder(box); changed(); } });
      var dn = el('button', { type: 'button', text: '↓', title: 'Move down', 'aria-label': 'Move ' + (LABELS[v] || v) + ' down', disabled: !on || i === chosen.length - 1, onclick: function () { set(path, move(chosen.slice(), i, 1)); renderOrder(box); changed(); } });
      var name = el('div', { class: 'n' }, [document.createTextNode(LABELS[v] || v), locked ? el('small', { text: on ? 'Skipped until the key is added' : '' }) : null]);
      box.appendChild(el('div', { class: 'item' + (on ? '' : ' off') + (locked ? ' locked' : '') }, [cb, name, locked ? needTag(need) : el('div', { class: 'ud' }, [up, dn])]));
    });
  }

  // ---- simple bindings ------------------------------------------------------------------------------
  function fillInputs() {
    all('[data-k]').forEach(function (n) {
      var v = get(n.getAttribute('data-k'));
      if (n.type === 'checkbox') n.checked = !!v; else n.value = v == null ? '' : v;
    });
    all('[data-arr]').forEach(function (n) { n.checked = (get(n.getAttribute('data-arr')) || []).indexOf(n.value) >= 0; });
    all('[data-lines]').forEach(function (n) { n.value = (get(n.getAttribute('data-lines')) || []).join('\n'); });
    all('[data-ui]').forEach(function (n) { n.value = get(n.getAttribute('data-ui'), ui) || ''; });
    all('[data-order]').forEach(renderOrder);
    enhanceSelects();
    applyMode();
    refreshNeeds();
  }
  function bindInputs() {
    all('input[name="mode"]').forEach(function (n) {
      n.addEventListener('change', function () { cfg.advanced = n.value === 'advanced'; changed(); applyMode(); });
    });
    all('[data-k]').forEach(function (n) {
      n.addEventListener('input', function () {
        var v = n.type === 'checkbox' ? n.checked : n.type === 'number' ? Number(n.value) : n.value;
        set(n.getAttribute('data-k'), v); changed();
        if (n.getAttribute('data-k').indexOf('jellyfin.') === 0) renderInstall();
      });
    });
    all('[data-arr]').forEach(function (n) {
      n.addEventListener('change', function () {
        var path = n.getAttribute('data-arr');
        var order = all('[data-arr="' + path + '"]').map(function (x) { return x.value; });
        var cur = get(path) || [];
        if (n.checked && cur.indexOf(n.value) < 0) cur.push(n.value);
        if (!n.checked) cur = cur.filter(function (x) { return x !== n.value; });
        cur.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
        set(path, cur); changed();
      });
    });
    all('[data-lines]').forEach(function (n) {
      n.addEventListener('input', function () {
        set(n.getAttribute('data-lines'), n.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)); changed();
      });
    });
    all('[data-ui]').forEach(function (n) {
      n.addEventListener('input', function () { set(n.getAttribute('data-ui'), n.value.trim(), ui); uiChanged(); });
    });
    $('show-keys').addEventListener('click', function () {
      var shown = this.textContent === 'Hide keys';
      all('input.key').forEach(function (i) { i.type = shown ? 'password' : 'text'; });
      this.textContent = shown ? 'Show keys' : 'Hide keys';
    });
  }

  // ---- addon probe ----------------------------------------------------------------------------------
  function bindProbes() {
    all('[data-probe]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var path = btn.getAttribute('data-probe');
        var out = document.querySelector('[data-probe-out="' + path + '"]');
        var urls = get(path) || [];
        clear(out);
        if (!urls.length) { out.appendChild(el('div', { text: 'Nothing to check.' })); return; }
        btn.disabled = true;
        Promise.all(urls.map(function (u) {
          return api('/api/probe', { url: u }).then(function (r) {
            var line = el('div');
            if (r.error) { line.appendChild(el('b', { text: u })); line.appendChild(el('span', { text: ' — ' + r.error })); return line; }
            line.appendChild(el('b', { text: r.name || u }));
            var bits = [];
            if (r.resources && r.resources.length) bits.push(r.resources.join(', '));
            if (r.types && r.types.length) bits.push(r.types.join(', '));
            if (r.catalogs) bits.push(r.catalogs + (r.catalogs === 1 ? ' catalog' : ' catalogs'));
            if (r.version) bits.push('v' + r.version);
            line.appendChild(el('span', { text: ' — ' + bits.join(' · ') }));
            return line;
          });
        })).then(function (lines) { lines.forEach(function (l) { out.appendChild(l); }); btn.disabled = false; });
      });
    });
  }

  // ---- trackers --------------------------------------------------------------------------------------
  var polls = {};
  function stopPoll(name) { if (polls[name]) { clearTimeout(polls[name]); polls[name] = null; } }
  function status(name, text, on) { var n = $(name + '-status'); n.textContent = text || ''; n.className = 'status' + (on ? ' on' : ''); }

  function renderTrackerStates() {
    var t = cfg.trackers;
    if (t.trakt && t.trakt.accessToken) {
      status('trakt', 'Connected' + (t.trakt.username ? ' as ' + t.trakt.username : '') + (t.trakt.expiresAt ? '. Token expires ' + when(t.trakt.expiresAt) + '.' : '.'), true);
      if (!ui.trakt.clientId && t.trakt.clientId) ui.trakt.clientId = t.trakt.clientId;
      if (!ui.trakt.clientSecret && t.trakt.clientSecret) ui.trakt.clientSecret = t.trakt.clientSecret;
    } else if (!polls.trakt) status('trakt', 'Not connected.');
    $('trakt-refresh').hidden = !(t.trakt && t.trakt.refreshToken);
    $('trakt-disconnect').hidden = !(t.trakt && t.trakt.accessToken);

    if (t.simkl && t.simkl.accessToken) {
      status('simkl', 'Connected. Simkl tokens do not expire.', true);
      if (!ui.simkl.clientId && t.simkl.clientId) ui.simkl.clientId = t.simkl.clientId;
    } else if (!polls.simkl) status('simkl', 'Not connected.');
    $('simkl-disconnect').hidden = !(t.simkl && t.simkl.accessToken);

    if (t.mal && t.mal.accessToken) {
      status('mal', 'Connected.' + (t.mal.expiresAt ? ' Token expires ' + when(t.mal.expiresAt) + '.' : ''), true);
      if (!ui.mal.clientId && t.mal.clientId) ui.mal.clientId = t.mal.clientId;
    } else status('mal', 'Not connected.');
    $('mal-disconnect').hidden = !(t.mal && t.mal.accessToken);

    if (t.anilist && t.anilist.accessToken) status('anilist', 'Connected. AniList tokens last about a year.', true);
    else status('anilist', 'Not connected.');
    $('anilist-disconnect').hidden = !(t.anilist && t.anilist.accessToken);

    all('[data-ui]').forEach(function (n) { n.value = get(n.getAttribute('data-ui'), ui) || ''; });
    renderAuthLinks();
  }

  function renderAuthLinks() {
    var a = $('anilist-link');
    if (ui.anilist.clientId) a.href = 'https://anilist.co/api/v2/oauth/authorize?client_id=' + encodeURIComponent(ui.anilist.clientId) + '&response_type=token';
    else a.removeAttribute('href');
    $('mal-open').disabled = !ui.mal.clientId;
  }

  // Trakt device code
  $('trakt-connect').addEventListener('click', function () {
    var id = ui.trakt.clientId, secret = ui.trakt.clientSecret;
    if (!id || !secret) { status('trakt', 'Enter the client id and secret first.'); return; }
    stopPoll('trakt');
    status('trakt', 'Asking Trakt for a code…');
    api('/api/oauth/trakt/device', { clientId: id }).then(function (r) {
      if (r.error) { status('trakt', r.error); return; }
      $('trakt-code').hidden = false;
      $('trakt-usercode').textContent = r.userCode;
      $('trakt-verify').textContent = r.verificationUrl; $('trakt-verify').href = r.verificationUrl;
      var deadline = Date.now() + (r.expiresIn || 600) * 1000, wait = (r.interval || 5) * 1000;
      status('trakt', 'Waiting for you to approve on Trakt…');
      function tick() {
        if (Date.now() > deadline) { $('trakt-code').hidden = true; status('trakt', 'The code expired. Connect again.'); polls.trakt = null; return; }
        api('/api/oauth/trakt/token', { clientId: id, clientSecret: secret, deviceCode: r.deviceCode }).then(function (t) {
          if (t.pending) { if (t.slowDown) wait += 1000; polls.trakt = setTimeout(tick, wait); return; }
          polls.trakt = null;
          $('trakt-code').hidden = true;
          if (t.error) { status('trakt', t.error); return; }
          cfg.trackers.trakt = { clientId: id, clientSecret: secret, accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt, username: t.username };
          if (cfg.trackers.primary === 'off') { cfg.trackers.primary = 'trakt'; $('tr-primary').value = 'trakt'; }
          renderTrackerStates(); changed();
        });
      }
      polls.trakt = setTimeout(tick, wait);
    });
  });
  $('trakt-refresh').addEventListener('click', function () {
    var t = cfg.trackers.trakt; if (!t || !t.refreshToken) return;
    status('trakt', 'Refreshing…');
    api('/api/oauth/trakt/refresh', { clientId: ui.trakt.clientId || t.clientId, clientSecret: ui.trakt.clientSecret || t.clientSecret, refreshToken: t.refreshToken }).then(function (r) {
      if (r.error) { status('trakt', r.error); return; }
      t.accessToken = r.accessToken; t.refreshToken = r.refreshToken || t.refreshToken; t.expiresAt = r.expiresAt;
      renderTrackerStates(); changed();
    });
  });
  $('trakt-disconnect').addEventListener('click', function () { stopPoll('trakt'); delete cfg.trackers.trakt; $('trakt-code').hidden = true; dropTracker('trakt'); });

  // Simkl PIN
  $('simkl-connect').addEventListener('click', function () {
    var id = ui.simkl.clientId;
    if (!id) { status('simkl', 'Enter the client id first.'); return; }
    stopPoll('simkl');
    status('simkl', 'Asking Simkl for a PIN…');
    api('/api/oauth/simkl/pin', { clientId: id }).then(function (r) {
      if (r.error) { status('simkl', r.error); return; }
      $('simkl-code').hidden = false;
      $('simkl-usercode').textContent = r.userCode;
      $('simkl-verify').textContent = r.verificationUrl; $('simkl-verify').href = r.verificationUrl;
      var deadline = Date.now() + (r.expiresIn || 900) * 1000, wait = (r.interval || 5) * 1000;
      status('simkl', 'Waiting for you to enter the PIN on Simkl…');
      function tick() {
        if (Date.now() > deadline) { $('simkl-code').hidden = true; status('simkl', 'The PIN expired. Connect again.'); polls.simkl = null; return; }
        api('/api/oauth/simkl/poll', { clientId: id, userCode: r.userCode }).then(function (t) {
          if (t.pending) { if (t.slowDown) wait += 1000; polls.simkl = setTimeout(tick, wait); return; }
          polls.simkl = null;
          $('simkl-code').hidden = true;
          if (t.error) { status('simkl', t.error); return; }
          cfg.trackers.simkl = { clientId: id, accessToken: t.accessToken };
          if (cfg.trackers.primary === 'off') { cfg.trackers.primary = 'simkl'; $('tr-primary').value = 'simkl'; }
          renderTrackerStates(); changed();
        });
      }
      polls.simkl = setTimeout(tick, wait);
    });
  });
  $('simkl-disconnect').addEventListener('click', function () { stopPoll('simkl'); delete cfg.trackers.simkl; $('simkl-code').hidden = true; dropTracker('simkl'); });

  // MAL PKCE (plain challenge, the only method MAL accepts)
  function malVerifier() {
    var bytes = new Uint8Array(64); crypto.getRandomValues(bytes);
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  $('mal-open').addEventListener('click', function () {
    var id = ui.mal.clientId; if (!id) return;
    var v = malVerifier(); ssSet('rill.mal.verifier', v);
    var url = 'https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=' + encodeURIComponent(id) + '&code_challenge=' + v + '&code_challenge_method=plain';
    if (ui.mal.redirectUri) url += '&redirect_uri=' + encodeURIComponent(ui.mal.redirectUri);
    $('mal-url').textContent = url;
    status('mal', 'Approve on MyAnimeList, then paste the code from the address bar here.');
    window.open(url, '_blank', 'noopener');
  });
  $('mal-exchange').addEventListener('click', function () {
    var code = $('mal-code').value.trim(), v = ssGet('rill.mal.verifier');
    if (!code) { status('mal', 'Paste the code first.'); return; }
    if (!v) { status('mal', 'Open the authorisation page from this tab first; the verifier belongs to it.'); return; }
    try { if (code.indexOf('code=') >= 0) code = new URL(code).searchParams.get('code') || code; } catch (e) {}
    status('mal', 'Exchanging the code…');
    api('/api/oauth/mal/token', { clientId: ui.mal.clientId, code: code, verifier: v, redirectUri: ui.mal.redirectUri || undefined }).then(function (r) {
      if (r.error) { status('mal', r.error); return; }
      cfg.trackers.mal = { clientId: ui.mal.clientId, accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: r.expiresAt };
      $('mal-code').value = ''; $('mal-url').textContent = '';
      if (cfg.trackers.primary === 'off') { cfg.trackers.primary = 'mal'; $('tr-primary').value = 'mal'; }
      renderTrackerStates(); changed();
    });
  });
  $('mal-disconnect').addEventListener('click', function () { delete cfg.trackers.mal; dropTracker('mal'); });

  // AniList implicit grant: the user pastes the token AniList shows on its pin page
  $('anilist-save').addEventListener('click', function () {
    var tok = $('anilist-token').value.trim();
    try { if (tok.indexOf('access_token=') >= 0) tok = /access_token=([^&]+)/.exec(tok)[1]; } catch (e) {}
    if (!tok) { status('anilist', 'Paste the token first.'); return; }
    cfg.trackers.anilist = { accessToken: tok };
    $('anilist-token').value = '';
    if (cfg.trackers.primary === 'off') { cfg.trackers.primary = 'anilist'; $('tr-primary').value = 'anilist'; }
    renderTrackerStates(); changed();
  });
  $('anilist-disconnect').addEventListener('click', function () { delete cfg.trackers.anilist; dropTracker('anilist'); });

  function dropTracker(name) {
    if (cfg.trackers.primary === name) { cfg.trackers.primary = 'off'; $('tr-primary').value = 'off'; }
    cfg.trackers.scrobbleTo = cfg.trackers.scrobbleTo.filter(function (x) { return x !== name; });
    all('[data-arr="trackers.scrobbleTo"]').forEach(function (n) { n.checked = cfg.trackers.scrobbleTo.indexOf(n.value) >= 0; });
    renderTrackerStates(); changed();
  }

  // ---- install: copy, load, reset ------------------------------------------------------------------
  function copyText(text, note) {
    function done(ok) { note.textContent = ok ? 'Copied' : 'Select and copy by hand'; setTimeout(function () { note.textContent = ''; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }
  all('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = $(b.getAttribute('data-copy')).textContent;
      if (!text) return;
      copyText(text, b.parentNode.querySelector('span'));
    });
  });
  $('load-btn').addEventListener('click', function () {
    var input = $('load-input').value.trim();
    if (!input) return;
    $('load-status').textContent = 'Reading…';
    api('/api/config/decode', { input: input }).then(function (r) {
      if (r.error || !r.config) { $('load-status').textContent = r.error || 'Could not read that.'; return; }
      Object.keys(polls).forEach(stopPoll);
      cfg = merge(DEFAULTS, r.config);
      $('load-input').value = '';
      $('load-status').textContent = 'Loaded. The form now shows that configuration.';
      lastCatKey = '';
      renderAll();
      changed();
    });
  });
  $('reset-btn').addEventListener('click', function () {
    if (!confirm('Replace the current draft with the defaults?')) return;
    Object.keys(polls).forEach(stopPoll);
    cfg = clone(DEFAULTS);
    lastCatKey = '';
    renderAll();
    changed();
  });

  async function deliveryStatus(retry) {
    var status=$('delivery-status');status.textContent='Checking…';
    var encoded=await api('/api/config/encode',cfg);
    if (!encoded.token) {status.textContent=encoded.error || 'Could not read configuration.';return;}
    var base=ORIGIN+'/'+encoded.token+'/jellyfin', access;
    try {
      var login=await fetch(base+'/Users/AuthenticateByName',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({Username:cfg.jellyfin.username,Pw:cfg.jellyfin.password})});
      var user=await login.json();if(!login.ok || !user.AccessToken)throw Error('Sign-in failed.');access=user.AccessToken;
      var headers={'x-emby-token':access};
      if(retry){var queued=await fetch(base+'/Tracking/Retry',{method:'POST',headers:headers});if(!queued.ok)throw Error('Could not queue retries.');}
      var result=await fetch(base+'/Tracking/Status',{headers:headers});if(!result.ok)throw Error('Could not read delivery status.');
      var state=await result.json();
      status.textContent=!state.durable ? 'Durable storage is not configured.' : state.failed ? state.failed+' failed; '+state.pending+' waiting. Reconnect the affected service, then retry.' : state.pending ? state.pending+' updates waiting for delivery.' : 'All queued updates delivered.';
      if(state.services && state.services.length)status.textContent+=' '+state.services.map(function(s){return s.service+': '+s.count+' '+s.status;}).join(' · ');
      $('delivery-retry').hidden=!state.failed;
    } catch(e){status.textContent=e.message || 'Could not check delivery status.';}
    finally {if(access)fetch(base+'/Sessions/Logout',{method:'POST',headers:{'x-emby-token':access}}).catch(function(){});}
  }
  $('delivery-check').addEventListener('click',function(){deliveryStatus(false);});
  $('delivery-retry').addEventListener('click',function(){deliveryStatus(true);});

  function renderProfiles() {
    var root = $('profiles'); clear(root);
    (cfg.jellyfin.profiles || []).forEach(function(p, index) {
      var box = el('div', {class:'svc'});
      function field(label, value, update, type) {
        var input=el('input',{type:type || 'text',value:value || '',onchange:function(){update(input.value);changed();}});
        return el('label',{class:'f'},[el('span',{class:'t',text:label}),input]);
      }
      box.appendChild(field('Name',p.name,function(v){p.name=v;}));
      var share=el('input',{type:'checkbox',checked:p.sharesHistory,onchange:function(){p.sharesHistory=share.checked;changed();}});
      box.appendChild(el('label',{class:'check'},[share,'Share account history and scrobbling']));
      box.appendChild(field('Avatar URL',p.avatar,function(v){p.avatar=v;},'url'));
      var cap=el('select',{onchange:function(){p.ageCap=cap.value;changed();}});
      $('agecap').querySelectorAll('option').forEach(function(o){cap.appendChild(o.cloneNode(true));});
      cap.options[0].textContent='Use account cap';
      cap.value=p.ageCap || '';
      box.appendChild(el('label',{class:'f'},[el('span',{class:'t',text:'Age cap'}),cap]));
      var catalogs=el('details',{},[el('summary',{text:'Catalogs'})]);
      catalogs.appendChild(el('p',{class:'note',text:'Leave all unchecked to show every enabled catalog.'}));
      cfg.catalogs.filter(function(c){return c.enabled;}).forEach(function(c){
        var input=el('input',{type:'checkbox',checked:(p.catalogs || []).indexOf(c.id)>=0,onchange:function(){p.catalogs=p.catalogs || [];p.catalogs=p.catalogs.filter(function(id){return id!==c.id;});if(input.checked)p.catalogs.push(c.id);changed();}});
        var def=catDefs.find(function(d){return d.id===c.id && d.type===c.type;});
        catalogs.appendChild(el('label',{class:'check'},[input,c.name || (def && def.name) || c.id]));
      });
      box.appendChild(catalogs);
      box.appendChild(el('button',{type:'button',text:'Remove profile',onclick:function(){cfg.jellyfin.profiles.splice(index,1);renderProfiles();changed();}}));
      root.appendChild(box);
    });
    enhanceSelects();
  }
  $('profile-add').addEventListener('click',function(){
    cfg.jellyfin.profiles=cfg.jellyfin.profiles || [];
    cfg.jellyfin.profiles.push({id:crypto.randomUUID(),name:'Viewer '+(cfg.jellyfin.profiles.length+1),sharesHistory:false,catalogs:[]});
    renderProfiles();changed();
  });

  // ---- boot --------------------------------------------------------------------------------------------
  var activePicker = null;
  var pickerId = 0;
  function closePicker(focus) {
    if (!activePicker) return;
    var picker = activePicker;
    activePicker = null;
    picker.menu.hidePopover();
    picker.trigger.setAttribute('aria-expanded', 'false');
    if (focus) picker.trigger.focus();
  }
  document.addEventListener('pointerdown', function(e) {
    if (activePicker && !activePicker.menu.contains(e.target) && !activePicker.trigger.contains(e.target)) closePicker(false);
  });
  window.addEventListener('resize', function() { closePicker(false); });
  window.addEventListener('hashchange', function() { closePicker(false); });
  document.addEventListener('scroll', function(e) {
    if (activePicker && !activePicker.menu.contains(e.target)) closePicker(false);
  }, true);

  // Keep native selects as the data source for existing config and profile bindings.
  function enhanceSelects() {
    if (!('showPopover' in HTMLElement.prototype)) return;
    all('select').forEach(function(select) {
      if (select._picker) { select._picker.sync(); return; }
      var label = Array.from(select.labels || []).map(function(l) { return l.textContent.trim(); }).join(' ') || 'Choose an option';
      var menu = el('div', {class:'select-menu',popover:'manual',role:'listbox',id:'picker-' + (++pickerId),'aria-label':label});
      var trigger = el('button', {type:'button',class:'select-trigger',role:'combobox','aria-label':label,'aria-haspopup':'listbox','aria-expanded':'false','aria-controls':menu.id});
      var wrapper = el('div', {class:'select-control'});
      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(select); wrapper.appendChild(trigger); wrapper.appendChild(menu);
      var picker = {menu:menu,trigger:trigger,sync:function() {
        trigger.textContent = select.selectedOptions[0] ? select.selectedOptions[0].textContent : 'Choose';
        trigger.disabled = select.disabled;
      }};
      select._picker = picker;
      function choose(index) {
        select.selectedIndex = index;
        picker.sync(); closePicker(true);
        select.dispatchEvent(new Event('input', {bubbles:true}));
        select.dispatchEvent(new Event('change', {bubbles:true}));
      }
      function open() {
        if (activePicker === picker) { closePicker(true); return; }
        closePicker(false); clear(menu);
        Array.from(select.options).forEach(function(option,index) {
          menu.appendChild(el('button', {type:'button',role:'option',tabindex:'-1',text:option.textContent,'aria-label':option.textContent,'aria-selected':String(option.selected),disabled:option.disabled,onclick:function() { choose(index); }}));
        });
        activePicker = picker;
        trigger.setAttribute('aria-expanded', 'true');
        var rect = trigger.getBoundingClientRect();
        var below = innerHeight - rect.bottom - 12;
        var above = rect.top - 12;
        var height = Math.min(280, Math.max(below, above));
        menu.style.width = Math.min(rect.width, innerWidth - 24) + 'px';
        menu.style.maxHeight = height + 'px';
        menu.style.left = Math.max(12, Math.min(rect.left, innerWidth - rect.width - 12)) + 'px';
        menu.style.top = below >= Math.min(280, select.options.length * 40 + 14) || below >= above ? (rect.bottom + 6) + 'px' : 'auto';
        menu.style.bottom = menu.style.top === 'auto' ? (innerHeight - rect.top + 6) + 'px' : 'auto';
        menu.showPopover();
        var selected = menu.querySelector('[aria-selected=true]:not(:disabled)') || menu.querySelector('[role=option]:not(:disabled)');
        if (selected) { selected.focus({preventScroll:true}); selected.scrollIntoView({block:'nearest'}); }
      }
      trigger.addEventListener('click', open);
      trigger.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
      });
      var search = '', searchTimer;
      menu.addEventListener('keydown', function(e) {
        var choices = all('[role=option]:not(:disabled)', menu);
        var index = choices.indexOf(document.activeElement);
        var next = e.key === 'ArrowDown' ? (index + 1) % choices.length : e.key === 'ArrowUp' ? (index + choices.length - 1) % choices.length : e.key === 'Home' ? 0 : e.key === 'End' ? choices.length - 1 : -1;
        if (next >= 0) { e.preventDefault(); choices[next].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); closePicker(true); }
        else if (e.key === 'Tab') { closePicker(true); }
        else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault(); search += e.key.toLowerCase(); clearTimeout(searchTimer);
          searchTimer = setTimeout(function() { search = ''; }, 600);
          var match = choices.find(function(choice) { return choice.textContent.toLowerCase().startsWith(search); });
          if (match) match.focus();
        }
      });
      select.addEventListener('change', picker.sync);
      picker.sync();
    });
  }

  function renderAll() {
    updateSummary();
    fillInputs();
    renderTrackerStates();
    renderCatalogs();
    renderProfiles();
    renderCustomCatalogs();
    enhanceSelects();
    renderInstall();
  }
  bindInputs();
  bindProbes();
  renderAll();
  encode();
  loadCatalogs();
  api('/api/account/status').then(function (r) {
    account = { durable: !!r.durable, exists: !!r.exists, signedIn: !!r.signedIn, username: r.username || '' };
    renderAccount();
    if (account.signedIn) api('/api/account/load').then(function (l) { if (!l.error) adoptServerConfig(l.config); });
  });
})();
`;

// ---------------------------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------------------------

export function renderPage(): string {
  const defaults = JSON.stringify(DEFAULT_CONFIG).replace(/</g, '\\u003c');
  const script = JS.replace('__DEFAULTS__', defaults);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="referrer" content="no-referrer">
<title>Rill</title>
<link rel="icon" href="/logo.svg?v=rill" type="image/svg+xml">
<style>${CSS}</style>
</head>
<body>
${body()}
<script>${script}</script>
</body>
</html>`;
}

/** An abstract monochrome mark; also used as the favicon. */
export function renderLogo(): string {
  return BRAND_LOGO;
}
