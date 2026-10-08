// Absolute-path entry point: usable from any Agent working directory.
import {register} from 'tsx/esm/api';
register();
await import('./agent-cli.ts');
