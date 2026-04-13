import type {
    ActionAttempt,
    BookingSnapshot,
    InteractiveMeta,
    Strategy,
} from './types.js';

import {
    buildSnapshot,
    comparableUrl,
    FORM_CONTROL_SELECTOR,
    getHostname,
    hasMeaningfulProgress,
    INTERACTIVE_SELECTOR,
    isAllowedBookingNavigation,
    isDisallowedHref,
    itemText,
    looksLikeDayNumber,
    looksLikeTimeText,
    normalize,
    serviceLikeText,
} from './booking-state.js';

/* ──────────────────────────────────────────────
 *  Strategy-keyed scan limits
 * ────────────────────────────────────────────── */

const SCAN_LIMIT_BY_STRATEGY: Record<Strategy, number> = {
    fast: 28,
    broad: 60,
    adapter: 96,
};

const BOOKING_ENTRY_SCAN_LIMIT_BY_STRATEGY: Record<Strategy, number> = {
    fast: 72,
    broad: 120,
    adapter: 180,
};

const BOOKSY_SERVICE_SCAN_LIMIT_BY_STRATEGY: Record<Strategy, number> = {
    fast: 24,
    broad: 40,
    adapter: 56,
};

/* ──────────────────────────────────────────────
 *  Mock profile (safe non-submitting field fill)
 * ────────────────────────────────────────────── */

const MOCK_PROFILE = {
    firstName: 'Test',
    lastName: 'Crawler',
    email: 'test.booking.crawler@example.invalid',
    phoneDigits: '5550100000',
    preferredDateText: 'Next available',
    preferredTimeText: 'Any',
    dobText: '01/01/1990',
    dobIso: '1990-01-01',
    message: 'Automated non-submitting booking-flow classification test.',
};

/* ──────────────────────────────────────────────
 *  Phrase / pattern constants
 * ────────────────────────────────────────────── */

const BOOKING_ENTRY_PHRASES = [
    'book now',
    'book online',
    'book appointment',
    'book an appointment',
    'schedule now',
    'schedule online',
    'schedule appointment',
    'request appointment',
    'appointment request',
    'request consultation',
    'book consultation',
    'reserve',
    'book',
    'schedule',
];

const SERVICE_ACTION_PHRASES = [
    'book',
    'book now',
    'select',
    'select service',
    'choose',
    'choose service',
    'view times',
    'show times',
    'find times',
    'see times',
    'view availability',
    'see availability',
    'next available',
];

const CONTINUE_PHRASES = [
    'continue',
    'proceed',
    'next',
    'continue booking',
    'continue as guest',
    'continue to booking',
    'continue without signing in',
    'continue without logging in',
    'guest checkout',
    'checkout as guest',
    'book as guest',
    'skip login',
    'skip sign in',
];

const DISALLOWED_TEXT_PATTERNS = [
    'app store',
    'google play',
    'instagram',
    'facebook',
    'website',
    'payment & cancellation policy',
    'report',
    'share',
    'read more',
    'you might also like',
    'next page',
];

const GENERIC_NAV_TEXTS = [
    'home',
    'about us',
    'contact us',
    'current-services',
    'current services',
    'payment plans',
    'more',
    'learn more',
    'see results',
    'all services',
    'booksy logo',
    'logo',
    'schedule',
    'us',
    'read more:',
];

const KNOWN_VENDOR_HINTS = [
    'booksy.com',
    'vagaro.com',
    'mindbody',
    'mindbodyonline',
    'joinblvd',
    'blvd.co',
    'glossgenius',
    'acuityscheduling',
    'squareup',
    'square.site',
    'fresha.com',
    'zenoti.com',
];

const BOOKSY_MARKETPLACE_CATEGORY_TEXTS = [
    'hair',
    'barber',
    'nails',
    'skin care',
    'brows and lashes',
    'massage',
    'makeup',
    'wellness and spa',
    'braids and locs',
    'tattoos',
    'medical aesthetics',
    'hair removal',
    'home services',
    'piercing',
    'pet services',
    'dental and orthodontics',
    'health and fitness',
    'professional services',
    'other',
];

/* ──────────────────────────────────────────────
 *  Date / time scoring helpers
 *
 *  These tighten date and time action scoring to
 *  avoid false positives on bare labels like
 *  "Date", "Time", or calendar nav controls.
 * ────────────────────────────────────────────── */

const BARE_DATE_LABELS = new Set([
    'date',
    'dates',
    'day',
    'days',
    'calendar',
]);

const BARE_TIME_LABELS = new Set([
    'time',
    'times',
]);

function isBareDateControlText(text: string): boolean {
    return BARE_DATE_LABELS.has(text.trim().toLowerCase());
}

function isBareTimeControlText(text: string): boolean {
    return BARE_TIME_LABELS.has(text.trim().toLowerCase());
}

const WEEKDAY_RE =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;

const MONTH_RE =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i;

const SLASH_DATE_RE = /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/;

const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/;

/**
 * Returns true when `text` looks like it contains an explicit human-readable
 * date — e.g. "Mon, Oct 21", "10/21/2026", "2026-10-21".
 *
 * Intended for short interactive-element labels (≤ 80 chars).  Longer text is
 * rejected to avoid matching month names buried inside paragraphs.
 */
function looksLikeExplicitDateText(text: string): boolean {
    const t = text.trim();
    if (t.length > 80) return false;
    return WEEKDAY_RE.test(t) || MONTH_RE.test(t) || SLASH_DATE_RE.test(t) || ISO_DATE_RE.test(t);
}

const EXPLICIT_TIME_RE = /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/i;

/**
 * Supplementary check for explicit AM / PM time patterns like "10:30 AM" or
 * "2 pm".  Complements the imported `looksLikeTimeText` from booking-state.
 */
function looksLikeExplicitTimeText(text: string): boolean {
    return EXPLICIT_TIME_RE.test(text.trim());
}

/**
 * Single-word calendar navigation texts that should never score as a date
 * choice (e.g. forward/back arrows rendered as text).
 */
