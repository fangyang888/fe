import {buildLikely32Lab} from './likely32Lab';
import {compactTracker} from './likely32Tracker';
self.onmessage = (event: MessageEvent<{history: unknown}>) => {
  try {self.postMessage({result: compactTracker(buildLikely32Lab(event.data.history))});}
  catch (error) {self.postMessage({error: error instanceof Error ? error.message : '方案计算失败'});}
};
