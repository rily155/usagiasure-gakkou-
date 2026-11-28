const gashaponResults = [
  {
    capsuleName: "金のカプセル",
    content: {
      name: "天使うさまる",
      backgroundColor: "#fef3c7",
      borderColor: "#f59e0b",
      silhouetteColor: "#b45309",
      imageName: "angel-usamaru.jpeg",
    },
  },
  {
    capsuleName: "銀のカプセル",
    content: {
      name: "パトカーうさまる",
      backgroundColor: "#e5e7eb",
      borderColor: "#9ca3af",
      silhouetteColor: "#6b7280",
      imageName: "usamaru.png",
    },
  },
  {
    capsuleName: "赤いカプセル",
    content: {
      name: "うさこちゃん",
      backgroundColor: "#fee2e2",
      borderColor: "#ef4444",
      silhouetteColor: "#991b1b",
      imageName: "usako.jpg",
    },
  },
  {
    capsuleName: "青いカプセル",
    content: {
      name: "ねこちゃん",
      backgroundColor: "#dbeafe",
      borderColor: "#3b82f6",
      silhouetteColor: "#1d4ed8",
      imageName: "neko.png",
    },
  },
  {
    capsuleName: "緑のカプセル",
    content: {
      name: "モリゾーとキッコロ",
      backgroundColor: "#dcfce7",
      borderColor: "#22c55e",
      silhouetteColor: "#166534",
      imageName: "morizo.png",
    },
  },
];

const capsuleColorsByResult = {
  "金のカプセル": {
    top: "#fbbf24",
    band: "#b45309",
    shine: "#fde68a",
    bottom: "#f59e0b",
  },
  "銀のカプセル": {
    top: "#d1d5db",
    band: "#6b7280",
    shine: "#f3f4f6",
    bottom: "#9ca3af",
  },
  "赤いカプセル": {
    top: "#f87171",
    band: "#b91c1c",
    shine: "#fecaca",
    bottom: "#dc2626",
  },
  "青いカプセル": {
    top: "#60a5fa",
    band: "#1d4ed8",
    shine: "#bfdbfe",
    bottom: "#2563eb",
  },
  "緑のカプセル": {
    top: "#4ade80",
    band: "#166534",
    shine: "#bbf7d0",
    bottom: "#16a34a",
  },
};

const capsuleThemeByResult = {
  "金のカプセル": {
    shell: "#f59e0b",
    shellLight: "#fbbf24",
    shellDark: "#d97706",
    highlight: "#fde68a",
  },
  "銀のカプセル": {
    shell: "#9ca3af",
    shellLight: "#d1d5db",
    shellDark: "#6b7280",
    highlight: "#f3f4f6",
  },
  "赤いカプセル": {
    shell: "#dc2626",
    shellLight: "#f87171",
    shellDark: "#991b1b",
    highlight: "#fecaca",
  },
  "青いカプセル": {
    shell: "#2563eb",
    shellLight: "#60a5fa",
    shellDark: "#1d4ed8",
    highlight: "#bfdbfe",
  },
  "緑のカプセル": {
    shell: "#16a34a",
    shellLight: "#4ade80",
    shellDark: "#166534",
    highlight: "#bbf7d0",
  },
};

const STAR_LAYOUT = [
  { size: "s", left: "10%", top: "10%", duration: 8, delay: 0 },
  { size: "s", left: "80%", top: "20%", duration: 6, delay: 1 },
  { size: "s", left: "60%", top: "40%", duration: 5, delay: 2 },
  { size: "s", left: "20%", top: "70%", duration: 7, delay: 3 },
  { size: "s", left: "80%", top: "80%", duration: 7, delay: 4 },
  { size: "m", left: "40%", top: "10%", duration: 4, delay: 0 },
  { size: "m", left: "10%", top: "50%", duration: 7, delay: 1 },
  { size: "m", left: "50%", top: "50%", duration: 8, delay: 2 },
  { size: "m", left: "90%", top: "90%", duration: 5, delay: 3 },
  { size: "m", left: "80%", top: "50%", duration: 7, delay: 4 },
  { size: "l", left: "90%", top: "10%", duration: 5, delay: 0 },
  { size: "l", left: "10%", top: "80%", duration: 6, delay: 1 },
  { size: "l", left: "30%", top: "20%", duration: 7, delay: 2 },
  { size: "l", left: "60%", top: "90%", duration: 8, delay: 3 },
  { size: "l", left: "80%", top: "50%", duration: 7, delay: 4 },
];


const $ = (selector) => document.querySelector(selector);
const toy = $('.gashaponToy'), start = $('#start'), capsule = $('#c1'), dialog = $('#result'), preview = $('#preview');
let result = null, active = false, timer = null;
function startGashapon() {
  if (active || dialog.open) return;
  result = gashaponResults[Math.floor(Math.random() * gashaponResults.length)];
  const colors = capsuleColorsByResult[result.capsuleName];
  capsule.querySelectorAll('[data-color]').forEach(el => el.setAttribute('fill', colors[el.dataset.color]));
  active = true; start.disabled = true; start.textContent = 'もう一度まわす?';
  toy.classList.add('is-active');
  timer = setTimeout(() => { timer = null; capsule.classList.add('ready'); capsule.setAttribute('tabindex','0'); }, 1000);
}
function showResult() {
  if (!active || timer !== null) return;
  active = false; toy.classList.remove('is-active'); capsule.classList.remove('ready'); capsule.setAttribute('tabindex','-1');
  start.disabled = false; start.textContent = 'ガチャをまわす';
  const theme = capsuleThemeByResult[result.capsuleName];
  for (const [key,value] of Object.entries({shell:theme.shell,'shell-light':theme.shellLight,'shell-dark':theme.shellDark,highlight:theme.highlight})) preview.style.setProperty('--capsule-'+key,value);
  const content = result.content; $('.prize').style.backgroundColor = content.backgroundColor; $('.prize').style.borderColor = content.borderColor;
  $('#prizeImage').src = 'assets/items/' + content.imageName; $('#prizeName').textContent = content.name;
  preview.classList.remove('opened'); dialog.showModal(); preview.focus();
}
function openCapsule() {
  preview.classList.remove('opened');
  preview.querySelectorAll('.rotator').forEach(el => el.getAnimations().forEach(a=>a.cancel()));
  void preview.offsetWidth; preview.classList.add('opened');
}
function activate(el,fn) { el.addEventListener('click',fn); el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}}); }
start.addEventListener('click',startGashapon); activate($('#holder'),startGashapon); activate(capsule,showResult); activate(preview,openCapsule);
$('#close').addEventListener('click',()=>dialog.close()); dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();}); dialog.addEventListener('close',()=>start.focus());
for(const star of STAR_LAYOUT){const el=document.createElement('span');el.className='star '+star.size;el.textContent='✦';Object.assign(el.style,{left:star.left,top:star.top,animationDuration:star.duration+'s',animationDelay:star.delay+'s'});$('.stars').append(el);}
