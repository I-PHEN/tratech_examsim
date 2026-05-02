import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ==========================================
  // MILESTONE 1: QUESTION ENGINE API routes
  // ==========================================
  
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Question Engine Backend Active" });
  });

  // Keep these endpoints simple for now. Later we'll build out the logic.
  app.get("/api/courses", async (req, res) => {
    try {
      const courses = await prisma.course.findMany({
        include: { department: true }
      });
      res.json(courses);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch courses" });
    }
  });

  app.get("/api/questions", async (req, res) => {
    try {
      const questions = await prisma.question.findMany({
        include: { options: true, topic: true }
      });
      res.json(questions);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  // ==========================================
  // VITE MIDDLEWARE (for serving React)
  // ==========================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
