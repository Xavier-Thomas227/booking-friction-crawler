import { createPlaywrightRouter } from '@crawlee/playwright';

export const router = createPlaywrightRouter();

type ClassificationResult = {
    url: string;
    finalUrl: string;
    bookingVendor: string | null;
    forcedAccountCreation: boolean;
    contactFormOnlyBooking: boolean;
    needsManualReview: boolean;
    clickedText: string | null;
    confidence: number;
    reason: string;
    evidence: {
        visitedUrls: string[];
        vendorMatch: string | null;
        loginSignals: string[];
        appointmentSignals: string[];
        generalContactSignals: string[];
        schedulerSignals: string[];
        filledFields: string[];
    };
};

type VendorDetection = {
    name: string | null;
    match: string | null;
};

type Strategy = 'fast' | 'broad' | 'adapter';

type BookingState =
    | 'landing'
    | 'service_list'
    | 'date_picker'
    | 'time_picker'
    | 'contact_form'
    | 'review'
    | 'payment'
    | 'login_gate'
    | 'unknown';

type Surface = {
    kind: 'page' | 'frame';
    key: string;
    label: string;
    url: string;
    root: any;
};

type InteractiveMeta = {
    text: string;
    href: string;
    ariaLabel: string;
    title: string;
    visible: boolean;
    disabled: boolean;
    ariaDisabled: boolean;
    containerText: string;
};

type ControlMeta = {
    tag: string;
    type: string;
    meta: string;
    visible: boolean;
    disabled: boolean;
};

type SurfaceScan = {
    surface: Surface;
    state: BookingState;
    score: number;
    bodyText: string;
    combinedText: string;
    interactiveItems: InteractiveMeta[];
    controlItems: ControlMeta[];
    visibleForms: number;
    visibleFormControls: number;
    visibleDialogs: number;
    loginSignals: string[];
    paymentSignals: string[];
    terminalSignals: string[];
    appointmentSignals: string[];
    generalContactSignals: string[];
    schedulerSignals: string[];
};

type BookingSnapshot = {
    pageUrl: string;
    vendor: VendorDetection;
    scans: SurfaceScan[];
    dominant: SurfaceScan;
    totalForms: number;
    totalFormControls: number;
    totalDialogs: number;
    aggregate: {
        loginSignals: string[];
        paymentSignals: string[];
        terminalSignals: string[];
        appointmentSignals: string[];
        generalContactSignals: string[];
        schedulerSignals: string[];
    };
};

type ActionAttempt = {
    acted: boolean;
    page: any;
    snapshot: BookingSnapshot;
    clickedText: string | null;
};

type FlowAdvanceResult = {
    activePage: any;
    stopReason: 'login' | 'payment' | 'review' | 'contact_form' | 'stalled' | 'maxSteps';
    snapshot: BookingSnapshot;
    filledFields: string[];
};

type VendorAdapter = {
    name: string;
    matches(snapshot: BookingSnapshot): boolean;
    tryAdvance(args: {
        page: any;
        snapshot: BookingSnapshot;
        attemptedActions: Set<string>;
        strategy: Strategy;
        log: any;
    }): Promise<ActionAttempt | null>;
};

const INTERACTIVE_SELECTOR = 'a, button, [role="button"], input[type="submit"], input[type="button"]';
const FORM_CONTROL_SELECTOR = 'input, textarea, select';
const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"], .modal, .popup';

const SERVICE_CONTAINER_SELECTORS = [
    'article',
    'li',
    'section',
    '[data-testid*="service"]',
    '[data-qa*="service"]',
    '[class*="service"]',
    '[class*="Service"]',
];

const HANDLER_TIME_BUDGET_MS = 90_000;
const MAX_RETRY_ESCALATION = 2;

const MAX_STEPS_BY_STRATEGY: Record<Strategy, number> = {
    fast: 6,
    broad: 10,
    adapter: 12,
};

const SCAN_LIMIT_BY_STRATEGY: Record<Strategy, number> = {
    fast: 24,
    broad: 48,
    adapter: 72,
};

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

const VENDOR_RULES = [
    { name: 'Vagaro', patterns: ['vagaro.com'] },
    { name: 'Mindbody', patterns: ['mindbodyonline.com', 'clients.mindbodyonline.com'] },
    { name: 'Boulevard', patterns: ['joinblvd.com', 'blvd.co'] },
    { name: 'GlossGenius', patterns: ['glossgenius.com'] },
    { name: 'Acuity Scheduling', patterns: ['acuityscheduling.com'] },
    { name: 'Square Appointments', patterns: ['square.site', 'squareup.com', 'app.squareup.com'] },
    { name: 'Fresha', patterns: ['fresha.com'] },
    { name: 'Booksy', patterns: ['booksy.com'] },
];

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
];

const LOGIN_PHRASES = [
    'sign in',
    'log in',
    'login',
    'create account',
    'create an account',
    'account required',
    'sign up',
    'already have an account',
    'continue with google',
    'continue with apple',
    'continue with facebook',
    'continue with email',
    'book and manage your appointments',
    'create an account or log in',
    'log in to book',
    'create an account to book',
    'verify your phone',
    'verify your email',
    'one-time code',
    'magic link',
];

