const REPO_OWNER = 'ideapitch';
const REPO_NAME  = 'ideapitch.github.io';
const GH_REACT   = 'application/vnd.github.squirrel-girl-preview+json';
const GH_JSON    = 'application/vnd.github.v3+json';

async function fetchIdeas() {
  const token  = getToken();
  const headers = { Accept: GH_REACT };
  if (token) headers['Authorization'] = `token ${token}`;

  const [oRes, cRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=open&labels=idea&per_page=100`,   { headers }),
    fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=closed&labels=idea&per_page=100`, { headers })
  ]);

  let openIdeas   = await oRes.json();
  let closedIdeas = await cRes.json();

  if (!Array.isArray(openIdeas))   openIdeas   = [];
  if (!Array.isArray(closedIdeas)) closedIdeas = [];

  return { openIdeas, closedIdeas };
}

async function fetchVoteState(issueNumber) {
  if (!isLoggedIn()) return { voted: false, rid: null };
  const token = getToken();
  const user  = getUser();
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/reactions?content=%2B1&per_page=100`,
      { headers: { Accept: GH_REACT, Authorization: `token ${token}` } }
    );
    if (!res.ok) return { voted: false, rid: null };
    const reactions = await res.json();
    if (!Array.isArray(reactions)) return { voted: false, rid: null };
    const mine = reactions.find(r => r.user?.login === user.login);
    return {
      voted: !!mine,
      rid:   mine ? mine.id : null
    };
  } catch {
    return { voted: false, rid: null };
  }
}

async function postIdea(text) {
  const token = getToken();
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
    {
      method: 'POST',
      headers: { Authorization: `token ${token}`, Accept: GH_JSON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Idea', body: text, labels: ['idea'] })
    }
  );
  if (!res.ok) return null;
  return await res.json();
}

async function addReaction(issueNumber) {
  const token = getToken();
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/reactions`,
    {
      method: 'POST',
      headers: { Authorization: `token ${token}`, Accept: GH_REACT, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '+1' })
    }
  );
  if (!res.ok) return null;
  return await res.json();
}
