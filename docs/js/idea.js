const params  = new URLSearchParams(location.search);
const issueId = params.get('id');

let currentIssue = null;
let voteState    = { voted: false, rid: null };

async function loadIdea() {
  stopPolling();

  Object.keys(sessionStorage).forEach(key => {
    if ((key.startsWith('etag_') || key.startsWith('lm_')) &&
        key !== `etag_${issueId}` && key !== `lm_${issueId}`) {
      sessionStorage.removeItem(key);
    }
  });

  if (!issueId) { showError('No idea ID provided.'); return; }

  try {
    const issueRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueId}`,
      { headers: { Accept: GH_REACT } }
    );

    if (!issueRes.ok) { showError('Idea not found.'); return; }

    const issue = await issueRes.json();
    if (!issue || !issue.number) { showError('Idea not found.'); return; }

    currentIssue = issue;

    if (isLoggedIn()) {
      const { voted, rid } = await fetchVoteState(issue.number);
      voteState = { voted, rid };
    }

    renderIdea(issue);
    try {
      await loadComments(issue);
    } catch {
      renderComments(issue, []);
    }
    startPolling();

  } catch {
    showError('Could not load idea. Check your connection.');
  }
}

async function loadComments(issue) {
  try {
    const token   = getToken();
    const headers = { Accept: GH_JSON };
    if (token) headers['Authorization'] = `token ${token}`;
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueId}/comments?per_page=100`,
      { headers }
    );
    const comments = res.ok ? await res.json() : [];
    renderComments(issue, Array.isArray(comments) ? comments : []);
  } catch {
    renderComments(issue, []);
  }
}

function renderIdea(issue) {
  if (!issue || !issue.user) { showError('Could not load idea.'); return; }

  const isClosed = issue.state === 'closed';
  const votes    = issue.reactions?.['+1'] || 0;
  const date     = new Date(issue.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });

  document.getElementById('ideaLoading').style.display     = 'none';
  document.getElementById('ideaBox').style.display         = 'block';
  document.getElementById('commentsSection').style.display = 'block';
  document.title = 'IdeaPitch — Idea #' + issue.number;

  document.getElementById('ideaStatus').className   = `idea-status ${isClosed ? 'closed' : 'open'}`;
  document.getElementById('ideaStatus').textContent = isClosed ? 'Closed' : '● Open';
  document.getElementById('ideaText').textContent   = issue.body || '';
  document.getElementById('ideaAvatar').src         = issue.user.avatar_url;
  document.getElementById('ideaAuthor').textContent = `@${issue.user.login}`;
  document.getElementById('ideaAuthor').href        = `https://github.com/${issue.user.login}`;
  document.getElementById('ideaDate').textContent   = date;
  document.getElementById('voteCount').textContent  = votes;

  const voteBtn = document.getElementById('voteBtn');
  if (isClosed) {
    voteBtn.disabled = true;
    voteBtn.title    = 'Idea is closed';
  } else {
    voteBtn.classList.toggle('voted', voteState.voted);
    voteBtn.title   = voteState.voted ? 'Remove vote' : 'Upvote';
    voteBtn.onclick = () => vote(voteBtn);
  }

  const closeBtn = document.getElementById('closeBtn');
  if (!isClosed && isLoggedIn()) {
    const user    = getUser();
    const isOwner = user?.login === issue.user.login;
    const isAdmin = user?.login === 'offici5l';
    if (isOwner || isAdmin) closeBtn.style.display = 'inline-flex';
  }
}

function renderComments(issue, comments) {
  const isClosed = issue.state === 'closed';
  const list     = document.getElementById('commentsList');

  document.getElementById('commentsHeader').textContent = `Comments (${comments.length})`;

  list.innerHTML = comments.length === 0
    ? '<div class="no-comments">No comments yet.</div>'
    : comments.map(c => buildCommentHTML(c)).join('');

  const formArea = document.getElementById('commentFormArea');

  if (isClosed) {
    formArea.innerHTML = '<div class="comment-locked">🔒 This idea is closed. Comments are disabled.</div>';
  } else if (!isLoggedIn()) {
    formArea.innerHTML = `
      <div class="comment-signin">
        <p>Sign in to leave a comment.</p>
        <button class="btn-signin" onclick="login()">Sign in to comment</button>
      </div>`;
  } else {
    formArea.innerHTML = `
      <div class="comment-form">
        <textarea id="commentInput" placeholder="Leave a comment..." maxlength="1000" oninput="onCommentType()"></textarea>
        <div class="comment-form-footer">
          <button class="btn-comment" id="commentBtn" onclick="submitComment(${issue.number})" disabled>Comment</button>
        </div>
      </div>`;
  }
}

