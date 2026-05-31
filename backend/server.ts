import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import 'dotenv/config';

import { errorMiddleware } from './lib/errors';
import { requireAuth } from './lib/auth';

import healthRouter from './routes/health';
import departmentsRouter from './routes/departments';
import programsRouter from './routes/programs';
import coursesRouter from './routes/courses';
import programCoursesRouter from './routes/programCourses';
import topicsRouter from './routes/topics';
import questionsRouter from './routes/questions';
import sessionsRouter from './routes/sessions';
import aiRouter from './routes/ai';
import ingestionRouter from './routes/ingestion';
import topicSuggestionsRouter from './routes/topicSuggestions';
import analyticsRouter from './routes/analytics';
import masteryRouter from './routes/mastery';
import bookmarksRouter from './routes/bookmarks';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);

  app.use('/api/departments', requireAuth, departmentsRouter);
  app.use('/api/programs', requireAuth, programsRouter);
  app.use('/api/courses', requireAuth, coursesRouter);
  app.use('/api/program-courses', requireAuth, programCoursesRouter);
  app.use('/api/topics', requireAuth, topicsRouter);
  app.use('/api/questions', requireAuth, questionsRouter);
  app.use('/api/sessions', requireAuth, sessionsRouter);
  app.use('/api/ai', requireAuth, aiRouter);
  app.use('/api/ingestion', requireAuth, ingestionRouter);
  app.use('/api/topic-suggestions', requireAuth, topicSuggestionsRouter);
  app.use('/api/analytics', requireAuth, analyticsRouter);
  app.use('/api/mastery', requireAuth, masteryRouter);
  app.use('/api/bookmarks', requireAuth, bookmarksRouter);

  app.use('/api', errorMiddleware);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
