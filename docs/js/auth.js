const CLIENT_ID = 'Ov23lieD7jNNhSPtiKgy';
const PROXY_URL = 'https://ideapitch.offici5l.workers.dev';

function login() {
  const state = Math.random().toString(36).slice(2);
  localStorage.setItem('oauth_state', state);
  location.href = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=public_repo&state=${state}`;
}

function logout() {
  localStorage.removeItem('gh_token');
  localStorage.removeItem('gh_user');
  renderUI();
}

function getToken() {
  return localStorage.getItem('gh_token');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('gh_user') || 'null');
  } catch {
    localStorage.removeItem('gh_user');
    return null;
  }
}

function isLoggedIn() {
  return !!(getToken() && getUser());
}

async function checkToken() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}` }
    });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('gh_token');
      localStorage.removeItem('gh_user');
      renderUI();
    }
  } catch {}
}

function setEl(id, prop, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (prop === 'display') el.style.display = val;
  else if (prop === 'src') el.src = val;
  else if (prop === 'text') el.textContent = val;
  else if (prop === 'class') el.classList.toggle('visible', val);
}

function renderUI() {
  const loggedIn = isLoggedIn();
  const user     = getUser();

  setEl('userInfo',   'display', loggedIn ? 'flex' : 'none');
  setEl('postBox',    'class',   loggedIn);
  setEl('loginNudge', 'display', loggedIn ? 'none' : 'flex');

  if (loggedIn && user) {
    setEl('userAvatar', 'src',  user.avatar_url);
    setEl('userName',   'text', user.login);
  }
}
