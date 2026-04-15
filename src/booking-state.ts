import type {
    BookingSnapshot,
    BookingState,
    ControlMeta,
    InteractiveMeta,
    Strategy,
    Surface,
    SurfaceScan,
    VendorDetection,
} from './types.js';

export const INTERACTIVE_SELECTOR = 'a, button, [role="button"], input[type="submit"], input[type="button"]';
export const FORM_CONTROL_SELECTOR = 'input, textarea, select';
export const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"], .modal, .popup';

export const SERVICE_CONTAINER_SELECTORS = [
    'article',
    'li',
    'section',
    '[data-testid*="service"]',
    '[data-qa*="service"]',
    '[class*="service"]',
    '[class*="Service"]',
];

export const HANDLER_TIME_BUDGET_MS = 90_000;

export const MAX_STEPS_BY_STRATEGY: Record<Strategy, number> = {
    fast: 6,
    broad: 10,
    adapter: 12,
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
    { name: 'Zenoti', patterns: ['zenoti.com'] },
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
    'we\'ll contact you',
    'we will reach out',
    'we\'ll reach out',
];

const GENERAL_CONTACT_PHRASES = [
    'contact us',
    'get in touch',
    'send us a message',
    'general inquiry',
    'general enquiry',
    'ask a question',
];

// ── FIX: phrases that confirm the form is PASSIVE (business contacts you back)
// If none of these are present, the form is more likely part of a live booking flow.
const PASSIVE_FORM_PHRASES = [
    'we will contact you',
    'we\'ll contact you',
    'we will reach out',
    'we\'ll reach out',
    'we\'ll get back to you',
    'we will get back to you',
    'request appointment',
    'appointment request',
    'request consultation',
    'submit request',
    'send request',
    'inquiry',
    'enquiry',
];

// ── FIX: phrases that indicate we're INSIDE a booking flow (past service/time selection)
// The customer-details step of live schedulers shows these.
const BOOKING_FLOW_CONTEXT_PHRASES = [
    'your appointment',
    'appointment details',
    'booking details',
    'your booking',
    'your order',
    'order summary',
    'your information',
    'your details',
    'your contact',
    'client details',
    'customer details',
    'contact information',
    'personal details',
    'personal information',
    'add a note',
    'notes for your',
    'selected service',
    'selected staff',
    'appointment time',
    'booking time',
    'cancellation policy',
    'no-show',
    'no show',
];

// ── FIX: CTA text patterns on booking buttons — indicates live booking, not contact form
const BOOKING_CTA_PHRASES = [
    'book appointment',
    'book now',
    'book this',
    'complete booking',
    'complete appointment',
    'confirm booking',
    'confirm appointment',
    'schedule appointment',
    'schedule now',
    'reserve appointment',
    'place booking',
    'finish booking',
    'submit booking',
    'confirm and book',
    'confirm and pay',
    'complete and pay',
    'pay and book',
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
    'card on file',
    'checkout',
    'due today',
    'due at appointment',
    'subtotal',
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
    'book appointment',
    'complete appointment',
    // ── FIX: more terminal / CTA phrases that appear on the last step
    'book now',
    'schedule appointment',
    'confirm and book',
    'confirm and pay',
    'complete and pay',
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

const INFRASTRUCTURE_FRAME_PATTERNS = [
    'stripe.com',
    'stripe.network',
    'js.stripe.com',
    'm.stripe.network',
    'checkout.stripe.com',
    'braintreegateway.com',
    'braintree-api.com',
    'paypal.com/tagmanager',
    'paypalobjects.com',
    'sq-payment',
    'squarecdn.com',
    'cookiebot.com',
    'consentcdn',
    'onetrust.com',
    'cookielaw.org',
    'trustarc.com',
    'privacymanager.io',
    'googletagmanager.com',
    'google-analytics.com',
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'facebook.net',
    'facebook.com/tr',
    'connect.facebook.net',
    'snap.licdn.com',
    'bat.bing.com',
    'hotjar.com',
    'clarity.ms',
    'fullstory.com',
    'segment.io',
    'segment.com',
    'mixpanel.com',
    'heapanalytics.com',
    'amplitude.com',
    'sentry.io',
    'intercom.io',
    'intercomcdn.com',
    'crisp.chat',
    'tawk.to',
    'livechatinc.com',
    'zendesk.com',
    'drift.com',
    'hubspot.com',
    'recaptcha',
    'hcaptcha.com',
    'challenges.cloudflare.com',
];

function isInfrastructureFrameUrl(url: string): boolean {
    if (!url || url === 'about:blank') return true;
    const lower = url.toLowerCase();
    return INFRASTRUCTURE_FRAME_PATTERNS.some((pattern) => lower.includes(pattern));
}

export const STRONG_LIVE_SCHEDULER_SIGNALS = new Set([
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
    'time section headers',
]);

export function normalize(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

export function includesAny(text: string, phrases: string[]): string[] {
    return phrases.filter((phrase) => text.includes(phrase));
}

export function withPrefix(prefix: string, values: string[]): string[] {
    return values.map((value) => `${prefix}:${value}`);
}

export function getStrategy(retryCount: number): Strategy {
    if (retryCount >= 2) return 'adapter';
    if (retryCount >= 1) return 'broad';
    return 'fast';
}

export function isOutOfTime(startedAt: number): boolean {
    return Date.now() - startedAt > HANDLER_TIME_BUDGET_MS;
}

export function recordVisitedUrl(visitedUrls: string[], url: string): void {
    if (url && !visitedUrls.includes(url)) visitedUrls.push(url);
}

export function comparableUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const pathname = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
        return `${parsed.origin}${pathname}${parsed.search}`.toLowerCase();
    } catch {
        return normalize(url.split('#')[0]);
    }
}