function buildCommentHTML(c) {
  if (!c || !c.user) return '';
  const date = new Date(c.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  return `
    <div class="comment" data-id="${c.id}">
      <img class="comment-avatar" src="${c.user.avatar_url}" alt="">
      <div class="comment-body">
        <div class="comment-meta">
          <a href="https://github.com/${c.user.login}" target="_blank" class="comment-author">@${c.user.login}</a>
          <span class="comment-date">${date}</span>
        </div>
        <p class="comment-text">${escapeHtml(c.body)}</p>
      </div>
    </div>`;
}

function onCommentType() {
  const val = document.getElementById('commentInput')?.value || '';
  const btn = document.getElementById('commentBtn');
  if (btn) btn.disabled = val.trim().length < 2;
}

async function vote(btn) {
  if (!isLoggedIn()) { showToast('Sign in to vote', 'err'); return; }

  const countEl = document.getElementById('voteCount');
  const current = parseInt(countEl.textContent) || 0;

  btn.disabled = true;

  try {
    if (!voteState.voted) {
      const reaction = await addReaction(currentIssue.number);
      if (reaction && reaction.id) {
        voteState = { voted: true, rid: reaction.id };
        btn.classList.add('voted');
        btn.title    = 'Already voted';
        btn.disabled = true;
        countEl.textContent = current + 1;
      } else {
        showToast('Vote failed.', 'err');
        btn.disabled = false;
      }
    }
  } catch {
    showToast('Vote failed.', 'err');
    btn.disabled = false;
  }
}

async function closeIdea() {
  if (!isLoggedIn() || !currentIssue) return;

  const btn = document.getElementById('closeBtn');
  btn.disabled    = true;
  btn.textContent = 'Closing...';

  try {
    const token = getToken();
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${currentIssue.number}`,
      {
        method: 'PATCH',
        headers: { Authorization: `token ${token}`, Accept: GH_JSON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' })
      }
    );

    if (res.ok) {
      const updated = await res.json();
      showToast('Idea closed ✓', 'ok');

      document.getElementById('ideaStatus').className   = 'idea-status closed';
      document.getElementById('ideaStatus').textContent = 'Closed';
      document.getElementById('voteBtn').disabled = true;
      btn.style.display = 'none';

      currentIssue = updated;

      const formArea = document.getElementById('commentFormArea');
      formArea.innerHTML = '<div class="comment-locked">🔒 This idea is closed. Comments are disabled.</div>';
    } else {
      showToast('Failed to close. Try again.', 'err');
      btn.disabled    = false;
      btn.textContent = 'Close idea';
    }
  } catch {
    showToast('Network error.', 'err');
    btn.disabled    = false;
    btn.textContent = 'Close idea';
  }
}

let isSubmitting = false;

async function submitComment(issueNumber) {
  if (isSubmitting) return;
  const input = document.getElementById('commentInput');
  const text  = input?.value.trim();
  const token = getToken();
  if (!text || !token) return;

  isSubmitting    = true;
  const btn = document.getElementById('commentBtn');
  btn.disabled    = true;
  btn.textContent = 'Commenting...';

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        headers: { Authorization: `token ${token}`, Accept: GH_JSON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text })
      }
    );

    if (res.ok) {
      const newComment = await res.json();
      input.value     = '';
      onCommentType();
      btn.textContent = 'Comment';

      const list = document.getElementById('commentsList');
      list.querySelector('.no-comments')?.remove();
      list.insertAdjacentHTML('beforeend', buildCommentHTML(newComment));

      document.getElementById('commentsHeader').textContent =
        `Comments (${list.querySelectorAll('.comment').length})`;

      pollNoChange = 0;
      pollInterval = 30000;
      isSubmitting = false;
      showToast('Comment posted! ✓', 'ok');
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || 'Failed to comment.', 'err');
      isSubmitting = false;
      btn.textContent = 'Comment';
    }
  } catch {
    isSubmitting    = false;
    showToast('Network error.', 'err');
    btn.textContent = 'Comment';
  }

  btn.disabled = false;
}

function showError(msg) {
  document.getElementById('ideaLoading').style.display     = 'none';
  document.getElementById('ideaBox').style.display         = 'none';
  document.getElementById('commentsSection').style.display = 'none';
  document.getElementById('errorBox').style.display        = 'block';
  document.getElementById('errorBox').innerHTML =
    `<div class="error-box">${msg}<br><a href="/">← Back to ideas</a></div>`;
}

function escapeHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  renderUI();
  checkToken();
  loadIdea();
});

window.addEventListener('pageshow', e => {
  if (e.persisted) { stopPolling(); location.reload(); }
});

function fetchWithTimeout(url, options, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeout);
  const signal     = options.signal
    ? options.signal
    : controller.signal;
  return fetch(url, { ...options, signal })
    .finally(() => clearTimeout(timeoutId));
}

// Poll comments: ETag + adaptive interval + append-only + AbortController
let pollEtag            = null;
let pollLastModified    = null;
let pollNoChange        = 0;
let pollInterval        = 30000;
let pollTimer           = null;
let pollActive          = false;
let pollAbortController = null;

function loadEtagFromStorage() {
  pollEtag         = sessionStorage.getItem(`etag_${issueId}`) || null;
  pollLastModified = sessionStorage.getItem(`lm_${issueId}`) || null;
}

function saveEtagToStorage() {
  if (pollEtag)         sessionStorage.setItem(`etag_${issueId}`, pollEtag);
  if (pollLastModified) sessionStorage.setItem(`lm_${issueId}`, pollLastModified);
}

async function pollComments() {
  if (!currentIssue || !pollActive) return;

  if (pollAbortController) pollAbortController.abort();
  pollAbortController = new AbortController();

  try {
    const headers = { Accept: GH_JSON };
    if (pollEtag)         headers['If-None-Match']     = pollEtag;
    if (pollLastModified) headers['If-Modified-Since'] = pollLastModified;
    const token = getToken();
    if (token) headers['Authorization'] = `token ${token}`;

    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueId}/comments?per_page=100`,
      { headers, signal: pollAbortController.signal }
    );

    if (res.status === 404 || res.status === 410) {
      stopPolling();
      showError('This idea no longer exists.');
      return;
    }

    if (res.status === 429) {
      pollInterval = Math.min(pollInterval * 2, 300000);
      if (pollActive) pollTimer = setTimeout(pollComments, pollInterval);
      return;
    }

    if (res.status === 304) {
      pollNoChange++;
    } else if (res.ok) {
      pollEtag         = res.headers.get('ETag') || pollEtag;
      pollLastModified = res.headers.get('Last-Modified') || pollLastModified;
      saveEtagToStorage();

      const comments = await res.json();
      if (!Array.isArray(comments)) return;

      const list = document.getElementById('commentsList');
      if (!list) return;

      const existingIds = new Set(
        [...list.querySelectorAll('.comment[data-id]')].map(c => parseInt(c.dataset.id, 10))
      );

      const newComments = comments.filter(c => !existingIds.has(c.id));

      if (newComments.length > 0) {
        list.querySelector('.no-comments')?.remove();
        newComments.forEach(c => list.insertAdjacentHTML('beforeend', buildCommentHTML(c)));
        document.getElementById('commentsHeader').textContent =
          `Comments (${list.querySelectorAll('.comment').length})`;
        pollNoChange = 0;
        pollInterval = 30000;
      } else {
        pollNoChange++;
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    pollInterval = Math.min(pollInterval * 2, 120000);
    if (pollActive) pollTimer = setTimeout(pollComments, pollInterval);
    return;
  }

  if (pollNoChange >= 3 && pollInterval < 120000) {
    pollInterval = Math.min(pollInterval * 2, 120000);
  }

  if (pollActive) pollTimer = setTimeout(pollComments, pollInterval);
}

function startPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollActive = true;
  loadEtagFromStorage();
  pollInterval = 30000;
  pollNoChange = 0;
  pollTimer    = setTimeout(pollComments, pollInterval);
}

function stopPolling() {
  pollActive = false;
  if (pollTimer) clearTimeout(pollTimer);
  if (pollAbortController) pollAbortController.abort();
  pollTimer           = null;
  pollAbortController = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else if (currentIssue) {
    startPolling();
  }
});

window.addEventListener('pagehide', stopPolling);
window.addEventListener('beforeunload', stopPolling);
