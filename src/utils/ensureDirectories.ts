import fs from 'fs';
import path from 'path';

export function ensureDirectories(): void {
  const dirs: string[] = [
    '.cache/puppeteer',
    '.wwebjs_auth',
    'sessions'
  ];

  dirs.forEach((dir: string) => {
    const fullPath: string = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
}