const APPOINTMENT_FORM_PHRASES = [
    'request appointment',
    'appointment request',
    'request consultation',
    'book consultation',
    'preferred date',
    'preferred time',
    'service of interest',
    'treatment of interest',
    'we will contact you',
    'we’ll contact you',
    'we will reach out',
    'we’ll reach out',
];

const GENERAL_CONTACT_PHRASES = [
    'contact us',
    'get in touch',
    'send us a message',
    'general inquiry',
    'general enquiry',
    'ask a question',
];

const SCHEDULER_PHRASES = [
    'select a service',
    'choose a service',
    'popular services',
    'select date & time',
    'your order',
    'add another service',
    'available times',
    'select a time',
    'choose a time',
    'next available',
    'select date',
    'choose date',
    'preferred time',
    'when?',
];

const PAYMENT_PHRASES = [
    'credit card',
    'card number',
    'name on card',
    'cardholder name',
    'expiration date',
    'expiry date',
    'exp date',
    'security code',
    'cvv',
    'cvc',
    'billing address',
    'payment method',
    'pay now',
];

const TERMINAL_BOOKING_PHRASES = [
    'review appointment',
    'review booking',
    'appointment summary',
    'booking summary',
    'confirm appointment',
    'confirm booking',
    'complete booking',
    'final step',
    'almost done',
];

const DISALLOWED_HOST_PATTERNS = [
    'apps.apple.com',
    'itunes.apple.com',
    'play.google.com',
    'instagram.com',
    'facebook.com',
    'm.facebook.com',
    'l.facebook.com',
    'tiktok.com',
    'x.com',
    'twitter.com',
    'youtube.com',
    'maps.apple.com',
    'google.com',
    'googleadservices.com',
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

const STRONG_LIVE_SCHEDULER_SIGNALS = new Set([
    'select a service',
    'choose a service',
    'popular services',
    'select date & time',
    'your order',
    'available times',
    'select a time',
    'choose a time',
    'next available',
    'select date',
    'choose date',
    'time slot button',
    'calendar day choice',
    'date input',
    'time input',
    'booking iframe',
    'multiple book buttons',
    'priced services',
    'service durations',
    'add another service',
]);

function normalize(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function includesAny(text: string, phrases: string[]): string[] {
    return phrases.filter((phrase) => text.includes(phrase));
}

function withPrefix(prefix: string, values: string[]): string[] {
    return values.map((value) => `${prefix}:${value}`);
}

function getStrategy(retryCount: number): Strategy {
    if (retryCount >= 2) return 'adapter';
    if (retryCount >= 1) return 'broad';
    return 'fast';
}

function isOutOfTime(startedAt: number): boolean {
    return Date.now() - startedAt > HANDLER_TIME_BUDGET_MS;
}

function recordVisitedUrl(visitedUrls: string[], url: string): void {
    if (url && !visitedUrls.includes(url)) visitedUrls.push(url);
}

function comparableUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const pathname = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
        return `${parsed.origin}${pathname}${parsed.search}`.toLowerCase();
    } catch {
        return normalize(url.split('#')[0]);
    }
}