const CALENDAR_NAV_TEXTS = new Set([
    'back',
    'prev',
    'previous',
    'forward',
    'next',
    '>',
    '<',
    '\u2039',  // ‹
    '\u203a',  // ›
    '\u00ab',  // «
    '\u00bb',  // »
]);

/* ──────────────────────────────────────────────
 *  Page / error utilities
 * ────────────────────────────────────────────── */

function isPageUsable(page: any): boolean {
    try {
        return !!page && !(typeof page.isClosed === 'function' && page.isClosed());
    } catch {
        return false;
    }
}

function isClosedPageError(error: unknown): boolean {
    const message = String((error as any)?.message ?? error ?? '');
    return /target page, context or browser has been closed/i.test(message);
}

function getBooksyServiceScanLimit(strategy: Strategy): number {
    return BOOKSY_SERVICE_SCAN_LIMIT_BY_STRATEGY[strategy];
}

function getBookingEntryScanLimit(strategy: Strategy): number {
    return BOOKING_ENTRY_SCAN_LIMIT_BY_STRATEGY[strategy];
}

/* ──────────────────────────────────────────────
 *  Snapshot delta / settling
 * ────────────────────────────────────────────── */

function signalCount(values: string[] | undefined): number {
    return Array.isArray(values) ? values.length : 0;
}

function hasUsefulBookingDelta(args: {
    before: BookingSnapshot;
    after: BookingSnapshot;
    beforeUrl: string;
    afterUrl: string;
}): boolean {
    const { before, after, beforeUrl, afterUrl } = args;

    if (hasMeaningfulProgress(before, after)) return true;
    if (comparableUrl(beforeUrl) !== comparableUrl(afterUrl)) return true;
    if (before.dominant.state !== after.dominant.state) return true;
    if (before.dominant.surface.key !== after.dominant.surface.key) return true;
    if (!before.vendor.name && !!after.vendor.name) return true;

    if (signalCount(after.aggregate.schedulerSignals) > signalCount(before.aggregate.schedulerSignals)) return true;
    if (signalCount(after.aggregate.loginSignals) > signalCount(before.aggregate.loginSignals)) return true;
    if (signalCount(after.aggregate.paymentSignals) > signalCount(before.aggregate.paymentSignals)) return true;
    if (signalCount(after.aggregate.terminalSignals) > signalCount(before.aggregate.terminalSignals)) return true;
    if (signalCount(after.aggregate.appointmentSignals) > signalCount(before.aggregate.appointmentSignals)) return true;
    if (signalCount(after.aggregate.generalContactSignals) > signalCount(before.aggregate.generalContactSignals)) return true;

    return false;
}

async function buildSettledSnapshot(
    page: any,
    before: BookingSnapshot,
    beforeUrl: string,
): Promise<BookingSnapshot> {
    if (!isPageUsable(page)) return before;

    const waits = [0, 250, 600, 1200];
    let latest = before;

    for (const ms of waits) {
        if (!isPageUsable(page)) return latest;

        if (ms > 0) {
            await page.waitForTimeout(ms).catch(() => {});
        }

        latest = await buildSnapshot(page);

        if (hasUsefulBookingDelta({
            before,
            after: latest,
            beforeUrl,
            afterUrl: page.url(),
        })) {
            return latest;
        }
    }

    return latest;
}

/* ──────────────────────────────────────────────
 *  Popup dismissal
 * ────────────────────────────────────────────── */

export async function dismissCommonPopups(page: any): Promise<void> {
    if (!isPageUsable(page)) return;

    const selectors = [
        'button:has-text("Accept")',
        'button:has-text("Accept all")',
        'button:has-text("Allow all")',
        'button:has-text("I agree")',
        'button:has-text("Got it")',
        'button:has-text("Close")',
        '#onetrust-accept-btn-handler',
        'button[aria-label*="accept" i]',
        'button[aria-label*="close" i]',
    ];

    for (const selector of selectors) {
        if (!isPageUsable(page)) return;

        const locator = page.locator(selector).first();
        try {
            if (await locator.count()) {
                await locator.click({ timeout: 700 }).catch(() => {});
                await page.waitForTimeout(120).catch(() => {});
            }
        } catch {
            // ignore
        }
    }
}

/* ──────────────────────────────────────────────
 *  Locator introspection
 * ────────────────────────────────────────────── */

async function isLocatorUsable(locator: any): Promise<boolean> {
    try {
        if (!(await locator.isVisible())) return false;
        if (!(await locator.isEnabled().catch(() => true))) return false;
        return true;
    } catch {
        return false;
    }
}

async function readLocatorMeta(locator: any): Promise<InteractiveMeta | null> {
    try {
        return await locator.evaluate((el, containerSelectors) => {
            const anyEl = el as any;
            const style = window.getComputedStyle(el as Element);
            const rect = (el as HTMLElement).getBoundingClientRect();
            const visible =
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;

            const text = (anyEl.innerText || anyEl.value || anyEl.textContent || '').trim();
            const href = anyEl.href || '';
            const ariaLabel = anyEl.getAttribute?.('aria-label') || '';
            const title = anyEl.getAttribute?.('title') || '';
            const ariaDisabled = anyEl.getAttribute?.('aria-disabled') === 'true';

            let containerText = '';
            for (const selector of containerSelectors as string[]) {
                try {
                    const container = (el as Element).closest(selector);
                    if (container) {
                        containerText = ((container as HTMLElement).innerText || container.textContent || '').trim();
                        break;
                    }
                } catch {
                    // ignore
                }
            }

            return {
                text,
                href,
                ariaLabel,
                title,
                visible,
                disabled: !!anyEl.disabled,
                ariaDisabled,
                containerText,
            };
        }, [
            '[data-testid*="service"]',
            '[data-qa*="service"]',
            '[class*="service"]',
            '[class*="Service"]',
            'article',
            'li',
            'section',
        ]);
    } catch {
        return null;
    }
}

