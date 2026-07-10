import axios from "axios";
import crypto from "crypto";
import { SocialAccount } from "@prisma/client";

// Decryption helper
const ALGO = "aes-256-gcm";
const KEY = Buffer.from(
  process.env.SOCIAL_CREDS_KEY ?? "",
  "hex"
).slice(0, 32);

function decryptCredentials(stored: string): Record<string, string> {
  const { iv, tag, data: encData } = JSON.parse(stored);
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encData, "hex")),
      decipher.final(),
    ]).toString("utf8")
  );
}

interface PublishResult {
  success: boolean;
  platformPostId?: string;
  platformUrl?: string;
  error?: string;
  errorDetails?: unknown;
}

interface PostData {
  caption: string;
  mediaUrls?: string[];
  title?: string;
}

export const socialPublisherService = {
  // FACEBOOK IMPLEMENTATION
  async publishToFacebook(account: SocialAccount, postData: PostData): Promise<PublishResult> {
    try {
      console.log(`[Facebook] Publishing to ${account.accountName}`);
      
      const creds = decryptCredentials(account.credentials as string);
      
      // Check if we have stored page data
      const pageAccessToken = creds.pageAccessToken;
      const pageId = creds.pageId;
      
      if (!pageAccessToken || !pageId) {
        // Fallback to fetching pages if we don't have stored data (for existing accounts)
        console.log("[Facebook] No stored page data found, fetching from API...");
        const accessToken = creds.accessToken;
        
        // Verify token is valid
        try {
          await axios.get("https://graph.facebook.com/v19.0/me", {
            params: { access_token: accessToken },
          });
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 401) {
            return {
              success: false,
              error: "❌ Access token expired. Please reconnect Facebook account.",
            };
          }
          throw error;
        }

        // Get pages
        const { data: pagesData } = await axios.get(
          "https://graph.facebook.com/v19.0/me/accounts",
          { params: { access_token: accessToken, fields: "id,name,access_token" } }
        );

        const pages = pagesData.data || [];
        if (pages.length === 0) {
          return {
            success: false,
            error: "No Facebook pages found. Connect a page to publish.",
          };
        }

        const targetPage = pages[0];
        const pageAccessTokenFallback = targetPage.access_token;
        const pageIdFallback = targetPage.id;
        
        return this.publishToFacebookPage(pageIdFallback, pageAccessTokenFallback, postData);
      }

      // Use stored page data
      console.log(`[Facebook] Using stored page: ${creds.pageName || pageId}`);
      return this.publishToFacebookPage(pageId, pageAccessToken, postData);
    } catch (error) {
      console.error("[Facebook] ❌ ERROR:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Facebook API error",
        errorDetails: axios.isAxiosError(error) ? error.response?.data : error,
      };
    }
  },

  async publishToFacebookPage(pageId: string, pageAccessToken: string, postData: PostData): Promise<PublishResult> {
    try {
      // ✅ PUBLISH: Make actual API call
      const { data } = await axios.post(
        `https://graph.facebook.com/v19.0/${pageId}/feed`,
        new URLSearchParams({
          message: postData.caption,
          access_token: pageAccessToken,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      console.log(`[Facebook] ✅ SUCCESS! Post ID: ${data.id}`);

      // ✅ RETURN: Only return success with actual post ID
      return {
        success: true,
        platformPostId: data.id,
        platformUrl: `https://www.facebook.com/${data.id}`,
      };
    } catch (error) {
      console.error("[Facebook] ❌ ERROR publishing to page:", error);
      throw error;
    }
  },

  // INSTAGRAM IMPLEMENTATION - TWO-STEP PROCESS
  async publishToInstagram(account: SocialAccount, postData: PostData): Promise<PublishResult> {
    try {
      console.log(`[Instagram] Publishing to ${account.accountName}`);
      
      const creds = decryptCredentials(account.credentials as string);
      const accessToken = creds.accessToken;

      // ✅ TOKEN CHECK
      try {
        await axios.get("https://graph.facebook.com/v19.0/me", {
          params: { access_token: accessToken },
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          return {
            success: false,
            error: "❌ Access token expired. Please reconnect Instagram account.",
          };
        }
        throw error;
      }

      if (!account.accountId) {
        return {
          success: false,
          error: "Instagram Business Account ID missing. Reconnect account.",
        };
      }

      if (!postData.mediaUrls || postData.mediaUrls.length === 0) {
        return {
          success: false,
          error: "Instagram requires at least one image",
        };
      }

      const igUserId = account.accountId;
      const imageUrl = postData.mediaUrls[0];

      // ✅ STEP 1: Create media container
      console.log(`[Instagram] Step 1/2: Creating container`);
      const { data: containerData } = await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        new URLSearchParams({
          image_url: imageUrl,
          caption: postData.caption || "",
          access_token: accessToken,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const containerId = containerData.id;
      console.log(`[Instagram] Container created: ${containerId}`);

      // ⏱️ Wait for Instagram to process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // ✅ STEP 2: Publish container (THIS IS THE ACTUAL PUBLISH!)
      console.log(`[Instagram] Step 2/2: Publishing container`);
      const { data: publishData } = await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
        new URLSearchParams({
          creation_id: containerId,
          access_token: accessToken,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const postId = publishData.id;
      console.log(`[Instagram] ✅ SUCCESS! Post ID: ${postId}`);

      // ✅ NOTE: Container creation (step 1) is NOT a successful publish!
      // Only step 2 completion means the post is live
      return {
        success: true,
        platformPostId: postId,
        platformUrl: `https://www.instagram.com/p/${postId}`,
      };
    } catch (error) {
      console.error("[Instagram] ❌ ERROR:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Instagram API error",
        errorDetails: axios.isAxiosError(error) ? error.response?.data : error,
      };
    }
  },

  // YOUTUBE IMPLEMENTATION
  async publishToYouTube(account: SocialAccount, postData: PostData): Promise<PublishResult> {
    try {
      console.log(`[YouTube] Publishing to ${account.accountName}`);
      
      const creds = decryptCredentials(account.credentials as string);
      const accessToken = creds.accessToken;

      // ✅ TOKEN CHECK
      try {
        await axios.get("https://www.googleapis.com/youtube/v3/channels", {
          params: { part: "snippet", mine: true, access_token: accessToken },
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          return {
            success: false,
            error: "❌ Access token expired. Please reconnect YouTube account.",
          };
        }
        throw error;
      }

      // YouTube requires video upload - placeholder for now
      return {
        success: false,
        error: "YouTube video upload requires resumable upload protocol (not yet implemented)",
      };
    } catch (error) {
      console.error("[YouTube] ❌ ERROR:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "YouTube API error",
        errorDetails: axios.isAxiosError(error) ? error.response?.data : error,
      };
    }
  },

  // MAIN ENTRY POINT
  async publishPost(account: SocialAccount, postData: PostData): Promise<PublishResult> {
    console.log(`[Publisher] Publishing to ${account.platform} (${account.accountName})`);

    switch (account.platform) {
      case "FACEBOOK":
        return this.publishToFacebook(account, postData);
      case "INSTAGRAM":
        return this.publishToInstagram(account, postData);
      case "YOUTUBE":
        return this.publishToYouTube(account, postData);
      default:
        return {
          success: false,
          error: `${account.platform} publishing not yet implemented`,
        };
    }
  },
};
