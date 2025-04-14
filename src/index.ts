/// <reference lib="dom" />
import puppeteer from '@cloudflare/puppeteer';
import type { Browser as PuppeteerBrowser, Page } from '@cloudflare/puppeteer';
import { Tweet } from 'react-tweet/api';
import { html } from './response';

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
		let page = null;
		try {
			page = await this.browser!.newPage();
			await page.goto(url, { waitUntil: 'networkidle0' });
			
			const metadata = await page.evaluate(() => {
				const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim();
				const author = document.querySelector('ytd-video-owner-renderer #channel-name a')?.textContent?.trim();
				const description = document.querySelector('ytd-expander#description ytd-formatted-string')?.textContent?.trim();
				const viewCount = document.querySelector('ytd-video-view-count-renderer .view-count')?.textContent?.trim();
				const uploadDate = document.querySelector('ytd-video-primary-info-renderer .date')?.textContent?.trim();
				const likeCount = document.querySelector('ytd-menu-renderer ytd-toggle-button-renderer:first-child #text')?.textContent?.trim();
				
				return {
					title,
					author,
					description,
					viewCount,
					uploadDate,
					likeCount
				};
			});

			return `# ${metadata.title}
						## Video Information
						- **Author**: ${metadata.author}
						- **Views**: ${metadata.viewCount}
						- **Upload Date**: ${metadata.uploadDate}
						- **Likes**: ${metadata.likeCount}

						## Description
						${metadata.description}

						Video URL: ${url}`;
		} catch (error) {
			console.error('Error extracting YouTube metadata:', error);
			return `Failed to extract YouTube metadata: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			if (page) {
				await page.close();
			}
		}
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
				return [{ url: urls[0], md: 'Could not start browser instance', error: true }];
			}

			return await Promise.all(
				urls.map(async (url) => {
					try {
						const ip = this.request?.headers.get('cf-connecting-ip');

						if (this.token !== env.BACKEND_SECURITY_TOKEN) {
							const { success } = await env.RATELIMITER.limit({ key: ip ?? 'no-ip' });

							if (!success) {
								return { url, md: 'Rate limit exceeded', error: true };
							}
						}

						const id = url + (enableDetailedResponse ? '-detailed' : '') + (this.llmFilter ? '-llm' : '');
						const cached = await env.MD_CACHE.get(id);

						// Special YouTube handling
						if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
							if (cached) return { url, md: cached };
							const md = await this.getYouTubeMetadata(url);
							await env.MD_CACHE.put(id, md, { expirationTtl: 3600 });
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
									
									// Scroll down to load more tweets
									await page.evaluate(() => {
										window.scrollBy(0, LOAD_MORE_TWEETS_SCROLL_AMOUNT);
										return new Promise(resolve => setTimeout(resolve, LOAD_MORE_TWEETS_SCROLL_DELAY));
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
