import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
for (const dir of ['.','apps/capture','apps/workspace']) {
  const result=spawnSync('npm',['ci'],{cwd:`${root}/${dir}`,stdio:'inherit'});
  if(result.status!==0) process.exit(result.status || 1);
}
const browser=spawnSync('npx',['playwright','install','chromium'],{cwd:root,stdio:'inherit'});
process.exit(browser.status || 0);