/* ──────────────────────────────────────────────
 *  Action key / text helpers
 * ────────────────────────────────────────────── */

function buildActionKey(state: BookingSnapshot['dominant']['state'], surfaceKey: string, meta: InteractiveMeta): string {
    const text = itemText(meta);
    const href = normalize(meta.href);
    const container = normalize(meta.containerText).slice(0, 120);
    return `${state}|${surfaceKey}|${text}|${href}|${container}`;
}

function isGenericNavText(text: string): boolean {
    if (GENERIC_NAV_TEXTS.includes(text)) return true;
    if (text.endsWith(' logo')) return true;
    return false;
}

function isLikelyVendorHref(href: string): boolean {
    const h = normalize(href);
    return KNOWN_VENDOR_HINTS.some((hint) => h.includes(hint));
}

function isSelfNavigation(href: string, currentUrl: string): boolean {
    if (!href) return false;
    return comparableUrl(href) === comparableUrl(currentUrl);
}

function isVendorHomeLink(href: string): boolean {
    const h = normalize(href);

    return (
        h === 'https://booksy.com/en-us/' ||
        h === 'https://booksy.com/en-us' ||
        h.endsWith('booksy.com/en-us/') ||
        h.endsWith('booksy.com/en-us')
    );
}

/* ──────────────────────────────────────────────
 *  Booksy-specific helpers
 * ────────────────────────────────────────────── */

function isBooksyProviderUrl(url: string): boolean {
    return /booksy\.com\/en-us\/\d+_/i.test(url);
}

function isBooksyDirectoryHref(href: string): boolean {
    return /booksy\.com\/en-us\/s\//i.test(normalize(href));
}

function isBooksyMarketplaceCategoryText(text: string): boolean {
    return BOOKSY_MARKETPLACE_CATEGORY_TEXTS.includes(normalize(text));
}

function isShortBooksyCategoryContainer(text: string): boolean {
    const t = normalize(text);
    return !!t && t.length <= 40 && BOOKSY_MARKETPLACE_CATEGORY_TEXTS.includes(t);
}

function looksLikePricedTimedServiceContainer(text: string): boolean {
    const t = normalize(text);
    return (
        /\$\s?\d|free|varies/.test(t) &&
        /\b\d+\s?(min|mins|minute|minutes|h|hr|hrs)\b/i.test(t)
    );
}

function looksLikeBooksyProviderHeader(text: string): boolean {
    const t = normalize(text);
    return (
        t.includes('show all photos') ||
        t.includes('entrepreneur') ||
        t.includes('reviews') ||
        t.includes('amenities') ||
        (t.includes('330 sw 27th ave') && !looksLikePricedTimedServiceContainer(t))
    );
}

function hasBooksyServiceContext(meta: InteractiveMeta): boolean {
    const text = itemText(meta);
    const container = normalize(meta.containerText);

    if (looksLikeBooksyProviderHeader(container)) return false;

    if (looksLikePricedTimedServiceContainer(container)) return true;
    if (serviceLikeText(container)) return true;
    if (container.includes('popular services')) return true;
    if (container.includes('other services')) return true;
    if (container.includes('services')) return true;
    if (/\$\s?\d|free|varies/.test(container)) return true;
    if (/\b\d+\s?(min|mins|minute|minutes|h|hr|hrs)\b/i.test(container)) return true;
    if (text.includes('next available')) return true;

    return false;
}

async function getPreferredServiceRoot(page: any, fallbackRoot: any): Promise<any> {
    if (!isBooksyProviderUrl(page.url())) return fallbackRoot;

    const candidates = [
        page.locator('section:has-text("Popular Services")').first(),
        page.locator('section:has-text("Other Services")').first(),
        page.locator('section:has-text("Services")').first(),
        page.locator('main:has-text("Popular Services")').first(),
        page.locator('main:has-text("Services")').first(),
    ];

    for (const locator of candidates) {
        try {
            if (await locator.count()) return locator;
        } catch {
            // ignore
        }
    }

    return fallbackRoot;
}

/* ──────────────────────────────────────────────
 *  Navigation helpers
 * ────────────────────────────────────────────── */

function shouldDirectNavigate(meta: InteractiveMeta, currentUrl: string): boolean {
    const href = meta.href?.trim();
    if (!href) return false;
    if (isDisallowedHref(href)) return false;
    if (isSelfNavigation(href, currentUrl)) return false;
    if (href.startsWith('#')) return false;

    return true;
}

async function navigateViaHref(page: any, href: string): Promise<any> {
    await page.goto(href, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
    }).catch(async () => {
        await page.goto(href, {
            waitUntil: 'load',
            timeout: 15000,
        });
    });

    await page.waitForTimeout(900).catch(() => {});
    return page;
}

/* ──────────────────────────────────────────────
 *  Click + wait + verified-click engine
 * ────────────────────────────────────────────── */

async function clickLocatorAndWait(page: any, locator: any, meta: InteractiveMeta): Promise<any> {
    const beforeUrl = page.url();

    const newPagePromise = page.context().waitForEvent('page', { timeout: 2200 }).catch(() => null);

    await locator.scrollIntoViewIfNeeded().catch(() => {});

    let clicked = false;

    try {
        await locator.click({ timeout: 1800 });
        clicked = true;
    } catch {
        try {
            await locator.click({ timeout: 1800, force: true });
            clicked = true;
        } catch {
            clicked = false;
        }
    }

    if (!clicked) {
        if (shouldDirectNavigate(meta, beforeUrl)) {
            return navigateViaHref(page, meta.href);
        }

        throw new Error(`Click failed for interactive candidate: ${meta.text || meta.ariaLabel || meta.title || meta.href || 'unknown'}`);
    }

    const maybeNewPage = await newPagePromise;
    const activePage = maybeNewPage ?? page;

    if (maybeNewPage) {
        await activePage.waitForLoadState('domcontentloaded', { timeout: 7000 }).catch(() => {});
    } else if (comparableUrl(beforeUrl) !== comparableUrl(page.url())) {
        await page.waitForLoadState('domcontentloaded', { timeout: 7000 }).catch(() => {});
    } else {
        await page.waitForTimeout(350).catch(() => {});
    }

    await activePage.waitForTimeout(650).catch(() => {});
    return activePage;
}

