/* global VoidFunction */
import { isDeepStrictEqual } from 'node:util';

import { type BrowserContext, type Page, type Request } from '@playwright/test';

export type ApiRequestDescription = {
    url: string;
    method: string;
    body?: unknown;
    headers: Record<string, string>;
};

type ApiMethod = {
    (...args: never[]): Promise<{ data: unknown }>;
    describeRequest: (...args: never[]) => ApiRequestDescription;
};

type TransportOptions<T extends ApiMethod> = undefined extends Parameters<T>[1]
    ? { transport?: Parameters<T>[1] }
    : { transport: Parameters<T>[1] };

type IsUnion<T, Whole = T> = T extends unknown ? ([Whole] extends [T] ? false : true) : never;

// JSON imports widen strings. Only relax unions of multiple string members.
type MockResponse<T> =
    true extends IsUnion<Extract<T, string>>
        ? string | MockResponse<Exclude<T, string>>
        : T extends string | number | bigint | boolean | symbol | null | undefined
          ? T
          : T extends (...args: never[]) => unknown
            ? T
            : T extends object
              ? { [Key in keyof T]: MockResponse<T[Key]> }
              : T;

export type MockOptions<T extends ApiMethod> = {
    params: Parameters<T>[0];
    delay?: number | 'manual';
} & TransportOptions<T> &
    (
        | {
              response: MockResponse<Awaited<ReturnType<T>>['data']>;
              status?: 200 | 201 | 202 | 204;
          }
        | {
              response: unknown;
              status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504;
          }
    );

export type ManualMockController = {
    /** Wait for the first matching request, with a default timeout of 5000 ms. */
    waitForRequest: (options?: { timeout?: number }) => Promise<void>;

    /** Release all current and future responses belonging to this registration. */
    release: VoidFunction;
};

export type MockApi = {
    <T extends ApiMethod>(
        api: T,
        options: MockOptions<NoInfer<T>> & { delay: 'manual' }
    ): Promise<ManualMockController>;
    <T extends ApiMethod>(
        api: T,
        options: MockOptions<NoInfer<T>> & { delay?: number }
    ): Promise<void>;
    <T extends ApiMethod>(
        api: T,
        options: MockOptions<NoInfer<T>>
    ): Promise<void | ManualMockController>;
};
export type ApiURL = Parameters<BrowserContext['route']>[0];

const createManualMock = (request: ApiRequestDescription) => {
    let arrived = false;
    let released = false;
    let closed = false;
    const arrivals = new Set<(error?: Error) => void>();
    const responses = new Set<(send: boolean) => void>();
    const description = `${request.method.toUpperCase()} ${request.url}`;
    const closedError = () => new Error(`Mock API context is closed: ${description}`);
    const controller: ManualMockController = {
        waitForRequest: async ({ timeout = 5000 } = {}) => {
            if (!Number.isFinite(timeout) || timeout <= 0) {
                throw new Error('waitForRequest timeout must be a finite positive number');
            }
            if (arrived) return;
            if (closed) throw closedError();
            await new Promise<void>((resolve, reject) => {
                const started = performance.now();
                let timer: ReturnType<typeof setTimeout>;
                const finish = (error?: Error) => {
                    clearTimeout(timer);
                    arrivals.delete(finish);
                    if (error) reject(error);
                    else resolve();
                };
                const schedule = () => {
                    const remaining = timeout - (performance.now() - started);
                    if (remaining <= 0) {
                        finish(
                            new Error(`Timed out waiting for ${description} after ${timeout} ms`)
                        );
                    } else {
                        // Node timers overflow above the signed 32-bit limit.
                        timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
                    }
                };
                arrivals.add(finish);
                schedule();
            });
        },
        release: () => {
            if (closed || released) return;
            released = true;
            for (const send of responses) send(true);
            responses.clear();
        },
    };
    return {
        controller,
        hold: () => {
            arrived = true;
            for (const finish of arrivals) finish();
            const response = Promise.withResolvers<boolean>();
            const send = (allowed: boolean) => {
                responses.delete(send);
                response.resolve(allowed);
            };
            if (closed || released) send(!closed);
            else responses.add(send);
            return { promise: response.promise, cancel: () => send(false) };
        },
        close: () => {
            closed = true;
            for (const finish of arrivals) finish(closedError());
            for (const send of responses) send(false);
            responses.clear();
        },
    };
};

type Mock = {
    request: ApiRequestDescription;
    response: unknown;
    status: number;
    delay: number;
    manual?: ReturnType<typeof createManualMock>;
};