function getHostname(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

function hostMatches(host: string, pattern: string): boolean {
    return host === pattern || host.endsWith(`.${pattern}`);
}

function isKnownVendorHost(host: string): boolean {
    if (!host) return false;
    return VENDOR_RULES.some((rule) => rule.patterns.some((pattern) => hostMatches(host, pattern)));
}

function isDisallowedHost(host: string): boolean {
    if (!host) return false;
    return DISALLOWED_HOST_PATTERNS.some((pattern) => hostMatches(host, pattern));
}

function isDisallowedHref(href: string): boolean {
    const value = normalize(href);
    if (!value) return false;

    if (
        value.startsWith('mailto:') ||
        value.startsWith('tel:') ||
        value.startsWith('sms:') ||
        value.startsWith('javascript:')
    ) {
        return true;
    }

    return isDisallowedHost(getHostname(href));
}

function isAllowedBookingNavigation(fromUrl: string, toUrl: string): boolean {
    const fromHost = getHostname(fromUrl);
    const toHost = getHostname(toUrl);

    if (!toHost) return true;
    if (isDisallowedHost(toHost)) return false;
    if (fromHost === toHost) return true;

    const fromVendor = isKnownVendorHost(fromHost);
    const toVendor = isKnownVendorHost(toHost);

    if (!fromVendor && toVendor) return true;
    if (fromVendor && toVendor) return true;
    if (fromVendor && !toVendor) return false;

    return true;
}

function looksLikeTimeText(text: string): boolean {
    return /\b\d{1,2}:\d{2}\s?(am|pm)\b/i.test(text) || /\bnoon\b/i.test(text);
}

function looksLikeDayNumber(text: string): boolean {
    return /^(0?[1-9]|[12][0-9]|3[01])$/.test(text.trim());
}

function hasCalendarContext(text: string): boolean {
    const t = normalize(text);
    return (
        t.includes('select date & time') ||
        t.includes('select date') ||
        t.includes('choose date') ||
        t.includes('available times') ||
        t.includes('your order') ||
        t.includes('calendar')
    );
}

function serviceLikeText(text: string): boolean {
    const t = normalize(text);
    return (
        t.includes('service') ||
        t.includes('treatment') ||
        t.includes('duration') ||
        t.includes('staff') ||
        /\$\s?\d/.test(t) ||
        /\b\d+\s?(min|mins|minute|minutes|h|hr|hrs)\b/i.test(t)
    );
}

function statePriority(state: BookingState): number {
    switch (state) {
        case 'login_gate':
            return 100;
        case 'payment':
            return 95;
        case 'review':
            return 90;
        case 'time_picker':
            return 80;
        case 'date_picker':
            return 75;
        case 'service_list':
            return 70;
        case 'contact_form':
            return 65;
        case 'unknown':
            return 35;
        case 'landing':
        default:
            return 10;
    }
}

function hasStrongLiveSchedulerEvidence(signals: string[]): boolean {
    return signals.some((signal) => STRONG_LIVE_SCHEDULER_SIGNALS.has(signal)) || signals.length >= 3;
}

async function countVisible(root: any, selector: string): Promise<number> {
    return await root.locator(selector).evaluateAll((els) =>
        els.filter((el) => {
            const anyEl = el as any;
            const style = window.getComputedStyle(el as Element);
            const rect = (el as HTMLElement).getBoundingClientRect();

            return (
                !anyEl.disabled &&
                anyEl.getAttribute?.('aria-hidden') !== 'true' &&
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0
            );
        }).length,
    ).catch(() => 0);
}

async function getBodyText(root: any): Promise<string> {
    try {
        const text = await root.locator('body').innerText({ timeout: 2500 });
        return normalize(text);
    } catch {
        return '';
    }
}

async function getInteractiveMetas(root: any): Promise<InteractiveMeta[]> {
    return await root.locator(INTERACTIVE_SELECTOR).evaluateAll((els, containerSelectors) =>
        els.map((el) => {
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
                    // ignore invalid selector edge cases
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
        }),
        SERVICE_CONTAINER_SELECTORS,
    ).catch(() => [] as InteractiveMeta[]);
}

async function getControlMetas(root: any): Promise<ControlMeta[]> {
    return await root.locator(FORM_CONTROL_SELECTOR).evaluateAll((els) =>
        els.map((el) => {
            const anyEl = el as any;
            const tag = el.tagName.toLowerCase();
            const type = (anyEl.type || '').toLowerCase();
            const name = anyEl.name || '';
            const id = anyEl.id || '';
            const placeholder = anyEl.placeholder || '';
            const ariaLabel = anyEl.getAttribute?.('aria-label') || '';
            const autocomplete = anyEl.getAttribute?.('autocomplete') || '';
            const labels = anyEl.labels ? Array.from(anyEl.labels).map((l: any) => l.textContent || '').join(' ') : '';
            const style = window.getComputedStyle(el as Element);
            const rect = (el as HTMLElement).getBoundingClientRect();
            const visible =
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0;

            return {
                tag,
                type,
                meta: [name, id, placeholder, ariaLabel, autocomplete, labels].join(' '),
                visible,
                disabled: !!anyEl.disabled || !!anyEl.readOnly || anyEl.getAttribute?.('aria-disabled') === 'true',
            };
        }),
    ).catch(() => [] as ControlMeta[]);
}

async function dismissCommonPopups(page: any): Promise<void> {
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
        const locator = page.locator(selector).first();
        try {
            if (await locator.count()) {
                await locator.click({ timeout: 700 }).catch(() => {});
                await page.waitForTimeout(120);
            }
        } catch {
            // ignore
        }
    }
}

async function detectVendor(page: any): Promise<VendorDetection> {
    const frameUrls = page.frames().map((frame: any) => frame.url()).filter(Boolean);
    const assetUrls = await page.locator('a, iframe, script').evaluateAll((els) =>
        els
            .map((el) => {
                const anyEl = el as any;
                return anyEl.href || anyEl.src || '';
            })
            .filter(Boolean),
    ).catch(() => [] as string[]);

    const haystack = normalize([page.url(), ...frameUrls, ...assetUrls].join(' '));

    for (const rule of VENDOR_RULES) {
        for (const pattern of rule.patterns) {
            if (haystack.includes(pattern.toLowerCase())) {
                return { name: rule.name, match: pattern };
            }
        }
    }

    return { name: null, match: null };
}

async function getSurfaces(page: any): Promise<Surface[]> {
    const frames = page.frames().filter((frame: any) => frame !== page.mainFrame?.());
    const surfaces: Surface[] = [
        {
            kind: 'page',
            key: `page:${comparableUrl(page.url())}`,
            label: 'page',
            url: page.url(),
            root: page,
        },
    ];

    frames.forEach((frame: any, index: number) => {
        const url = frame.url() || '';
        const host = getHostname(url);

        if (host && isDisallowedHost(host)) return;

        surfaces.push({
            kind: 'frame',
            key: `frame:${index}:${comparableUrl(url || `frame-${index}`)}`,
            label: `frame:${index}`,
            url,
            root: frame,
        });
    });

    return surfaces;
}

function itemText(item: InteractiveMeta): string {
    return normalize(`${item.text} ${item.ariaLabel} ${item.title}`);
}

