/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as analyticsHelpers from "../analyticsHelpers.js";
import type * as authHelpers from "../authHelpers.js";
import type * as caixa from "../caixa.js";
import type * as caixaHelpers from "../caixaHelpers.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as customerCounterHistory from "../customerCounterHistory.js";
import type * as customers from "../customers.js";
import type * as expenseTemplates from "../expenseTemplates.js";
import type * as expenses from "../expenses.js";
import type * as intelligence from "../intelligence.js";
import type * as ledgerHelpers from "../ledgerHelpers.js";
import type * as movements from "../movements.js";
import type * as payments from "../payments.js";
import type * as products from "../products.js";
import type * as seed from "../seed.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  analyticsHelpers: typeof analyticsHelpers;
  authHelpers: typeof authHelpers;
  caixa: typeof caixa;
  caixaHelpers: typeof caixaHelpers;
  cleanup: typeof cleanup;
  crons: typeof crons;
  customerCounterHistory: typeof customerCounterHistory;
  customers: typeof customers;
  expenseTemplates: typeof expenseTemplates;
  expenses: typeof expenses;
  intelligence: typeof intelligence;
  ledgerHelpers: typeof ledgerHelpers;
  movements: typeof movements;
  payments: typeof payments;
  products: typeof products;
  seed: typeof seed;
  transactions: typeof transactions;
  users: typeof users;
  utils: typeof utils;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
