import { Router } from 'express';
import { asyncHandler } from '../lib/errors';
import { parse } from '../lib/validate';
import { ChatRequest } from '../schemas/ai';
import { streamingFetch } from '../lib/llm';

const router = Router();

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const body = parse(ChatRequest, req.body);

    const upstream = await streamingFetch({
      messages: body.messages,
      model: body.model,
      stream: true,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();

    req.on('close', () => {
      reader.cancel().catch(() => {});
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      res.write(chunk);
    }
    res.end();
  })
);

export default router;
