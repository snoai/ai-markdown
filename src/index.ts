/// <reference lib="dom" />
import puppeteer from '@cloudflare/puppeteer';
import type { Browser as PuppeteerBrowser, Page } from '@cloudflare/puppeteer';
import { Tweet } from 'react-tweet/api';
import { html } from './response';

interface Env {
	BROWSER: DurableObjectNamespace;
	MYBROWSER: any;
	MD_CACHE: KVNamespace;
	RATELIMITER: any;
	AI: any;
	BACKEND_SECURITY_TOKEN: string;
	REDDIT_CLIENT_ID?: string;
	REDDIT_CLIENT_SECRET?: string;
}

export default {
	async fetch(request: Request, env: Env) {
		try {
			const ip = request.headers.get('cf-connecting-ip');
			if (!(env.BACKEND_SECURITY_TOKEN === request.headers.get('Authorization')?.replace('Bearer ', ''))) {
				const { success } = await env.RATELIMITER.limit({ key: ip ?? 'no-ip' });

				if (!success) {
					return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { 
						status: 429,
						headers: { 'Content-Type': 'application/json' }
					});
				}
			}

			const id = env.BROWSER.idFromName('browser');
			const obj = env.BROWSER.get(id);
			const resp = await obj.fetch(request.url, { headers: request.headers });
			return resp;
		} catch (error) {
			console.error('Error in main fetch handler:', error);
			return new Response(JSON.stringify({ 
				error: 'Server error',
				message: error instanceof Error ? error.message : String(error)
			}), { 
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	},
};

const KEEP_BROWSER_ALIVE_IN_SECONDS = 60;
const TEN_SECONDS = 10000;
const SIMPLE_CONTENT_MAX_LENGTH = 10000;
const TWITTER_TIMEOUT = 10000;
const LOAD_MORE_TWEETS_SCROLL_AMOUNT = 2000;
const LOAD_MORE_TWEETS_SCROLL_DELAY = 2000;
export class Browser {
	state: DurableObjectState;
	env: Env;
	keptAliveInSeconds: number;
	storage: DurableObjectStorage;
	browser: PuppeteerBrowser | undefined;
	request: Request | undefined;
	llmFilter: boolean;
	token = '';

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
		this.keptAliveInSeconds = 0;
		this.storage = this.state.storage;
		this.request = undefined;
		this.llmFilter = false;
	}

	// The main fetch handler for the outside GET requests
	async fetch(request: Request) {
		console.log("\n🚀🚀🚀 ---> DO Fetch Handler Entered <--- 🚀🚀🚀\n");
		try {
			this.request = request;

			if (!(request.method === 'GET')) {
				return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
					status: 405,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			// Get the parameters from the URL
			const url = new URL(request.url).searchParams.get('url');
			const htmlDetails = new URL(request.url).searchParams.get('htmlDetails') === 'true';
			const crawlSubpages = new URL(request.url).searchParams.get('subpages') === 'true';
			const contentType = request.headers.get('content-type') === 'application/json' ? 'json' : 'text';
			const token = request.headers.get('Authorization')?.replace('Bearer ', '');

			this.token = token ?? '';

			this.llmFilter = new URL(request.url).searchParams.get('llmFilter') === 'true';

			// TODO: See if we need to change this feature
			if (contentType === 'text' && crawlSubpages) {
				return new Response(JSON.stringify({ error: 'Error: Crawl subpages can only be enabled with JSON content type' }), { 
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			if (!url) {
				return this.buildHelpResponse();
			}

			if (!this.isValidUrl(url)) {
				return new Response(JSON.stringify({ error: 'Invalid URL provided, should be a full URL starting with http:// or https://' }), { 
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			if (!(await this.ensureBrowser())) {
				return new Response(JSON.stringify({ error: 'Could not start browser instance' }), { 
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			return crawlSubpages
				? this.crawlSubpages(url, htmlDetails, contentType)
				: this.processSinglePage(url, htmlDetails, contentType);
		} catch (error) {
			console.error('Error in Browser.fetch:', error);
			return new Response(JSON.stringify({ 
				error: 'Browser fetch error',
				message: error instanceof Error ? error.message : String(error)
			}), { 
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	async ensureBrowser() {
		let retries = 3;
		while (retries) {
			if (!this.browser || !this.browser.isConnected()) {
				try {
					this.browser = await puppeteer.launch(this.env.MYBROWSER);
					return true;
				} catch (e) {
					console.error(`[Browser] Could not start browser instance. Error: ${e}`);
					retries--;
					if (!retries) {
						return false;
					}

					try {
						const sessions = await puppeteer.sessions(this.env.MYBROWSER);

						for (const session of sessions) {
							const b = await puppeteer.connect(this.env.MYBROWSER, session.sessionId);
							await b.close();
						}
					} catch (sessionError) {
						console.error(`Failed to clean up sessions: ${sessionError}`);
					}

					console.log(`Retrying to start browser instance. Retries left: ${retries}`);
				}
			} else {
				return true;
			}
		}
	}

	async crawlSubpages(baseUrl: string, enableDetailedResponse: boolean, contentType: string) {
		try {
			const page = await this.browser!.newPage();
			await page.goto(baseUrl);
			const links = await this.extractLinks(page, baseUrl);
			await page.close();

			const uniqueLinks = Array.from(new Set(links)).splice(0, 10);
			const md = await this.getWebsiteMarkdown({
				urls: uniqueLinks as string[],
				enableDetailedResponse,
				classThis: this,
				env: this.env,
			});

			let status = 200;
			if (md.some((item) => item.md === 'Rate limit exceeded')) {
				status = 429;
			}

			return new Response(JSON.stringify(md), { 
				status: status,
				headers: { 'Content-Type': 'application/json' }
			});
		} catch (error) {
			console.error('Error in crawlSubpages:', error);
			return new Response(JSON.stringify({ 
				error: 'Failed to crawl subpages',
				message: error instanceof Error ? error.message : String(error),
				url: baseUrl
			}), { 
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	async processSinglePage(url: string, enableDetailedResponse: boolean, contentType: string) {
		try {
			const md = await this.getWebsiteMarkdown({
				urls: [url],
				enableDetailedResponse,
				classThis: this,
				env: this.env,
			});
			
			if (contentType === 'json') {
				let status = 200;
				if (md.some((item) => item.md === 'Rate limit exceeded')) {
					status = 429;
				}
				return new Response(JSON.stringify(md), { 
					status: status,
					headers: { 'Content-Type': 'application/json' }
				});
			} else {
				return new Response(md[0].md, {
					status: md[0].md === 'Rate limit exceeded' ? 429 : 200,
					headers: { 'Content-Type': 'text/plain' }
				});
			}
		} catch (error) {
			console.error('Error in processSinglePage:', error);
			const errorResponse = {
				error: 'Failed to process page',
				message: error instanceof Error ? error.message : String(error),
				url: url
			};
			
			if (contentType === 'json') {
				return new Response(JSON.stringify([errorResponse]), { 
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			} else {
				return new Response(JSON.stringify(errorResponse), { 
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}
	}

	async extractLinks(page: Page, baseUrl: string) {
		try {
			return await page.evaluate((baseUrl) => {
				return Array.from(document.querySelectorAll('a'))
					.map((link) => (link as { href: string }).href)
					.filter((link) => link.startsWith(baseUrl));
			}, baseUrl);
		} catch (error) {
			console.error('Error extracting links:', error);
			return [];
		}
	}

	async getTweet(tweetID: string) {
		try {
			const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetID}&lang=en&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue%3Btfw_tweet_edit_backend%3Aon%3Btfw_refsrc_session%3Aon%3Btfw_fosnr_soft_interventions_enabled%3Aon%3Btfw_show_birdwatch_pivots_enabled%3Aon%3Btfw_show_business_verified_badge%3Aon%3Btfw_duplicate_scribes_to_settings%3Aon%3Btfw_use_profile_image_shape_enabled%3Aon%3Btfw_show_blue_verified_badge%3Aon%3Btfw_legacy_timeline_sunset%3Atrue%3Btfw_show_gov_verified_badge%3Aon%3Btfw_show_business_affiliate_badge%3Aon%3Btfw_tweet_edit_frontend%3Aon&token=4c2mmul6mnh`;

			const resp = await fetch(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
					Accept: 'application/json',
					'Accept-Language': 'en-US,en;q=0.5',
					'Accept-Encoding': 'gzip, deflate, br',
					Connection: 'keep-alive',
					'Upgrade-Insecure-Requests': '1',
					'Cache-Control': 'max-age=0',
					TE: 'Trailers',
				},
			});
			console.log(resp.status);
			const data = (await resp.json()) as Tweet;

			return data;
		} catch (error) {
			console.error('Error fetching tweet:', error);
			return null;
		}
	}

	async getYouTubeMetadata(url: string): Promise<string> {
		// Skip browser interaction entirely for YouTube
		// YouTube's UI changes frequently and is hard to scrape reliably
		
		try {
			// Extract video ID
			let videoId = '';
			if (url.includes('youtube.com/watch')) {
				const urlObj = new URL(url);
				videoId = urlObj.searchParams.get('v') || '';
			} else if (url.includes('youtu.be/')) {
				videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
			}
			
			if (!videoId) {
				return `# YouTube Video\n\nCould not extract video ID from: ${url}`;
			}
			
			// Create a simple, reliable response
			return `# YouTube Video

## Information
- **Video ID**: ${videoId}
- **Direct Link**: ${url}
- **Embed Code**: <iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

To view this video, visit: ${url}`;
		} catch (error) {
			console.error('[YouTube] Error:', error);
			return `# YouTube Video\n\nError processing: ${url}\n\n${error instanceof Error ? error.message : String(error)}`;
		}
	}

	// Reddit API helpers - simplified to only use public API without OAuth
	async fetchRedditSubredditMarkdown(url: string, env: Env): Promise<string> {
		try {
			console.log(`[Reddit] === STARTING FETCH FOR URL: ${url} ===`);
			// Extract subreddit name from URL
			const match = url.match(/reddit\.com\/r\/([A-Za-z0-9_-]+)/i);
			if (!match) {
				console.error('[Reddit] Invalid URL format:', url);
				return 'Invalid Reddit URL format';
			}
			
			const subreddit = match[1];
			console.log('[Reddit] Fetching subreddit:', subreddit);
			
			// Use cache first
			const cacheKey = `Reddit:${url}`;
			const cached = await env.MD_CACHE.get(cacheKey);
			if (cached) {
				console.log('[Reddit] STEP 1: Using cached content for:', url);
				console.log('[Reddit] Using cached content for:', url);
				return cached;
			}
			console.log('[Reddit] STEP 1: No cache found, proceeding with API fetch');
			
			// Try public API first
			console.log('[Reddit] STEP 2: Attempting public API fetch');
			console.log('[Reddit] Trying public API first');
			const publicApiResult = await this.fetchRedditPublicApi(subreddit, url, env, cacheKey);
			
			console.log('[Reddit] STEP 3: Public API result - isRateLimited:', publicApiResult.isRateLimited, 'Has content:', !!publicApiResult.md);
			// If public API succeeds, return the result
			if (!publicApiResult.isRateLimited && publicApiResult.md) {
				console.log('[Reddit] STEP 4A: Public API successful, returning content');
				console.log('[Reddit] Public API successful');
				
				// Cache successful responses
				if (publicApiResult.md && publicApiResult.md.length > 100) {
					console.log('[Reddit] STEP 5A: Caching public API response');
					console.log('[Reddit] Caching public API response for:', subreddit);
					await env.MD_CACHE.put(cacheKey, publicApiResult.md, { expirationTtl: 3600 });
				}
				
				return publicApiResult.md;
			}
			
			// If we reached here, we hit a rate limit or error with public API
			console.log('[Reddit] STEP 4B: Public API failed or rate limited, attempting authenticated request');
			console.log('[Reddit] Public API failed. Attempting authenticated request...');
			
			// Try authenticated API as fallback
			console.log('[Reddit] STEP 5B: Starting authenticated API request');
			const authResult = await this.fetchRedditAuthenticatedApi(subreddit, url, env, cacheKey);
			
			console.log('[Reddit] STEP 6: Authenticated API completed, response length:', authResult.length);
			// Log detailed information about the auth result
			console.log('[Reddit] Auth API response length:', authResult.length);
			console.log('[Reddit] Auth API response preview:', authResult.substring(0, 100));
			
			// Check if auth result contains error indicators
			const hasErrorIndicators = authResult.includes('Failed to') || 
				authResult.includes('Error') || 
				authResult.includes('limit') ||
				authResult.includes('failed');
			console.log('[Reddit] STEP 7: Auth result contains error indicators:', hasErrorIndicators);
			
			// Cache successful authenticated responses
			if (authResult && authResult.length > 100) {
				console.log('[Reddit] STEP 8: Caching authenticated response');
				console.log('[Reddit] Caching authenticated response for:', url);
				await env.MD_CACHE.put(cacheKey, authResult, { expirationTtl: 3600 });
			}
			
			console.log(`[Reddit] === COMPLETED FETCH FOR URL: ${url} ===`);
			return authResult;
		} catch (error) {
			console.log('[Reddit] === ERROR IN FETCH PROCESS ===');
			console.error('[Reddit] Error in fetchRedditSubredditMarkdown:', error);
			console.error('[Reddit] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
			return `Error fetching Reddit content: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	
	// Helper method to fetch from public Reddit API
	async fetchRedditPublicApi(subreddit: string, url: string, env: Env, cacheKey: string): Promise<{md: string, isRateLimited: boolean}> {
		try {
			console.log('[Reddit-Public] === STARTING PUBLIC API FETCH ===');
			// Create the public API URL
			const apiUrl = `https://www.reddit.com/r/${subreddit}/hot.json?limit=5`;
			console.log('[Reddit] Fetching from public API:', apiUrl);
			
			// Fetch without authentication
			console.log('[Reddit-Public] Sending request to public API');
			const resp = await fetch(apiUrl, {
				method: 'GET',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
					'Accept': 'application/json',
					'Cache-Control': 'no-cache'
				}
			});
			
			console.log(`[Reddit-Public] Public API response received: Status ${resp.status}`);
			console.log('[Reddit] Response status:', resp.status);
			console.log('[Reddit] Response headers:', JSON.stringify(Object.fromEntries([...resp.headers.entries()])));
			
			// Check for rate limiting
			if (resp.status === 429 || resp.headers.get('x-ratelimit-remaining') === '0') {
				console.log('[Reddit-Public] RATE LIMIT DETECTED from status code or headers');
				console.log('[Reddit] Rate limit hit on public API');
				console.log('[Reddit] Rate limit details:', 
					resp.headers.get('x-ratelimit-used'), 
					resp.headers.get('x-ratelimit-remaining'), 
					resp.headers.get('x-ratelimit-reset'));
				return { md: '', isRateLimited: true };
			}
			
			if (!resp.ok) {
				console.log(`[Reddit-Public] Response not OK: ${resp.status} ${resp.statusText}`);
				console.error(`[Reddit] API error: ${resp.status} ${resp.statusText}`);
				const errorText = await resp.text();
				console.log(`[Reddit-Public] Error response body: ${errorText.substring(0, 100)}...`);
				console.error('[Reddit] Error details:', errorText);
				
				// Return specific message about rate limiting if detected in response
				if (errorText.includes('rate limit') || errorText.includes('ratelimit')) {
					console.log('[Reddit-Public] RATE LIMIT DETECTED in response text');
					console.log('[Reddit] Rate limit detected in response text');
					return { md: '', isRateLimited: true };
				}
				console.log('[Reddit-Public] Returning error message (not rate limited)');
				return { md: `Failed to fetch from Reddit API: ${resp.status}`, isRateLimited: false };
			}
			
			console.log('[Reddit-Public] Successfully received OK response');
			const responseText = await resp.text();
			console.log('[Reddit] API response length:', responseText.length);
			console.log('[Reddit] API response preview (first 100 chars):', responseText.substring(0, 100));
			
			let data;
			try {
				console.log('[Reddit-Public] Parsing JSON response');
				data = JSON.parse(responseText);
			} catch (parseError) {
				console.log('[Reddit-Public] JSON PARSE ERROR');
				console.error('[Reddit] JSON parse error:', parseError);
				console.error('[Reddit] JSON parse error details:', JSON.stringify(parseError, Object.getOwnPropertyNames(parseError)));
				return { md: 'Error parsing Reddit API response', isRateLimited: false };
			}
			
			// Check if the response contains an error message
			if (data.error) {
				console.log(`[Reddit-Public] API returned error: ${data.error}`);
				console.error('[Reddit] API returned error:', data.error);
				console.error('[Reddit] Error message:', data.message);
				return { md: `Reddit API error: ${data.message || data.error}`, isRateLimited: false };
			}
			
			console.log('[Reddit-Public] Formatting response data to markdown');
			const md = this.formatRedditData(data, subreddit, url);
			console.log('[Reddit] Formatted data length:', md.length);
			if (md.length < 100) {
				console.log('[Reddit-Public] WARNING: Formatted content suspiciously short');
				console.error('[Reddit] Formatted content suspiciously short:', md);
			}
			
			// Cache successful responses
			if (md && md.length > 100) {
				console.log('[Reddit-Public] Caching successful response');
				console.log('[Reddit] Caching response for:', url);
				await env.MD_CACHE.put(cacheKey, md, { expirationTtl: 3600 });
			}
			
			console.log('[Reddit-Public] === COMPLETED PUBLIC API FETCH ===');
			return { md, isRateLimited: false };
		} catch (error) {
			console.log('[Reddit-Public] === ERROR IN PUBLIC API FETCH ===');
			console.error('[Reddit] Error in fetchRedditPublicApi:', error);
			console.error('[Reddit] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
			return { 
				md: `Error fetching Reddit content: ${error instanceof Error ? error.message : String(error)}`, 
				isRateLimited: false 
			};
		}
	}
	
	// Helper method to fetch from Reddit API with authentication
	async fetchRedditAuthenticatedApi(subreddit: string, url: string, env: Env, cacheKey: string): Promise<string> {
		try {
			console.log('[Reddit-Auth] === STARTING AUTHENTICATED API FETCH ===');
			console.log('[Reddit] Starting authenticated API request for:', url);

			// First, get an OAuth token
			const tokenCacheKey = 'Reddit:OAuthToken';
			let token = await env.MD_CACHE.get(tokenCacheKey);
			
			console.log('[Reddit-Auth] Cached token available:', !!token);
			console.log('[Reddit] Cached token available:', !!token);

			if (!token) {
				console.log('[Reddit-Auth] No cached token, requesting new token');
				console.log('[Reddit] Getting new OAuth token');
				
				// Fetch new token
				const authString = `${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`;
				console.log('[Reddit-Auth] Client credentials available:', !!env.REDDIT_CLIENT_ID && !!env.REDDIT_CLIENT_SECRET);
				console.log('[Reddit] Using auth string (first 5 chars):', authString.substring(0, 5) + '...');
				console.log('[Reddit] Client ID length:', env.REDDIT_CLIENT_ID?.length || 0);
				console.log('[Reddit] Client secret length:', env.REDDIT_CLIENT_SECRET?.length || 0);

				console.log('[Reddit-Auth] Sending token request to Reddit');
				const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
					method: 'POST',
					headers: {
						'Authorization': `Basic ${btoa(authString)}`,
						'Content-Type': 'application/x-www-form-urlencoded',
						'User-Agent': 'CloudflareWorker/1.0'
					},
					body: 'grant_type=client_credentials&scope=read'
				});
				
				console.log(`[Reddit-Auth] Token response received: Status ${tokenResponse.status}`);
				console.log('[Reddit] Token response status:', tokenResponse.status);
				console.log('[Reddit] Token response headers:', JSON.stringify(Object.fromEntries([...tokenResponse.headers.entries()])));

				if (!tokenResponse.ok) {
					console.log(`[Reddit-Auth] Token response not OK: ${tokenResponse.status}`);
					const errorText = await tokenResponse.text();
					console.log(`[Reddit-Auth] Token error response: ${errorText}`);
					console.error('[Reddit] OAuth error:', errorText);
					// Clear any existing token if authentication fails
					await env.MD_CACHE.delete(tokenCacheKey);
					return `Failed to authenticate with Reddit: ${tokenResponse.status}`;
				}
				
				// Get response text for debugging
				const tokenResponseText = await tokenResponse.text();
				console.log(`[Reddit-Auth] Token response received, length: ${tokenResponseText.length}`);
				console.log('[Reddit] Token response (first 30 chars):', tokenResponseText.substring(0, 30) + '...');
				
				let tokenData;
				try {
					console.log('[Reddit-Auth] Parsing token response');
					tokenData = JSON.parse(tokenResponseText) as { access_token: string };
				} catch (parseError) {
					console.log('[Reddit-Auth] TOKEN PARSE ERROR');
					console.error('[Reddit] Failed to parse token response:', parseError);
					console.error('[Reddit] Parse error details:', JSON.stringify(parseError, Object.getOwnPropertyNames(parseError)));
					return `Failed to parse Reddit authentication response: ${tokenResponseText.substring(0, 100)}`;
				}
				
				token = tokenData.access_token;
				
				if (!token) {
					console.log('[Reddit-Auth] NO TOKEN IN RESPONSE');
					console.error('[Reddit] No token in response:', tokenResponseText);
					return `Reddit did not provide an access token: ${tokenResponseText.substring(0, 100)}`;
				}
				
				console.log('[Reddit-Auth] Successfully extracted token');
				console.log('[Reddit] Received token (first 5 chars):', token.substring(0, 5) + '...');
				
				// Cache the token (expires in 1 hour by default, we'll use 50 minutes to be safe)
				if (token) {
					console.log('[Reddit-Auth] Caching token');
					await env.MD_CACHE.put(tokenCacheKey, token, { expirationTtl: 3000 }); // 50 minutes
					console.log('[Reddit] Token cached successfully');
				} else {
					console.log('[Reddit-Auth] NO TOKEN TO CACHE');
					console.error('[Reddit] No token received from Reddit');
					return 'Failed to obtain Reddit access token';
				}
			}
			
			console.log('[Reddit-Auth] Token available, proceeding with authenticated request');
			// Now use the token to fetch data
			console.log('[Reddit] Using authenticated API for subreddit:', subreddit);
			const apiUrl = `https://oauth.reddit.com/r/${subreddit}/hot?limit=5`;
			console.log('[Reddit] API URL:', apiUrl);
			
			console.log('[Reddit-Auth] Sending authenticated API request');
			const resp = await fetch(apiUrl, {
				headers: {
					'Authorization': `Bearer ${token}`,
					'User-Agent': 'url2md/1.0 (by /u/your_username)',
					'Accept': 'application/json'
				}
			});
			
			console.log(`[Reddit-Auth] Authenticated API response received: Status ${resp.status}`);
			console.log('[Reddit] API response status:', resp.status);
			console.log('[Reddit] API response headers:', JSON.stringify(Object.fromEntries([...resp.headers.entries()])));

			if (!resp.ok) {
				// If unauthorized, the token might be invalid, so clear it from cache
				if (resp.status === 401) {
					console.log('[Reddit-Auth] UNAUTHORIZED: Invalid or expired token');
					console.error('[Reddit] Token invalid or expired, clearing cache');
					await env.MD_CACHE.delete(tokenCacheKey);
					return `Reddit authentication failed. Token may have expired.`;
				}
				
				console.log(`[Reddit-Auth] Response not OK: ${resp.status}`);
				// Get response text for debugging
				const errorText = await resp.text();
				console.log(`[Reddit-Auth] Error response body: ${errorText.substring(0, 100)}...`);
				console.error(`[Reddit] Authenticated API error: ${resp.status}`, errorText);
				return `Failed to fetch from Reddit API (authenticated): ${resp.status} - ${errorText.substring(0, 100)}`;
			}
			
			console.log('[Reddit-Auth] Successfully received OK response');
			// Get response text for debugging
			const responseText = await resp.text();
			console.log('[Reddit] API response received (first 30 chars):', responseText.substring(0, 30) + '...');
			console.log('[Reddit] API response length:', responseText.length);
			
			let data;
			try {
				console.log('[Reddit-Auth] Parsing JSON response');
				data = JSON.parse(responseText);
			} catch (parseError) {
				console.log('[Reddit-Auth] JSON PARSE ERROR');
				console.error('[Reddit] Failed to parse API response:', parseError);
				console.error('[Reddit] Parse error details:', JSON.stringify(parseError, Object.getOwnPropertyNames(parseError)));
				return `Failed to parse Reddit API response: ${responseText.substring(0, 100)}`;
			}
			
			// Check if the response contains an error message
			if (data.error) {
				console.log(`[Reddit-Auth] API returned error: ${data.error}`);
				console.error('[Reddit] API returned error:', data.error);
				console.error('[Reddit] Error message:', data.message || 'No message');
				return `Reddit API error: ${data.message || data.error}`;
			}
			
			console.log('[Reddit-Auth] Formatting response data to markdown');
			const md = this.formatRedditData(data, subreddit, url);
			console.log('[Reddit] Formatted data length:', md.length);
			
			// Log detailed information if content is suspiciously short
			if (md.length < 100) {
				console.log('[Reddit-Auth] WARNING: Formatted content suspiciously short');
				console.error('[Reddit] Formatted content suspiciously short:', md);
			}

			// Cache successful response
			if (md && md.length > 100) {
				console.log('[Reddit-Auth] Caching successful response');
				console.log('[Reddit] Caching authenticated response for:', url);
				await env.MD_CACHE.put(cacheKey, md, { expirationTtl: 3600 });
			}
			
			console.log('[Reddit-Auth] === COMPLETED AUTHENTICATED API FETCH ===');
			console.log('[Reddit] Authenticated response complete');
			return md;
		} catch (error) {
			console.log('[Reddit-Auth] === ERROR IN AUTHENTICATED API FETCH ===');
			console.error('[Reddit] Error in fetchRedditAuthenticatedApi:', error);
			console.error('[Reddit] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
			return `Error fetching Reddit content: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	
	// Helper method to format Reddit data to markdown
	formatRedditData(data: any, subreddit: string, originalUrl: string): string {
		if (!data?.data?.children?.length) {
			return 'No posts found in this subreddit.';
		}
		
		let md = `# Subreddit: r/${subreddit}\n\n`;
		
		for (const post of data.data.children) {
			const p = post.data;
			if (!p) continue;
			
			md += `## ${p.title || 'Untitled post'}\n\n`;
			md += `- **Author:** u/${p.author || 'unknown'}\n`;
			md += `- **Score:** ${p.score || 0}\n`;
			md += `- **Comments:** ${p.num_comments || 0}\n`;
			md += `- **Posted:** ${new Date(p.created_utc * 1000).toLocaleString()}\n\n`;
			
			if (p.selftext) {
				// Limit text length with ellipsis if too long
				const maxLength = 500;
				const text = p.selftext.length > maxLength 
					? p.selftext.substring(0, maxLength) + '...' 
					: p.selftext;
				md += `${text}\n\n`;
			}
			
			if (p.url && !p.url.includes('reddit.com')) {
				md += `**Link:** [${p.url}](${p.url})\n\n`;
			}
			
			md += `**Reddit link:** [View full post](https://reddit.com${p.permalink})\n\n`;
			md += `---\n\n`;
		}
		
		md += `\nSource: [${originalUrl}](${originalUrl})`;
		return md;
	}

	async getWebsiteMarkdown({
		urls,
		enableDetailedResponse,
		classThis,
		env,
	}: {
		urls: string[];
		enableDetailedResponse: boolean;
		classThis: Browser;
		env: Env;
	}) {
		classThis.keptAliveInSeconds = 0;

		try {
			const isBrowserActive = await this.ensureBrowser();

			if (!isBrowserActive) {
				return [{ url: urls[0], md: '[Browser] Could not start browser instance', error: true }];
			}

			return await Promise.all( // Process all URLs in parallel

				urls.map(async (url) => {
					try {
						const ip = this.request?.headers.get('cf-connecting-ip');

						if (this.token !== env.BACKEND_SECURITY_TOKEN) {
							const { success } = await env.RATELIMITER.limit({ key: ip ?? 'no-ip' });

							if (!success) {
								return { url, md: 'Rate limit exceeded', error: true };
							}
						}

						console.log(`[getWebsiteMarkdown] Passed rate limit check for ${url}`)

						const id = url + (enableDetailedResponse ? '-detailed' : '') + (this.llmFilter ? '-llm' : '');
						console.log(`[getWebsiteMarkdown] Checking main cache for id: ${id}`)
						const cached = await env.MD_CACHE.get(id);

						// Special YouTube handling
						if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
							const cacheKey = `Youtube:${url}`;
							const cached = await env.MD_CACHE.get(cacheKey);

							if (cached) return { url, md: cached };
							
							// Call our dedicated YouTube handler method
							const md = await this.getYouTubeMetadata(url);
							
							await env.MD_CACHE.put(cacheKey, md, { expirationTtl: 3600 });
							return { url, md };
						}

						// Special twitter handling
						if (url.startsWith('https://x.com') || url.startsWith('https://twitter.com')) {
							const urlParts = url.split('/');
							const lastPart = urlParts.pop();
							const isProfilePage = urlParts.length <= 3 || (urlParts.length === 4 && lastPart === '');
							
							if (isProfilePage) {
								// Handle profile page
								const username = urlParts[urlParts.length - 1];
								const page = await this.browser!.newPage();
								try {
									await page.goto(url, { waitUntil: 'networkidle0' });
									
									// Wait for tweets to load
									await page.waitForSelector('article', { timeout: TWITTER_TIMEOUT }).catch(() => console.log('Timeout waiting for articles'));
									
									// Scroll down to load more tweets - use explicit values to avoid reference errors
									await page.evaluate(() => {
										window.scrollBy(0, 2000); // Use fixed value instead of LOAD_MORE_TWEETS_SCROLL_AMOUNT
										return new Promise(resolve => setTimeout(resolve, 2000)); // Use fixed value instead of LOAD_MORE_TWEETS_SCROLL_DELAY
									});
									
									const profileContent = await page.evaluate((username) => {
										const tweets = Array.from(document.querySelectorAll('article')).map(tweet => {
											const rawText = tweet.innerText;
											
											// Get only the tweet text without engagement numbers and clean up encoding
											const tweetText = rawText
												.split(/\d+K|\d+M/)[0]
												.replace(/\u00A0/g, ' ')    // Replace non-breaking space
												.replace(/[·•]/g, '-')      // Replace any kind of dots/bullets with simple dash
												.replace(/\s*-\s*/g, ' - ') // Normalize spacing around dash
												.replace(/[""]/g, '"')      // Replace smart quotes
												.replace(/['']/g, "'")      // Replace smart apostrophes
												.replace(/\s+/g, ' ')       // Normalize whitespace
												.trim();
											return tweetText;
										}).filter(text => text.length > 0).slice(0, 10);
										
										const profileName = document.querySelector('h2')?.textContent?.trim() || username;
										const bio = document.querySelector('[data-testid="UserDescription"]')?.textContent?.trim() || '';
										
										return {
											profileName,
											bio,
											tweets
										};
									}, username);
									
									const profileMd = `
									# ${profileContent.profileName} (@${username})
										${profileContent.bio}
										## Recent Tweets
										${profileContent.tweets.map((tweet, index) => `### Tweet ${index + 1}\n${tweet}`).join('\n\n')}
										Profile URL: ${url}`;
									
									return { url, md: profileMd };
								} catch (error) {
									console.error(`Error processing profile ${url}:`, error);
									return { url, md: `Failed to fetch profile: ${error instanceof Error ? error.message : String(error)}`, error: true };
								} finally {
									await page.close();
								}
							} else {
								// Handle individual tweet
								const tweetID = lastPart;
								if (!tweetID) return { url, md: 'Invalid tweet URL', error: true };

								const cacheKey = `Twitter:${tweetID}`;
								const cacheFind = await env.MD_CACHE.get(cacheKey);
								if (cacheFind) return { url, md: cacheFind };

								console.log(tweetID);
								const tweet = await this.getTweet(tweetID);

								if (!tweet || typeof tweet !== 'object' || tweet.text === undefined) return { url, md: 'Tweet not found', error: true };

								const tweetMd = `Tweet from @${tweet.user?.name ?? tweet.user?.screen_name ?? 'Unknown'}

								${tweet.text}
								Images: ${tweet.photos ? tweet.photos.map((photo) => photo.url).join(', ') : 'none'}
								Time: ${tweet.created_at}, Likes: ${tweet.favorite_count}, Retweets: ${tweet.conversation_count}

								raw: ${JSON.stringify(tweet)}`;
								await env.MD_CACHE.put(cacheKey, tweetMd);

								return { url, md: tweetMd };
							}
						}

						console.log(`[getWebsiteMarkdown] Passed Twitter check for ${url}, checking Reddit...`)
						// Reddit handling
						if (url.includes('reddit.com/r/')) {
							console.log(`[getWebsiteMarkdown] ---> Entering Reddit block for ${url} <---`);
							console.log('[Reddit] Detected Reddit URL:', url);
							
							// Let the specialized function handle caching
							const md = await this.fetchRedditSubredditMarkdown(url, env);
							console.log('[Reddit] Content fetched, length:', md.length);
							
							return { url, md };
						}
						console.log(`[getWebsiteMarkdown] URL ${url} is not Reddit, proceeding to default fetch.`)

						let md = cached ?? (await classThis.fetchAndProcessPage(url, enableDetailedResponse));

						if (this.llmFilter && !cached) {
							// for (let i = 0; i < 60; i++) await env.RATELIMITER.limit({ key: ip ?? 'no-ip' });

							const answer = (await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', {
								prompt: 
								`You are an AI assistant that converts webpage content to markdown while filtering out unnecessary information. 
								Please follow these guidelines:
									Remove any inappropriate content, ads, or irrelevant information
									If unsure about including something, err on the side of keeping it
									Answer in English. Include all points in markdown in sufficient detail to be useful.
									Aim for clean, readable markdown.
									Return the markdown and nothing else.
									Do not include any other text or formatting.
									Input: ${md}
									Output:\`\`\`markdown\n`,
							})) as { response: string };

							md = answer.response;
						}

						await env.MD_CACHE.put(id, md, { expirationTtl: 3600 });
						return { url, md };

					} catch (error) {
						console.error(`Error processing URL ${url}:`, error);
						return { 
							url, 
							status: 500,
							md: 'Failed to process page', 
							error: true,
							errorDetails: error instanceof Error ? error.message : String(error)
						};
					}
				}),
			);
		} catch (error) {
			console.error('Error in getWebsiteMarkdown:', error);
			return [{ 
				url: urls[0], 
				md: 'Failed to get website markdown', 
				status: 404,
				error: true,
				errorDetails: error instanceof Error ? error.message : String(error)
			}];
		}
	}

	async fetchAndProcessPage(url: string, enableDetailedResponse: boolean): Promise<string> {
		let page = null;
		try {
			page = await this.browser!.newPage();
			await page.goto(url, { waitUntil: 'networkidle0' });
			
			// Add the required scripts with error handling
			try {
				await page.addScriptTag({ url: 'https://unpkg.com/@mozilla/readability/Readability.js' });
				await page.addScriptTag({ url: 'https://unpkg.com/turndown/dist/turndown.js' });
			} catch (scriptError) {
				console.error('Error adding script tags:', scriptError);
				// If scripts fail to load, return a simple HTML extraction
				try {
					return await page.evaluate(() => {
						const mainContent = document.body.innerText;
						return `## ${document.title || 'Untitled Page'}\n\n${mainContent.slice(0, 10000)}`;
					});
				} catch (evaluateError) {
					console.error('Error in page evaluation:', evaluateError);
					return `## Error\n\nFailed to extract content: ${evaluateError instanceof Error ? evaluateError.message : String(evaluateError)}`;
				}
			}

			const md = await page.evaluate((detailed) => {
				try {
					const reader = new (globalThis as any).Readability(document.cloneNode(true), {
						charThreshold: 0,
						keepClasses: true,
						nbTopCandidates: 500,
					});

					const article = reader.parse();
					const turndownService = new (globalThis as any).TurndownService();

					if (detailed) {
						const doc = document.cloneNode(true) as HTMLDocument;
						doc.querySelectorAll('script,style,iframe,noscript').forEach((el: Element) => el.remove());
						return turndownService.turndown(doc);
					}
					
					return turndownService.turndown(article.content);
				} catch (evalError) {
					// If Readability/TurndownService fails, return a simple extraction
					const title = document.title || 'Untitled Page';
					const content = document.body.innerText;
					return `## ${title}\n\n${content.slice(0, SIMPLE_CONTENT_MAX_LENGTH)}`;
				}
			}, enableDetailedResponse);

			return md;
		} catch (error) {
			console.error('Error in fetchAndProcessPage:', error);
			return `Failed to process page: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			if (page) {
				try {
					await page.close();
				} catch (closeError) {
					console.error('Error closing page:', closeError);
				}
			}
		}
	}

	buildHelpResponse() {
		return new Response(html, {
			headers: { 'content-type': 'text/html;charset=UTF-8' },
		});
	}

	isValidUrl(url: string): boolean {
		return /^(http|https):\/\/[^ "]+$/.test(url);
	}

	async alarm() {
		try {
			this.keptAliveInSeconds += 10;
			if (this.keptAliveInSeconds < KEEP_BROWSER_ALIVE_IN_SECONDS) {
				await this.storage.setAlarm(Date.now() + TEN_SECONDS);
			} else {
				if (this.browser) {
					await this.browser.close();
					this.browser = undefined;
				}
			}
		} catch (error) {
			console.error('Error in alarm handler:', error);
		}
	}
}