async function tryVerifiedClick(args: {
    page: any;
    locator: any;
    meta: InteractiveMeta;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    label: string;
    log: any;
}): Promise<ActionAttempt> {
    const { page, locator, meta, snapshot, attemptedActions, label, log } = args;

    if (!isPageUsable(page)) {
        return { acted: false, page, snapshot, clickedText: null };
    }

    const key = buildActionKey(snapshot.dominant.state, snapshot.dominant.surface.key, meta);

    if (attemptedActions.has(key)) {
        return { acted: false, page, snapshot, clickedText: null };
    }

    attemptedActions.add(key);

    log.info('Trying action', {
        label,
        pageUrl: page.url(),
        surface: snapshot.dominant.surface.label,
        state: snapshot.dominant.state,
        text: meta.text,
        href: meta.href,
        containerText: normalize(meta.containerText).slice(0, 150),
    });

    const beforeUrl = page.url();

    try {
        const activePage = await clickLocatorAndWait(page, locator, meta);

        if (!isPageUsable(activePage)) {
            return { acted: false, page, snapshot, clickedText: null };
        }

        await dismissCommonPopups(activePage);

        if (!isAllowedBookingNavigation(beforeUrl, activePage.url())) {
            if (activePage !== page) {
                await activePage.close().catch(() => {});
            } else if (comparableUrl(beforeUrl) !== comparableUrl(activePage.url())) {
                await activePage.goBack({ timeout: 4000 }).catch(() => {});
                await activePage.waitForLoadState('domcontentloaded', { timeout: 4000 }).catch(() => {});
            }

            return { acted: false, page, snapshot, clickedText: null };
        }

        const afterSnapshot = await buildSettledSnapshot(activePage, snapshot, beforeUrl);

        if (hasUsefulBookingDelta({
            before: snapshot,
            after: afterSnapshot,
            beforeUrl,
            afterUrl: activePage.url(),
        })) {
            return {
                acted: true,
                page: activePage,
                snapshot: afterSnapshot,
                clickedText: meta.text || meta.ariaLabel || meta.title || label,
            };
        }

        if (activePage !== page) {
            await activePage.close().catch(() => {});
            return { acted: false, page, snapshot, clickedText: null };
        }

        if (comparableUrl(beforeUrl) !== comparableUrl(activePage.url())) {
            await activePage.goBack({ timeout: 4000 }).catch(() => {});
            await activePage.waitForLoadState('domcontentloaded', { timeout: 4000 }).catch(() => {});
        }

        return { acted: false, page, snapshot, clickedText: null };
    } catch (error: any) {
        const message = String(error?.message ?? error);

        if (!isClosedPageError(error)) {
            log.info('Action candidate failed', {
                label,
                pageUrl: page.url(),
                text: meta.text,
                href: meta.href,
                error: message,
            });
        }

        return { acted: false, page, snapshot, clickedText: null };
    }
}

/* ──────────────────────────────────────────────
 *  Generic best-interactive picker
 * ────────────────────────────────────────────── */

async function clickBestInteractive(args: {
    page: any;
    root: any;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    log: any;
    strategy: Strategy;
    label: string;
    scorer: (meta: InteractiveMeta) => number;
    scanLimit?: number;
}): Promise<ActionAttempt> {
    const { page, root, snapshot, attemptedActions, log, strategy, label, scorer, scanLimit } = args;

    if (!isPageUsable(page)) {
        return { acted: false, page, snapshot, clickedText: null };
    }

    const locatorList = root.locator(INTERACTIVE_SELECTOR);
    const count = Math.min(
        await locatorList.count().catch(() => 0),
        scanLimit ?? SCAN_LIMIT_BY_STRATEGY[strategy],
    );

    const candidates: Array<{ locator: any; meta: InteractiveMeta; score: number }> = [];

    for (let i = 0; i < count; i++) {
        if (!isPageUsable(page)) {
            return { acted: false, page, snapshot, clickedText: null };
        }

        const locator = locatorList.nth(i);
        if (!(await isLocatorUsable(locator))) continue;

        const meta = await readLocatorMeta(locator);
        if (!meta || !meta.visible || meta.disabled || meta.ariaDisabled) continue;

        const score = scorer(meta);
        if (score <= 0) continue;

        candidates.push({ locator, meta, score });
    }

    candidates.sort((a, b) => b.score - a.score);

    for (const candidate of candidates) {
        if (!isPageUsable(page)) {
            return { acted: false, page, snapshot, clickedText: null };
        }

        const result = await tryVerifiedClick({
            page,
            locator: candidate.locator,
            meta: candidate.meta,
            snapshot,
            attemptedActions,
            label,
            log,
        });

        if (result.acted) return result;
    }

    return { acted: false, page, snapshot, clickedText: null };
}

/* ──────────────────────────────────────────────
 *  Scoring: booking entry
 * ────────────────────────────────────────────── */

