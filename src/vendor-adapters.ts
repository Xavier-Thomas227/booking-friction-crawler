import type {
    ActionAttempt,
    BookingSnapshot,
    Strategy,
    VendorAdapter,
} from './types.js';

import { clickBestVendorBookButton } from './booking-actions.js';

const booksyAdapter: VendorAdapter = {
    name: 'Booksy',
    matches(snapshot: BookingSnapshot) {
        return snapshot.vendor.name === 'Booksy';
    },
    async tryAdvance(args: {
        page: any;
        snapshot: BookingSnapshot;
        attemptedActions: Set<string>;
        strategy: Strategy;
        log: any;
    }): Promise<ActionAttempt | null> {
        const result = await clickBestVendorBookButton({
            page: args.page,
            snapshot: args.snapshot,
            attemptedActions: args.attemptedActions,
            strategy: args.strategy,
            log: args.log,
        });

        return result;
    },
};

const VENDOR_ADAPTERS: VendorAdapter[] = [booksyAdapter];

export async function runVendorAdapter(args: {
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