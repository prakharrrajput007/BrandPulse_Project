import { Devvit, type FormField, ScheduledJobEvent, TriggerContext } from "@devvit/public-api";
import { handleNuke, handleNukePost } from "./nuke.js";

// ─── CONFIG ───────────────────────────────────────────────────

const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/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';

// Subreddits to scan
const TARGET_SUBREDDITS = [
  'amazon',
  'amazonreviews',
  'AmazonFlexDrivers',
  'Flipkart',
  'india',
  'onlineshopping',
  'deals',
  'frugalmalefashion',
  'BuyItForLife',
  'productreviews',
];

// 🔍 Keywords to search inside posts
const KEYWORDS = [
  'delivery',
  'refund',
  'late',
  'scam',
  'quality',
  'broken',
  'replacement',
  'return',
  'customer service',
  'discount',
];

const POSTS_PER_SUBREDDIT = 25;

// ─────────────────────────────────────────────────────────────

Devvit.configure({
  redditAPI: true,
  http: true,
});

// ─── HELPER: Send posts to Slack in chunks ────────────────────
async function sendToSlack(posts: object[]): Promise<void> {
  const chunkSize = 10;

  for (let i = 0; i < posts.length; i += chunkSize) {
    const chunk = posts.slice(i, i + chunkSize);

    try {
      const response = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: JSON.stringify(chunk, null, 2) }),
      });

      if (!response.ok) {
        console.error(`❌ Slack webhook failed: ${response.status}`);
      } else {
        console.log(`✅ Sent chunk ${Math.floor(i / chunkSize) + 1}`);
      }

      await new Promise(r => setTimeout(r, 1000)); // prevent rate limit

    } catch (err: any) {
      console.error(`❌ Slack send error: ${err.message}`);
    }
  }
}

// ─── SCRAPER JOB ─────────────────────────────────────────────
Devvit.addSchedulerJob({
  name: 'scrapeAndForward',
  onRun: async (_event: ScheduledJobEvent, context: TriggerContext) => {
    console.log('🚀 scrapeAndForward job started');

    const matchedPosts: object[] = [];

    for (const subredditName of TARGET_SUBREDDITS) {
      console.log(`📂 Fetching from r/${subredditName}`);

      try {
        const listing = await context.reddit.getHotPosts({
          subredditName,
          limit: POSTS_PER_SUBREDDIT,
        }).all();

        console.log(`  ✅ Got ${listing.length} posts`);

        for (const post of listing) {
          const title = post.title ?? '';
          const body = post.body ?? '';
          const combinedText = (title + ' ' + body).toLowerCase();

          const matchedKeyword = KEYWORDS.find(keyword =>
            combinedText.includes(keyword.toLowerCase())
          );

          if (!matchedKeyword) continue;

          matchedPosts.push({
            Title: title,
            Body: body,
            CreatedDate: post.createdAt?.toISOString?.() ?? '',
            Comments: post.numberOfComments ?? 0,
            Upvotes: post.score ?? 0,
            Subreddit: post.subredditName ?? subredditName,
            PostID: post.id,
            Keyword: matchedKeyword,
          });
        }

        await new Promise(r => setTimeout(r, 1000));

      } catch (err: any) {
        console.error(`❌ Failed for r/${subredditName}: ${err.message}`);
      }
    }

    console.log(`📦 Matched posts: ${matchedPosts.length}`);

    if (matchedPosts.length === 0) {
      console.log('⚠️ No keyword matches found.');
      return;
    }

    // Sort newest → oldest
    matchedPosts.sort((a: any, b: any) =>
      new Date(b.CreatedDate).getTime() - new Date(a.CreatedDate).getTime()
    );

    await sendToSlack(matchedPosts);

    console.log('🏁 Job complete.');
  },
});

// ─── SCHEDULE JOB ON INSTALL ──────────────────────────────────
Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (_event, context) => {
    await context.scheduler.runJob({
      name: 'scrapeAndForward',
      cron: '0 * * * *', // every hour
    });
    console.log('⏰ Hourly scraper scheduled.');
  },
});

// ─── MANUAL TRIGGER ──────────────────────────────────────────
Devvit.addMenuItem({
  label: '🔍 Run Reddit Scraper Now',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    await context.scheduler.runJob({
      name: 'scrapeAndForward',
      runAt: new Date(Date.now() + 1000),
    });
    context.ui.showToast('✅ Scraper triggered! Check logs.');
  },
});

// ─── EXISTING COMMENT MOP LOGIC (UNCHANGED) ──────────────────
const nukeFields: FormField[] = [
  { name: "remove", label: "Remove comments", type: "boolean", defaultValue: true },
  { name: "lock", label: "Lock comments", type: "boolean", defaultValue: false },
  { name: "skipDistinguished", label: "Skip distinguished comments", type: "boolean", defaultValue: false },
] as const;

const nukeForm = Devvit.createForm(
  () => ({ fields: nukeFields, title: "Mop Comments", acceptLabel: "Mop", cancelLabel: "Cancel" }),
  async ({ values }, context) => {
    if (!values.lock && !values.remove) { context.ui.showToast("You must select either lock or remove."); return; }
    if (context.commentId) {
      const result = await handleNuke({ remove: values.remove, lock: values.lock, skipDistinguished: values.skipDistinguished, commentId: context.commentId, subredditId: context.subredditId }, context);
      context.ui.showToast(`${result.success ? "Success" : "Failed"} : ${result.message}`);
    } else {
      context.ui.showToast(`Mop failed! Please try again later.`);
    }
  }
);

Devvit.addMenuItem({ label: "Mop comments", location: "comment", forUserType: "moderator", onPress: (_, context) => { context.ui.showForm(nukeForm); } });

const nukePostForm = Devvit.createForm(
  () => ({ fields: nukeFields, title: "Mop Post Comments", acceptLabel: "Mop", cancelLabel: "Cancel" }),
  async ({ values }, context) => {
    if (!values.lock && !values.remove) { context.ui.showToast("You must select either lock or remove."); return; }
    if (!context.postId) { throw new Error("No post ID"); }
    const result = await handleNukePost({ remove: values.remove, lock: values.lock, skipDistinguished: values.skipDistinguished, postId: context.postId, subredditId: context.subredditId }, context);
    context.ui.showToast(`${result.success ? "Success" : "Failed"} : ${result.message}`);
  }
);

Devvit.addMenuItem({ label: "Mop post comments", location: "post", forUserType: "moderator", onPress: (_, context) => { context.ui.showForm(nukePostForm); } });

export default Devvit;