export function getHostname(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

export function hostMatches(host: string, pattern: string): boolean {
    return host === pattern || host.endsWith(`.${pattern}`);
}

export function isKnownVendorHost(host: string): boolean {
    if (!host) return false;
    return VENDOR_RULES.some((rule) => rule.patterns.some((pattern) => hostMatches(host, pattern)));
}

export function isDisallowedHost(host: string): boolean {
    if (!host) return false;
    return DISALLOWED_HOST_PATTERNS.some((pattern) => hostMatches(host, pattern));
}

export function isDisallowedHref(href: string): boolean {
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

export function isAllowedBookingNavigation(fromUrl: string, toUrl: string): boolean {
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

export function looksLikeTimeText(text: string): boolean {
    return /\b\d{1,2}:\d{2}\s?(am|pm)\b/i.test(text) || /\bnoon\b/i.test(text);
}

export function looksLikeDayNumber(text: string): boolean {
    return /^(0?[1-9]|[12][0-9]|3[01])$/.test(text.trim());
}

export function hasCalendarContext(text: string): boolean {
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

export function serviceLikeText(text: string): boolean {
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

export function statePriority(state: BookingState): number {
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

export function hasStrongLiveSchedulerEvidence(signals: string[]): boolean {
    return signals.some((signal) => STRONG_LIVE_SCHEDULER_SIGNALS.has(signal)) || signals.length >= 3;
}

export async function countVisible(root: any, selector: string): Promise<number> {
    return await root.locator(selector).evaluateAll((els: Element[]) =>
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

export async function getBodyText(root: any): Promise<string> {
    try {
        const text = await root.locator('body').innerText({ timeout: 2500 });
        return normalize(text);
    } catch {
        return '';
    }
}

export async function getInteractiveMetas(root: any): Promise<InteractiveMeta[]> {
    return await root.locator(INTERACTIVE_SELECTOR).evaluateAll((els: Element[], containerSelectors: string[]) =>
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

export async function getControlMetas(root: any): Promise<ControlMeta[]> {
    return await root.locator(FORM_CONTROL_SELECTOR).evaluateAll((els: Element[]) =>
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

export async function detectVendor(page: any): Promise<VendorDetection> {
    const frameUrls = page.frames().map((frame: any) => frame.url()).filter(Boolean);
    const assetUrls = await page.locator('a, iframe, script').evaluateAll((els: Element[]) =>
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

export async function getSurfaces(page: any): Promise<Surface[]> {
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
        if (isInfrastructureFrameUrl(url)) return;

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

export function itemText(item: InteractiveMeta): string {
    return normalize(`${item.text} ${item.ariaLabel} ${item.title}`);
}

export async function scanSurface(surface: Surface): Promise<SurfaceScan> {
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
    // ── FIX: new signal set for booking-flow context ──
    const bookingFlowSignals = new Set<string>();

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

    if (calendarDayCount > 0 && hasCalendarContext(bodyText)) {
        schedulerSignals.add('calendar day choice');
    }

    const hasTimeSectionHeaders =
        (bodyText.includes('morning') || bodyText.includes('afternoon') || bodyText.includes('evening')) &&
        timeLikeCount >= 1;
    if (hasTimeSectionHeaders) schedulerSignals.add('time section headers');

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

    const liveSchedulerSignals = [...schedulerSignals].filter((signal) => STRONG_LIVE_SCHEDULER_SIGNALS.has(signal));

    const urlLooksCheckout = ['/checkout', '/payment', '/pay']
        .some((part) => normalize(surface.url).includes(part));

    const hasAppointmentHeld = bodyText.includes('appointment held');

    // ── FIX: Detect booking-flow context ──
    // These signals indicate we're INSIDE a live booking flow (past service/time
    // selection, now at the customer-details or review step) — NOT a standalone
    // "contact us" or "request appointment" form.

    // 1) Body text phrases that appear on the customer-details / review step
    for (const hit of includesAny(bodyText, BOOKING_FLOW_CONTEXT_PHRASES)) {
        bookingFlowSignals.add(hit);
    }

    // 2) Booking CTA buttons (Book Appointment, Book Now, Complete Booking, etc.)
    //    These appear in interactive items (buttons / links) and prove we're in a
    //    booking flow where the user is about to BOOK, not "request" or "inquire".
    for (const item of interactiveItems) {
        if (!item.visible || item.disabled || item.ariaDisabled) continue;
        const text = itemText(item);
        for (const phrase of BOOKING_CTA_PHRASES) {
            if (text.includes(phrase)) {
                bookingFlowSignals.add(`cta:${phrase}`);
            }
        }
        // A single visible "Book" button (not link) is also a CTA signal
        if (text === 'book') {
            bookingFlowSignals.add('cta:book');
        }
    }

    // 3) URL patterns that indicate booking flow
    const urlLooksBooking = ['/book', '/booking', '/schedule', '/appointment', '/reserve']
        .some((part) => normalize(surface.url).includes(part));
    if (urlLooksBooking) bookingFlowSignals.add('booking url');

    // 4) Known vendor host
    const surfaceHost = getHostname(surface.url);
    if (isKnownVendorHost(surfaceHost)) bookingFlowSignals.add('vendor host');

    // 5) Vendor asset detected anywhere on the page (iframes, scripts, etc.)
    //    — catches embedded widgets on non-vendor hosts
    const allFrameUrls = (surface.root.frames?.() || []).map((f: any) => f.url?.() || '').filter(Boolean);
    const hasVendorFrame = allFrameUrls.some((url: string) => isKnownVendorHost(getHostname(url)));
    if (hasVendorFrame) bookingFlowSignals.add('vendor frame');

    // 6) Check if the page contains a service summary with price/duration
    //    (this means a service was already selected — we're past service_list)
    const hasServiceSummary =
        (/\$\s?\d/.test(bodyText) || /\b\d+\s?(min|mins|minute|minutes)\b/i.test(bodyText)) &&
        (bodyText.includes('your appointment') ||
         bodyText.includes('your order') ||
         bodyText.includes('appointment details') ||
         bodyText.includes('booking details') ||
         bodyText.includes('selected service'));
    if (hasServiceSummary) bookingFlowSignals.add('service summary');

    // 7) Check if we have PASSIVE form indicators — "we will contact you", etc.
    //    These are the opposite of booking-flow: they mean the form sends a request
    //    and the business follows up later.
    const passiveFormHits = includesAny(bodyText, PASSIVE_FORM_PHRASES);
    const isPassiveForm = passiveFormHits.length > 0;

    // ── Derive composite flags ──
    const hasBookingFlowContext = bookingFlowSignals.size >= 2;
    const hasStrongBookingFlowContext = bookingFlowSignals.size >= 3;

    // ─── Competitive scoring: every state scored independently ───

    const scores: Record<BookingState, number> = {
        landing: 0,
        login_gate: 0,
        payment: 0,
        review: 0,
        time_picker: 0,
        date_picker: 0,
        service_list: 0,
        contact_form: 0,
        unknown: 0,
    };

    // --- login_gate ---
    if (passwordCount > 0) scores.login_gate += 5;
    if (urlLooksAuth && (emailCount > 0 || otpCount > 0)) scores.login_gate += 5;
    if (emailCount > 0 && loginSignals.size >= 2) scores.login_gate += 4;
    if (otpCount > 0) scores.login_gate += 3;
    for (const _ of includesAny(combinedText, [
        'create an account or log in',
        'log in to book',
        'create an account to book',
        'already have an account',
        'book and manage your appointments',
    ])) {
        scores.login_gate += 3;
    }
    if (schedulerSignals.has('priced services') && schedulerSignals.size >= 3) scores.login_gate -= 2;
    if (paymentSignals.size >= 2) scores.login_gate -= 3;
    if (urlLooksCheckout) scores.login_gate -= 3;

    // --- payment ---
    if (visiblePaymentFieldCount > 0) scores.payment += 5;
    if (visiblePaymentIframeCount > 0 && paymentSignals.size >= 2) scores.payment += 4;
    else if (visiblePaymentIframeCount > 0) scores.payment += 1;
    if (paymentSignals.size >= 2) scores.payment += 3;
    if (urlLooksCheckout) scores.payment += 3;
    if (hasAppointmentHeld) scores.payment += 3;
    if (schedulerSignals.has('priced services') && visiblePaymentFieldCount === 0 && visiblePaymentIframeCount === 0) scores.payment -= 3;
    if (schedulerSignals.has('priced services') && schedulerSignals.has('multiple book buttons')) scores.payment -= 4;
    if (schedulerSignals.has('service durations') && schedulerSignals.has('multiple book buttons')) scores.payment -= 3;

    // --- review ---
    if (terminalSignals.size >= 1) scores.review += 4;
    if (terminalSignals.size >= 2) scores.review += 3;
    if (hasAppointmentHeld) scores.review += 2;
    // ── FIX: booking flow context with a form = review, not contact_form ──
    // When we detect booking-flow context (CTA, vendor, service summary, etc.)
    // alongside a form, this is the customer-details / review step.
    if (hasBookingFlowContext && visibleForms > 0) scores.review += 4;
    if (hasStrongBookingFlowContext) scores.review += 3;
    // Booking CTA specifically boosts review
    const hasBookingCta = [...bookingFlowSignals].some((s) => s.startsWith('cta:'));
    if (hasBookingCta) scores.review += 3;

    // --- service_list ---
    if (combinedText.includes('select a service') || combinedText.includes('choose a service')) scores.service_list += 5;
    if (combinedText.includes('popular services')) scores.service_list += 4;
    if (combinedText.includes('add another service') || combinedText.includes('your order')) scores.service_list += 3;
    if (schedulerSignals.has('priced services')) scores.service_list += 3;
    if (schedulerSignals.has('service durations')) scores.service_list += 3;
    if (visibleBooks >= 2) scores.service_list += 3;
    if (timeLikeCount >= 4) scores.service_list -= 2;
    if (calendarDayCount >= 7) scores.service_list -= 2;

    // --- time_picker ---
    if (timeLikeCount >= 5) scores.time_picker += 5;
    else if (timeLikeCount >= 3) scores.time_picker += 4;
    else if (timeLikeCount >= 1) scores.time_picker += 2;
    if (combinedText.includes('available times')) scores.time_picker += 4;
    if (combinedText.includes('select a time') || combinedText.includes('choose a time')) scores.time_picker += 4;
    if (hasTimeSectionHeaders) scores.time_picker += 3;
    if (schedulerSignals.has('priced services')) scores.time_picker -= 3;
    if (schedulerSignals.has('service durations')) scores.time_picker -= 2;
    if (combinedText.includes('select a service') || combinedText.includes('choose a service')) scores.time_picker -= 3;

    // --- date_picker ---
    if (dateInputCount > 0) scores.date_picker += 3;
    if (calendarDayCount >= 7 && hasCalendarContext(bodyText)) scores.date_picker += 5;
    else if (calendarDayCount >= 3 && hasCalendarContext(bodyText)) scores.date_picker += 3;
    if (combinedText.includes('select date') || combinedText.includes('choose date')) scores.date_picker += 3;
    if (combinedText.includes('select date & time')) scores.date_picker += 2;
    if (schedulerSignals.has('priced services')) scores.date_picker -= 2;
    if (combinedText.includes('select a service') || combinedText.includes('choose a service')) scores.date_picker -= 2;

    // --- contact_form ---
    // ── FIX: Only award positive points when there's actual PASSIVE form evidence.
    // The old logic gave +3 just for having a form + appointmentSignals, which
    // fires on the customer-details step of every booking platform.
    // Now we require either (a) passive form phrases or (b) no booking flow context.
    if (isPassiveForm && visibleForms > 0 && appointmentSignals.size > 0) scores.contact_form += 4;
    else if (visibleForms > 0 && appointmentSignals.size > 0 && !hasBookingFlowContext) scores.contact_form += 3;

    if (isPassiveForm && appointmentSignals.size >= 2) scores.contact_form += 3;
    else if (appointmentSignals.size >= 2 && !hasBookingFlowContext) scores.contact_form += 2;

    if (generalContactSignals.size >= 1 && appointmentSignals.size >= 1 && !hasBookingFlowContext) scores.contact_form += 2;

    // existing negatives
    if (liveSchedulerSignals.length >= 2) scores.contact_form -= 3;
    if (timeLikeCount >= 1) scores.contact_form -= 2;
    if (calendarDayCount >= 3) scores.contact_form -= 2;
    if (paymentSignals.size >= 2) scores.contact_form -= 4;
    if (urlLooksCheckout) scores.contact_form -= 4;
    if (terminalSignals.size >= 1) scores.contact_form -= 3;
    if (hasAppointmentHeld) scores.contact_form -= 3;

    // ── FIX: booking-flow context is the strongest negative for contact_form ──
    // This is the core fix: when we know we're inside a booking flow, contact_form
    // should not win. The penalty scales with evidence strength.
    if (hasBookingFlowContext) scores.contact_form -= 5;
    if (hasStrongBookingFlowContext) scores.contact_form -= 4;
    if (hasBookingCta) scores.contact_form -= 3;
    if (urlLooksBooking) scores.contact_form -= 2;

    // Known vendor host (kept from before, now stacks with booking-flow context)
    if (isKnownVendorHost(surfaceHost)) {
        scores.contact_form -= 4;
        if (schedulerSignals.size > 0) {
            scores.service_list += 2;
            scores.time_picker += 2;
            scores.date_picker += 2;
        }
    }

    // --- unknown (fallback for scheduler-like pages) ---
    if (schedulerSignals.size > 0 || isKnownVendorHost(surfaceHost)) {
        scores.unknown = 1 + Math.min(schedulerSignals.size, 5);
    }
    // ── FIX: booking flow context with no other strong state → unknown beats contact_form
    if (hasBookingFlowContext && scores.unknown < 3) {
        scores.unknown = 3 + bookingFlowSignals.size;
    }

    // Pick the highest-scoring state
    let state: BookingState = 'landing';
    let score = 0;
    for (const [s, sc] of Object.entries(scores) as [BookingState, number][]) {
        if (sc > score) {
            state = s;
            score = sc;
        }
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
        bookingFlowSignals: [...bookingFlowSignals],
    };
}

export function pickDominantScan(scans: SurfaceScan[]): SurfaceScan {
    return [...scans].sort((a, b) => {
        const p = statePriority(b.state) - statePriority(a.state);
        if (p !== 0) return p;

        const s = b.score - a.score;
        if (s !== 0) return s;

        if (a.surface.kind !== b.surface.kind) {
            return a.surface.kind === 'frame' ? 1 : -1;
        }

        return 0;
    })[0];
}

export async function buildSnapshot(page: any): Promise<BookingSnapshot> {
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
            bookingFlowSignals: unique(scans.flatMap((scan) => scan.bookingFlowSignals)),
        },
    };
}

export function recordSnapshotUrls(visitedUrls: string[], snapshot: BookingSnapshot): void {
    recordVisitedUrl(visitedUrls, snapshot.pageUrl);

    for (const scan of snapshot.scans) {
        recordVisitedUrl(visitedUrls, scan.surface.url);
    }
}

export function hasMeaningfulProgress(before: BookingSnapshot, after: BookingSnapshot): boolean {
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
    if (after.aggregate.bookingFlowSignals.length > before.aggregate.bookingFlowSignals.length) return true;
    return false;
}