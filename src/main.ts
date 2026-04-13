/**
 * Production-ready PlaywrightCrawler entry file.
 */

import { PlaywrightCrawler } from '@crawlee/playwright';
import { Actor } from 'apify';
import { router } from './routes.js';

interface StartUrl {
    url: string;
    method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'CONNECT' | 'PATCH';
    headers?: Record<string, string>;
    userData?: Record<string, unknown>;
}

interface Input {
    startUrls?: StartUrl[];
    maxRequestsPerCrawl?: number;
}

await Actor.init();

/* ── CLI override: support --url from the command line ── */
function getCliUrl(): string | null {
    const args = process.argv;
    const idx = args.indexOf('--url');
    if (idx !== -1 && idx + 1 < args.length) {
        return args[idx + 1];
    }
    return null;
}

const cliUrl = getCliUrl();

const input = (await Actor.getInput<Input>()) ?? {};

const startUrls: StartUrl[] = cliUrl
    ? [{ url: cliUrl }]
    : input.startUrls?.length
        ? input.startUrls
        : [{ url: 'https://mocasawc.com' }];

const maxRequestsPerCrawl = input.maxRequestsPerCrawl ?? 1;

/**
 * Only use Apify Proxy if you explicitly opt in.
 * PowerShell:
 * $env:USE_APIFY_PROXY="1"
 */
const useApifyProxy = process.env.USE_APIFY_PROXY === '1';

const proxyConfiguration = useApifyProxy
    ? await Actor.createProxyConfiguration({ checkAccess: true })
    : undefined;

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 300,
    navigationTimeoutSecs: 45,
    requestHandler: router,
    launchContext: {
        launchOptions: {
            args: [
                '--disable-gpu',
            ],
        },
    },
});

await crawler.run(startUrls);

await Actor.exit();