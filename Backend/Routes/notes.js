// File: Backend/Routes/notes.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// --- MULTER SETUP (SECURED) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../../Frontend/Uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "note-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// 🔒 SECURITY: Only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only images (jpeg, jpg, png, gif, webp) are allowed."));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit to 5MB
  fileFilter: fileFilter,
});

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

// POST /api/notes/:roomId
router.post(
  "/:roomId",
  authenticateToken,
  (req, res, next) => {
    // Wrap upload in a closure to handle multer errors
    upload.single("image")(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res
          .status(400)
          .json({ error: "File upload error: " + err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message }); // "Only images..."
      }
      next();
    });
  },
  async (req, res) => {
    const { roomId } = req.params;
    const { title, content, color } = req.body;
    const userId = req.user.id;

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
      // Attach username manually for immediate UI update
      newNote.username = req.user.username;
      res.json(newNote);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create note" });
    }
  }
);

// PUT /api/notes/:noteId
router.put(
  "/:noteId",
  authenticateToken,
  (req, res, next) => {
    upload.single("image")(req, res, function (err) {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
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
    const check = await pool.query("SELECT user_id FROM notes WHERE id = $1", [
      noteId,
    ]);
    if (check.rows.length === 0)
      return res.status(404).json({ error: "Note not found" });
    if (check.rows[0].user_id !== userId)
      return res.status(403).json({ error: "Unauthorized" });

    await pool.query("DELETE FROM notes WHERE id = $1", [noteId]);
    res.json({ message: "Note deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

// GET /api/notes/:roomId/unread-count (Kept same)
router.get("/:roomId/unread-count", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    const memberRes = await pool.query(
      "SELECT last_notes_viewed_at FROM room_members WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    );

    if (memberRes.rows.length === 0) return res.json({ count: 0 });

    const lastViewed = memberRes.rows[0].last_notes_viewed_at || new Date(0);

    const countRes = await pool.query(
      "SELECT COUNT(*) FROM notes WHERE room_id = $1 AND created_at > $2",
      [roomId, lastViewed]
    );

    res.json({ count: parseInt(countRes.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

// POST /api/notes/:roomId/mark-read (Kept same)
router.post("/:roomId/mark-read", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    await pool.query(
      "UPDATE room_members SET last_notes_viewed_at = CURRENT_TIMESTAMP WHERE room_id = $1 AND user_id = $2",
      [roomId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark read" });
  }
});

module.exports = router;
