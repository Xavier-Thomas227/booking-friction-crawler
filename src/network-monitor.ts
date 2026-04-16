import type { Page, Request } from 'playwright';

export interface NetworkSignals {
    detectedVendor: string | null;
    hasAvailabilityApi: boolean;
    hasContactFormPost: boolean;
    matchedUrls: string[];
}

const VENDOR_AVAILABILITY_ENDPOINTS: Record<string, RegExp[]> = {
    'Square Appointments': [/squareup\.com.*\/bookings\/availability/i, /square\.site.*\/api.*booking/i],
    'Acuity Scheduling': [/acuityscheduling\.com.*action=showCalendar/i, /squarespacescheduling\.com.*availability/i],
    'Mindbody': [/mindbodyonline\.com.*\/availabletimes/i, /mindbody\.io.*\/bookableitems/i, /mindbodyonline\.com.*\/sessions/i],
    'Vagaro': [/vagaro\.com.*GetOpenDates/i, /vagaro\.com.*GetTimeSlots/i, /vagaro\.com.*availability/i],
    'Fresha': [/fresha\.com.*\/availability/i, /fresha\.com.*\/slots/i],
    'Booksy': [/booksy\.com.*\/slots/i, /booksy\.com.*\/availability/i],
    'Boulevard': [/boulevard\.io.*\/times/i, /joinblvd\.com.*\/availability/i],
    'GlossGenius': [/glossgenius\.com.*\/availability/i],
    'Zenoti': [/zenoti\.com.*\/slots/i, /zenoti\.com.*\/availability/i],
    'Calendly': [/calendly\.com.*\/calendar\/events/i],
    'TIMIFY': [/timify\.com.*\/slots/i],
    'Jane App': [/janeapp\.com.*\/available/i],
    'Booxi': [/booxi\.com.*\/availability/i],
};

const GENERIC_AVAILABILITY_PATTERNS: RegExp[] = [
    /\/slots\b/i, /\/availability\b/i, /\/available[-_]?times/i, /\/time[-_]?slots/i,
    /\/free[-_]?slots/i, /\/openings\b/i, /\/schedule\/open/i, /\/appointments\/available/i,
];

const CONTACT_FORM_POST_PATTERNS: RegExp[] = [
    /\/wp-admin\/admin-ajax\.php/i, /\/wp-json\/contact-form/i, /\/wpcf7v2/i, /\/gravity-forms/i,
    /formspree\.io/i, /getform\.io/i, /formsubmit\.co/i, /netlify\.com.*\/submission/i,
    /\/contact[-_]?form/i, /\/send[-_]?message/i, /\/email[-_]?form/i,
];

export class NetworkMonitor {
    private captured: Array<{ url: string; method: string }> = [];
    private listener: ((req: Request) => void) | null = null;
    private active = false;

    constructor(private page: Page) {}

    start(): void {
        if (this.active) return;
        this.listener = (req: Request) => {
            this.captured.push({ url: req.url(), method: req.method() });
        };
        this.page.on('request', this.listener);
        this.active = true;
    }

    stop(): void {
        if (!this.active || !this.listener) return;
        this.page.off('request', this.listener);
        this.listener = null;
        this.active = false;
    }

    classify(): NetworkSignals {
        const result: NetworkSignals = {
            detectedVendor: null,
            hasAvailabilityApi: false,
            hasContactFormPost: false,
            matchedUrls: [],
        };
        for (const req of this.captured) {
            if (!result.detectedVendor) {
                for (const [vendor, patterns] of Object.entries(VENDOR_AVAILABILITY_ENDPOINTS)) {
                    if (patterns.some((p) => p.test(req.url))) {
                        result.detectedVendor = vendor;
                        result.hasAvailabilityApi = true;
                        result.matchedUrls.push(req.url);
                        break;
                    }
                }
            }
            if (!result.hasAvailabilityApi) {
                if (GENERIC_AVAILABILITY_PATTERNS.some((p) => p.test(req.url))) {
                    result.hasAvailabilityApi = true;
                    result.matchedUrls.push(req.url);
                }
            }
            if (req.method === 'POST' && CONTACT_FORM_POST_PATTERNS.some((p) => p.test(req.url))) {
                result.hasContactFormPost = true;
                result.matchedUrls.push(req.url);
            }
        }
        return result;
    }

    reset(): void {
        this.captured = [];
    }
}
