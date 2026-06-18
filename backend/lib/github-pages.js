
/**
 * Creates or updates an HTML redirect file on a GitHub Pages repository.
 * This ensures that physical QR codes always point to a stable GitHub Pages URL,
 * which then redirects to the actual dynamic profile URL.
 * 
 * @param {string} profileId - The unique ID of the profile (used as the filename)
 * @param {string} targetUrl - The current URL of the profile (e.g., https://qr-memory.by/p/ivan-petrov)
 */
async function updateRedirectFile(profileId, targetUrl) {
  const token = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO; // e.g., 'moggerrescure/site'
  const repoDir = process.env.GITHUB_REPO_DIR || ''; // e.g., 'public/qr'

  if (!token || !repo) {
    // Silently skip if GitHub integration is not configured
    return;
  }

  const path = repoDir ? `${repoDir}/${profileId}.html` : `${profileId}.html`;
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;

  // Minimal HTML that redirects immediately
  const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Перенаправление...</title>
  <meta http-equiv="refresh" content="0; url=${targetUrl}">
  <script>window.location.replace("${targetUrl}");</script>
</head>
<body>
  <p>Если вы не были перенаправлены автоматически, <a href="${targetUrl}">нажмите здесь</a>.</p>
</body>
</html>`;

  const contentBase64 = Buffer.from(htmlContent).toString('base64');

  try {
    // 1. Check if the file already exists to get its SHA
    let sha = null;
    const getRes = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'qr-memory-backend'
      }
    });

    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }

    // 2. Create or update the file
    const body = {
      message: `Update redirect for ${profileId}`,
      content: contentBase64,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'qr-memory-backend'
      },
      body: JSON.stringify(body)
    });

    if (!putRes.ok) {
      const errorText = await putRes.text();
      console.error(`[github-pages] Failed to update ${path}: ${putRes.status} ${errorText}`);
    } else {
      console.log(`[github-pages] Successfully updated redirect for ${profileId}`);
    }
  } catch (err) {
    console.error(`[github-pages] Network error updating ${path}:`, err.message);
  }
}

module.exports = {
  updateRedirectFile
};