async function scanSurface(surface: Surface): Promise<SurfaceScan> {
    const root = surface.root;
    const bodyText = await getBodyText(root);
    const interactiveItems = await getInteractiveMetas(root);
    const controlItems = await getControlMetas(root);
    const interactiveText = normalize(interactiveItems.map((item) => `${item.text} ${item.ariaLabel} ${item.title}`).join(' '));
    const combinedText = normalize(`${surface.url} ${bodyText} ${interactiveText}`);

    const [visibleForms, visibleFormControls, visibleDialogs] = await Promise.all([
        countVisible(root, 'form'),
        countVisible(root, FORM_CONTROL_SELECTOR),
        countVisible(root, DIALOG_SELECTOR),
    ]);

    const passwordCount = await countVisible(root, 'input[type="password"]');
    const emailCount = await countVisible(
        root,
        [
            'input[type="email"]',
            'input[name*="email" i]',
            'input[id*="email" i]',
            'input[autocomplete="email"]',
        ].join(', '),
    );
    const otpCount = await countVisible(
        root,
        [
            'input[autocomplete="one-time-code"]',
            'input[inputmode="numeric"]',
            'input[name*="code" i]',
            'input[id*="code" i]',
            'input[placeholder*="code" i]',
        ].join(', '),
    );

    const visiblePaymentFieldCount = await countVisible(
        root,
        [
            'input[autocomplete="cc-number"]',
            'input[autocomplete="cc-exp"]',
            'input[autocomplete="cc-csc"]',
            'input[name*="cardnumber" i]',
            'input[name*="cc-number" i]',
            'input[name*="exp" i]',
            'input[name*="cvv" i]',
            'input[name*="cvc" i]',
            'input[placeholder*="card number" i]',
            'input[placeholder*="cvv" i]',
            'input[placeholder*="cvc" i]',
        ].join(', '),
    );

    const visiblePaymentIframeCount = await countVisible(
        root,
        [
            'iframe[src*="stripe"]',
            'iframe[src*="checkout"]',
            'iframe[name*="card" i]',
            'iframe[title*="card" i]',
        ].join(', '),
    );

    const dateInputCount = await countVisible(root, 'input[type="date"]');
    const timeInputCount = await countVisible(root, 'input[type="time"]');
    const bookingIframeCount = await countVisible(
        root,
        'iframe[src*="book" i], iframe[src*="schedule" i], iframe[src*="appointment" i], iframe[title*="calendar" i]',
    );

    const loginSignals = new Set<string>();
    const paymentSignals = new Set<string>();
    const terminalSignals = new Set<string>();
    const appointmentSignals = new Set<string>();
    const generalContactSignals = new Set<string>();
    const schedulerSignals = new Set<string>();

    if (passwordCount > 0) loginSignals.add('password input');
    if (emailCount > 0) loginSignals.add('email input');
    if (otpCount > 0) loginSignals.add('otp/code input');
    for (const hit of includesAny(combinedText, LOGIN_PHRASES)) loginSignals.add(hit);

    const urlLooksAuth = ['/login', '/signin', '/sign-in', '/signup', '/sign-up', '/register', '/account', '/auth']
        .some((part) => normalize(surface.url).includes(part));
    if (urlLooksAuth) loginSignals.add('auth url');

    for (const hit of includesAny(bodyText, PAYMENT_PHRASES)) paymentSignals.add(hit);
    if (visiblePaymentFieldCount > 0) paymentSignals.add('payment field');
    if (visiblePaymentIframeCount > 0) paymentSignals.add('payment iframe');

    for (const hit of includesAny(bodyText, TERMINAL_BOOKING_PHRASES)) terminalSignals.add(hit);

    for (const hit of includesAny(bodyText, APPOINTMENT_FORM_PHRASES)) appointmentSignals.add(hit);
    for (const hit of includesAny(bodyText, GENERAL_CONTACT_PHRASES)) generalContactSignals.add(hit);

    for (const hit of includesAny(bodyText, SCHEDULER_PHRASES)) schedulerSignals.add(hit);
    if (dateInputCount > 0) schedulerSignals.add('date input');
    if (timeInputCount > 0) schedulerSignals.add('time input');
    if (bookingIframeCount > 0) schedulerSignals.add('booking iframe');
    if (bodyText.includes('when?')) schedulerSignals.add('when prompt');
    if (bodyText.includes('preferred time')) schedulerSignals.add('preferred time');
    if (bodyText.includes('add another service')) schedulerSignals.add('add another service');
    if (/\$\s?\d/.test(bodyText)) schedulerSignals.add('priced services');
    if (/\b\d+\s?(min|mins|minute|minutes|h|hr|hrs)\b/i.test(bodyText)) schedulerSignals.add('service durations');

    const visibleBooks = interactiveItems.filter((item) => {
        const text = itemText(item);
        return item.visible && !item.disabled && !item.ariaDisabled && text === 'book';
    }).length;
    if (visibleBooks >= 3) schedulerSignals.add('multiple book buttons');

    const timeLikeCount = interactiveItems.filter((item) => {
        if (!item.visible || item.disabled || item.ariaDisabled) return false;
        return looksLikeTimeText(itemText(item));
    }).length;
    if (timeLikeCount > 0) schedulerSignals.add('time slot button');

    const calendarDayCount = interactiveItems.filter((item) => {
        if (!item.visible || item.disabled || item.ariaDisabled) return false;
        return looksLikeDayNumber(normalize(item.text));
    }).length;
    if (calendarDayCount > 0 && hasCalendarContext(bodyText)) schedulerSignals.add('calendar day choice');

    for (const control of controlItems) {
        const meta = normalize(control.meta);
        if (meta.includes('preferred date')) appointmentSignals.add('preferred date field');
        if (meta.includes('preferred time')) appointmentSignals.add('preferred time field');
        if (meta.includes('service')) appointmentSignals.add('service field');
        if (meta.includes('provider') || meta.includes('staff')) appointmentSignals.add('provider field');
        if (meta.includes('consultation')) appointmentSignals.add('consultation field');
        if (meta.includes('appointment')) appointmentSignals.add('appointment field');
        if (meta.includes('message')) generalContactSignals.add('message field');
    }

    const loginGate =
        passwordCount > 0 ||
        (emailCount > 0 && (
            combinedText.includes('create an account or log in') ||
            combinedText.includes('log in to book') ||
            combinedText.includes('create an account to book') ||
            combinedText.includes('already have an account') ||
            combinedText.includes('book and manage your appointments')
        )) ||
        (urlLooksAuth && (emailCount > 0 || otpCount > 0));

    const paymentStep =
        visiblePaymentFieldCount > 0 ||
        visiblePaymentIframeCount > 0 ||
        paymentSignals.size >= 2;

    const reviewStep = terminalSignals.size > 0;

    const liveSchedulerSignals = [...schedulerSignals].filter((signal) => STRONG_LIVE_SCHEDULER_SIGNALS.has(signal));
    const contactForm =
        visibleForms > 0 &&
        appointmentSignals.size > 0 &&
        liveSchedulerSignals.length === 0 &&
        timeLikeCount === 0 &&
        calendarDayCount === 0;

    const timePicker =
        timeLikeCount >= 1 ||
        combinedText.includes('available times') ||
        combinedText.includes('select a time') ||
        combinedText.includes('choose a time');

    const datePicker =
        dateInputCount > 0 ||
        (calendarDayCount >= 3 && hasCalendarContext(bodyText)) ||
        combinedText.includes('select date') ||
        combinedText.includes('choose date');

    const serviceList =
        combinedText.includes('select a service') ||
        combinedText.includes('choose a service') ||
        combinedText.includes('popular services') ||
        combinedText.includes('add another service') ||
        combinedText.includes('your order') ||
        visibleBooks >= 2 ||
        schedulerSignals.has('priced services') ||
        schedulerSignals.has('service durations');

    let state: BookingState = 'landing';
    let score = 10;

    if (loginGate) {
        state = 'login_gate';
        score = 100;
    } else if (paymentStep) {
        state = 'payment';
        score = 95;
    } else if (reviewStep) {
        state = 'review';
        score = 90;
    } else if (timePicker) {
        state = 'time_picker';
        score = 80;
    } else if (datePicker) {
        state = 'date_picker';
        score = 75;
    } else if (serviceList) {
        state = 'service_list';
        score = 70;
    } else if (contactForm) {
        state = 'contact_form';
        score = 65;
    } else if (schedulerSignals.size > 0 || isKnownVendorHost(getHostname(surface.url))) {
        state = 'unknown';
        score = 35 + Math.min(schedulerSignals.size, 10);
    }

    return {
        surface,
        state,
        score,
        bodyText,
        combinedText,
        interactiveItems,
        controlItems,
        visibleForms,
        visibleFormControls,
        visibleDialogs,
        loginSignals: [...loginSignals],
        paymentSignals: [...paymentSignals],
        terminalSignals: [...terminalSignals],
        appointmentSignals: [...appointmentSignals],
        generalContactSignals: [...generalContactSignals],
        schedulerSignals: [...schedulerSignals],
    };
}

