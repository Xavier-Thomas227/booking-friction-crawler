import { createPlaywrightRouter } from '@crawlee/playwright';

import {
    clickBookingEntry,
    clickDateChoice,
    clickSafeContinue,
    clickServiceChoice,
    clickTimeChoice,
    dismissCommonPopups,
    fillLowRiskFields,
} from './booking-actions.js';

import {
    buildSnapshot,
    detectVendor,
    getStrategy,
    hasStrongLiveSchedulerEvidence,
    isOutOfTime,
    MAX_STEPS_BY_STRATEGY,
    recordSnapshotUrls,
    unique,
    withPrefix,
} from './booking-state.js';

import type {
    ActionAttempt,
    BookingSnapshot,
    ClassificationResult,
    FlowAdvanceResult,
    Strategy,
} from './types.js';

import { runVendorAdapter } from './vendor-adapters.js';

export const router = createPlaywrightRouter();

const MAX_RETRY_ESCALATION = 1;

/**
 * States where the page is not yet inside a live scheduler, so
 * `clickBookingEntry` is a valid fallback when scheduler-specific
 * actions (service / date / time / continue) find nothing.
 */
const ENTRY_FALLBACK_STATES = new Set([
    'contact_form',
    'landing',
    'unknown',
]);

/* ══════════════════════════════════════════════════════════════
 *  Vendor marketing / homepage detection
 *
 *  CHANGED: added Zenoti corporate-site guard.  Only matches
 *  the vendor's own domain (zenoti.com), NOT business
 *  subdomains like <slug>.zenoti.com.
 * ══════════════════════════════════════════════════════════════ */

const VENDOR_MARKETING_PATTERNS: { host: RegExp; pathIsMarketing: (path: string) => boolean }[] = [
    {
        host: /^(www\.)?vagaro\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return (
                normalized === '' ||
                normalized === '/pro' ||
                normalized.startsWith('/signup') ||
                normalized.startsWith('/pricing') ||
                normalized.startsWith('/features') ||
                normalized.startsWith('/login') ||
                normalized.startsWith('/about')
            );
        },
    },
    {
        host: /^(www\.)?booksy\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return (
                normalized === '' ||
                normalized === '/biz' ||
                normalized.startsWith('/pricing') ||
                normalized.startsWith('/signup') ||
                normalized.startsWith('/login') ||
                normalized.startsWith('/for-business')
            );
        },
    },
    {
        host: /^(www\.)?acuityscheduling\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return normalized === '' || normalized.startsWith('/pricing');
        },
    },
    {
        host: /^(www\.)?square\.site$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return normalized === '';
        },
    },
    {
        host: /^(www\.)?squareup\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return normalized === '' || normalized.startsWith('/appointments');
        },
    },
    {
        host: /^(www\.)?(webflow\.)?glossgenius\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return (
                normalized === '' ||
                normalized.startsWith('/pricing') ||
                normalized.startsWith('/features') ||
                normalized.startsWith('/signup') ||
                normalized.startsWith('/login') ||
                normalized.startsWith('/blog')
            );
        },
    },
    {
        host: /^(www\.)?fresha\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return (
                normalized === '' ||
                normalized === '/for-business' ||
                normalized.startsWith('/pricing') ||
                normalized.startsWith('/features') ||
                normalized.startsWith('/signup')
            );
        },
    },
    {
        host: /^(www\.)?(get\.)?joinblvd\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return (
                normalized === '' ||
                normalized.startsWith('/features') ||
                normalized.startsWith('/pricing') ||
                normalized.startsWith('/integrations') ||
                normalized.startsWith('/professionals') ||
                normalized.startsWith('/salons')
            );
        },
    },
    {
        host: /^(www\.)?mangomint\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return (
                normalized === '' ||
                normalized.startsWith('/pricing') ||
                normalized.startsWith('/features')
            );
        },
    },
    {
        host: /^(www\.)?calendly\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return (
                normalized === '' ||
                normalized.startsWith('/pricing') ||
                normalized.startsWith('/features') ||
                normalized.startsWith('/blog') ||
                normalized.startsWith('/signup')
            );
        },
    },
    /* NEW ── Zenoti corporate site */
    {
        host: /^(www\.)?zenoti\.com$/i,
        pathIsMarketing: (path) => {
            const normalized = path.replace(/\/+$/, '').toLowerCase();
            return (
                normalized === '' ||
                normalized.startsWith('/pricing') ||
                normalized.startsWith('/features') ||
                normalized.startsWith('/solutions') ||
                normalized.startsWith('/demo') ||
                normalized.startsWith('/signup') ||
                normalized.startsWith('/platform')
            );
        },
    },
];

