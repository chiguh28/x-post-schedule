// State
let posts = [];
let isScheduling = false;
let ws = null;

// API helpers
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  return res.json();
}

// WebSocket connection
function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWsMessage(data);
  };
  ws.onclose = () => setTimeout(connectWs, 3000);
}

function handleWsMessage(data) {
  if (data.type === 'progress') {
    // Update the specific post's status
    const post = posts.find(p => p.id === data.postId);
    if (post) {
      post.status = data.status === 'success' ? 'scheduled' : data.status === 'failed' ? 'failed' : post.status;
      if (data.error) post.error = data.error;
    }
    updateProgress(data.current, data.total);
    renderAll();
  } else if (data.type === 'complete') {
    isScheduling = false;
    renderAll();
    const s = data.summary;
    showToast(s.failed > 0 ? 'error' : 'success', `完了: ${s.success}件成功 / ${s.failed}件失敗`);
    setTimeout(() => {
      document.getElementById('progressSection').classList.remove('active');
    }, 3000);
    // Re-enable button
    const btn = document.getElementById('scheduleBtn');
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> 一括予約実行';
  } else if (data.type === 'error') {
    isScheduling = false;
    showToast('error', data.message);
  } else if (data.type === 'session') {
    applySessionStatus({ valid: data.valid, message: data.message });
  }
}

// Parse Markdown
async function parseMd() {
  const md = document.getElementById('mdInput').value.trim();
  if (!md) { showToast('error', 'Markdown を入力してください'); return; }

  const result = await api('POST', '/parse', { markdown: md });
  posts = result.posts.map(p => ({ ...p, scheduledAt: p.scheduledAt }));

  renderAll();

  let msg = `${posts.length} 件の投稿を読み込みました`;
  if (result.warnings.length > 0) msg += ` (警告: ${result.warnings.length}件)`;
  showToast(result.errors.length > 0 ? 'error' : 'info', msg);
}

// Fetch posts from server
async function fetchPosts() {
  const data = await api('GET', '/posts');
  posts = data;
  renderAll();
}

// Update post text
async function updateText(id, value) {
  await api('PUT', `/posts/${id}`, { text: value });
  const post = posts.find(p => p.id === id);
  if (post) post.text = value;
  updateCharCount(id);
}

// Update post datetime
async function updateDateTime(id, value) {
  await api('PUT', `/posts/${id}`, { scheduledAt: new Date(value).toISOString() });
  const post = posts.find(p => p.id === id);
  if (post) post.scheduledAt = new Date(value).toISOString();
}

// Delete post
async function deletePost(id) {
  await api('DELETE', `/posts/${id}`);
  posts = posts.filter(p => p.id !== id);
  renderAll();
  showToast('info', '投稿を削除しました');
}

// Remove image
async function removeImage(postId, imgIndex) {
  const result = await api('DELETE', `/posts/${postId}/images/${imgIndex}`);
  const post = posts.find(p => p.id === postId);
  if (post) post.images = result.images;
  renderAll();
}

// Add image by URL
async function addImageByUrl(postId) {
  const input = document.getElementById(`imgurl-${postId}`);
  const url = input?.value.trim();
  if (!url) return;

  const result = await api('POST', `/posts/${postId}/images`, { url });
  if (result.error) { showToast('error', result.error); return; }
  const post = posts.find(p => p.id === postId);
  if (post) post.images = result.images;
  renderAll();
  showToast('success', '画像を追加しました');
}

// Add image by file upload
async function addImageByFile(postId, file) {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch(`/api/posts/${postId}/images`, { method: 'POST', body: formData });
  const result = await res.json();
  if (result.error) { showToast('error', result.error); return; }
  const post = posts.find(p => p.id === postId);
  if (post) post.images = result.images;
  renderAll();
  showToast('success', '画像をアップロードしました');
}

// Start scheduling
async function startSchedule() {
  if (isScheduling) return;
  const pending = posts.filter(p => p.status === 'pending' || p.status === 'failed');
  if (pending.length === 0) { showToast('info', '予約対象の投稿がありません'); return; }

  isScheduling = true;
  document.getElementById('progressSection').classList.add('active');
  const btn = document.getElementById('scheduleBtn');
  btn.disabled = true;
  btn.textContent = '予約実行中...';

  // Mark all pending as scheduling
  pending.forEach(p => p.status = 'scheduling');
  renderAll();
  updateProgress(0, pending.length);

  await api('POST', '/schedule', { dryRun: false });
  // Progress updates come via WebSocket
}

