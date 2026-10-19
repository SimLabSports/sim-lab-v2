import fs from 'node:fs';
import path from 'node:path';
// Next's cache cleanup reads OneDrive cloud files as symlinks on Windows.
// Remove only this checkout's generated production output before Next starts.
if(process.platform==='win32'){
 const workspace=fs.realpathSync(process.cwd());
 const target=path.join(workspace,'.next');
 if(fs.existsSync(target)){
  const resolved=fs.realpathSync(target);
  if(path.dirname(resolved).toLowerCase()!==workspace.toLowerCase()||path.basename(resolved)!=='.next')throw new Error('Refusing to clean a build directory outside this checkout.');
  fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
}
