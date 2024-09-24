import { G as GolemInternalError, i as isNode, a as GftpStorageProvider, b as isBrowser, W as WebSocketBrowserStorageProvider, N as NullStorageProvider } from './shared-COHEMY9J.mjs';
export { z as Activity, H as ActivityModuleImpl, C as ActivityStateEnum, A as Agreement, n as Allocation, B as BasicDemandDirector, K as Batch, m as DebitNote, ah as DebitNoteRepository, D as Demand, f as DemandSpecification, j as DraftOfferProposalPool, a4 as EnvUtils, aj as EventReader, J as ExeUnit, F as ExecutionConfig, Y as GolemAbortError, Z as GolemConfigError, V as GolemError, g as GolemMarketError, a0 as GolemModuleError, c as GolemNetwork, y as GolemNetworkError, p as GolemPaymentError, _ as GolemPlatformError, $ as GolemTimeoutError, X as GolemUserError, Q as GolemWorkError, I as Invoice, r as InvoiceProcessor, ag as InvoiceRepository, ai as MIN_SUPPORTED_YAGNA, af as MarketApiAdapter, M as MarketErrorCode, k as MarketModuleImpl, u as Network, x as NetworkErrorCode, w as NetworkModuleImpl, v as NetworkNode, t as NetworkState, O as OfferProposal, ae as PaymentApiAdapter, P as PaymentDemandDirector, q as PaymentErrorCode, s as PaymentModuleImpl, o as RejectionReason, L as RemoteProcess, e as RentalModuleImpl, R as ResourceRental, d as ResourceRentalPool, E as Result, S as ScanDirector, l as ScannedOffer, U as TcpProxy, T as WorkErrorCode, h as WorkloadDemandDirector, a5 as YagnaApi, a9 as anyAbortSignal, a7 as checkAndThrowUnsupportedInBrowserError, a8 as createAbortSignalFromTimeout, a3 as defaultLogger, a6 as isWebWorker, ab as mergeUntilFirstComplete, a2 as nullLogger, aa as runOnNextEventLoopIteration, a1 as sleep, ad as waitAndCall, ac as waitFor } from './shared-COHEMY9J.mjs';
import Decimal from 'decimal.js-light';
import 'debug';
import 'ya-ts-client';
import 'uuid';
import 'semver/functions/satisfies.js';
import 'semver/functions/coerce.js';
import 'rxjs';
import 'eventsource';
import 'eventemitter3';
import 'async-lock';
import 'path';
import 'fs';
import 'cross-spawn';
import 'flatbuffers/js/flexbuffers.js';
import 'js-sha3';
import 'net';
import 'ws';
import 'buffer';
import 'async-retry';
import 'ip-num';

/** Default Proposal filter that accept all proposal coming from the market */
const acceptAll = () => () => true;
/** Proposal filter blocking every offer coming from a provider whose id is in the array */
const disallowProvidersById = (providerIds) => (proposal) => !providerIds.includes(proposal.provider.id);
/** Proposal filter blocking every offer coming from a provider whose name is in the array */
const disallowProvidersByName = (providerNames) => (proposal) => !providerNames.includes(proposal.provider.name);
/** Proposal filter blocking every offer coming from a provider whose name match to the regexp */
const disallowProvidersByNameRegex = (regexp) => (proposal) => !proposal.provider.name.match(regexp);
/** Proposal filter that only allows offers from a provider whose id is in the array */
const allowProvidersById = (providerIds) => (proposal) => providerIds.includes(proposal.provider.id);
/** Proposal filter that only allows offers from a provider whose name is in the array */
const allowProvidersByName = (providerNames) => (proposal) => providerNames.includes(proposal.provider.name);
/** Proposal filter that only allows offers from a provider whose name match to the regexp */
const allowProvidersByNameRegex = (regexp) => (proposal) => !!proposal.provider.name.match(regexp);
/**
 * Proposal filter only allowing offers that do not exceed the defined usage
 *
 * @param priceLimits.start The maximum start price in GLM
 * @param priceLimits.cpuPerSec The maximum price for CPU usage in GLM/s
 * @param priceLimits.envPerSec The maximum price for the duration of the activity in GLM/s
 */
const limitPriceFilter = (priceLimits) => (proposal) => {
    return (proposal.pricing.cpuSec <= priceLimits.cpuPerSec &&
        proposal.pricing.envSec <= priceLimits.envPerSec &&
        proposal.pricing.start <= priceLimits.start);
};

var strategy$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    acceptAll: acceptAll,
    allowProvidersById: allowProvidersById,
    allowProvidersByName: allowProvidersByName,
    allowProvidersByNameRegex: allowProvidersByNameRegex,
    disallowProvidersById: disallowProvidersById,
    disallowProvidersByName: disallowProvidersByName,
    disallowProvidersByNameRegex: disallowProvidersByNameRegex,
    limitPriceFilter: limitPriceFilter
});

/**
 * Helps to obtain a whitelist of providers which were health-tested.
 *
 * Important: This helper requires internet access to function properly.
 *
 * @return An array with Golem Node IDs of the whitelisted providers.
 */
async function getHealthyProvidersWhiteList() {
    try {
        const response = await fetch("https://reputation.dev-test.golem.network/v1/provider-whitelist");
        if (response.ok) {
            return response.json();
        }
        else {
            const body = await response.text();
            throw new GolemInternalError(`Request to download healthy provider whitelist failed: ${body}`);
        }
    }
    catch (err) {
        throw new GolemInternalError(`Failed to download healthy provider whitelist due to an error: ${err}`, err);
    }
}

var helpers = /*#__PURE__*/Object.freeze({
    __proto__: null,
    getHealthyProvidersWhiteList: getHealthyProvidersWhiteList
});

/** Default DebitNotes filter that accept all debit notes without any validation */
const acceptAllDebitNotesFilter = () => async () => true;
/** Default Invoices filter that accept all invoices without any validation */
const acceptAllInvoicesFilter = () => async () => true;
/** A custom filter that only accepts debit notes below a given value */
const acceptMaxAmountDebitNoteFilter = (maxAmount) => async (debitNote) => new Decimal(debitNote.totalAmountDue).lte(maxAmount);
/** A custom filter that only accepts invoices below a given value */
const acceptMaxAmountInvoiceFilter = (maxAmount) => async (invoice) => new Decimal(invoice.amount).lte(maxAmount);

var strategy = /*#__PURE__*/Object.freeze({
    __proto__: null,
    acceptAllDebitNotesFilter: acceptAllDebitNotesFilter,
    acceptAllInvoicesFilter: acceptAllInvoicesFilter,
    acceptMaxAmountDebitNoteFilter: acceptMaxAmountDebitNoteFilter,
    acceptMaxAmountInvoiceFilter: acceptMaxAmountInvoiceFilter
});

function createDefaultStorageProvider(yagnaApi, logger) {
    if (isNode) {
        return new GftpStorageProvider(logger === null || logger === void 0 ? void 0 : logger.child("storage"));
    }
    if (isBrowser) {
        return new WebSocketBrowserStorageProvider(yagnaApi, {
            logger: logger === null || logger === void 0 ? void 0 : logger.child("storage"),
        });
    }
    return new NullStorageProvider();
}

export { GftpStorageProvider, GolemInternalError, helpers as MarketHelpers, NullStorageProvider, strategy$1 as OfferProposalFilterFactory, strategy as PaymentFilters, WebSocketBrowserStorageProvider, createDefaultStorageProvider, isBrowser, isNode };
//# sourceMappingURL=golem-js.mjs.map