function scoreBookingEntry(meta: InteractiveMeta, currentUrl: string): number {
    const text = itemText(meta);
    const href = normalize(meta.href);
    const container = normalize(meta.containerText);

    if (!text) return 0;
    if (DISALLOWED_TEXT_PATTERNS.some((part) => text.includes(part))) return 0;
    if (isDisallowedHref(meta.href)) return 0;
    if (isGenericNavText(text)) return 0;
    if (text.includes('contact us')) return 0;
    if (isSelfNavigation(meta.href, currentUrl)) return 0;
    if (isVendorHomeLink(meta.href)) return 0;

    const genericServiceNavTexts = new Set([
        'service',
        'services',
        'our service',
        'our services',
        'treatment',
        'treatments',
        'all treatments',
        'view treatments',
        'view services',
    ]);

    if (genericServiceNavTexts.has(text)) return 0;

    const hasBookingPhrase = BOOKING_ENTRY_PHRASES.some((phrase) => text.includes(phrase));
    const hasBookingHref =
        href.includes('book') ||
        href.includes('schedule') ||
        href.includes('appointment') ||
        href.includes('reserve');
    const hasVendorHint = isLikelyVendorHref(href);

    if (!hasBookingPhrase && !hasBookingHref && !hasVendorHint) {
        return 0;
    }

    let score = 0;

    for (const phrase of BOOKING_ENTRY_PHRASES) {
        if (text.includes(phrase)) {
            score += phrase === 'book' || phrase === 'schedule' ? 20 : 60;
        }
    }

    if (text === 'book now') score += 60;
    if (text === 'book') score += 25;
    if (!href && (text === 'book now' || text === 'book')) score += 20;
    if (hasBookingHref) score += 25;
    if (serviceLikeText(container)) score += 12;

    if (hasVendorHint) score += 180;
    if (href.includes('booksy.com')) score += 240;
    if (href.includes('vagaro.com')) score += 240;

    const currentHost = getHostname(currentUrl);
    const targetHost = getHostname(meta.href);
    if (targetHost && currentHost && targetHost !== currentHost) score += 50;

    return score;
}

/* ──────────────────────────────────────────────
 *  Scoring: service actions
 * ────────────────────────────────────────────── */

function scoreBooksyProviderServiceAction(meta: InteractiveMeta, currentUrl: string): number {
    const text = itemText(meta);
    const href = normalize(meta.href);
    const container = normalize(meta.containerText);

    if (!text) return 0;
    if (DISALLOWED_TEXT_PATTERNS.some((part) => text.includes(part))) return 0;
    if (isDisallowedHref(meta.href)) return 0;
    if (isGenericNavText(text)) return 0;
    if (isSelfNavigation(meta.href, currentUrl)) return 0;
    if (isVendorHomeLink(meta.href)) return 0;
    if (text.includes('booksy logo')) return 0;
    if (text.endsWith(' logo')) return 0;
    if (text === 'booksy') return 0;

    if (isBooksyDirectoryHref(href)) return 0;
    if (isBooksyMarketplaceCategoryText(text)) return 0;
    if (isShortBooksyCategoryContainer(container)) return 0;
    if (looksLikeBooksyProviderHeader(container)) return 0;

    const deny = [
        'sign in',
        'log in',
        'login',
        'continue with google',
        'continue with facebook',
        'continue with apple',
        'close',
        'cancel',
        'contact',
        'payment',
        'share',
        'report',
        'blog',
        'about us',
        'faq',
        'privacy policy',
        'show all photos',
        'how reviews work',
        'switch to mobile view',
    ];

    if (deny.some((d) => text.includes(d) || container.includes(d))) return 0;

    const hasServiceContext = hasBooksyServiceContext(meta);

    if ((text === 'book' || text === 'book now') && !hasServiceContext) {
        return 0;
    }

    let score = 0;

    if (text === 'book') score += 320;
    if (text === 'book now') score += 260;
    if (text.includes('next available')) score += 180;

    if (serviceLikeText(text)) score += 90;
    if (serviceLikeText(container)) score += 110;
    if (container.includes('popular services')) score += 160;
    if (container.includes('other services')) score += 120;
    if (container.includes('services')) score += 50;
    if (looksLikePricedTimedServiceContainer(container)) score += 140;
    if (/\$\s?\d|free|varies/.test(container)) score += 50;
    if (/\b\d+\s?(min|mins|minute|minutes|h|hr|hrs)\b/i.test(container)) score += 50;
    if (href.includes('/book') || href.includes('/appointment') || href.includes('/schedule')) score += 30;
    if (!href && text === 'book') score += 20;

    return score;
}

function scoreGenericServiceAction(meta: InteractiveMeta, currentUrl: string): number {
    const text = itemText(meta);
    const href = normalize(meta.href);
    const container = normalize(meta.containerText);

    if (!text) return 0;
    if (DISALLOWED_TEXT_PATTERNS.some((part) => text.includes(part))) return 0;
    if (isDisallowedHref(meta.href)) return 0;
    if (isGenericNavText(text)) return 0;
    if (isSelfNavigation(meta.href, currentUrl)) return 0;
    if (isVendorHomeLink(meta.href)) return 0;
    if (text.includes('booksy logo')) return 0;
    if (text.endsWith(' logo')) return 0;

    const deny = [
        'sign in',
        'log in',
        'login',
        'continue with google',
        'continue with facebook',
        'continue with apple',
        'close',
        'cancel',
        'contact',
        'payment',
        'share',
        'report',
    ];

    if (deny.some((d) => text.includes(d))) return 0;

    let score = 0;

    for (const phrase of SERVICE_ACTION_PHRASES) {
        if (text.includes(phrase)) score += 80;
    }

    if (text === 'book') score += 120;
    if (text === 'book now') score += 130;
    if (serviceLikeText(text)) score += 20;
    if (serviceLikeText(container)) score += 35;
    if (/\$\s?\d/.test(container)) score += 15;
    if (/\b\d+\s?(min|mins|minute|minutes|h|hr|hrs)\b/i.test(container)) score += 15;
    if (href.includes('/book') || href.includes('/schedule') || href.includes('/appointment')) score += 20;
    if (container.includes('service') || container.includes('treatment')) score += 10;

    if (isLikelyVendorHref(href)) score += 180;
    if (href.includes('booksy.com')) score += 240;

    return score;
}

function scoreServiceAction(meta: InteractiveMeta, currentUrl: string): number {
    if (isBooksyProviderUrl(currentUrl)) {
        return scoreBooksyProviderServiceAction(meta, currentUrl);
    }

    return scoreGenericServiceAction(meta, currentUrl);
}