const matches = (mock: Mock, request: Request) => {
    const expected = new URL(mock.request.url);
    const actual = new URL(request.url());
    if (
        mock.request.method.toUpperCase() !== request.method() ||
        expected.origin !== actual.origin ||
        expected.pathname !== actual.pathname
    ) {
        return false;
    }
    for (const key of expected.searchParams.keys()) {
        if (
            !isDeepStrictEqual(expected.searchParams.getAll(key), actual.searchParams.getAll(key))
        ) {
            return false;
        }
    }
    const headers = request.headers();
    for (const [name, value] of Object.entries(mock.request.headers)) {
        if (headers[name.toLowerCase()] !== value) return false;
    }
    const body = mock.request.body;
    if (body === undefined || body instanceof FormData) return true;
    if (typeof body === 'string') return body === request.postData();
    try {
        return isDeepStrictEqual(body, request.postDataJSON());
    } catch {
        return false;
    }
};

const requestPage = (request: Request): Page | undefined => {
    try {
        return request.frame().page();
    } catch (error) {
        // The first popup navigation has no frame until its response is delivered.
        // It is still covered by context request-failure and disposal handling.
        if (
            request.isNavigationRequest() &&
            error instanceof Error &&
            error.message.startsWith('Frame for this navigation request is not available')
        ) {
            return undefined;
        }
        throw error;
    }
};

export const installMockApi = async (context: BrowserContext, apiURL: ApiURL) => {
    const mocks: Mock[] = [];
    const unexpectedRequests: string[] = [];
    let disposed = false;
    const active = new Map<Request, VoidFunction>();
    const pages = new Map<Page, { requests: Set<VoidFunction>; close: VoidFunction }>();
    const failed = (request: Request) => active.get(request)?.();
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        for (const cancel of active.values()) cancel();
        for (const mock of mocks) mock.manual?.close();
        mocks.length = 0;
        for (const [page, entry] of pages) page.off('close', entry.close);
        pages.clear();
        active.clear();
        context.off('requestfailed', failed);
        context.off('close', dispose);
    };
    context.on('requestfailed', failed);
    context.on('close', dispose);
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    };
    const mockApi = (async <T extends ApiMethod>(api: T, options: MockOptions<T>) => {
        if (disposed) throw new Error('Mock API context is closed');
        if (typeof api.describeRequest !== 'function') {
            throw new Error('mockApi expects an API method exposing describeRequest');
        }
        const request = api.describeRequest(options.params as never, options.transport as never);
        const url = new URL(request.url).href;
        const manual =
            options.delay === 'manual' ? createManualMock({ ...request, url }) : undefined;
        mocks.push({
            request: { ...request, url },
            response: options.response,
            status: options.status ?? 200,
            delay: typeof options.delay === 'number' ? options.delay : 0,
            manual,
        });
        return manual?.controller;
    }) as MockApi;
    await context.route(apiURL, async (route) => {
        const request = route.request();
        if (disposed) {
            await route.abort('aborted');
            return;
        }
        if (request.method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: cors });
            return;
        }
        const mock = mocks.findLast((candidate) => matches(candidate, request));
        if (!mock) {
            unexpectedRequests.push(`${request.method()} ${request.url()}`);
            await route.abort('blockedbyclient');
            return;
        }
        if (mock.manual) {
            const page = requestPage(request);
            const held = mock.manual.hold();
            let cancelled = false;
            const cancel = () => {
                cancelled = true;
                held.cancel();
            };
            let entry = page ? pages.get(page) : undefined;
            if (page && !entry) {
                const requests = new Set<VoidFunction>();
                entry = {
                    requests,
                    close: () => {
                        for (const cancelRequest of requests) cancelRequest();
                    },
                };
                pages.set(page, entry);
                page.on('close', entry.close);
            }
            entry?.requests.add(cancel);
            active.set(request, cancel);
            try {
                const send = await held.promise;
                if (!send || cancelled || request.failure() || page?.isClosed()) {
                    if (request.failure() || page?.isClosed()) {
                        // The browser has already ended this request. Finish local route handling
                        // without sending another command to a potentially destroyed popup target.
                        await route.fallback();
                    } else {
                        // Disposal must still cancel requests whose browser target is alive.
                        await route.abort('aborted');
                    }
                    return;
                }
                await route.fulfill({
                    status: mock.status,
                    headers: cors,
                    contentType: 'application/json',
                    body: mock.status === 204 ? undefined : JSON.stringify(mock.response),
                });
            } finally {
                active.delete(request);
                entry?.requests.delete(cancel);
                if (page && entry?.requests.size === 0) {
                    page.off('close', entry.close);
                    pages.delete(page);
                }
            }
            return;
        }
        if (mock.delay) await new Promise((resolve) => setTimeout(resolve, mock.delay));
        await route.fulfill({
            status: mock.status,
            headers: cors,
            contentType: 'application/json',
            body: mock.status === 204 ? undefined : JSON.stringify(mock.response),
        });
    });
    return { mockApi, unexpectedRequests, dispose };
};
