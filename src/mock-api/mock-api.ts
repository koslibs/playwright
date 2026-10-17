import { isDeepStrictEqual } from 'node:util';

import { type BrowserContext, type Request } from '@playwright/test';

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
    delay?: number;
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

export type MockApi = <T extends ApiMethod>(
    api: T,
    options: MockOptions<NoInfer<T>>
) => Promise<void>;
export type ApiURL = Parameters<BrowserContext['route']>[0];

type Mock = {
    request: ApiRequestDescription;
    response: unknown;
    status: number;
    delay: number;
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

export const installMockApi = async (context: BrowserContext, apiURL: ApiURL) => {
    const mocks: Mock[] = [];
    const unexpectedRequests: string[] = [];
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    };
    const mockApi: MockApi = async (api, options) => {
        if (typeof api.describeRequest !== 'function') {
            throw new Error('mockApi expects an API method exposing describeRequest');
        }
        const request = api.describeRequest(options.params as never, options.transport as never);
        const url = new URL(request.url).href;
        mocks.push({
            request: { ...request, url },
            response: options.response,
            status: options.status ?? 200,
            delay: options.delay ?? 0,
        });
    };
    await context.route(apiURL, async (route) => {
        const request = route.request();
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
        if (mock.delay) await new Promise((resolve) => setTimeout(resolve, mock.delay));
        await route.fulfill({
            status: mock.status,
            headers: cors,
            contentType: 'application/json',
            body: mock.status === 204 ? undefined : JSON.stringify(mock.response),
        });
    });
    return { mockApi, unexpectedRequests };
};