/* ──────────────────────────────────────────────
 *  Scoring: date action (TIGHTENED)
 *
 *  Old behavior: gave 80 pts to "select date" / "choose date" and 40 pts
 *  to bare "calendar" — nearly as much as an actual day number (100).
 *  This caused the crawler to waste attempts on generic openers and
 *  calendar nav instead of clicking real date cells.
 *
 *  New behavior:
 *  • bare labels "date" / "calendar" / etc. → 0
 *  • calendar nav (prev / next / back / < / >) → 0
 *  • oauth / login / cancel / close → 0
 *  • actual day number → 140 (strongest)
 *  • explicit date text (Mon, Oct 21, …) → 120
 *  • "next available" → 80
 *  • opener labels ("select date", …) → 30 (much weaker)
 *  • container context boosts → 5–8
 * ────────────────────────────────────────────── */

function scoreDateAction(meta: InteractiveMeta): number {
    const text = itemText(meta);
    if (!text) return 0;
    if (isDisallowedHref(meta.href)) return 0;

    /* ── reject bare generic labels ── */
    if (isBareDateControlText(text)) return 0;

    /* ── deny oauth / login / cancel / close / calendar nav phrases ── */
    const deny = [
        'continue with google',
        'continue with apple',
        'continue with facebook',
        'sign in',
        'log in',
        'login',
        'cancel',
        'close',
        'previous month',
        'next month',
        'prev month',
    ];
    if (deny.some((d) => text.includes(d))) return 0;

    /* ── deny single-word calendar navigation controls ── */
    if (CALENDAR_NAV_TEXTS.has(text)) return 0;

    /* ── deny generic nav that shouldn't score as a date ── */
    if (isGenericNavText(text)) return 0;

    const container = normalize(meta.containerText);
    let score = 0;

    /* ── strongest: an actual selectable day number ── */
    if (looksLikeDayNumber(normalize(meta.text))) score += 140;

    /* ── strong: explicit human-readable date ── */
    if (looksLikeExplicitDateText(text)) score += 120;

    /* ── good: "next available" ── */
    if (text.includes('next available')) score += 80;

    /* ── mild: opener / prompt labels (not actual date cells) ── */
    if (
        text.includes('select date') ||
        text.includes('select a date') ||
        text.includes('choose date') ||
        text.includes('choose a date') ||
        text.includes('pick a date') ||
        text.includes('pick date')
    ) {
        score += 30;
    }

    /* ── small container context boosts ── */
    if (container.includes('available') || container.includes('availability')) score += 8;
    if (container.includes('appointment') || container.includes('booking')) score += 8;
    if (container.includes('calendar') || container.includes('schedule')) score += 5;

    return score;
}

/* ──────────────────────────────────────────────
 *  Scoring: time action (TIGHTENED)
 *
 *  Old behavior: gave 60 pts to "select a time" / "choose a time" — half
 *  of a real time slot (120). Bare "time" had no guard and could
 *  accumulate score from container context.
 *
 *  New behavior:
 *  • bare labels "time" / "times" → 0
 *  • oauth / login / cancel / close / back → 0
 *  • real time text (10:30 AM, …) → 140 (strongest)
 *  • supplementary explicit AM/PM pattern → +15
 *  • "next available" → 80
 *  • opener labels ("select a time", …) → 30 (much weaker)
 *  • container context boosts → 5–8
 * ────────────────────────────────────────────── */

function scoreTimeAction(meta: InteractiveMeta): number {
    const text = itemText(meta);
    if (!text) return 0;
    if (isDisallowedHref(meta.href)) return 0;

    /* ── reject bare generic labels ── */
    if (isBareTimeControlText(text)) return 0;

    /* ── deny oauth / login / cancel / close / nav ── */
    const deny = [
        'continue with google',
        'continue with apple',
        'continue with facebook',
        'sign in',
        'log in',
        'login',
        'cancel',
        'close',
        'back',
    ];
    if (deny.some((d) => text.includes(d))) return 0;

    /* ── deny generic nav ── */
    if (isGenericNavText(text)) return 0;

    const container = normalize(meta.containerText);
    let score = 0;

    /* ── strongest: recognized time text (from booking-state) ── */
    if (looksLikeTimeText(text)) score += 140;

    /* ── supplementary boost for explicit AM/PM pattern ── */
    if (looksLikeExplicitTimeText(normalize(meta.text))) score += 15;

    /* ── good: "next available" ── */
    if (text.includes('next available')) score += 80;

    /* ── mild: opener / prompt labels ── */
    if (
        text.includes('select a time') ||
        text.includes('select time') ||
        text.includes('choose a time') ||
        text.includes('choose time') ||
        text.includes('pick a time') ||
        text.includes('pick time')
    ) {
        score += 30;
    }

    /* ── small container context boosts ── */
    if (container.includes('available') || container.includes('availability')) score += 8;
    if (container.includes('appointment') || container.includes('booking')) score += 8;

    return score;
}

/* ──────────────────────────────────────────────
 *  Scoring: safe continue
 * ────────────────────────────────────────────── */

function scoreContinue(meta: InteractiveMeta): number {
    const text = itemText(meta);
    if (!text) return 0;
    if (isDisallowedHref(meta.href)) return 0;

    const deny = [
        'continue with google',
        'continue with facebook',
        'continue with apple',
        'submit',
        'send',
        'request',
        'confirm',
        'complete',
        'pay',
        'checkout',
        'purchase',
        'place order',
        'book now',
        'reserve now',
        'cancel',
        'close',
    ];

    if (deny.some((d) => text.includes(d))) return 0;

    let score = 0;
    for (const phrase of CONTINUE_PHRASES) {
        if (text.includes(phrase)) score += phrase === 'continue' ? 120 : 90;
    }

    if (text.includes('guest')) score += 80;
    if (text.includes('without signing in')) score += 120;
    if (text.includes('without logging in')) score += 120;
    if (text.includes('skip login') || text.includes('skip sign in')) score += 100;

    return score;
}

/* ──────────────────────────────────────────────
 *  Exported flow actions
 * ────────────────────────────────────────────── */