async function startDryRun() {
  showToast('info', 'ドライラン: 実際の予約は行いません');
  if (isScheduling) return;
  const pending = posts.filter(p => p.status === 'pending' || p.status === 'failed');
  if (pending.length === 0) { showToast('info', '予約対象の投稿がありません'); return; }

  isScheduling = true;
  document.getElementById('progressSection').classList.add('active');

  await api('POST', '/schedule', { dryRun: true });
}

// Retry single post
async function retryPost(id) {
  const post = posts.find(p => p.id === id);
  if (!post) return;
  post.status = 'scheduling';
  renderAll();
  await api('POST', `/schedule/${id}`);
  // Progress via WebSocket
}

// Clear all
async function clearAll() {
  // Delete all posts from server
  for (const p of [...posts]) {
    await api('DELETE', `/posts/${p.id}`);
  }
  posts = [];
  document.getElementById('mdInput').value = '';
  renderAll();
  document.getElementById('progressSection').classList.remove('active');
  // Reset empty state
  const list = document.getElementById('postList');
  list.innerHTML = `<div class="empty-state" id="emptyState">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <p>Markdown を入力して「読み込み」を押すと<br>投稿一覧がここに表示されます</p>
  </div>`;
}

// Check session status
async function checkSession() {
  try {
    const status = await api('GET', '/session/status');
    applySessionStatus(status);
  } catch {}
}

// Reflect a session status object onto the header indicator + login button
function applySessionStatus(status) {
  const indicator = document.querySelector('.session-indicator');
  const dot = indicator.querySelector('.session-dot');
  const label = indicator.querySelector('.session-label');
  const btn = document.getElementById('loginBtn');
  if (status.valid) {
    dot.style.background = 'var(--success)';
    dot.style.boxShadow = '0 0 8px rgba(0,200,83,.5)';
    label.textContent = 'セッション有効';
    btn.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'ログイン';
  } else {
    dot.style.background = 'var(--danger)';
    dot.style.boxShadow = '0 0 8px rgba(244,33,46,.5)';
    label.textContent = status.message || 'セッション無効';
    btn.style.display = '';
  }
}

// Trigger the login flow: opens a real Chrome window server-side.
// The user logs in there and closes it; the session indicator updates
// automatically via WebSocket once done — no separate script to run.
async function startLogin() {
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = 'ログイン中...';
  const result = await api('POST', '/session/login', {});
  if (result.started) {
    showToast('info', result.message || 'ブラウザが開きます。ログインしてブラウザを閉じてください。');
  } else {
    showToast('error', result.message || 'ログインを開始できませんでした');
    btn.disabled = false;
    btn.textContent = 'ログイン';
  }
  // 成功/失敗の最終状態は WebSocket の 'session' メッセージで反映される
}

// === RENDER ===
function renderAll() {
  renderSummary();
  renderPosts();
  document.getElementById('scheduleSection').style.display = posts.length ? '' : 'none';
  document.getElementById('summaryBar').style.display = posts.length ? 'flex' : 'none';
}

function renderSummary() {
  document.getElementById('totalCount').textContent = posts.length;
  document.getElementById('imageCount').textContent = posts.filter(p => p.images && p.images.length > 0).length;
  const errors = posts.filter(p => p.status === 'failed').length;
  document.getElementById('errorCount').textContent = errors;
  document.getElementById('errorChip').style.display = errors > 0 ? 'flex' : 'none';
}

function renderPosts() {
  const list = document.getElementById('postList');
  const empty = document.getElementById('emptyState');
  if (posts.length === 0) {
    if (!empty) {
      list.innerHTML = `<div class="empty-state" id="emptyState">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p>Markdown を入力して「読み込み」を押すと<br>投稿一覧がここに表示されます</p>
      </div>`;
    }
    return;
  }
  list.innerHTML = posts.map((post, i) => renderCard(post, i)).join('');
  // Attach char count events
  posts.forEach(post => {
    const ta = document.getElementById(`text-${post.id}`);
    if (ta) {
      ta.addEventListener('input', () => updateCharCount(post.id));
      updateCharCount(post.id);
    }
  });
}

