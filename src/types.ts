export type ClassificationResult = {
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
        bookingFlowSignals: string[];
        filledFields: string[];
    };
};

export type VendorDetection = {
    name: string | null;
    match: string | null;
};

export type Strategy = 'fast' | 'broad' | 'adapter';

export type BookingState =
    | 'landing'
    | 'service_list'
    | 'date_picker'
    | 'time_picker'
    | 'contact_form'
    | 'review'
    | 'payment'
    | 'login_gate'
    | 'unknown';

export type Surface = {
    kind: 'page' | 'frame';
    key: string;
    label: string;
    url: string;
    root: any;
};

export type InteractiveMeta = {
    text: string;
    href: string;
    ariaLabel: string;
    title: string;
    visible: boolean;
    disabled: boolean;
    ariaDisabled: boolean;
    containerText: string;
};

export type ControlMeta = {
    tag: string;
    type: string;
    meta: string;
    visible: boolean;
    disabled: boolean;
};

export type SurfaceScan = {
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
    bookingFlowSignals: string[];
};

export type BookingSnapshot = {
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
        bookingFlowSignals: string[];
    };
};

export type ActionAttempt = {
    acted: boolean;
    page: any;
    snapshot: BookingSnapshot;
    clickedText: string | null;
};

export type FlowAdvanceResult = {
    activePage: any;
    stopReason: 'login' | 'payment' | 'review' | 'contact_form' | 'stalled' | 'maxSteps' | 'vendor_marketing';
    snapshot: BookingSnapshot;
    filledFields: string[];
};

export type VendorAdapter = {
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