function pickDominantScan(scans: SurfaceScan[]): SurfaceScan {
    return [...scans].sort((a, b) => {
        const p = statePriority(b.state) - statePriority(a.state);
        if (p !== 0) return p;
        const s = b.score - a.score;
        if (s !== 0) return s;
        if (a.surface.kind !== b.surface.kind) return a.surface.kind === 'frame' ? 1 : -1;
        return 0;
    })[0];
}

async function buildSnapshot(page: any): Promise<BookingSnapshot> {
    const surfaces = await getSurfaces(page);
    const scans = await Promise.all(surfaces.map(scanSurface));
    const dominant = pickDominantScan(scans);
    const vendor = await detectVendor(page);

    return {
        pageUrl: page.url(),
        vendor,
        scans,
        dominant,
        totalForms: scans.reduce((sum, scan) => sum + scan.visibleForms, 0),
        totalFormControls: scans.reduce((sum, scan) => sum + scan.visibleFormControls, 0),
        totalDialogs: scans.reduce((sum, scan) => sum + scan.visibleDialogs, 0),
        aggregate: {
            loginSignals: unique(scans.flatMap((scan) => scan.loginSignals)),
            paymentSignals: unique(scans.flatMap((scan) => scan.paymentSignals)),
            terminalSignals: unique(scans.flatMap((scan) => scan.terminalSignals)),
            appointmentSignals: unique(scans.flatMap((scan) => scan.appointmentSignals)),
            generalContactSignals: unique(scans.flatMap((scan) => scan.generalContactSignals)),
            schedulerSignals: unique(scans.flatMap((scan) => scan.schedulerSignals)),
        },
    };
}

