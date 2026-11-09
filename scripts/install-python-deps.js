import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function installPythonDeps() {
  const isRender = process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID);
  const isLinux = process.platform === 'linux';

  // Only auto-install in Linux/CI/Render environments to avoid interfering with local developer environments
  if (!isRender && !isLinux) {
    return;
  }

  const reqPath = path.resolve(process.cwd(), 'requirements.txt');
  if (!fs.existsSync(reqPath)) {
    console.log('[install-python-deps] requirements.txt not found, skipping.');
    return;
  }

  console.log('[install-python-deps] Detected Render/Linux deployment environment.');
  console.log('[install-python-deps] Ensuring Python ML dependencies are installed...');

  const pipCandidates = [
    { cmd: 'pip', args: ['install', '-r', reqPath] },
    { cmd: 'pip3', args: ['install', '-r', reqPath] },
    { cmd: 'python3', args: ['-m', 'pip', 'install', '-r', reqPath] },
    { cmd: 'python3', args: ['-m', 'pip', 'install', '--break-system-packages', '-r', reqPath] },
    { cmd: 'python', args: ['-m', 'pip', 'install', '-r', reqPath] },
  ];

  for (const candidate of pipCandidates) {
    try {
      console.log(`[install-python-deps] Trying: ${candidate.cmd} ${candidate.args.join(' ')}`);
      const res = spawnSync(candidate.cmd, candidate.args, { stdio: 'inherit' });
      if (res.status === 0) {
        console.log('[install-python-deps] Successfully installed Python dependencies.');
        return;
      }
    } catch {
      // try next candidate
    }
  }

  console.warn('[install-python-deps] Note: Pip install command exited with non-zero status. If dependencies are missing, ensure your Render Build Command is set to: pip install -r requirements.txt && npm install && npm run build');
}

installPythonDeps();

