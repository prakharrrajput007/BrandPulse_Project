require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
let collection;

async function startServer() {
  try {
    await client.connect();

    const db = client.db("brandpulse");
    collection = db.collection("reddit_posts");

    console.log("✅ MongoDB connected successfully");

    // ⭐ ADDED — ensure unique index on postId (prevents duplicates forever)
    await collection.createIndex({ postId: 1 }, { unique: true });

    // Start listening only after DB connection is established
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

/* ----------- HEALTH CHECK (OPTIONAL BUT USEFUL) ----------- */
// ⭐ ADDED — helps verify ngrok works
app.get("/", (req, res) => {
  res.send("Server running ✅");
});


/* ----------- STORE POSTS API ----------- */
app.post("/store-posts", async (req, res) => {
  try {

    // ⭐ CHANGED — allow BOTH formats:
    // 1) raw array
    // 2) { posts: [...] }
    const posts = Array.isArray(req.body) ? req.body : req.body.posts;

    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No posts received or invalid format"
      });
    }

    // ⭐ ADDED — remove invalid posts safely
    const cleanPosts = posts.filter(p => p.postId);

    if (cleanPosts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Posts missing postId"
      });
    }

    // Bulk upsert operations
    const ops = cleanPosts.map(p => ({
      updateOne: {
        filter: { postId: p.postId },
        update: { $set: p },
        upsert: true
      }
    }));

    const result = await collection.bulkWrite(ops);

    console.log(`Stored ${cleanPosts.length} posts`);

    res.status(200).json({
      success: true,
      message: "Data processed",
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount
    });

  } catch (err) {
    console.error("Error during bulkWrite:", err);
    res.status(500).json({
      success: false,
      error: "Error storing posts to database"
    });
  }
});


/* ----------- GRACEFUL SHUTDOWN ----------- */
process.on("SIGINT", async () => {
  await client.close();
  console.log("MongoDB connection closed. App exiting.");
  process.exit(0);
});

// Initialize the app
startServer();