function recordSnapshotUrls(visitedUrls: string[], snapshot: BookingSnapshot): void {
    recordVisitedUrl(visitedUrls, snapshot.pageUrl);
    for (const scan of snapshot.scans) {
        recordVisitedUrl(visitedUrls, scan.surface.url);
    }
}

function hasMeaningfulProgress(before: BookingSnapshot, after: BookingSnapshot): boolean {
    if (comparableUrl(before.pageUrl) !== comparableUrl(after.pageUrl)) return true;
    if (before.dominant.surface.key !== after.dominant.surface.key) return true;
    if (before.dominant.state !== after.dominant.state) return true;
    if (statePriority(after.dominant.state) > statePriority(before.dominant.state)) return true;
    if (after.totalForms > before.totalForms) return true;
    if (after.totalFormControls > before.totalFormControls + 1) return true;
    if (after.totalDialogs > before.totalDialogs) return true;
    if (!before.vendor.name && !!after.vendor.name) return true;
    if (after.aggregate.schedulerSignals.length > before.aggregate.schedulerSignals.length) return true;
    if (after.aggregate.loginSignals.length > before.aggregate.loginSignals.length) return true;
    if (after.aggregate.paymentSignals.length > before.aggregate.paymentSignals.length) return true;
    if (after.aggregate.terminalSignals.length > before.aggregate.terminalSignals.length) return true;
    return false;
}

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
        }, SERVICE_CONTAINER_SELECTORS);
    } catch {
        return null;
    }
}

function buildActionKey(state: BookingState, surfaceKey: string, meta: InteractiveMeta): string {
    const text = itemText(meta);
    const href = normalize(meta.href);
    const container = normalize(meta.containerText).slice(0, 120);
    return `${state}|${surfaceKey}|${text}|${href}|${container}`;
}

async function clickLocatorAndWait(page: any, locator: any): Promise<any> {
    const beforeUrl = page.url();
    const newPagePromise = page.context().waitForEvent('page', { timeout: 1800 }).catch(() => null);

    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ timeout: 2500 }).catch(async () => {
        await locator.click({ timeout: 2500, force: true });
    });

    const maybeNewPage = await newPagePromise;
    const activePage = maybeNewPage ?? page;

    if (maybeNewPage) {
        await activePage.waitForLoadState('domcontentloaded', { timeout: 7000 }).catch(() => {});
    } else if (comparableUrl(beforeUrl) !== comparableUrl(page.url())) {
        await page.waitForLoadState('domcontentloaded', { timeout: 7000 }).catch(() => {});
    }

    await activePage.waitForTimeout(900).catch(() => {});
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
    const activePage = await clickLocatorAndWait(page, locator);
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

    const afterSnapshot = await buildSnapshot(activePage);

    if (hasMeaningfulProgress(snapshot, afterSnapshot)) {
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
}