export async function clickBookingEntry(
    page: any,
    strategy: Strategy,
    attemptedActions: Set<string>,
    log: any,
): Promise<ActionAttempt> {
    const snapshot = await buildSnapshot(page);

    return clickBestInteractive({
        page,
        root: page,
        snapshot,
        attemptedActions,
        log,
        strategy,
        label: 'booking-entry',
        scanLimit: getBookingEntryScanLimit(strategy),
        scorer: (meta) => scoreBookingEntry(meta, page.url()),
    });
}

/* ──────────────────────────────────────────────
 *  Low-risk field filling
 * ────────────────────────────────────────────── */

function pickValueForField(meta: string, type: string): string | null {
    const m = normalize(meta);
    const t = normalize(type);

    if (m.includes('first name') || m === 'firstname' || m.includes('given name')) return MOCK_PROFILE.firstName;
    if (m.includes('last name') || m === 'lastname' || m.includes('family name')) return MOCK_PROFILE.lastName;
    if (m.includes('full name') || m === 'name') return `${MOCK_PROFILE.firstName} ${MOCK_PROFILE.lastName}`;
    if (m.includes('email')) return MOCK_PROFILE.email;
    if (m.includes('phone') || m.includes('mobile') || m.includes('tel')) return MOCK_PROFILE.phoneDigits;

    if (m.includes('birth') || m.includes('dob') || m.includes('date of birth')) {
        return t === 'date' ? MOCK_PROFILE.dobIso : MOCK_PROFILE.dobText;
    }

    if (m.includes('preferred date')) {
        return t === 'date' ? null : MOCK_PROFILE.preferredDateText;
    }

    if (m.includes('preferred time')) return MOCK_PROFILE.preferredTimeText;
    if (m.includes('message') || m.includes('comment') || m.includes('notes')) return MOCK_PROFILE.message;

    return null;
}

export async function fillLowRiskFields(root: any): Promise<string[]> {
    const fields = root.locator(FORM_CONTROL_SELECTOR);
    const count = await fields.count().catch(() => 0);
    const filled: string[] = [];

    for (let i = 0; i < count; i++) {
        const locator = fields.nth(i);

        try {
            if (!(await locator.isVisible())) continue;
        } catch {
            continue;
        }

        const meta = await locator.evaluate((el) => {
            const anyEl = el as any;
            const tag = el.tagName.toLowerCase();
            const type = (anyEl.type || '').toLowerCase();
            const name = anyEl.name || '';
            const id = anyEl.id || '';
            const placeholder = anyEl.placeholder || '';
            const ariaLabel = anyEl.getAttribute?.('aria-label') || '';
            const autocomplete = anyEl.getAttribute?.('autocomplete') || '';
            const labels = anyEl.labels ? Array.from(anyEl.labels).map((l: any) => l.textContent || '').join(' ') : '';

            const options = tag === 'select'
                ? Array.from((el as HTMLSelectElement).options).map((opt) => ({
                    text: (opt.textContent || '').trim(),
                    value: opt.value,
                    disabled: opt.disabled,
                }))
                : [];

            return {
                tag,
                type,
                disabled: !!anyEl.disabled || !!anyEl.readOnly || anyEl.getAttribute?.('aria-disabled') === 'true',
                meta: [name, id, placeholder, ariaLabel, autocomplete, labels].join(' '),
                options,
            };
        }).catch(() => null);

        if (!meta) continue;
        if (meta.disabled) continue;
        if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'password'].includes(meta.type)) continue;

        const combinedMeta = normalize(meta.meta);

        try {
            if (meta.tag === 'select') {
                let chosenIndex = -1;

                for (let j = 0; j < meta.options.length; j++) {
                    const opt = meta.options[j];
                    const text = normalize(opt.text);
                    const value = normalize(opt.value);

                    if (opt.disabled) continue;
                    if (!text && !value) continue;
                    if (text.includes('select') || text.includes('choose')) continue;

                    chosenIndex = j;
                    break;
                }

                if (chosenIndex >= 0) {
                    await locator.selectOption({ index: chosenIndex });
                    filled.push(`select:${combinedMeta}`);
                }

                continue;
            }

            const currentValue = await locator.inputValue().catch(() => '');
            if (currentValue) continue;

            const desired = pickValueForField(combinedMeta, meta.type);
            if (!desired) continue;

            await locator.fill(desired);
            filled.push(`fill:${combinedMeta}`);
        } catch {
            // ignore
        }
    }

    return [...new Set(filled)];
}

/* ──────────────────────────────────────────────
 *  Fallback date / time input filling
 * ────────────────────────────────────────────── */

async function clickDateInputFallback(
    page: any,
    root: any,
    snapshot: BookingSnapshot,
    attemptedActions: Set<string>,
    log: any,
): Promise<ActionAttempt> {
    const locator = root.locator('input[type="date"]').first();
    if (!(await locator.count().catch(() => 0))) {
        return { acted: false, page, snapshot, clickedText: null };
    }

    try {
        if (!(await locator.isVisible())) return { acted: false, page, snapshot, clickedText: null };

        const key = `${snapshot.dominant.state}|${snapshot.dominant.surface.key}|date-input`;
        if (attemptedActions.has(key)) return { acted: false, page, snapshot, clickedText: null };
        attemptedActions.add(key);

        const today = new Date();
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const iso = nextWeek.toISOString().slice(0, 10);

        await locator.fill(iso);
        await page.waitForTimeout(600).catch(() => {});
        const afterSnapshot = await buildSnapshot(page);

        if (hasMeaningfulProgress(snapshot, afterSnapshot)) {
            log.info('Filled date input', { url: page.url(), value: iso });
            return { acted: true, page, snapshot: afterSnapshot, clickedText: iso };
        }
    } catch {
        // ignore
    }

    return { acted: false, page, snapshot, clickedText: null };
}

