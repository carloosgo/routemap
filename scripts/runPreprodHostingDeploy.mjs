/* global process, console */
import { main } from './runPreprodHostingDeploy.js';

export * from './runPreprodHostingDeploy.js';

if (process.argv[1]?.endsWith('runPreprodHostingDeploy.mjs')) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
