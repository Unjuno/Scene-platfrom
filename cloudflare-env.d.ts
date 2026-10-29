declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SCENE_MODERATOR_IDS?: string;
    BUCKET?: R2Bucket;
  }
}