async function clickTimeInputFallback(
    page: any,
    root: any,
    snapshot: BookingSnapshot,
    attemptedActions: Set<string>,
    log: any,
): Promise<ActionAttempt> {
    const locator = root.locator('input[type="time"]').first();
    if (!(await locator.count().catch(() => 0))) {
        return { acted: false, page, snapshot, clickedText: null };
    }

    try {
        if (!(await locator.isVisible())) return { acted: false, page, snapshot, clickedText: null };

        const key = `${snapshot.dominant.state}|${snapshot.dominant.surface.key}|time-input`;
        if (attemptedActions.has(key)) return { acted: false, page, snapshot, clickedText: null };
        attemptedActions.add(key);

        await locator.fill('10:00');
        await page.waitForTimeout(600).catch(() => {});
        const afterSnapshot = await buildSnapshot(page);

        if (hasMeaningfulProgress(snapshot, afterSnapshot)) {
            log.info('Filled time input', { url: page.url(), value: '10:00' });
            return { acted: true, page, snapshot: afterSnapshot, clickedText: '10:00' };
        }
    } catch {
        // ignore
    }

    return { acted: false, page, snapshot, clickedText: null };
}

/* ──────────────────────────────────────────────
 *  Exported compound click actions
 * ────────────────────────────────────────────── */

export async function clickServiceChoice(args: {
    page: any;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    strategy: Strategy;
    log: any;
}): Promise<ActionAttempt> {
    const { page, snapshot, attemptedActions, strategy, log } = args;
    const fallbackRoot = snapshot.dominant.surface.root;
    const root = await getPreferredServiceRoot(page, fallbackRoot);

    if (isBooksyProviderUrl(page.url())) {
        const scanLimit = getBooksyServiceScanLimit(strategy);

        const bookFirst = await clickBestInteractive({
            page,
            root,
            snapshot,
            attemptedActions,
            log,
            strategy,
            label: 'service-choice-booksy-book-first',
            scanLimit,
            scorer: (meta) => {
                const text = itemText(meta);
                if (text !== 'book' && text !== 'book now' && !text.includes('next available')) return 0;
                if (!hasBooksyServiceContext(meta)) return 0;
                return scoreServiceAction(meta, page.url()) + 120;
            },
        });

        if (bookFirst.acted) return bookFirst;
    }

    return clickBestInteractive({
        page,
        root,
        snapshot,
        attemptedActions,
        log,
        strategy,
        label: 'service-choice',
        scanLimit: isBooksyProviderUrl(page.url()) ? getBooksyServiceScanLimit(strategy) : undefined,
        scorer: (meta) => scoreServiceAction(meta, page.url()),
    });
}

export async function clickDateChoice(args: {
    page: any;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    strategy: Strategy;
    log: any;
}): Promise<ActionAttempt> {
    const { page, snapshot, attemptedActions, strategy, log } = args;
    const root = snapshot.dominant.surface.root;

    const clicked = await clickBestInteractive({
        page,
        root,
        snapshot,
        attemptedActions,
        log,
        strategy,
        label: 'date-choice',
        scorer: scoreDateAction,
    });

    if (clicked.acted) return clicked;
    return clickDateInputFallback(page, root, snapshot, attemptedActions, log);
}

export async function clickTimeChoice(args: {
    page: any;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    strategy: Strategy;
    log: any;
}): Promise<ActionAttempt> {
    const { page, snapshot, attemptedActions, strategy, log } = args;
    const root = snapshot.dominant.surface.root;

    const clicked = await clickBestInteractive({
        page,
        root,
        snapshot,
        attemptedActions,
        log,
        strategy,
        label: 'time-choice',
        scorer: scoreTimeAction,
    });

    if (clicked.acted) return clicked;
    return clickTimeInputFallback(page, root, snapshot, attemptedActions, log);
}

export async function clickSafeContinue(args: {
    page: any;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    strategy: Strategy;
    log: any;
}): Promise<ActionAttempt> {
    const { page, snapshot, attemptedActions, strategy, log } = args;
    const root = snapshot.dominant.surface.root;

    return clickBestInteractive({
        page,
        root,
        snapshot,
        attemptedActions,
        log,
        strategy,
        label: 'safe-continue',
        scorer: scoreContinue,
    });
}

export async function clickBestVendorBookButton(args: {
    page: any;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    strategy: Strategy;
    log: any;
}): Promise<ActionAttempt> {
    const { page, snapshot, attemptedActions, strategy, log } = args;
    const fallbackRoot = snapshot.dominant.surface.root;
    const root = await getPreferredServiceRoot(page, fallbackRoot);

    return clickBestInteractive({
        page,
        root,
        snapshot,
        attemptedActions,
        log,
        strategy,
        label: 'vendor-book-button',
        scanLimit: isBooksyProviderUrl(page.url()) ? getBooksyServiceScanLimit(strategy) : undefined,
        scorer: (meta) => {
            const text = itemText(meta);
            const href = normalize(meta.href);
            const container = normalize(meta.containerText);

            if (!text) return 0;
            if (isDisallowedHref(meta.href)) return 0;
            if (text.includes('app store') || text.includes('google play')) return 0;
            if (isGenericNavText(text)) return 0;
            if (isVendorHomeLink(meta.href)) return 0;
            if (text.includes('booksy logo')) return 0;
            if (text.endsWith(' logo')) return 0;
            if (text === 'booksy') return 0;

            if (isBooksyProviderUrl(page.url())) {
                if (isBooksyDirectoryHref(href)) return 0;
                if (isBooksyMarketplaceCategoryText(text)) return 0;
                if (isShortBooksyCategoryContainer(container)) return 0;
                if (!hasBooksyServiceContext(meta) && (text === 'book' || text === 'book now')) return 0;
            }

            let score = 0;
            if (text === 'book') score += 220;
            if (text === 'book now') score += 210;
            if (text.includes('next available')) score += 120;
            if (serviceLikeText(container)) score += 40;
            if (looksLikePricedTimedServiceContainer(container)) score += 90;
            if (!href && text === 'book') score += 20;
            if (isLikelyVendorHref(href)) score += 200;
            if (href.includes('booksy.com')) score += 260;

            return score;
        },
    });
}