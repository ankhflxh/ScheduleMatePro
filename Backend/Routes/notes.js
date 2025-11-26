// File: Backend/Routes/notes.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// --- MULTER SETUP ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Save to Frontend/Uploads so they are publicly accessible
    const uploadPath = path.join(__dirname, "../../Frontend/Uploads");

    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Unique filename: note-TIMESTAMP-RANDOM.ext
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "note-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// GET /api/notes/:roomId
router.get("/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  try {
    const result = await pool.query(
      `SELECT n.*, u.username 
       FROM notes n
       JOIN users u ON n.user_id = u.id
       WHERE n.room_id = $1
       ORDER BY n.created_at DESC`,
      [roomId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// POST /api/notes/:roomId (Supports Image Upload)
router.post(
  "/:roomId",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    const { roomId } = req.params;
    const { title, content, color } = req.body;
    const userId = req.user.id;

    // If file uploaded, save relative path (e.g., "/Uploads/note-123.jpg")
    const imagePath = req.file ? `/Uploads/${req.file.filename}` : null;

    try {
      const result = await pool.query(
        `INSERT INTO notes (room_id, user_id, title, content, color, image_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
        [
          roomId,
          userId,
          title || "",
          content || "",
          color || "#ffffff",
          imagePath,
        ]
      );
      const newNote = result.rows[0];
      newNote.username = req.user.username;
      res.json(newNote);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create note" });
    }
  }
);

// PUT /api/notes/:noteId (Supports Image Update)
router.put(
  "/:noteId",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    const { noteId } = req.params;
    const { title, content, color } = req.body;
    const userId = req.user.id;
    const imagePath = req.file ? `/Uploads/${req.file.filename}` : null;

    try {
      const check = await pool.query(
        "SELECT user_id FROM notes WHERE id = $1",
        [noteId]
      );
      if (check.rows.length === 0)
        return res.status(404).json({ error: "Note not found" });
      if (check.rows[0].user_id !== userId)
        return res.status(403).json({ error: "Unauthorized" });

      // Dynamic Query: Only update image_path if a new file was uploaded
      let query, params;

      if (imagePath) {
        query = `UPDATE notes SET title=$1, content=$2, color=$3, image_path=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING *`;
        params = [title || "", content || "", color, imagePath, noteId];
      } else {
        query = `UPDATE notes SET title=$1, content=$2, color=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`;
        params = [title || "", content || "", color, noteId];
      }

      const result = await pool.query(query, params);
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update note" });
    }
  }
);

// DELETE /api/notes/:noteId
router.delete("/:noteId", authenticateToken, async (req, res) => {
  const { noteId } = req.params;
  const userId = req.user.id;

  try {
    const check = await pool.query(
      "SELECT user_id, image_path FROM notes WHERE id = $1",
      [noteId]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ error: "Note not found" });
    if (check.rows[0].user_id !== userId)
      return res.status(403).json({ error: "Unauthorized" });

    // Optional: Delete file from filesystem here if you want to clean up
    // const filePath = path.join(__dirname, "../../Frontend", check.rows[0].image_path);
    // if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query("DELETE FROM notes WHERE id = $1", [noteId]);
    res.json({ message: "Note deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

module.exports = router;
