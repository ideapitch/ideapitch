let currentFilter = 'top';
let openIdeas     = [];
let closedIdeas   = [];
let isLoading     = false;

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function onType() {
  const val = document.getElementById('ideaInput').value;
  const len = val.trim().length;
  const el  = document.getElementById('charCount');
  el.textContent = `${val.length} / 500`;
  el.className   = val.length > 450 ? 'warn' : '';
  document.getElementById('submitBtn').disabled = len < 10 || len > 500;
}

function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderIdeas();
}

function renderStats() {
  document.getElementById('sOpen').textContent   = openIdeas.length;
  document.getElementById('sClosed').textContent = closedIdeas.length;
}

function buildCard(idea, isClosed) {
  if (!idea || !idea.user) return '';
  const votes    = idea.reactions?.['+1'] || 0;
  const ideaText = idea.body || idea.title || '';
  const badge    = isClosed ? `<span class="badge closed">Closed</span>` : '';
  return `
    <div class="idea-card ${isClosed ? 'is-closed' : ''}">
      <div class="vote-col">
        <span class="vote-n">${votes}</span>
        <span class="vote-label">votes</span>
      </div>
      <div class="idea-content">
        <div class="idea-from">
          <img src="${idea.user.avatar_url}" alt="">
          idea from <a href="https://github.com/${idea.user.login}" target="_blank">@${idea.user.login}</a>
        </div>
        <p class="idea-text">${escapeHtml(ideaText)}</p>
        <div class="idea-footer">
          <div class="idea-actions">${badge}</div>
          <a href="/idea?id=${idea.number}" class="meta-link">View →</a>
        </div>
      </div>
    </div>`;
}

function renderIdeas() {
  const list     = document.getElementById('ideasList');
  const isClosed = currentFilter === 'closed';
  let ideas      = isClosed ? [...closedIdeas] : [...openIdeas];

  if (!ideas.length) {
    list.innerHTML = isClosed
      ? '<div class="empty">No closed ideas yet.</div>'
      : '<div class="empty">No ideas yet.<br>Be the first to post one.</div>';
    return;
  }

  if (currentFilter === 'top') {
    ideas.sort((a, b) => (b.reactions?.['+1'] || 0) - (a.reactions?.['+1'] || 0));
  } else {
    ideas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  list.innerHTML = ideas.map(idea => buildCard(idea, isClosed)).join('');
}

let isSubmittingIdea = false;

async function submitIdea() {
  if (isSubmittingIdea) return;
  const text = document.getElementById('ideaInput').value.trim();
  if (!text || !isLoggedIn() || text.length > 500) return;

  isSubmittingIdea = true;
  const btn = document.getElementById('submitBtn');
  btn.disabled    = true;
  btn.textContent = 'Publishing...';

  try {
    const newIdea = await postIdea(text);

    if (!newIdea || !newIdea.number) {
      showToast('Failed to post. Try again.', 'err');
      isSubmittingIdea = false;
      btn.disabled    = false;
      btn.textContent = 'Submit idea';
      return;
    }

    document.getElementById('ideaInput').value = '';
    onType();

    openIdeas.unshift(newIdea);
    renderStats();
    currentFilter = 'new';
    document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.f-btn:nth-child(2)').classList.add('active');
    renderIdeas();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Idea posted! ✓', 'ok');

  } catch {
    showToast('Network error.', 'err');
  }

  isSubmittingIdea = false;
  btn.disabled    = false;
  btn.textContent = 'Submit idea';
}

async function loadIdeas(silent = false) {
  if (isLoading) return;
  isLoading = true;

  try {
    const data  = await fetchIdeas();
    openIdeas   = data.openIdeas;
    closedIdeas = data.closedIdeas;
    renderStats();
    renderIdeas();
  } catch {
    if (!silent) {
      document.getElementById('ideasList').innerHTML =
        '<div class="empty">Could not load ideas.<br>Check your connection.</div>';
    }
  }

  isLoading = false;
}

document.addEventListener('DOMContentLoaded', () => {
  renderUI();
  checkToken();
  document.getElementById('ideasList').innerHTML =
    '<div class="loading"><div class="spinner"></div><span>Loading ideas...</span></div>';
  loadIdeas();
});

window.addEventListener('pageshow', e => {
  if (e.persisted) location.reload();
});
