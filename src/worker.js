// Module worker for createRenderer() (ES-module builds). The classic-script equivalent is
// dist/texturelib.worker.js. Nothing to configure: it answers row-band render requests.
import { serveWorker } from './renderer.js';
serveWorker(self);