async function clickBestInteractive(args: {
    page: any;
    root: any;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    log: any;
    strategy: Strategy;
    label: string;
    scorer: (meta: InteractiveMeta) => number;
}): Promise<ActionAttempt> {
    const { page, root, snapshot, attemptedActions, log, strategy, label, scorer } = args;
    const locatorList = root.locator(INTERACTIVE_SELECTOR);
    const count = Math.min(await locatorList.count().catch(() => 0), SCAN_LIMIT_BY_STRATEGY[strategy]);

    const candidates: Array<{ locator: any; meta: InteractiveMeta; score: number }> = [];

    for (let i = 0; i < count; i++) {
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

function scoreBookingEntry(meta: InteractiveMeta): number {
    const text = itemText(meta);
    const href = normalize(meta.href);

    if (!text) return 0;
    if (DISALLOWED_TEXT_PATTERNS.some((part) => text.includes(part))) return 0;
    if (isDisallowedHref(meta.href)) return 0;
    if (text.includes('contact us')) return 0;

    let score = 0;

    for (const phrase of BOOKING_ENTRY_PHRASES) {
        if (text.includes(phrase)) score += phrase === 'book' || phrase === 'schedule' ? 20 : 60;
    }

    if (text === 'book now') score += 30;
    if (!href && (text === 'book now' || text === 'book')) score += 20;
    if (href.includes('book') || href.includes('schedule') || href.includes('appointment')) score += 25;
    if (serviceLikeText(meta.containerText)) score += 10;

    return score;
}

function scoreServiceAction(meta: InteractiveMeta): number {
    const text = itemText(meta);
    const href = normalize(meta.href);
    const container = normalize(meta.containerText);

    if (!text) return 0;
    if (DISALLOWED_TEXT_PATTERNS.some((part) => text.includes(part))) return 0;
    if (isDisallowedHref(meta.href)) return 0;

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
    if (text === 'book now') score += 100;
    if (serviceLikeText(container)) score += 35;
    if (/\$\s?\d/.test(container)) score += 15;
    if (/\b\d+\s?(min|mins|minute|minutes|h|hr|hrs)\b/i.test(container)) score += 15;
    if (href.includes('/book') || href.includes('/schedule') || href.includes('/appointment')) score += 20;
    if (normalize(container).includes('service') || normalize(container).includes('treatment')) score += 10;

    return score;
}

function scoreDateAction(meta: InteractiveMeta): number {
    const text = itemText(meta);
    if (!text) return 0;
    if (isDisallowedHref(meta.href)) return 0;

    const deny = ['continue with google', 'continue with apple', 'continue with facebook', 'cancel', 'close'];
    if (deny.some((d) => text.includes(d))) return 0;

    let score = 0;

    if (looksLikeDayNumber(normalize(meta.text))) score += 100;
    if (text.includes('select date')) score += 80;
    if (text.includes('choose date')) score += 80;
    if (text.includes('next available')) score += 70;
    if (text.includes('calendar')) score += 40;

    return score;
}

function scoreTimeAction(meta: InteractiveMeta): number {
    const text = itemText(meta);
    if (!text) return 0;
    if (isDisallowedHref(meta.href)) return 0;

    const deny = ['continue with google', 'continue with apple', 'continue with facebook', 'cancel', 'close'];
    if (deny.some((d) => text.includes(d))) return 0;

    let score = 0;

    if (looksLikeTimeText(text)) score += 120;
    if (text.includes('next available')) score += 80;
    if (text.includes('select a time') || text.includes('choose a time')) score += 60;

    return score;
}

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

    return score;
}

async function clickBookingEntry(page: any, strategy: Strategy, attemptedActions: Set<string>, log: any): Promise<ActionAttempt> {
    const snapshot = await buildSnapshot(page);

    return clickBestInteractive({
        page,
        root: page,
        snapshot,
        attemptedActions,
        log,
        strategy,
        label: 'booking-entry',
        scorer: scoreBookingEntry,
    });
}

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

async function fillLowRiskFields(root: any): Promise<string[]> {
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

    return unique(filled);
}

async function clickDateInputFallback(page: any, root: any, snapshot: BookingSnapshot, attemptedActions: Set<string>, log: any): Promise<ActionAttempt> {
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

async function clickTimeInputFallback(page: any, root: any, snapshot: BookingSnapshot, attemptedActions: Set<string>, log: any): Promise<ActionAttempt> {
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

async function clickServiceChoice(args: {
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
        label: 'service-choice',
        scorer: scoreServiceAction,
    });
}

async function clickDateChoice(args: {
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

async function clickTimeChoice(args: {
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

async function clickSafeContinue(args: {
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

const booksyAdapter: VendorAdapter = {
    name: 'Booksy',
    matches(snapshot) {
        return snapshot.vendor.name === 'Booksy';
    },
    async tryAdvance({ page, snapshot, attemptedActions, strategy, log }) {
        const root = snapshot.dominant.surface.root;

        return clickBestInteractive({
            page,
            root,
            snapshot,
            attemptedActions,
            log,
            strategy,
            label: 'vendor-adapter:booksy',
            scorer: (meta) => {
                const text = itemText(meta);
                const href = normalize(meta.href);
                const container = normalize(meta.containerText);

                if (!text) return 0;
                if (isDisallowedHref(meta.href)) return 0;
                if (text.includes('app store') || text.includes('google play')) return 0;

                let score = 0;
                if (text === 'book') score += 220;
                if (text === 'book now') score += 180;
                if (text.includes('next available')) score += 120;
                if (serviceLikeText(container)) score += 40;
                if (!href && text === 'book') score += 20;
                return score;
            },
        });
    },
};

const VENDOR_ADAPTERS: VendorAdapter[] = [booksyAdapter];

async function runVendorAdapter(args: {
    page: any;
    snapshot: BookingSnapshot;
    attemptedActions: Set<string>;
    strategy: Strategy;
    log: any;
}): Promise<ActionAttempt | null> {
    const adapter = VENDOR_ADAPTERS.find((candidate) => candidate.matches(args.snapshot));
    if (!adapter) return null;
    return adapter.tryAdvance(args);
}

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

    if (strategy === 'adapter') {
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

    for (let step = 0; step < MAX_STEPS_BY_STRATEGY[strategy]; step++) {
        if (isOutOfTime(startedAt)) {
            return {
                activePage,
                stopReason: 'stalled',
                snapshot,
                filledFields: unique(filledFields),
            };
        }

        await dismissCommonPopups(activePage);

        snapshot = await buildSnapshot(activePage);
        recordSnapshotUrls(visitedUrls, snapshot);

        if (snapshot.dominant.state === 'login_gate') {
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

        if (snapshot.dominant.state === 'contact_form') {
            return {
                activePage,
                stopReason: 'contact_form',
                snapshot,
                filledFields: unique(filledFields),
            };
        }

        const newlyFilled = await fillLowRiskFields(snapshot.dominant.surface.root);
        filledFields.push(...newlyFilled);

        const afterFillSnapshot = await buildSnapshot(activePage);
        snapshot = afterFillSnapshot;
        recordSnapshotUrls(visitedUrls, snapshot);

        if (snapshot.dominant.state === 'login_gate') {
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

        if (snapshot.dominant.state === 'contact_form') {
            return {
                activePage,
                stopReason: 'contact_form',
                snapshot,
                filledFields: unique(filledFields),
            };
        }

        const action = await tryAdvanceBookingFlow({
            page: activePage,
            snapshot,
            attemptedActions,
            strategy,
            log,
        });

        if (!action.acted) {
            return {
                activePage,
                stopReason: 'stalled',
                snapshot,
                filledFields: unique(filledFields),
            };
        }

        activePage = action.page;
        snapshot = action.snapshot;
        recordSnapshotUrls(visitedUrls, snapshot);
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

router.addDefaultHandler(async ({ request, page, log, pushData }) => {
    const startedAt = Date.now();
    const strategy = getStrategy(request.retryCount ?? 0);

    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    await dismissCommonPopups(page);

    const visitedUrls: string[] = [page.url()];
    let clickedText: string | null = null;

    log.info('Starting booking-flow classification', {
        url: request.url,
        currentUrl: page.url(),
        strategy,
        retryCount: request.retryCount ?? 0,
    });

    const firstVendor = await detectVendor(page);
    const entryAttempted = new Set<string>();
    const entry = await clickBookingEntry(page, strategy, entryAttempted, log);

    if (!entry.acted) {
        const result: ClassificationResult = {
            url: request.url,
            finalUrl: page.url(),
            bookingVendor: firstVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: false,
            needsManualReview: true,
            clickedText: null,
            confidence: 0.35,
            reason: 'No clear booking entry was found.',
            evidence: {
                visitedUrls,
                vendorMatch: firstVendor.match,
                loginSignals: [],
                appointmentSignals: [],
                generalContactSignals: [],
                schedulerSignals: [],
                filledFields: [],
            },
        };

        await maybeRetryOrPush({ request, pushData, result });
        return;
    }

    let activePage = entry.page;
    let snapshot = entry.snapshot;
    clickedText = entry.clickedText;

    recordSnapshotUrls(visitedUrls, snapshot);

    const immediateVendor = snapshot.vendor.name ? snapshot.vendor : firstVendor;

    if (snapshot.dominant.state === 'login_gate') {
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
                filledFields: [],
            },
        };

        await pushData(result);
        return;
    }

    const flow = await advanceBookingFlow({
        page: activePage,
        visitedUrls,
        strategy,
        log,
        startedAt,
    });

    activePage = flow.activePage;
    snapshot = flow.snapshot;

    const bestVendor = snapshot.vendor.name ? snapshot.vendor : immediateVendor;

    if (flow.stopReason === 'login') {
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
                filledFields: flow.filledFields,
            },
        };

        await pushData(result);
        return;
    }

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
            reason: 'Booking flow reached a payment step without hitting a forced account gate.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: [],
                appointmentSignals: [],
                generalContactSignals: [],
                schedulerSignals: unique([
                    ...snapshot.aggregate.schedulerSignals,
                    ...withPrefix('payment', snapshot.aggregate.paymentSignals),
                ]),
                filledFields: flow.filledFields,
            },
        };

        await pushData(result);
        return;
    }

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
            reason: 'Booking flow reached a final review or confirmation step without hitting a forced account gate.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: [],
                appointmentSignals: [],
                generalContactSignals: [],
                schedulerSignals: unique([
                    ...snapshot.aggregate.schedulerSignals,
                    ...withPrefix('review', snapshot.aggregate.terminalSignals),
                ]),
                filledFields: flow.filledFields,
            },
        };

        await pushData(result);
        return;
    }

    if (flow.stopReason === 'contact_form') {
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
                loginSignals: [],
                appointmentSignals: snapshot.aggregate.appointmentSignals,
                generalContactSignals: snapshot.aggregate.generalContactSignals,
                schedulerSignals: snapshot.aggregate.schedulerSignals,
                filledFields: flow.filledFields,
            },
        };

        await pushData(result);
        return;
    }

    const strongSchedulerEvidence = hasStrongLiveSchedulerEvidence(snapshot.aggregate.schedulerSignals);

    if (strongSchedulerEvidence) {
        const result: ClassificationResult = {
            url: request.url,
            finalUrl: activePage.url(),
            bookingVendor: bestVendor.name,
            forcedAccountCreation: false,
            contactFormOnlyBooking: false,
            needsManualReview: true,
            clickedText,
            confidence: 0.68,
            reason: 'Booking path appears to be a live scheduler, but the crawler did not reach payment, review, or a clear account gate.',
            evidence: {
                visitedUrls,
                vendorMatch: bestVendor.match,
                loginSignals: snapshot.aggregate.loginSignals,
                appointmentSignals: snapshot.aggregate.appointmentSignals,
                generalContactSignals: snapshot.aggregate.generalContactSignals,
                schedulerSignals: snapshot.aggregate.schedulerSignals,
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
        forcedAccountCreation: false,
        contactFormOnlyBooking: false,
        needsManualReview: true,
        clickedText,
        confidence: 0.45,
        reason:
            flow.stopReason === 'stalled' || flow.stopReason === 'maxSteps'
                ? 'Booking path was found, but it stalled before payment, review, or a clear account gate.'
                : 'Booking path was found, but the friction type is still ambiguous.',
        evidence: {
            visitedUrls,
            vendorMatch: bestVendor.match,
            loginSignals: snapshot.aggregate.loginSignals,
            appointmentSignals: snapshot.aggregate.appointmentSignals,
            generalContactSignals: snapshot.aggregate.generalContactSignals,
            schedulerSignals: snapshot.aggregate.schedulerSignals,
            filledFields: flow.filledFields,
        },
    };

    await maybeRetryOrPush({ request, pushData, result });
});