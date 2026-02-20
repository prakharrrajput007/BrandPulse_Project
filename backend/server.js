require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI);
let collection;

// ─── SLACK CONFIG ─────────────────────────────────────────────
const SLACK_BOT_TOKEN = 'xoxb-10581505344880-10553224889122-cGByQGamNYYNwDaugq7nQrQx';
const SLACK_CHANNEL_ID = 'C0AG5QBB02Z';
// ─────────────────────────────────────────────────────────────

async function startServer() {
  try {
    await client.connect();
    const db = client.db("brandpulse");
    collection = db.collection("reddit_posts");
    await collection.createIndex({ postId: 1 }, { unique: true });
    console.log("✅ MongoDB connected successfully");

    const PORT = process.env.PORT || 5050;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`   Hit http://localhost:${PORT}/read-slack to pull Slack messages into Atlas`);
    });
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

app.get("/", (req, res) => {
  res.send("Server running ✅");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── READ SLACK → SAVE TO ATLAS ──────────────────────────────
// Hit this in browser: http://localhost:5050/read-slack
// It reads all messages from #brandpulse_data and saves posts to Atlas
app.get("/read-slack", async (req, res) => {
  try {
    console.log("📨 Fetching messages from Slack...");

    let allMessages = [];
    let cursor = undefined;

    // Slack paginates messages — loop until all are fetched
    do {
      const url = new URL('https://slack.com/api/conversations.history');
      url.searchParams.set('channel', SLACK_CHANNEL_ID);
      url.searchParams.set('limit', '200');
      if (cursor) url.searchParams.set('cursor', cursor);

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!data.ok) {
        console.error("❌ Slack API error:", data.error);
        return res.status(500).json({ success: false, error: data.error });
      }

      allMessages = allMessages.concat(data.messages || []);
      cursor = data.response_metadata?.next_cursor;

    } while (cursor);

    console.log(`📦 Total Slack messages fetched: ${allMessages.length}`);

    // Parse posts from each message
    const allPosts = [];
    for (const msg of allMessages) {
      if (!msg.text) continue;
      try {
        const parsed = JSON.parse(msg.text);
        if (Array.isArray(parsed)) {
          allPosts.push(...parsed.filter(p => p.postId));
        }
      } catch (e) {
        // Not a JSON message, skip (e.g. "Hello World" test message)
      }
    }

    console.log(`✅ Valid posts parsed: ${allPosts.length}`);

    if (allPosts.length === 0) {
      return res.status(200).json({ success: true, message: "No valid posts found in Slack messages" });
    }

    // Upsert all posts into Atlas
    const ops = allPosts.map(p => ({
      updateOne: {
        filter: { postId: p.postId },
        update: { $set: p },
        upsert: true
      }
    }));

    const result = await collection.bulkWrite(ops);
    console.log(`✅ Atlas: Upserted ${result.upsertedCount} | Modified ${result.modifiedCount}`);

    res.status(200).json({
      success: true,
      slackMessages: allMessages.length,
      postsFound: allPosts.length,
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
    });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── STORE POSTS (unchanged) ──────────────────────────────────
app.post("/store-posts", async (req, res) => {
  try {
    const posts = Array.isArray(req.body) ? req.body : req.body.posts;
    if (!Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ success: false, message: "No posts received or invalid format" });
    }
    const cleanPosts = posts.filter(p => p.postId);
    if (cleanPosts.length === 0) {
      return res.status(400).json({ success: false, message: "Posts missing postId" });
    }
    const ops = cleanPosts.map(p => ({
      updateOne: { filter: { postId: p.postId }, update: { $set: p }, upsert: true }
    }));
    const result = await collection.bulkWrite(ops);
    console.log(`✅ Stored ${cleanPosts.length} posts`);
    res.status(200).json({ success: true, message: "Data processed", upsertedCount: result.upsertedCount, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error during bulkWrite:", err);
    res.status(500).json({ success: false, error: "Error storing posts to database" });
  }
});

process.on("SIGINT", async () => {
  await client.close();
  console.log("MongoDB connection closed. App exiting.");
  process.exit(0);
});

startServer();