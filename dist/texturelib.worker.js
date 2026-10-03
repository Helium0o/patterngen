/*! texturelib 2.0.0 worker — classic Web Worker for TextureLib.createRenderer({ workerUrl: '<path>/texturelib.worker.js' }).
 * Keep this file next to texturelib.js (importScripts resolves relative to this file). */
importScripts('texturelib.js');
TextureLib.serveWorker(self);
