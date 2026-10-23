import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { handleRequest } from './app.js';

export { handleRequest } from './app.js';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  createServer(handleRequest).listen(config.port, () => {
    console.log(`BECO API em http://localhost:${config.port}`);
  });
}