function isVendorMarketingPage(url: string): boolean {
    try {
        const parsed = new URL(url);
        for (const vendor of VENDOR_MARKETING_PATTERNS) {
            if (vendor.host.test(parsed.hostname) && vendor.pathIsMarketing(parsed.pathname)) {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

/* ══════════════════════════════════════════════════════════════
 *  Vendor-policy helpers
 *
 *  CHANGED: added /zenoti/i to the gated-vendor list.
 *  Zenoti's consumer-facing webstore always presents a
 *  login / create-account modal before the service menu.
 * ══════════════════════════════════════════════════════════════ */

function asStrings(value: string | string[] | undefined | null): string[] {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
}

const ACCOUNT_GATED_VENDOR_PATTERNS: RegExp[] = [
    /vagaro/i,
    /booker/i,
    /mindbody/i,
    /zenoti/i,          /* ← NEW */
];

function vendorRequiresAccountForOnlineBooking({
    vendor,
    snapshot,
    visitedUrls,
}: {
    vendor?: { name?: string | null; match?: string | null };
    snapshot: {
        vendor?: { name?: string | null; match?: string | null };
        aggregate?: {
            schedulerSignals?: string[];
            loginSignals?: string[];
        };
    };
    visitedUrls?: string[];
}): boolean {
    const haystack = [
        ...asStrings(vendor?.name),
        ...asStrings(vendor?.match),
        ...asStrings(snapshot?.vendor?.name),
        ...asStrings(snapshot?.vendor?.match),
        ...asStrings(visitedUrls),
        ...asStrings(snapshot?.aggregate?.schedulerSignals),
        ...asStrings(snapshot?.aggregate?.loginSignals),
    ]
        .join(' ')
        .toLowerCase();

    return ACCOUNT_GATED_VENDOR_PATTERNS.some((re) => re.test(haystack));
}

/* ══════════════════════════════════════════════════════════════
 *  NEW — Fallback vendor detection from visited / iframe URLs
 * ══════════════════════════════════════════════════════════════ */

const VENDOR_URL_DETECTION_PATTERNS: { pattern: RegExp; name: string }[] = [
    { pattern: /zenoti\.com/i,                                name: 'Zenoti' },
    { pattern: /vagaro\.com/i,                                name: 'Vagaro' },
    { pattern: /mindbodyonline\.com|healcode/i,               name: 'mindbody' },
    { pattern: /go\.booker\.com/i,                            name: 'Booker' },
    { pattern: /fresha\.com/i,                                name: 'Fresha' },
    { pattern: /glossgenius\.com/i,                           name: 'GlossGenius' },
    { pattern: /joinblvd\.com|boulevard\.io/i,                name: 'Boulevard' },
    { pattern: /acuityscheduling\.com/i,                      name: 'Acuity' },
    { pattern: /calendly\.com/i,                              name: 'Calendly' },
    { pattern: /square\.site|squareup\.com\/appointments/i,   name: 'Square' },
    { pattern: /mangomint\.com/i,                             name: 'Mangomint' },
    { pattern: /booksy\.com/i,                                name: 'Booksy' },
    { pattern: /phorest\.com/i,                               name: 'Phorest' },
    { pattern: /gettimely\.com/i,                             name: 'Timely' },
    { pattern: /setmore\.com/i,                               name: 'Setmore' },
    { pattern: /simplybook\.me/i,                             name: 'SimplyBook' },
    { pattern: /appointy\.com/i,                              name: 'Appointy' },
    { pattern: /leadconnectorhq\.com\/widget\/booking\//i,    name: 'GoHighLevel' },
];

function detectVendorFromVisitedUrls(urls: string[]): { name: string; match: string } | null {
    for (const url of urls) {
        for (const { pattern, name } of VENDOR_URL_DETECTION_PATTERNS) {
            if (pattern.test(url)) {
                return { name, match: url };
            }
        }
    }
    return null;
}

/**
 * Merge multiple vendor-detection results, returning the first
 * one that carries an actual name.
 */
function resolveVendor(
    ...candidates: Array<{ name?: string | null; match?: string | null } | null | undefined>
): { name: string | null; match: string | null } {
    for (const c of candidates) {
        if (c?.name) return { name: c.name, match: c.match ?? null };
    }
    return { name: null, match: null };
}

/* ══════════════════════════════════════════════════════════════
 *  NEW — Known vendor login-gate URL patterns
 * ══════════════════════════════════════════════════════════════ */

const VENDOR_LOGIN_GATE_URL_PATTERNS: RegExp[] = [
    /zenoti\.com\/(webstoreNew|webstore)\b/i,
];

function visitedUrlsShowVendorLoginGate(urls: string[]): boolean {
    return urls.some((url) =>
        VENDOR_LOGIN_GATE_URL_PATTERNS.some((re) => re.test(url)),
    );
}

/* ──────────────────────────────────────────────
 *  Shopify background-auth noise detection
 * ────────────────────────────────────────────── */

const SHOPIFY_AUTH_URL_PATTERNS: RegExp[] = [
    /\/services\/login_with_shop\b/i,
    /pay\.shopify\.com\/pay\//i,
];

const SHOPIFY_NOISE_URL_PATTERNS: RegExp[] = [
    ...SHOPIFY_AUTH_URL_PATTERNS,
    /\/web-pixels@.*\/sandbox\//i,
];

const SHOPIFY_AMBIENT_LOGIN_SIGNALS = new Set([
    'log in',
    'login',
    'sign in',
    'signin',
    'email input',
    'auth url',
]);

function hasShopifyAuthNoise(visitedUrls: string[]): boolean {
    return visitedUrls.some((url) =>
        SHOPIFY_AUTH_URL_PATTERNS.some((re) => re.test(url)),
    );
}

function isShopifyInfraUrl(url: string): boolean {
    return SHOPIFY_NOISE_URL_PATTERNS.some((re) => re.test(url));
}

function hasOnlyShopifyAmbientAuth(
    visitedUrls: string[],
    loginSignals: string[],
): boolean {
    if (!hasShopifyAuthNoise(visitedUrls)) return false;

    const authLikeUrls = visitedUrls.filter((u) =>
        /login|auth|sign.?in|account|callback|pay\.shopify/i.test(u),
    );
    if (authLikeUrls.length > 0 && !authLikeUrls.every((u) => isShopifyInfraUrl(u))) {
        return false;
    }

    const realSignals = loginSignals.filter(
        (s) => !SHOPIFY_AMBIENT_LOGIN_SIGNALS.has(s.toLowerCase().trim()),
    );
    return realSignals.length === 0;
}

async function cleanShopifyAuthArtifacts(page: any): Promise<void> {
    await page
        .evaluate(() => {
            for (const iframe of document.querySelectorAll('iframe')) {
                const src = (iframe.src || '').toLowerCase();
                if (
                    src.includes('/services/login_with_shop') ||
                    src.includes('pay.shopify.com') ||
                    src.includes('shopify.com/authentication') ||
                    /\/web-pixels@.*\/sandbox\//.test(src)
                ) {
                    iframe.remove();
                }
            }
        })
        .catch(() => {});

    try {
        const pages = page.context().pages();
        for (const p of pages) {
            if (p === page) continue;
            const url = p.url();
            if (SHOPIFY_NOISE_URL_PATTERNS.some((re) => re.test(url))) {
                await p.close().catch(() => {});
            }
        }
    } catch {
        /* context.pages() may not be available in every setup */
    }
}

/* ──────────────────────────────────────────────
 *  Combined ambient-platform-auth detection
 * ────────────────────────────────────────────── */

function isAmbientPlatformAuth(
    visitedUrls: string[],
    loginSignals: string[],
): boolean {
    return hasOnlyShopifyAmbientAuth(visitedUrls, loginSignals);
}

/* ══════════════════════════════════════════════════════════════
 *  Visited-URL live-scheduler evidence
 * ══════════════════════════════════════════════════════════════ */

const LIVE_SCHEDULER_URL_PATTERNS: RegExp[] = [
    /* Booker / Mindbody */
    /go\.booker\.com\/location\/[^/]+\/service-menu\b/i,
    /go\.booker\.com\/location\/[^/]+\/detail-summary\b/i,
    /go\.booker\.com\/location\/[^/]+\/date-time\b/i,
    /go\.booker\.com\/location\/[^/]+\/staff\b/i,
    /clients\.mindbodyonline\.com/i,
    /widgets\.mindbodyonline\.com/i,
    /* Acuity Scheduling (Squarespace) */
    /acuityscheduling\.com\/schedule/i,
    /app\.acuityscheduling\.com/i,
    /embed\.acuityscheduling\.com/i,
    /* Calendly */
    /calendly\.com\/[^/?]+\/[^/?]+/i,
    /* Vagaro (business booking page, not marketing root) */
    /www\.vagaro\.com\/[^/]+\/book-now/i,
    /* Boulevard */
    /dashboard\.boulevard\.io\/booking\//i,
    /booking\.joinblvd\.com/i,
    /* GlossGenius */
    /book\.glossgenius\.com/i,
    /* Fresha */
    /fresha\.com\/book-now\//i,
    /widget\.fresha\.com/i,
    /* Mangomint */
    /book\.mangomint\.com/i,
    /* Phorest */
    /phorest\.com\/book\//i,
    /* Zenoti — webstore is a real scheduler, just login-gated */
    /zenoti\.com\/(webstoreNew|webstore)\b/i,
    /* Booksy */
    /booksy\.com\/en-[a-z]{2}\/[^/]+\/[^/]+\/\d+/i,
    /* Setmore */
    /my\.setmore\.com/i,
    /* SimplyBook.me */
    /simplybook\.me\/v2/i,
    /* Appointy */
    /book\.appointy\.com/i,
    /* Timely */
    /book\.gettimely\.com/i,
    /* Square Appointments */
    /squareup\.com\/appointments\/buyer/i,
    /square\.site\/book\//i,
    /* GoHighLevel / LeadConnector */
    /leadconnectorhq\.com\/widget\/booking\//i,
];

function visitedUrlsShowLiveScheduler(visitedUrls: string[]): boolean {
    return visitedUrls.some((url) =>
        LIVE_SCHEDULER_URL_PATTERNS.some((re) => re.test(url)),
    );
}

/* ══════════════════════════════════════════════════════════════
 *  Contact-form vendor iframe detection
 * ══════════════════════════════════════════════════════════════ */

const CONTACT_FORM_VENDOR_URL_PATTERNS: RegExp[] = [
    /* JotForm */
    /form\.jotform\.com/i,
    /submit\.jotform\.com/i,
    /jotform\.com\/form\//i,
    /* Typeform */
    /typeform\.com\/to\//i,
    /* Wufoo */
    /\.wufoo\.com\/forms\//i,
    /* Google Forms */
    /docs\.google\.com\/forms/i,
    /forms\.gle\//i,
    /* Cognito Forms */
    /cognitoforms\.com\//i,
    /* Paperform */
    /paperform\.co\//i,
    /* Formstack */
    /formstack\.com\/forms\//i,
    /* Microsoft Forms */
    /forms\.office\.com/i,
    /* Airtable shared forms */
    /airtable\.com\/shr/i,
    /* Tally */
    /tally\.so\//i,
    /* 123FormBuilder */
    /123formbuilder\.com\/form/i,
    /* GoHighLevel / LeadConnector — lead-capture forms */
    /leadconnectorhq\.com\/widget\/form\//i,
];

function urlsContainContactFormVendor(urls: string[]): boolean {
    return urls.some((url) =>
        CONTACT_FORM_VENDOR_URL_PATTERNS.some((re) => re.test(url)),
    );
}

/* ──────────────────────────────────────────────
 *  Iframe URL enumeration
 * ────────────────────────────────────────────── */

async function collectIframeUrls(page: any): Promise<string[]> {
    try {
        const frames = page.frames();
        const urls: string[] = [];
        for (const frame of frames) {
            try {
                const url = frame.url();
                if (url && url !== 'about:blank' && url !== '' && url !== 'about:srcdoc') {
                    urls.push(url);
                }
            } catch {
                /* frame may have been detached — skip it */
            }
        }
        return urls;
    } catch {
        return [];
    }
}

async function collectAndRecordIframeUrls(page: any, visitedUrls: string[]): Promise<void> {
    const iframeUrls = await collectIframeUrls(page);
    for (const url of iframeUrls) {
        if (!visitedUrls.includes(url)) {
            visitedUrls.push(url);
        }
    }
}

/* ──────────────────────────────────────────────
 *  Weak scheduler signal detection
 * ────────────────────────────────────────────── */

const WEAK_SCHEDULER_SIGNAL_PATTERNS: RegExp[] = [
    /^priced\s+services?$/i,
    /^service\s+list\s+detected$/i,
    /^consultation\s+field$/i,
    /^single\s+appointment\s+keyword$/i,
    /^service\s+menu$/i,
    /^service\s+names?$/i,
    /^price\s+list$/i,
];

function hasOnlyWeakSchedulerSignals(signals: string[]): boolean {
    if (signals.length === 0) return false;
    return signals.every((s) =>
        WEAK_SCHEDULER_SIGNAL_PATTERNS.some((re) => re.test(s.trim())),
    );
}

/* ──────────────────────────────────────────────
 *  Medical / consultation intake form detection
 * ────────────────────────────────────────────── */

const MEDICAL_INTAKE_PATTERNS: RegExp[] = [
    /\bmedical\s+(history|problems?|conditions?|records?)\b/i,
    /\bpast\s+(and\s+)?ongoing\s+medical\b/i,
    /\ballerg(y|ies)\s*(to\s+medications?)?\b/i,
    /\bcurrent\s+medications?\b/i,
    /\bhealth\s+(history|questionnaire|intake|information)\b/i,
    /\bpatient\s+(intake|information|history|form)\b/i,
    /\bmedical\s+intake\b/i,
    /\bblood\s+(type|pressure)\b/i,
    /\bemergency\s+contact\b/i,
    /\binsurance\s+(provider|information|carrier|company)\b/i,
    /\bprimary\s+care\s+(physician|doctor|provider)\b/i,
    /\bpre-?op(erative)?\s+(instructions?|form)\b/i,
];

function hasMedicalIntakeEvidence(snapshot: BookingSnapshot): boolean {
    const allText = snapshot.scans
        .map((s) => `${s.bodyText ?? ''} ${s.combinedText ?? ''}`)
        .join(' ');

    let matchCount = 0;
    for (const pattern of MEDICAL_INTAKE_PATTERNS) {
        if (pattern.test(allText)) {
            matchCount++;
            if (matchCount >= 2) return true;
        }
    }
    return false;
}

/* ──────────────────────────────────────────────
 *  Healcode / Mindbody custom-element detection
 * ────────────────────────────────────────────── */

async function detectHealcodeWidget(page: any): Promise<boolean> {
    try {
        return await page.evaluate(() => {
            return (
                document.querySelectorAll('healcode-widget').length > 0 ||
                !!document.querySelector('script[src*="widgets.mindbodyonline.com"]') ||
                !!document.querySelector('script[src*="healcode.js"]')
            );
        });
    } catch {
        return false;
    }
}

/* ──────────────────────────────────────────────
 *  Contact-form-only detection (enhanced)
 * ────────────────────────────────────────────── */

interface ContactFormOpts {
    tolerateWeakSchedulerSignals?: boolean;
    visitedUrls?: string[];
}

function isContactFormOnlySite(
    snapshot: BookingSnapshot,
    opts?: ContactFormOpts,
): boolean {
    if (opts?.visitedUrls && visitedUrlsShowLiveScheduler(opts.visitedUrls)) {
        return false;
    }

    const schedulerSignals = snapshot.aggregate.schedulerSignals;

    if (schedulerSignals.length > 0) {
        if (
            opts?.tolerateWeakSchedulerSignals &&
            hasOnlyWeakSchedulerSignals(schedulerSignals)
        ) {
            /* Weak signals only — continue evaluating contact-form evidence */
        } else {
            return false;
        }
    }

    const allText = snapshot.scans
        .map((s) => `${s.bodyText ?? ''} ${s.combinedText ?? ''}`)
        .join(' ');

    const allItems = snapshot.scans.flatMap((s) => s.interactiveItems ?? []);

    const hasPhone = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(allText);

    const hasTelOrMailto = allItems.some((i) => {
        const href = (i.href ?? '').toLowerCase();
        return href.startsWith('tel:') || href.startsWith('mailto:');
    });

    const contactLanguagePatterns = [
        /call\s+(us|now|today)/i,
        /call\s+to\s+(book|schedule|make|reserve)/i,
        /contact\s+us\s+(to|for)/i,
        /get\s+in\s+touch/i,
        /request\s+(an?\s+)?appointment/i,
        /reach\s+out/i,
        /book\s+(an?\s+)?appointment\s+today/i,
    ];
    const hasContactLanguage = contactLanguagePatterns.some((p) => p.test(allText));

    const hasContactCTA = allItems.some((i) => {
        const text = (i.text ?? '').toLowerCase();
        return (
            /\bcall\s*(us|now)?\b/.test(text) ||
            /\bcontact\s*(us)?\b/.test(text) ||
            /\bget\s+(in\s+touch|started)\b/.test(text) ||
            /\breach\s+out\b/.test(text)
        );
    });

    const hasGeneralContactSignals = snapshot.aggregate.generalContactSignals.length > 0;

    const hasFormVendorIframe =
        opts?.visitedUrls != null && urlsContainContactFormVendor(opts.visitedUrls);

    const hasMedicalIntake = hasMedicalIntakeEvidence(snapshot);

    const evidenceCount = [
        hasPhone,
        hasTelOrMailto,
        hasContactLanguage,
        hasContactCTA,
        hasGeneralContactSignals,
        hasFormVendorIframe,
        hasMedicalIntake,
    ].filter(Boolean).length;

    const threshold = (hasFormVendorIframe || hasMedicalIntake) ? 1 : 2;

    return evidenceCount >= threshold;
}

function gatherContactOnlySignals(
    snapshot: BookingSnapshot,
    opts?: ContactFormOpts,
): string[] {
    const signals: string[] = [];

    const allText = snapshot.scans
        .map((s) => `${s.bodyText ?? ''} ${s.combinedText ?? ''}`)
        .join(' ');

    const allItems = snapshot.scans.flatMap((s) => s.interactiveItems ?? []);

    if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(allText)) {
        signals.push('phone-number-on-page');
    }

    if (allItems.some((i) => (i.href ?? '').toLowerCase().startsWith('tel:'))) {
        signals.push('tel-link');
    }

    if (allItems.some((i) => (i.href ?? '').toLowerCase().startsWith('mailto:'))) {
        signals.push('mailto-link');
    }

    const ctaLabels = new Set<string>();
    for (const item of allItems) {
        const text = (item.text ?? '').toLowerCase().trim();
        if (/\bcall\b|\bcontact\b|\bget\s+(in\s+touch|started)\b|\breach\s+out\b/.test(text)) {
            ctaLabels.add(`contact-cta: ${item.text?.trim()}`);
        }
    }
    signals.push(...ctaLabels);

    const languageChecks: [RegExp, string][] = [
        [/call\s+(us|now|today)/i, 'call-us-language'],
        [/contact\s+us/i, 'contact-us-language'],
        [/get\s+in\s+touch/i, 'get-in-touch-language'],
        [/request\s+(an?\s+)?appointment/i, 'request-appointment-language'],
    ];
    for (const [pattern, label] of languageChecks) {
        if (pattern.test(allText)) {
            signals.push(label);
        }
    }

    if (opts?.visitedUrls && urlsContainContactFormVendor(opts.visitedUrls)) {
        const matchedUrl = opts.visitedUrls.find((url) =>
            CONTACT_FORM_VENDOR_URL_PATTERNS.some((re) => re.test(url)),
        );
        signals.push(`form-vendor-iframe: ${matchedUrl ?? 'detected'}`);
    }

    if (hasMedicalIntakeEvidence(snapshot)) {
        signals.push('medical-intake-form-detected');
    }

    return signals;
}

function contactFormOpts(visitedUrls: string[]): ContactFormOpts {
    return { tolerateWeakSchedulerSignals: true, visitedUrls };
}

/* ══════════════════════════════════════════════════════════════
 *  Helper to build a forced-account-creation result
 * ══════════════════════════════════════════════════════════════ */

function buildGatedVendorResult(args: {
    requestUrl: string;
    finalUrl: string;
    vendor: { name?: string | null; match?: string | null };
    clickedText: string | null;
    confidence: number;
    reason: string;
    visitedUrls: string[];
    snapshot: BookingSnapshot;
    filledFields: string[];
}): ClassificationResult {
    return {
        url: args.requestUrl,
        finalUrl: args.finalUrl,
        bookingVendor: args.vendor.name ?? null,
        forcedAccountCreation: true,
        contactFormOnlyBooking: false,
        needsManualReview: false,
        clickedText: args.clickedText,
        confidence: args.confidence,
        reason: args.reason,
        evidence: {
            visitedUrls: args.visitedUrls,
            vendorMatch: args.vendor.match ?? null,
            loginSignals: args.snapshot.aggregate?.loginSignals ?? [],
            appointmentSignals: args.snapshot.aggregate?.appointmentSignals ?? [],
            generalContactSignals: args.snapshot.aggregate?.generalContactSignals ?? [],
            schedulerSignals: args.snapshot.aggregate?.schedulerSignals ?? [],
            bookingFlowSignals: [],
            filledFields: args.filledFields,
        },
    };
}

/* ──────────────────────────────────────────────
 *  Flow advance helpers
 * ────────────────────────────────────────────── */

async function tryAdvanceBookingFlow(args: {
    page: any;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    strategy: Strategy;
    log: any;
}): Promise<ActionAttempt> {
    const { page, snapshot, attemptedActions, strategy, log } = args;

    switch (snapshot.dominant.state) {
        case 'service_list': {
            const action = await clickServiceChoice({ page, snapshot, attemptedActions, strategy, log });
            if (action.acted) return action;

            const continueAction = await clickSafeContinue({ page, snapshot, attemptedActions, strategy, log });
            if (continueAction.acted) return continueAction;
            break;
        }

        case 'date_picker': {
            const action = await clickDateChoice({ page, snapshot, attemptedActions, strategy, log });
            if (action.acted) return action;

            const continueAction = await clickSafeContinue({ page, snapshot, attemptedActions, strategy, log });
            if (continueAction.acted) return continueAction;
            break;
        }

        case 'time_picker': {
            const action = await clickTimeChoice({ page, snapshot, attemptedActions, strategy, log });
            if (action.acted) return action;

            const continueAction = await clickSafeContinue({ page, snapshot, attemptedActions, strategy, log });
            if (continueAction.acted) return continueAction;
            break;
        }

        case 'contact_form':
        case 'landing': {
            const byService = await clickServiceChoice({ page, snapshot, attemptedActions, strategy, log });
            if (byService.acted) return byService;

            const byDate = await clickDateChoice({ page, snapshot, attemptedActions, strategy, log });
            if (byDate.acted) return byDate;

            const byTime = await clickTimeChoice({ page, snapshot, attemptedActions, strategy, log });
            if (byTime.acted) return byTime;

            const byContinue = await clickSafeContinue({ page, snapshot, attemptedActions, strategy, log });
            if (byContinue.acted) return byContinue;
            break;
        }

        case 'unknown': {
            const byService = await clickServiceChoice({ page, snapshot, attemptedActions, strategy, log });
            if (byService.acted) return byService;

            const byDate = await clickDateChoice({ page, snapshot, attemptedActions, strategy, log });
            if (byDate.acted) return byDate;

            const byTime = await clickTimeChoice({ page, snapshot, attemptedActions, strategy, log });
            if (byTime.acted) return byTime;

            const byContinue = await clickSafeContinue({ page, snapshot, attemptedActions, strategy, log });
            if (byContinue.acted) return byContinue;
            break;
        }

        default:
            break;
    }

    if (strategy !== 'fast') {
        const adapterResult = await runVendorAdapter({ page, snapshot, attemptedActions, strategy, log });
        if (adapterResult?.acted) return adapterResult;
    }

    return { acted: false, page, snapshot, clickedText: null };
}

async function advanceBookingFlow(args: {
    page: any;
    visitedUrls: string[];
    strategy: Strategy;
    log: any;
    startedAt: number;
}): Promise<FlowAdvanceResult> {
    const { page, visitedUrls, strategy, log, startedAt } = args;
    const attemptedActions = new Set<string>();
    const filledFields: string[] = [];
    let activePage = page;
    let snapshot = await buildSnapshot(activePage);

    recordSnapshotUrls(visitedUrls, snapshot);
    await collectAndRecordIframeUrls(activePage, visitedUrls);

    let platformAmbientConfirmed = false;

    for (let step = 0; step < MAX_STEPS_BY_STRATEGY[strategy]; step++) {
        if (isOutOfTime(startedAt)) {
            return {
                activePage,
                stopReason: 'stalled',
                snapshot,
                filledFields: unique(filledFields),
            };
        }

        /* ── Vendor-marketing-page guard ── */
        const currentUrl = activePage.url();
        if (isVendorMarketingPage(currentUrl)) {
            log.warning('Landed on vendor marketing page — stopping flow', { currentUrl });
            return {
                activePage,
                stopReason: 'vendor_marketing',
                snapshot,
                filledFields: unique(filledFields),
            };
        }

        await dismissCommonPopups(activePage);

        snapshot = await buildSnapshot(activePage);
        recordSnapshotUrls(visitedUrls, snapshot);
        await collectAndRecordIframeUrls(activePage, visitedUrls);

        /* ── Terminal states: stop immediately ── */

        if (snapshot.dominant.state === 'login_gate' && !platformAmbientConfirmed) {
            const guestContinue = await clickSafeContinue({
                page: activePage,
                snapshot,
                attemptedActions,
                strategy,
                log,
            });

            if (guestContinue.acted) {
                activePage = guestContinue.page;
                snapshot = guestContinue.snapshot;
                recordSnapshotUrls(visitedUrls, snapshot);
                continue;
            }

            if (hasShopifyAuthNoise(visitedUrls)) {
                log.info('Login-gate in flow loop likely caused by Shopify background auth — cleaning up');
                await cleanShopifyAuthArtifacts(activePage);
                snapshot = await buildSnapshot(activePage);
                recordSnapshotUrls(visitedUrls, snapshot);

                if (snapshot.dominant.state === 'login_gate') {
                    if (isAmbientPlatformAuth(visitedUrls, snapshot.aggregate.loginSignals)) {
                        log.info(
                            'Login-gate in flow loop is only ambient platform noise — skipping',
                            { signals: snapshot.aggregate.loginSignals },
                        );
                        platformAmbientConfirmed = true;
                        continue;
                    }
                    return {
                        activePage,
                        stopReason: 'login',
                        snapshot,
                        filledFields: unique(filledFields),
                    };
                }
                continue;
            }

            if (isAmbientPlatformAuth(visitedUrls, snapshot.aggregate.loginSignals)) {
                log.info(
                    'Login-gate signals are ambient platform checkout noise — skipping',
                    { signals: snapshot.aggregate.loginSignals },
                );
                platformAmbientConfirmed = true;
                continue;
            }

            return {
                activePage,
                stopReason: 'login',
                snapshot,
                filledFields: unique(filledFields),
            };
        }

        if (snapshot.dominant.state === 'payment') {
            return {
                activePage,
                stopReason: 'payment',
                snapshot,
                filledFields: unique(filledFields),
            };
        }

        if (snapshot.dominant.state === 'review') {
            return {
                activePage,
                stopReason: 'review',
                snapshot,
                filledFields: unique(filledFields),
            };
        }

        /* ── Non-terminal states: try to advance ── */

        if (snapshot.dominant.state !== 'contact_form') {
            const newlyFilled = await fillLowRiskFields(snapshot.dominant.surface.root);
            filledFields.push(...newlyFilled);

            snapshot = await buildSnapshot(activePage);
            recordSnapshotUrls(visitedUrls, snapshot);

            if (snapshot.dominant.state === 'login_gate' && !platformAmbientConfirmed) {
                const guestContinue = await clickSafeContinue({
                    page: activePage,
                    snapshot,
                    attemptedActions,
                    strategy,
                    log,
                });

                if (guestContinue.acted) {
                    activePage = guestContinue.page;
                    snapshot = guestContinue.snapshot;
                    recordSnapshotUrls(visitedUrls, snapshot);
                    continue;
                }

                if (hasShopifyAuthNoise(visitedUrls)) {
                    log.info('Login-gate after field fill likely caused by Shopify background auth — cleaning up');
                    await cleanShopifyAuthArtifacts(activePage);
                    snapshot = await buildSnapshot(activePage);
                    recordSnapshotUrls(visitedUrls, snapshot);

                    if (snapshot.dominant.state === 'login_gate') {
                        if (isAmbientPlatformAuth(visitedUrls, snapshot.aggregate.loginSignals)) {
                            log.info(
                                'Login-gate after fill is only ambient platform noise — skipping',
                                { signals: snapshot.aggregate.loginSignals },
                            );
                            platformAmbientConfirmed = true;
                            continue;
                        }
                        return {
                            activePage,
                            stopReason: 'login',
                            snapshot,
                            filledFields: unique(filledFields),
                        };
                    }
                    continue;
                }

                if (isAmbientPlatformAuth(visitedUrls, snapshot.aggregate.loginSignals)) {
                    log.info(
                        'Login-gate after fill is ambient platform checkout noise — skipping',
                        { signals: snapshot.aggregate.loginSignals },
                    );
                    platformAmbientConfirmed = true;
                    continue;
                }

                return {
                    activePage,
                    stopReason: 'login',
                    snapshot,
                    filledFields: unique(filledFields),
                };
            }

            if (snapshot.dominant.state === 'payment') {
                return {
                    activePage,
                    stopReason: 'payment',
                    snapshot,
                    filledFields: unique(filledFields),
                };
            }

            if (snapshot.dominant.state === 'review') {
                return {
                    activePage,
                    stopReason: 'review',
                    snapshot,
                    filledFields: unique(filledFields),
                };
            }
        }

        /* ── Try scheduler-specific actions first ── */

        const action = await tryAdvanceBookingFlow({
            page: activePage,
            snapshot,
            attemptedActions,
            strategy,
            log,
        });

        if (action.acted) {
            const postActionUrl = action.page.url();
            if (isVendorMarketingPage(postActionUrl)) {
                log.warning('Action navigated to vendor marketing page — stopping flow', {
                    postActionUrl,
                    clickedText: action.clickedText,
                });
                return {
                    activePage: action.page,
                    stopReason: 'vendor_marketing',
                    snapshot: action.snapshot,
                    filledFields: unique(filledFields),
                };
            }

            activePage = action.page;
            snapshot = action.snapshot;
            recordSnapshotUrls(visitedUrls, snapshot);
            continue;
        }

        /* ── Fallback: try clickBookingEntry for intermediate pages ── */

        const fallbackEligible =
            ENTRY_FALLBACK_STATES.has(snapshot.dominant.state) ||
            (platformAmbientConfirmed && snapshot.dominant.state === 'login_gate');

        if (fallbackEligible) {
            let fallbackPopup: any = null;
            const onPopup = (p: any) => { fallbackPopup = p; };
            activePage.context().on('page', onPopup);

            const entryFallback = await clickBookingEntry(
                activePage,
                strategy,
                attemptedActions,
                log,
            );

            await activePage.waitForTimeout(2000);
            activePage.context().off('page', onPopup);

            if (fallbackPopup) {
                log.info('Booking-entry fallback opened a new tab — switching to popup', {
                    popupUrl: fallbackPopup.url(),
                });
                await fallbackPopup
                    .waitForLoadState('domcontentloaded', { timeout: 10000 })
                    .catch(() => {});
                await fallbackPopup.waitForTimeout(1500);
                await dismissCommonPopups(fallbackPopup);
            }

            const fallbackActed = entryFallback.acted || !!fallbackPopup;

            if (fallbackActed) {
                const candidatePage = fallbackPopup ?? entryFallback.page;
                const candidateUrl = candidatePage.url();

                if (isVendorMarketingPage(candidateUrl)) {
                    log.warning('Booking-entry fallback navigated to vendor marketing page — stopping flow', {
                        candidateUrl,
                        clickedText: entryFallback.clickedText,
                    });
                    return {
                        activePage: candidatePage,
                        stopReason: 'vendor_marketing',
                        snapshot,
                        filledFields: unique(filledFields),
                    };
                }

                activePage = candidatePage;
                snapshot = fallbackPopup
                    ? await buildSnapshot(fallbackPopup)
                    : entryFallback.snapshot;
                recordSnapshotUrls(visitedUrls, snapshot);
                await collectAndRecordIframeUrls(activePage, visitedUrls);
                continue;
            }
        }

        /* Nothing worked — report final state. */

        return {
            activePage,
            stopReason: snapshot.dominant.state === 'contact_form' ? 'contact_form' : 'stalled',
            snapshot,
            filledFields: unique(filledFields),
        };
    }

    return {
        activePage,
        stopReason: 'maxSteps',
        snapshot,
        filledFields: unique(filledFields),
    };
}

async function maybeRetryOrPush(args: {
    request: any;
    pushData: any;
    result: ClassificationResult;
}): Promise<void> {
    const { request, pushData, result } = args;
    const retryCount = request.retryCount ?? 0;

    if (result.needsManualReview && retryCount < MAX_RETRY_ESCALATION) {
        throw new Error(`Ambiguous booking flow; escalating retry. Reason: ${result.reason}`);
    }

    await pushData(result);
}

/* ══════════════════════════════════════════════════════════════
 *  Main request handler
 * ══════════════════════════════════════════════════════════════ */

router.addDefaultHandler(async ({ request, page, log, pushData }) => {
    const startedAt = Date.now();
    const strategy = getStrategy(request.retryCount ?? 0);

    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    await dismissCommonPopups(page);

    const visitedUrls: string[] = [page.url()];
    await collectAndRecordIframeUrls(page, visitedUrls);
    let clickedText: string | null = null;

    log.info('Starting booking-flow classification', {
        url: request.url,
        currentUrl: page.url(),
        strategy,
        retryCount: request.retryCount ?? 0,
    });

    let firstVendor = await detectVendor(page);

    /* ── Healcode / Mindbody widget fallback detection ── */
    if (!firstVendor.name) {
        const hasHealcode = await detectHealcodeWidget(page);
        if (hasHealcode) {
            firstVendor = { name: 'mindbody', match: 'healcode-widget element or script detected on page' };
            log.info('Detected Mindbody/Healcode widget on the page', { match: firstVendor.match });
        }
    }

    /* URL-based vendor fallback */
    if (!firstVendor.name) {
        const urlVendor = detectVendorFromVisitedUrls(visitedUrls);
        if (urlVendor) {
            firstVendor = urlVendor;
            log.info('Detected vendor from visited/iframe URLs', { vendor: urlVendor.name, match: urlVendor.match });
        }
    }

    /* ══════════════════════════════════════════════
     *  EARLY EXIT 1: account-gated vendor detected on homepage
     * ══════════════════════════════════════════════ */
    if (vendorRequiresAccountForOnlineBooking({ vendor: firstVendor, snapshot: { vendor: firstVendor }, visitedUrls })) {
        const vendorLabel = firstVendor.name || 'a detected vendor';
        const result: ClassificationResult = {
            url: request.url,
            finalUrl: page.url(),
            bookingVendor: firstVendor.name,
            forcedAccountCreation: true,
            contactFormOnlyBooking: false,
            needsManualReview: false,
            clickedText: null,
            confidence: 0.94,
            reason: `Detected ${vendorLabel} on the homepage. ${vendorLabel} requires customer sign-in to complete online booking (platform-level policy).`,
            evidence: {
                visitedUrls,
                vendorMatch: firstVendor.match,
                loginSignals: [],
                appointmentSignals: [],
                generalContactSignals: [],
                schedulerSignals: [],
                bookingFlowSignals: [],
                filledFields: [],
            },
        };
        await pushData(result);
        return;
    }

    const entryAttempted = new Set<string>();

    /* ── Listen for popups ── */
    let popupPage: any = null;
    const onNewPage = (p: any) => { popupPage = p; };
    page.context().on('page', onNewPage);

    const entry = await clickBookingEntry(page, strategy, entryAttempted, log);

    await page.waitForTimeout(2000);
    page.context().off('page', onNewPage);

    if (popupPage) {
        log.info('Booking entry opened in a new tab — switching to popup', {
            popupUrl: popupPage.url(),
        });
        await popupPage.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        await popupPage.waitForTimeout(1500);
        await dismissCommonPopups(popupPage);
    }

    const entryActed = entry.acted || !!popupPage;

    if (!entryActed) {
        const landingSnapshot = await buildSnapshot(page);
        recordSnapshotUrls(visitedUrls, landingSnapshot);
        await collectAndRecordIframeUrls(page, visitedUrls);

        const effectiveVendor = resolveVendor(
            firstVendor,
            detectVendorFromVisitedUrls(visitedUrls),
            landingSnapshot.vendor,
        );

        if (vendorRequiresAccountForOnlineBooking({
            vendor: effectiveVendor,
            snapshot: landingSnapshot,
            visitedUrls,
        })) {
            const vendorLabel = effectiveVendor.name || 'a detected vendor';
            const result = buildGatedVendorResult({
                requestUrl: request.url,
                finalUrl: page.url(),
                vendor: effectiveVendor,
                clickedText: null,
                confidence: 0.92,
                reason: `No booking entry was found, but detected ${vendorLabel} on the site. ${vendorLabel} requires customer sign-in to complete online booking (platform-level policy).`,
                visitedUrls,
                snapshot: landingSnapshot,
                filledFields: [],
            });
            await pushData(result);
            return;
        }

        if (visitedUrlsShowVendorLoginGate(visitedUrls)) {
            const urlVendor = detectVendorFromVisitedUrls(visitedUrls);
            const vendorLabel = urlVendor?.name ?? effectiveVendor.name ?? 'a detected vendor';
            const result = buildGatedVendorResult({
                requestUrl: request.url,
                finalUrl: page.url(),
                vendor: urlVendor ?? effectiveVendor,
                clickedText: null,
                confidence: 0.93,
                reason: `No booking entry was found, but a vendor webstore login-gate URL was detected in page iframes. ${vendorLabel} requires customer sign-in to complete online booking.`,
                visitedUrls,
                snapshot: landingSnapshot,
                filledFields: [],
            });
            await pushData(result);
            return;
        }

        /* ── Before flagging manual review, check for contact-form-only site ── */
        if (isContactFormOnlySite(landingSnapshot, contactFormOpts(visitedUrls))) {
            const detectedSignals = gatherContactOnlySignals(landingSnapshot, contactFormOpts(visitedUrls));

            const result: ClassificationResult = {
                url: request.url,
                finalUrl: page.url(),
                bookingVendor: effectiveVendor.name,
                forcedAccountCreation: false,
                contactFormOnlyBooking: true,
                needsManualReview: false,
                clickedText: null,
                confidence: 0.82,
                reason: 'No online scheduling system was found. The site relies on phone, contact form, or email for booking.',
                evidence: {
                    visitedUrls,
                    vendorMatch: effectiveVendor.match,
                    loginSignals: [],
                    appointmentSignals: landingSnapshot.aggregate.appointmentSignals,
                    generalContactSignals: unique([
                        ...landingSnapshot.aggregate.generalContactSignals,
                        ...detectedSignals,
                    ]),
                    schedulerSignals: [],
                    bookingFlowSignals: [],
                    filledFields: [],
                },
            };

            await pushData(result);
            return;
        }

        if (urlsContainContactFormVendor(visitedUrls) && !visitedUrlsShowLiveScheduler(visitedUrls)) {
            const detectedSignals = gatherContactOnlySignals(landingSnapshot, contactFormOpts(visitedUrls));

            const result: ClassificationResult = {
                url: request.url,
                finalUrl: page.url(),
                bookingVendor: effectiveVendor.name,
                forcedAccountCreation: false,
                contactFormOnlyBooking: true,
                needsManualReview: false,
                clickedText: null,
                confidence: 0.75,
                reason: 'No booking entry was found. The site embeds a third-party form (not a live scheduler) for collecting client information.',
                evidence: {
                    visitedUrls,
                    vendorMatch: effectiveVendor.match,
                    loginSignals: [],
                    appointmentSignals: landingSnapshot.aggregate.appointmentSignals,
                    generalContactSignals: unique([
                        ...landingSnapshot.aggregate.generalContactSignals,
                        ...detectedSignals,
                    ]),
                    schedulerSignals: [],
                    bookingFlowSignals: [],
                    filledFields: [],
                },
            };

            await pushData(result);
            return;
        }

        const result: ClassificationResult = {
            url: request.url,
            finalUrl: page.url(),
            bookingVendor: effectiveVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: false,
            needsManualReview: true,
            clickedText: null,
            confidence: 0.35,
            reason: 'No clear booking entry was found.',
            evidence: {
                visitedUrls,
                vendorMatch: effectiveVendor.match,
                loginSignals: [],
                appointmentSignals: [],
                generalContactSignals: [],
                schedulerSignals: [],
                bookingFlowSignals: [],
                filledFields: [],
            },
        };

        await maybeRetryOrPush({ request, pushData, result });
        return;
    }

    /* ── Post-entry: build snapshot and detect vendor ── */

    let activePage = popupPage ?? entry.page;
    let snapshot = popupPage
        ? await buildSnapshot(popupPage)
        : entry.snapshot;
    clickedText = entry.clickedText;
    if (popupPage && !clickedText) clickedText = 'BOOK (new tab)';

    recordSnapshotUrls(visitedUrls, snapshot);
    await collectAndRecordIframeUrls(activePage, visitedUrls);

    let immediateVendor = resolveVendor(
        snapshot.vendor,
        firstVendor,
        detectVendorFromVisitedUrls(visitedUrls),
    );

    /* ── Healcode fallback after entry click ── */
    if (!immediateVendor.name) {
        const hasHealcode = await detectHealcodeWidget(activePage);
        if (hasHealcode) {
            immediateVendor = { name: 'mindbody', match: 'healcode-widget element detected after entry click' };
            log.info('Detected Mindbody/Healcode widget after entry click', { match: immediateVendor.match });
        }
    }

    /* ══════════════════════════════════════════════
     *  EARLY EXIT 2: account-gated vendor detected after entry click
     * ══════════════════════════════════════════════ */
    if (vendorRequiresAccountForOnlineBooking({ vendor: immediateVendor, snapshot, visitedUrls })) {
        const vendorLabel = immediateVendor.name || 'a detected vendor';
        const result = buildGatedVendorResult({
            requestUrl: request.url,
            finalUrl: activePage.url(),
            vendor: immediateVendor,
            clickedText,
            confidence: 0.94,
            reason: `Detected ${vendorLabel} after entering the booking flow. ${vendorLabel} requires customer sign-in to complete online booking (platform-level policy).`,
            visitedUrls,
            snapshot,
            filledFields: [],
        });
        await pushData(result);
        return;
    }

    /* URL-based login-gate check after entry click */
    if (visitedUrlsShowVendorLoginGate(visitedUrls)) {
        const urlVendor = detectVendorFromVisitedUrls(visitedUrls);
        const effectiveVendor = resolveVendor(urlVendor, immediateVendor);
        const vendorLabel = effectiveVendor.name ?? 'a detected vendor';
        const result = buildGatedVendorResult({
            requestUrl: request.url,
            finalUrl: activePage.url(),
            vendor: effectiveVendor,
            clickedText,
            confidence: 0.93,
            reason: `After entering the booking flow, a vendor webstore login-gate URL was detected. ${vendorLabel} requires customer sign-in to complete online booking.`,
            visitedUrls,
            snapshot,
            filledFields: [],
        });
        await pushData(result);
        return;
    }

    /* ══════════════════════════════════════════════
     *  Immediate login-gate handling (with Shopify guards)
     * ══════════════════════════════════════════════ */
    if (snapshot.dominant.state === 'login_gate') {
        const immediateGuestAttempt = await clickSafeContinue({
            page: activePage,
            snapshot,
            attemptedActions: new Set<string>(),
            strategy,
            log,
        });

        if (immediateGuestAttempt.acted) {
            activePage = immediateGuestAttempt.page;
            snapshot = immediateGuestAttempt.snapshot;
            recordSnapshotUrls(visitedUrls, snapshot);
        } else if (hasShopifyAuthNoise(visitedUrls)) {
            log.info(
                'Login-gate appears to be Shopify background auth — cleaning artifacts and re-evaluating',
                { activeUrl: activePage.url() },
            );
            await cleanShopifyAuthArtifacts(activePage);
            snapshot = await buildSnapshot(activePage);
            recordSnapshotUrls(visitedUrls, snapshot);

            if (snapshot.dominant.state === 'login_gate') {
                if (isAmbientPlatformAuth(visitedUrls, snapshot.aggregate.loginSignals)) {
                    log.info(
                        'Post-cleanup login_gate is only ambient platform signals — not a real gate, continuing to flow',
                        { signals: snapshot.aggregate.loginSignals },
                    );
                } else {
                    const result: ClassificationResult = {
                        url: request.url,
                        finalUrl: activePage.url(),
                        bookingVendor: immediateVendor.name,
                        forcedAccountCreation: true,
                        contactFormOnlyBooking: false,
                        needsManualReview: false,
                        clickedText,
                        confidence: 0.98,
                        reason: 'Booking flow is blocked by a login or account-creation gate immediately after entry.',
                        evidence: {
                            visitedUrls,
                            vendorMatch: immediateVendor.match,
                            loginSignals: snapshot.aggregate.loginSignals,
                            appointmentSignals: [],
                            generalContactSignals: [],
                            schedulerSignals: snapshot.aggregate.schedulerSignals,
                            bookingFlowSignals: [],
                            filledFields: [],
                        },
                    };

                    await pushData(result);
                    return;
                }
            }
        } else if (isAmbientPlatformAuth(visitedUrls, snapshot.aggregate.loginSignals)) {
            log.info(
                'Login-gate is ambient platform checkout noise — not a real gate, continuing to flow',
                { signals: snapshot.aggregate.loginSignals, activeUrl: activePage.url() },
            );
        } else {
            const result: ClassificationResult = {
                url: request.url,
                finalUrl: activePage.url(),
                bookingVendor: immediateVendor.name,
                forcedAccountCreation: true,
                contactFormOnlyBooking: false,
                needsManualReview: false,
                clickedText,
                confidence: 0.98,
                reason: 'Booking flow is blocked by a login or account-creation gate immediately after entry.',
                evidence: {
                    visitedUrls,
                    vendorMatch: immediateVendor.match,
                    loginSignals: snapshot.aggregate.loginSignals,
                    appointmentSignals: [],
                    generalContactSignals: [],
                    schedulerSignals: snapshot.aggregate.schedulerSignals,
                    bookingFlowSignals: [],
                    filledFields: [],
                },
            };

            await pushData(result);
            return;
        }
    }

    /* ── Run the multi-step booking flow ── */

    const flow = await advanceBookingFlow({
        page: activePage,
        visitedUrls,
        strategy,
        log,
        startedAt,
    });

    activePage = flow.activePage;
    snapshot = flow.snapshot;

    /* Final iframe collection after the flow completes */
    await collectAndRecordIframeUrls(activePage, visitedUrls);

    /* Final vendor resolution from all accumulated evidence */
    const bestVendor = resolveVendor(
        snapshot.vendor,
        immediateVendor,
        detectVendorFromVisitedUrls(visitedUrls),
    );

    /* ── Vendor-marketing bail-out ── */

    if (flow.stopReason === 'vendor_marketing') {
        const vendorOverride = vendorRequiresAccountForOnlineBooking({
            vendor: bestVendor,
            snapshot,
            visitedUrls,
        });

        if (vendorOverride) {
            const vendorLabel = bestVendor.name || 'a detected vendor';
            const result = buildGatedVendorResult({
                requestUrl: request.url,
                finalUrl: activePage.url(),
                vendor: bestVendor,
                clickedText,
                confidence: 0.90,
                reason:
                    `Crawler followed an attribution link to ${vendorLabel}'s marketing site. ${vendorLabel} requires customer sign-in to complete online booking (platform-level policy).`,
                visitedUrls,
                snapshot,
                filledFields: flow.filledFields,
            });
            await pushData(result);
            return;
        }

        const result: ClassificationResult = {
            url: request.url,
            finalUrl: activePage.url(),
            bookingVendor: bestVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: false,
            needsManualReview: true,
            clickedText,
            confidence: 0.40,
            reason:
                'Crawler followed an attribution link to the vendor marketing site instead of the actual booking flow. Could not assess booking friction.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: snapshot.aggregate.loginSignals,
                appointmentSignals: snapshot.aggregate.appointmentSignals,
                generalContactSignals: snapshot.aggregate.generalContactSignals,
                schedulerSignals: snapshot.aggregate.schedulerSignals,
                bookingFlowSignals: [],
                filledFields: flow.filledFields,
            },
        };

        await maybeRetryOrPush({ request, pushData, result });
        return;
    }

    /* ── Explicit login gate detected during flow ── */

    if (flow.stopReason === 'login') {
        if (isAmbientPlatformAuth(visitedUrls, snapshot.aggregate.loginSignals)) {
            log.info(
                'Flow reported login gate, but all auth signals are ambient platform noise — overriding',
                { loginSignals: snapshot.aggregate.loginSignals },
            );

            if (visitedUrlsShowLiveScheduler(visitedUrls)) {
                const result: ClassificationResult = {
                    url: request.url,
                    finalUrl: activePage.url(),
                    bookingVendor: bestVendor.name,
                    forcedAccountCreation: false,
                    contactFormOnlyBooking: false,
                    needsManualReview: false,
                    clickedText,
                    confidence: 0.85,
                    reason:
                        'Reached a live scheduling system. Login-like UI elements (email input, OTP verification) are part of the platform\'s normal checkout flow, not a forced account-creation gate.',
                    evidence: {
                        visitedUrls,
                        vendorMatch: bestVendor.match,
                        loginSignals: snapshot.aggregate.loginSignals,
                        appointmentSignals: snapshot.aggregate.appointmentSignals,
                        generalContactSignals: snapshot.aggregate.generalContactSignals,
                        schedulerSignals: unique([
                            ...snapshot.aggregate.schedulerSignals,
                            'visited-url: live-scheduler-detected',
                        ]),
                        bookingFlowSignals: [],
                        filledFields: flow.filledFields,
                    },
                };
                await pushData(result);
                return;
            }

            if (vendorRequiresAccountForOnlineBooking({ vendor: bestVendor, snapshot, visitedUrls })) {
                const vendorLabel = bestVendor.name || 'a detected vendor';
                const result = buildGatedVendorResult({
                    requestUrl: request.url,
                    finalUrl: activePage.url(),
                    vendor: bestVendor,
                    clickedText,
                    confidence: 0.92,
                    reason: `Flow reported login gate with ambient platform noise. However, ${vendorLabel} was detected and requires customer sign-in to complete online booking (platform-level policy).`,
                    visitedUrls,
                    snapshot,
                    filledFields: flow.filledFields,
                });
                await pushData(result);
                return;
            }

            if (isContactFormOnlySite(snapshot, contactFormOpts(visitedUrls))) {
                const detectedSignals = gatherContactOnlySignals(snapshot, contactFormOpts(visitedUrls));
                const result: ClassificationResult = {
                    url: request.url,
                    finalUrl: activePage.url(),
                    bookingVendor: bestVendor.name,
                    forcedAccountCreation: false,
                    contactFormOnlyBooking: true,
                    needsManualReview: false,
                    clickedText,
                    confidence: 0.80,
                    reason:
                        'No online scheduling system was found. The site relies on phone, contact form, or email for booking. Platform background auth traffic was excluded as noise.',
                    evidence: {
                        visitedUrls,
                        vendorMatch: bestVendor.match,
                        loginSignals: snapshot.aggregate.loginSignals,
                        appointmentSignals: snapshot.aggregate.appointmentSignals,
                        generalContactSignals: unique([
                            ...snapshot.aggregate.generalContactSignals,
                            ...detectedSignals,
                        ]),
                        schedulerSignals: snapshot.aggregate.schedulerSignals,
                        bookingFlowSignals: [],
                        filledFields: flow.filledFields,
                    },
                };
                await pushData(result);
                return;
            }

            const result: ClassificationResult = {
                url: request.url,
                finalUrl: activePage.url(),
                bookingVendor: bestVendor.name,
                forcedAccountCreation: false,
                contactFormOnlyBooking: false,
                needsManualReview: true,
                clickedText,
                confidence: 0.45,
                reason:
                    'Booking path was found, but could not determine the booking method. Platform background auth traffic was excluded as noise.',
                evidence: {
                    visitedUrls,
                    vendorMatch: bestVendor.match,
                    loginSignals: snapshot.aggregate.loginSignals,
                    appointmentSignals: snapshot.aggregate.appointmentSignals,
                    generalContactSignals: snapshot.aggregate.generalContactSignals,
                    schedulerSignals: snapshot.aggregate.schedulerSignals,
                    bookingFlowSignals: [],
                    filledFields: flow.filledFields,
                },
            };
            await maybeRetryOrPush({ request, pushData, result });
            return;
        }

        const result: ClassificationResult = {
            url: request.url,
            finalUrl: activePage.url(),
            bookingVendor: bestVendor.name,
            forcedAccountCreation: true,
            contactFormOnlyBooking: false,
            needsManualReview: false,
            clickedText,
            confidence: 0.96,
            reason: 'Booking flow is blocked by a login or account-creation gate.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: snapshot.aggregate.loginSignals,
                appointmentSignals: [],
                generalContactSignals: [],
                schedulerSignals: snapshot.aggregate.schedulerSignals,
                bookingFlowSignals: [],
                filledFields: flow.filledFields,
            },
        };

        await pushData(result);
        return;
    }

    /* ── Reached payment step without login gate ── */

    if (flow.stopReason === 'payment') {
        const result: ClassificationResult = {
            url: request.url,
            finalUrl: activePage.url(),
            bookingVendor: bestVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: false,
            needsManualReview: false,
            clickedText,
            confidence: 0.9,
            reason: 'Was able to continue booking to the payment step without hitting a forced login or account-creation gate.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: snapshot.aggregate.loginSignals,
                appointmentSignals: snapshot.aggregate.appointmentSignals,
                generalContactSignals: snapshot.aggregate.generalContactSignals,
                schedulerSignals: unique([
                    ...snapshot.aggregate.schedulerSignals,
                    ...withPrefix('payment', snapshot.aggregate.paymentSignals),
                ]),
                bookingFlowSignals: [],
                filledFields: flow.filledFields,
            },
        };

        await pushData(result);
        return;
    }

    /* ── Reached review/confirmation step without login gate ── */

    if (flow.stopReason === 'review') {
        const result: ClassificationResult = {
            url: request.url,
            finalUrl: activePage.url(),
            bookingVendor: bestVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: false,
            needsManualReview: false,
            clickedText,
            confidence: 0.88,
            reason: 'Was able to reach the final review or confirmation step without hitting a forced login or account-creation gate.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: snapshot.aggregate.loginSignals,
                appointmentSignals: snapshot.aggregate.appointmentSignals,
                generalContactSignals: snapshot.aggregate.generalContactSignals,
                schedulerSignals: unique([
                    ...snapshot.aggregate.schedulerSignals,
                    ...withPrefix('review', snapshot.aggregate.terminalSignals),
                ]),
                bookingFlowSignals: [],
                filledFields: flow.filledFields,
            },
        };

        await pushData(result);
        return;
    }

    /* ── Contact / request form only ── */

    if (flow.stopReason === 'contact_form') {
        const vendorOverride = vendorRequiresAccountForOnlineBooking({
            vendor: bestVendor,
            snapshot,
            visitedUrls,
        });

        if (vendorOverride) {
            const vendorLabel = bestVendor.name || 'a detected vendor';
            const result = buildGatedVendorResult({
                requestUrl: request.url,
                finalUrl: activePage.url(),
                vendor: bestVendor,
                clickedText,
                confidence: 0.92,
                reason:
                    `Booking flow landed on ${vendorLabel}'s embedded widget (initially classified as contact form). ${vendorLabel} requires customer sign-in to complete online booking (platform-level policy).`,
                visitedUrls,
                snapshot,
                filledFields: flow.filledFields,
            });
            await pushData(result);
            return;
        }

        if (visitedUrlsShowVendorLoginGate(visitedUrls)) {
            const urlVendor = detectVendorFromVisitedUrls(visitedUrls);
            const effectiveVendor = resolveVendor(urlVendor, bestVendor);
            const vendorLabel = effectiveVendor.name ?? 'a detected vendor';
            const result = buildGatedVendorResult({
                requestUrl: request.url,
                finalUrl: activePage.url(),
                vendor: effectiveVendor,
                clickedText,
                confidence: 0.93,
                reason: `Booking flow was classified as contact-form, but a vendor webstore login-gate URL was detected. ${vendorLabel} requires customer sign-in to complete online booking.`,
                visitedUrls,
                snapshot,
                filledFields: flow.filledFields,
            });
            await pushData(result);
            return;
        }

        const detectedSignals = gatherContactOnlySignals(snapshot, contactFormOpts(visitedUrls));

        const result: ClassificationResult = {
            url: request.url,
            finalUrl: activePage.url(),
            bookingVendor: bestVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: true,
            needsManualReview: false,
            clickedText,
            confidence: 0.88,
            reason: 'The booking path leads to an appointment-request style form, not a live scheduler.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: snapshot.aggregate.loginSignals,
                appointmentSignals: snapshot.aggregate.appointmentSignals,
                generalContactSignals: unique([
                    ...snapshot.aggregate.generalContactSignals,
                    ...detectedSignals,
                ]),
                schedulerSignals: snapshot.aggregate.schedulerSignals,
                bookingFlowSignals: [],
                filledFields: flow.filledFields,
            },
        };

        await pushData(result);
        return;
    }

    /* ── Strong scheduler evidence present ── */

    const strongSchedulerEvidence =
        hasStrongLiveSchedulerEvidence(snapshot.aggregate.schedulerSignals) ||
        visitedUrlsShowLiveScheduler(visitedUrls);

    const vendorRequiresAccount = vendorRequiresAccountForOnlineBooking({
        vendor: bestVendor,
        snapshot,
        visitedUrls,
    });

    if (strongSchedulerEvidence && vendorRequiresAccount) {
        const vendorLabel = bestVendor.name || 'a detected vendor';
        const result = buildGatedVendorResult({
            requestUrl: request.url,
            finalUrl: activePage.url(),
            vendor: bestVendor,
            clickedText,
            confidence: 0.92,
            reason:
                `Reached a live scheduler on ${vendorLabel}, which requires customer sign-in to complete online booking (platform-level policy).`,
            visitedUrls,
            snapshot,
            filledFields: flow.filledFields,
        });
        await pushData(result);
        return;
    }

    if (strongSchedulerEvidence) {
        const highConfidence = visitedUrlsShowLiveScheduler(visitedUrls);

        const result: ClassificationResult = {
            url: request.url,
            finalUrl: activePage.url(),
            bookingVendor: bestVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: false,
            needsManualReview: !highConfidence,
            clickedText,
            confidence: highConfidence ? 0.85 : (bestVendor.name ? 0.55 : 0.45),
            reason: highConfidence
                ? 'Reached a live scheduling system without encountering a forced account-creation gate. Login-like UI on the checkout page is part of the platform\'s normal guest-checkout flow.'
                : 'Reached a live scheduler, but did not prove full booking completion without a login popup or account gate.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: snapshot.aggregate.loginSignals,
                appointmentSignals: snapshot.aggregate.appointmentSignals,
                generalContactSignals: snapshot.aggregate.generalContactSignals,
                schedulerSignals: unique([
                    ...snapshot.aggregate.schedulerSignals,
                    ...(highConfidence ? ['visited-url: live-scheduler-detected'] : []),
                ]),
                bookingFlowSignals: [],
                filledFields: flow.filledFields,
            },
        };

        if (result.needsManualReview) {
            await maybeRetryOrPush({ request, pushData, result });
        } else {
            await pushData(result);
        }
        return;
    }

    /* ── Fallback: ambiguous outcome ── */

    const stalledVendorOverride = vendorRequiresAccountForOnlineBooking({
        vendor: bestVendor,
        snapshot,
        visitedUrls,
    });

    if (stalledVendorOverride) {
        const vendorLabel = bestVendor.name || 'a detected vendor';
        const result = buildGatedVendorResult({
            requestUrl: request.url,
            finalUrl: activePage.url(),
            vendor: bestVendor,
            clickedText,
            confidence: 0.92,
            reason:
                `Booking flow reached ${vendorLabel}'s embedded widget but stalled before completion. ${vendorLabel} requires customer sign-in to complete online booking (platform-level policy).`,
            visitedUrls,
            snapshot,
            filledFields: flow.filledFields,
        });
        await pushData(result);
        return;
    }

    if (visitedUrlsShowVendorLoginGate(visitedUrls)) {
        const urlVendor = detectVendorFromVisitedUrls(visitedUrls);
        const effectiveVendor = resolveVendor(urlVendor, bestVendor);
        const vendorLabel = effectiveVendor.name ?? 'a detected vendor';
        const result = buildGatedVendorResult({
            requestUrl: request.url,
            finalUrl: activePage.url(),
            vendor: effectiveVendor,
            clickedText,
            confidence: 0.93,
            reason: `Booking flow stalled, but a vendor webstore login-gate URL was detected. ${vendorLabel} requires customer sign-in to complete online booking.`,
            visitedUrls,
            snapshot,
            filledFields: flow.filledFields,
        });
        await pushData(result);
        return;
    }

    /* Stalled with no scheduler — check for contact-form-only site */

    if (isContactFormOnlySite(snapshot, contactFormOpts(visitedUrls))) {
        const detectedSignals = gatherContactOnlySignals(snapshot, contactFormOpts(visitedUrls));
        const result: ClassificationResult = {
            url: request.url,
            finalUrl: activePage.url(),
            bookingVendor: bestVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: true,
            needsManualReview: false,
            clickedText,
            confidence: 0.82,
            reason:
                'No online scheduling system was found after entering the booking path. The site relies on phone, contact form, or email for booking.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: snapshot.aggregate.loginSignals,
                appointmentSignals: snapshot.aggregate.appointmentSignals,
                generalContactSignals: unique([
                    ...snapshot.aggregate.generalContactSignals,
                    ...detectedSignals,
                ]),
                schedulerSignals: snapshot.aggregate.schedulerSignals,
                bookingFlowSignals: [],
                filledFields: flow.filledFields,
            },
        };
        await pushData(result);
        return;
    }

    if (urlsContainContactFormVendor(visitedUrls) && !visitedUrlsShowLiveScheduler(visitedUrls)) {
        const detectedSignals = gatherContactOnlySignals(snapshot, contactFormOpts(visitedUrls));
        const result: ClassificationResult = {
            url: request.url,
            finalUrl: activePage.url(),
            bookingVendor: bestVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: true,
            needsManualReview: false,
            clickedText,
            confidence: 0.75,
            reason:
                'Booking path stalled on a page embedding a third-party form (not a live scheduler). The site likely relies on form submissions for appointment requests.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: snapshot.aggregate.loginSignals,
                appointmentSignals: snapshot.aggregate.appointmentSignals,
                generalContactSignals: unique([
                    ...snapshot.aggregate.generalContactSignals,
                    ...detectedSignals,
                ]),
                schedulerSignals: snapshot.aggregate.schedulerSignals,
                bookingFlowSignals: [],
                filledFields: flow.filledFields,
            },
        };
        await pushData(result);
        return;
    }

    const result: ClassificationResult = {
        url: request.url,
        finalUrl: activePage.url(),
        bookingVendor: bestVendor.name,
        forcedAccountCreation: false,
        contactFormOnlyBooking: false,
        needsManualReview: true,
        clickedText,
        confidence: 0.45,
        reason:
            flow.stopReason === 'stalled' || flow.stopReason === 'maxSteps'
                ? 'Booking path was found, but it stalled before proving full booking completion without a login popup or account gate.'
                : 'Booking path was found, but the booking outcome is still ambiguous.',
        evidence: {
            visitedUrls,
            vendorMatch: bestVendor.match,
            loginSignals: snapshot.aggregate.loginSignals,
            appointmentSignals: snapshot.aggregate.appointmentSignals,
            generalContactSignals: snapshot.aggregate.generalContactSignals,
            schedulerSignals: snapshot.aggregate.schedulerSignals,
            bookingFlowSignals: [],
            filledFields: flow.filledFields,
        },
    };

    await maybeRetryOrPush({ request, pushData, result });
});