import { Router } from 'express';
import { asyncHandler } from '../lib/errors';
import { requireAdmin } from '../lib/auth';
import { parse } from '../lib/validate';
import { TopicSuggestRequest } from '../schemas/topicSuggestion';
import { suggestTopicsFromSource } from '../services/topicSuggester';

const router = Router();

router.use(requireAdmin);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parse(TopicSuggestRequest, req.body);

    const input =
      body.source_type === 'text'
        ? ({ kind: 'text', text: body.text } as const)
        : ({ kind: 'images', pngBase64: body.images } as const);

    const topics = await suggestTopicsFromSource(input, body.model);
    res.json({ topics });
  })
);

export default router;
