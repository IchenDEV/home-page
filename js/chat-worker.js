/**
 * WebLLM engine host. Runs in a module Worker so tokenization/sampling and
 * GPU readback never block the main thread — the WebGL hero keeps animating
 * while the model generates.
 */

import { WebWorkerMLCEngineHandler } from '../vendor/web-llm.module.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
