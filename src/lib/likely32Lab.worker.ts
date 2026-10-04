import {buildLikely32Lab} from './likely32Lab';
import type {Config} from './likely32Lab';

self.onmessage = (event: MessageEvent<{history: unknown; config: Config}>) => {
  try {self.postMessage({result: buildLikely32Lab(event.data.history, event.data.config)});}
  catch (error) {self.postMessage({error: error instanceof Error ? error.message : '实验计算失败'});}
};
