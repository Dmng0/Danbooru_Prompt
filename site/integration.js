/* Server-backed generation; all formatting and output editing stays in the browser. */
const outputDirty = { sd: false, nai: false, natural: false };
let outputSource = null;

function serverBase() {
  const raw = (window.PROMPT_HELPER_CONFIG?.apiBase || '').trim();
  if (!raw) throw new Error('서비스 연결이 설정되지 않았습니다. 관리자에게 문의해 주세요.');
  let u;
  try { u = new URL(raw); } catch { throw new Error('서버 주소를 https://부터 입력해 주세요.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Error('외부 서버에는 HTTPS 주소를 사용해 주세요.');
  if (u.username || u.password || u.search || u.hash) throw new Error('서버 주소에는 계정·쿼리·해시를 넣지 마세요.');
  return u.href.replace(/\/$/, '');
}
function apiHeaders() { return { 'Content-Type': 'application/json' }; }
async function apiFetch(path, init = {}) {
  const base = serverBase();
  try {
    return await fetch(base + path, { ...init, headers: { ...init.headers, ...apiHeaders() }, signal: AbortSignal.timeout(90000) });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('서버 응답 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.');
    throw new Error('AI 서버에 연결하지 못했습니다. 주소·서버 실행 상태·허용 사이트 설정(CORS)을 확인해 주세요.');
  }
}
// Load the catalog before displaying verification labels, also enabling autocomplete immediately.
acEnsureLoaded().then(() => { if (currentResultData) syncOutputs(); });

function outputTokens() {
  const { front, back } = fixedSlots();
  return [...front, ...parsePassthroughNames(), ...(currentResultData?.final_prompt || '').split(','), ...back].map(x => x.trim()).filter(Boolean);
}
function formatForTarget(tokens, target) {
  return tokens.map(token => {
    const { tag, weight } = parseTagWeight(token);
    let text = tag;
    if (document.getElementById('replace_underscores').checked) text = text.replace(/_/g, ' ');
    // Escape literal brackets once; weight wrappers are added afterwards.
    text = text.replace(/\\([()[\]{}])/g, '$1');
    if (target === 'sd') text = text.replace(/[()[\]]/g, c => '\\' + c);
    else text = text.replace(/[{}[\]]/g, c => '\\' + c);
    const w = target === 'sd' ? Math.max(0.1, weight) : weight;
    return Math.abs(w - 1) < 1e-9 ? text : target === 'sd' ? `(${text}:${w.toFixed(1)})` : `${w.toFixed(1)}::${text}::`;
  }).join(', ');
}
function syncOutputs(reset = false) {
  if (!currentResultData) return;
  const source = currentResultData.english_prompt || '';
  if (reset || outputSource !== source) { Object.keys(outputDirty).forEach(k => outputDirty[k] = false); outputSource = source; }
  const values = { sd: formatForTarget(outputTokens(), 'sd'), nai: formatForTarget(outputTokens(), 'nai'), natural: source };
  for (const [key, value] of Object.entries(values)) if (!outputDirty[key]) document.getElementById('output_' + key).value = value;
  const unknown = (currentResultData.final_prompt || '').split(',').map(t => parseTagWeight(t).tag).filter(t => t && !tagInfo.has(t));
  document.getElementById('tag_validation').textContent = !ac.ready ? '태그 사전을 불러오는 중입니다. 사전 로딩 실패 시 자동완성·태그 확인을 사용할 수 없습니다.' : unknown.length ? `기본 사전에서 미확인 ${unknown.length}개: ${unknown.join(', ')}. 존재하지 않는 태그라는 뜻은 아니며 직접 확인할 수 있습니다.` : '현재 태그는 기본 사전에 포함되어 있습니다. 기본 사전은 전체 Danbooru DB가 아닙니다.';
  document.querySelectorAll('.db-tag').forEach(el => { const core = parseTagWeight(el.textContent).tag.replace(/\\([()])/g, '$1').replace(/ /g, '_'); el.classList.toggle('unverified', !tagInfo.has(core)); });
}
const originalDisplayResults = displayResults;
displayResults = function () { originalDisplayResults(); syncOutputs(); };
const originalFinalInput = onFinalEditInput;
onFinalEditInput = function () { originalFinalInput(); syncOutputs(); };
const originalGenerate = generateTags;
generateTags = async function () {
  // Configuration failures must not erase an existing result.
  try { serverBase(); }
  catch (e) { showError(e.message); return; }
  outputSource = null;
  await originalGenerate();
};
copyAll = function () {
  const sd = document.getElementById('output_sd').value;
  const natural = document.getElementById('output_natural').value;
  doCopy([sd, natural].filter(Boolean).join('\n\n'), () => document.getElementById('output_status').textContent = 'Stable Diffusion 태그와 자연어를 복사했습니다.');
};
document.getElementById('copy_all_btn').textContent = '모두 복사하기 (Stable Diffusion + 자연어)';
for (const key of Object.keys(outputDirty)) document.getElementById('output_' + key).addEventListener('input', () => { outputDirty[key] = true; });
document.querySelectorAll('[data-output]').forEach(button => button.onclick = () => {
  const mode = button.dataset.output;
  document.querySelectorAll('[data-output]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  document.querySelectorAll('[data-output-panel]').forEach(p => p.hidden = mode !== 'all' && p.dataset.outputPanel !== mode);
});
document.querySelectorAll('[data-copy-output]').forEach(button => button.onclick = () => {
  const key = button.dataset.copyOutput;
  doCopy(document.getElementById('output_' + key).value, () => document.getElementById('output_status').textContent = '복사했습니다.');
});
document.querySelectorAll('[data-reset-output]').forEach(button => button.onclick = () => { outputDirty[button.dataset.resetOutput] = false; syncOutputs(); });
// Make the existing natural-language area editable and keep its copy action in sync.
const nlArea = document.getElementById('res_nl_prompt');
nlArea.contentEditable = 'true';
nlArea.setAttribute('aria-label', '자연어 프롬프트 편집');
nlArea.addEventListener('input', () => {
  if (currentResultData && currentNlTone !== 'phrase') {
    currentResultData.english_prompt = nlArea.textContent;
    document.getElementById('output_natural').value = nlArea.textContent;
    outputSource = nlArea.textContent;
  }
});
// Search tags append in click order and participate in normal weight/delete editing.
const appendButton = document.createElement('button');
appendButton.type = 'button'; appendButton.textContent = '검색 결과: 클릭하여 태그 추가 모드';
document.getElementById('res_direct_db').before(appendButton);
let appendSearch = false;
appendButton.onclick = () => { appendSearch = !appendSearch; appendButton.textContent = appendSearch ? '태그 추가 모드 켜짐 · 클릭하여 끄기' : '검색 결과: 클릭하여 태그 추가 모드'; renderDirectDBResults(); };
const originalRenderDirect = renderDirectDBResults;
renderDirectDBResults = function () {
  originalRenderDirect();
  if (!appendSearch) return;
  [...document.getElementById('res_direct_db').children].forEach((el, i) => {
    const item = lastDirectDBResults?.[i]; if (!item) return;
    el.onclick = () => {
      currentResultData ||= { final_prompt: '', english_prompt: '' };
      const tokens = currentResultData.final_prompt.split(',').map(x => x.trim()).filter(Boolean);
      if (!tokens.some(t => parseTagWeight(t).tag === item.tag)) tokens.push(item.tag);
      currentResultData.final_prompt = tokens.join(', '); displayResults();
    };
  });
};
