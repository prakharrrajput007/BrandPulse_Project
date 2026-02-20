import { Devvit, type FormField, ScheduledJobEvent, TriggerContext } from "@devvit/public-api";
import { handleNuke, handleNukePost } from "./nuke.js";

// ─── CONFIG ───────────────────────────────────────────────────
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/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'; // ← paste your new webhook here

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
        body: JSON.stringify({ text: JSON.stringify(chunk) }),
      });
      if (!response.ok) {
        console.error(`❌ Slack webhook failed: ${response.status}`);
      } else {
        console.log(`✅ Sent chunk ${Math.floor(i / chunkSize) + 1} to Slack (${chunk.length} posts)`);
      }
      // Pause to avoid Slack rate limiting
      await new Promise(r => setTimeout(r, 1000));
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
    const allPosts: object[] = [];

    for (const subredditName of TARGET_SUBREDDITS) {
      console.log(`📂 Fetching from r/${subredditName}`);
      try {
        const listing = await context.reddit.getHotPosts({
          subredditName: subredditName,
          limit: POSTS_PER_SUBREDDIT,
        }).all();

        console.log(`  ✅ Got ${listing.length} posts from r/${subredditName}`);

        for (const post of listing) {
          allPosts.push({
            postId: post.id,
            title: post.title ?? '',
            author: post.authorName ?? 'unknown',
            subreddit: post.subredditName ?? subredditName,
            body: post.body ?? '',
            url: post.url ?? '',
            score: post.score ?? 0,
            numComments: post.numberOfComments ?? 0,
            createdAt: Math.floor((post.createdAt?.getTime?.() ?? 0) / 1000),
            keyword: subredditName,
          });
        }

        await new Promise(r => setTimeout(r, 1000));

      } catch (err: any) {
        console.error(`❌ Failed for r/${subredditName}: ${err.message}`);
      }
    }

    console.log(`📦 Total posts collected: ${allPosts.length}`);

    if (allPosts.length === 0) {
      console.log('⚠️ Nothing to send. Exiting.');
      return;
    }

    await sendToSlack(allPosts);

    console.log('🏁 Job complete.');
  },
});

Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (_event, context) => {
    await context.scheduler.runJob({
      name: 'scrapeAndForward',
      cron: '0 * * * *',
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

// ─── EXISTING COMMENT MOP LOGIC (unchanged) ──────────────────
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
      console.log(`Mop result - ${result.success ? "success" : "fail"} - ${result.message}`);
      context.ui.showToast(`${result.success ? "Success" : "Failed"} : ${result.message}`);
    } else {
      context.ui.showToast(`Mop failed! Please try again later.`);
    }
  }
);

Devvit.addMenuItem({ label: "Mop comments", description: "Remove this comment and all child comments. This might take a few seconds to run.", location: "comment", forUserType: "moderator", onPress: (_, context) => { context.ui.showForm(nukeForm); } });

const nukePostForm = Devvit.createForm(
  () => ({ fields: nukeFields, title: "Mop Post Comments", acceptLabel: "Mop", cancelLabel: "Cancel" }),
  async ({ values }, context) => {
    if (!values.lock && !values.remove) { context.ui.showToast("You must select either lock or remove."); return; }
    if (!context.postId) { throw new Error("No post ID"); }
    const result = await handleNukePost({ remove: values.remove, lock: values.lock, skipDistinguished: values.skipDistinguished, postId: context.postId, subredditId: context.subredditId }, context);
    console.log(`Mop result - ${result.success ? "success" : "fail"} - ${result.message}`);
    context.ui.showToast(`${result.success ? "Success" : "Failed"} : ${result.message}`);
  }
);

Devvit.addMenuItem({ label: "Mop post comments", description: "Remove all comments of this post. This might take a few seconds to run.", location: "post", forUserType: "moderator", onPress: (_, context) => { context.ui.showForm(nukePostForm); } });

export default Devvit;