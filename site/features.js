/* Saved preferences exclude input prompts, generated results and uploaded images. */
const settingsKey = 'prompt-helper-settings-v1';
function saveSettings() {
  const fields = {};
  document.querySelectorAll('.advanced-settings input[id]').forEach(el => fields[el.id] = el.value);
  const settings = { fields, fixedPos, fixedPriority, currentArtistPrefix, currentNlTone, currentWeightSyntax,
    artists: [...document.querySelectorAll('.artist-row')].map(row => ({ name: row.querySelector('.artist-name').value, weight: row.querySelector('.artist-weight').value })) };
  try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch { /* Private/limited storage: keep current session usable. */ }
}
function restoreSettings() {
  document.querySelectorAll('.advanced-settings').forEach(el => el.open = false);
  let saved; try { saved = JSON.parse(localStorage.getItem(settingsKey) || 'null'); } catch { return; }
  if (!saved || typeof saved !== 'object') return;
  const choose = (group, attribute, value, handler) => {
    const button = [...document.querySelectorAll(group + ' button')].find(b => b.dataset[attribute] === value);
    if (button) handler(button);
  };
  choose('#weight_syntax_group', 'syntax', saved.currentWeightSyntax, setWeightSyntax);
  choose('#quality_pos_group', 'pos', saved.fixedPos?.quality, b => setFixedPos('quality', b));
  choose('#artist_pos_group', 'pos', saved.fixedPos?.artist, b => setFixedPos('artist', b));
  choose('#fixed_priority_group', 'priority', saved.fixedPriority, setFixedPriority);
  choose('#artist_prefix_group', 'prefix', saved.currentArtistPrefix, setArtistPrefix);
  if (['rich', 'plain', 'phrase'].includes(saved.currentNlTone)) setNlTone(saved.currentNlTone);
  if (Array.isArray(saved.artists)) {
    document.getElementById('artist_rows').replaceChildren();
    saved.artists.slice(0, 100).forEach(row => {
      addArtistRow();
      const el = document.getElementById('artist_rows').lastElementChild;
      el.querySelector('.artist-name').value = typeof row.name === 'string' ? row.name : '';
      el.querySelector('.artist-weight').value = Number.isFinite(Number(row.weight)) ? row.weight : '1.0';
    });
  }
  document.querySelectorAll('.advanced-settings input[id]').forEach(el => {
    const value = saved.fields?.[el.id];
    if (typeof value === 'string') { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  renderQualityBadges(); refreshFixedTags();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreSettings);
else restoreSettings();
for (const event of ['input', 'change', 'click', 'wheel']) document.addEventListener(event, e => {
  if (e.target.closest('.advanced-settings, #nl_tone_group, #weight_syntax_group')) queueMicrotask(saveSettings);
});
window.addEventListener('pagehide', saveSettings);

let imageState = null;
let imagePreparing = false;
let imageVersion = 0;
const imageFile = document.getElementById('image_file');
const imageDrop = document.getElementById('image_dropzone');
const imagePreview = document.getElementById('image_preview');
const imageStatus = document.getElementById('image_status');
const imageRemove = document.getElementById('image_remove');
function clearImage() {
  imageVersion++; imageState = null; imagePreparing = false; imageFile.value = '';
  imagePreview.removeAttribute('src'); imagePreview.hidden = true; imageRemove.hidden = true;
  imageStatus.textContent = '선택한 이미지가 없습니다.';
}
async function loadImage(file) {
  const version = ++imageVersion;
  imageState = null; imagePreview.hidden = true; imageRemove.hidden = false; imagePreparing = true;
  imageStatus.textContent = '이미지 준비 중…';
  let url;
  try {
    if (!file || !/\.(jpe?g|png)$/i.test(file.name) || !['', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error('JPG, JPEG, PNG 파일만 선택해 주세요.');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 이미지 1장을 선택해 주세요.');
    url = URL.createObjectURL(file);
    const img = new Image(); img.src = url; await img.decode();
    if (img.naturalWidth * img.naturalHeight > 50000000) throw new Error('이미지 해상도가 너무 큽니다. 크기를 줄여 주세요.');
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const data = dataUrl.split(',')[1];
    if (data.length > 3000000) throw new Error('변환한 이미지가 너무 큽니다. 크기를 줄여 다시 선택해 주세요.');
    if (version !== imageVersion) return;
    imageState = { mime_type: 'image/jpeg', data };
    imagePreview.src = dataUrl; imagePreview.hidden = false;
    imageStatus.textContent = `${file.name} · ${img.naturalWidth}×${img.naturalHeight} · 분석 준비 완료`;
  } catch (e) {
    if (version === imageVersion) { imageStatus.textContent = e.name === 'EncodingError' ? '이미지를 읽을 수 없습니다. 정상적인 JPG 또는 PNG 파일을 선택해 주세요.' : e.message; imageFile.value = ''; }
  } finally { if (url) URL.revokeObjectURL(url); if (version === imageVersion) imagePreparing = false; }
}
imageDrop.onclick = () => imageFile.click();
imageFile.onchange = () => { if (imageFile.files.length) loadImage(imageFile.files[0]); };
imageRemove.onclick = clearImage;
for (const name of ['dragenter', 'dragover']) imageDrop.addEventListener(name, e => { e.preventDefault(); imageDrop.classList.add('dragging'); });
for (const name of ['dragleave', 'drop']) imageDrop.addEventListener(name, e => { e.preventDefault(); imageDrop.classList.remove('dragging'); });
imageDrop.addEventListener('drop', e => {
  if (e.dataTransfer.files.length !== 1) { imageStatus.textContent = '이미지는 한 번에 1장만 선택해 주세요.'; return; }
  loadImage(e.dataTransfer.files[0]);
});
function imagePayload() {
  if (imagePreparing) throw new Error('이미지 준비가 끝난 후 생성해 주세요.');
  if (!imageState) throw new Error('분석할 JPG 또는 PNG 이미지를 먼저 선택해 주세요.');
  return { image: { ...imageState }, prompt: document.getElementById('image_notes').value.trim(),
    threshold: Number(document.getElementById('threshold').value), kw_temperature: Number(document.getElementById('kw_temp').value),
    nl_temperature: Number(document.getElementById('nl_temp').value), nl_tone: currentNlTone, search_categories: getSearchPoolCategories() };
}