function renderCard(post, index) {
  const statusLabels = { pending: '未予約', scheduling: '予約中...', scheduled: '予約完了', failed: 'エラー' };
  const isLocked = isScheduling || post.status === 'scheduled';

  // Format datetime for input
  const dtValue = post.scheduledAt ? post.scheduledAt.slice(0, 16) : '';

  const imagesHtml = (post.images || []).map((img, imgI) => `
    <div class="image-thumb" onclick="openLightbox('${img.previewUrl || img.source}')">
      <img src="${img.previewUrl || img.source}" alt="画像${imgI + 1}">
      <button class="image-remove" onclick="event.stopPropagation();removeImage('${post.id}',${imgI})" title="削除">&times;</button>
    </div>
  `).join('');

  const imageCount = (post.images || []).length;
  const canAddImage = imageCount < 4 && !isLocked;

  return `
    <div class="post-card ${post.status}" style="animation-delay:${index * .07}s">
      <div class="post-card-header">
        <span class="post-number">#${index + 1}</span>
        <div class="post-header-right">
          <span class="status-badge ${post.status}">
            <span class="status-dot"></span>
            ${statusLabels[post.status] || post.status}
          </span>
          <button class="post-delete" onclick="deletePost('${post.id}')" title="削除">&times;</button>
        </div>
      </div>
      <div class="post-card-body">
        <div class="post-datetime">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <input type="datetime-local" value="${dtValue}" ${isLocked ? 'disabled' : ''} onchange="updateDateTime('${post.id}', this.value)">
        </div>
        <div class="post-text-area">
          <textarea class="post-textarea" id="text-${post.id}" ${isLocked ? 'disabled' : ''} onchange="updateText('${post.id}', this.value)">${post.text}</textarea>
          <span class="char-counter" id="counter-${post.id}">0/140</span>
        </div>
        <div class="post-images">
          <div class="image-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            画像 (${imageCount}/4)
          </div>
          <div class="images-grid">
            ${imagesHtml}
            ${canAddImage ? `
              <label class="image-add-btn" title="画像を追加">
                +
                <input type="file" accept="image/*" style="display:none" onchange="addImageByFile('${post.id}', this.files[0])">
              </label>
            ` : ''}
          </div>
          ${canAddImage ? `
            <div class="image-add-zone" style="margin-top:.4rem">
              <div class="image-url-input">
                <input type="text" placeholder="画像URLを入力..." id="imgurl-${post.id}">
                <button class="btn btn-ghost btn-sm" onclick="addImageByUrl('${post.id}')">追加</button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
      ${post.status === 'failed' ? `
        <div class="post-card-footer">
          <span style="flex:1;font-size:.75rem;color:var(--danger)">${post.error || '予約に失敗しました'}</span>
          <button class="btn btn-danger btn-sm" onclick="retryPost('${post.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            リトライ
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function updateCharCount(id) {
  const ta = document.getElementById(`text-${id}`);
  const counter = document.getElementById(`counter-${id}`);
  if (!ta || !counter) return;
  const len = ta.value.length;
  counter.textContent = `${len}/140`;
  counter.className = 'char-counter' + (len > 140 ? ' over' : len > 120 ? ' warning' : '');
}

function updateProgress(current, total) {
  const pct = total > 0 ? (current / total * 100) : 0;
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressCount').textContent = `${current} / ${total}`;
  document.getElementById('progressText').textContent = current === total ? '完了' : '予約実行中...';
}

// === LIGHTBOX ===
function openLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

// === DRAG & DROP ===
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('mdInput').value = ev.target.result;
      showToast('info', `${file.name} を読み込みました`);
    };
    reader.readAsText(file);
  }
});

document.getElementById('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('mdInput').value = ev.target.result;
      showToast('info', `${file.name} を読み込みました`);
    };
    reader.readAsText(file);
  }
});

// === TOAST ===
function showToast(type, msg) {
  const container = document.getElementById('toastContainer');
  const icons = {
    success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.innerHTML = `${icons[type] || ''}${msg}`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

// === EXAMPLES MODAL ===
function openExamples() {
  document.getElementById('examplesModal').classList.add('open');
}
function closeExamples(e) {
  if (e.target === e.currentTarget) document.getElementById('examplesModal').classList.remove('open');
}
function closeExamplesForce() {
  document.getElementById('examplesModal').classList.remove('open');
}
function switchTab(btn, panelId) {
  document.querySelectorAll('.example-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.example-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(panelId).classList.add('active');
}
function copyExample(codeId) {
  const text = document.getElementById(codeId).textContent;
  navigator.clipboard.writeText(text).then(() => showToast('success', 'コピーしました'));
}

// === KEYBOARD ===
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeLightbox(); closeExamplesForce(); }
});

// === INIT ===
connectWs();
checkSession();
