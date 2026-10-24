import {
    type ManualMockController,
    type MockApi,
    type MockOptions,
} from '../dist/mock-api/index.js';

import manualProfiles from './browser/mock/manual-delay/profiles-active-200.json' with { type: 'json' };
import profile from './fixtures/profile.json' with { type: 'json' };

const request = { url: 'https://api.example.test/items', method: 'GET', headers: {} };
const read = Object.assign(async (_params: { id: number }) => ({ data: { name: '' } }), {
    describeRequest: (_params: { id: number }) => request,
});
const extended = Object.assign(
    async (_params: { id: number }, _transport: { trace: string }) => ({ data: { name: '' } }),
    {
        describeRequest: (_params: { id: number }, _transport: { trace: string }) => request,
    }
);

type Profile = {
    name: string;
    avatar: 'web-orange' | 'teal';
    status: 'active' | 'archived' | null;
    counters: { hands: number };
    history: { state: 'queued' | 'completed'; attempts: number }[];
    enabled: boolean;
};

const profiles = Object.assign(
    async (_params: { status: 'active' | 'archived' }) => ({
        data: [] as Profile[],
    }),
    {
        describeRequest: (_params: { status: 'active' | 'archived' }) => request,
    }
);

const literals = Object.assign(
    async (_params: {}) => ({
        data: null as unknown as {
            kind: 'profile';
            nullable: 'fixed' | null;
            code: 200 | 201;
            enabled: true;
            mixed: 'active' | 'archived' | 0;
            tuple: readonly [state: 'queued' | 'completed', attempts: number];
        },
    }),
    {
        describeRequest: (_params: {}) => request,
    }
);

export const checkTypes = async (mockApi: MockApi) => {
    await mockApi(read, { params: { id: 1 }, response: { name: 'OK' } });
    await mockApi(extended, {
        params: { id: 1 },
        transport: { trace: 'test' },
        response: { name: 'OK' },
    });
    // @ts-expect-error params are inferred from the API method
    await mockApi(read, { params: { id: 'invalid' }, response: { name: 'OK' } });
    // @ts-expect-error a success payload must match the API response
    await mockApi(read, { params: { id: 1 }, response: [] });
    // @ts-expect-error required transport parameters remain required
    await mockApi(extended, { params: { id: 1 }, response: { name: 'OK' } });
    await mockApi(read, { params: { id: 1 }, response: { code: 'UNAVAILABLE' }, status: 503 });
};

type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const exact = <T extends true>(_value: T) => {};

export const checkManualTypes = async (mockApi: MockApi, delay: number | 'manual') => {
    const manual = await mockApi(profiles, {
        params: { status: 'active' },
        response: manualProfiles,
        delay: 'manual',
    });
    const normal = await mockApi(profiles, {
        params: { status: 'active' },
        response: manualProfiles,
    });
    const numeric = await mockApi(profiles, {
        params: { status: 'active' },
        response: manualProfiles,
        delay: 10,
    });
    const dynamic = await mockApi(profiles, {
        params: { status: 'active' },
        response: manualProfiles,
        delay,
    });
    const options: MockOptions<typeof profiles> = {
        params: { status: 'active' },
        response: manualProfiles,
        delay,
    };
    const _broad = await mockApi(profiles, options);

    exact<Equal<typeof manual, ManualMockController>>(true);
    exact<Equal<typeof normal, void>>(true);
    exact<Equal<typeof numeric, void>>(true);
    exact<Equal<typeof dynamic, void | ManualMockController>>(true);
    exact<Equal<typeof _broad, void | ManualMockController>>(true);
    exact<Equal<ReturnType<typeof manual.release>, void>>(true);
    exact<Equal<ReturnType<typeof manual.waitForRequest>, Promise<void>>>(true);
    await manual.waitForRequest({ timeout: 25 });

    // @ts-expect-error union results must be narrowed before accessing the controller
    dynamic.release();
    // @ts-expect-error ordinary calls do not return a controller
    normal.release();
    // @ts-expect-error numeric calls do not return a controller
    numeric.release();
    // @ts-expect-error timeout must be numeric
    await manual.waitForRequest({ timeout: '25' });
    // @ts-expect-error required transport parameters remain required for manual calls
    await mockApi(extended, { params: { id: 1 }, response: { name: 'OK' }, delay: 'manual' });
    await mockApi(extended, {
        params: { id: 1 },
        transport: { trace: 'test' },
        response: { name: 'OK' },
        delay: 'manual',
    });
    await mockApi(extended, {
        params: { id: 1 },
        // @ts-expect-error transport fields remain strict
        transport: { trace: 1 },
        response: { name: 'OK' },
        delay: 'manual',
    });
    await mockApi(profiles, {
        // @ts-expect-error manual parameters retain request string unions
        params: { status: profile.status },
        response: manualProfiles,
        delay: 'manual',
    });
    // @ts-expect-error a manual success response must match the API response
    await mockApi(read, { params: { id: 1 }, response: [], delay: 'manual' });
    await mockApi(read, {
        params: { id: 1 },
        response: { name: 'OK' },
        // @ts-expect-error unsupported statuses remain invalid
        status: 418,
        delay: 'manual',
    });
    // @ts-expect-error arbitrary strings are not delay modes
    await mockApi(read, { params: { id: 1 }, response: { name: 'OK' }, delay: 'automatic' });
};

export const checkJsonResponseTypes = async (mockApi: MockApi) => {
    for (const delay of [undefined, 'manual'] as const) {
        await mockApi(profiles, { delay, params: { status: 'active' }, response: [profile] });
        await mockApi(profiles, {
            delay,
            params: { status: 'active' },
            response: [{ ...profile, status: null }],
        });
        // Union values are intentionally not validated after widening.
        await mockApi(profiles, {
            delay,
            params: { status: 'active' },
            response: [{ ...profile, avatar: 'any-json-string' }],
        });
        // @ts-expect-error request string unions must remain strict
        await mockApi(profiles, { delay, params: { status: profile.status }, response: [profile] });
        // @ts-expect-error numeric response fields must remain numbers
        await mockApi(profiles, {
            delay,
            params: { status: 'active' },
            response: [{ ...profile, counters: { hands: '42' } }],
        });
        // @ts-expect-error boolean response fields must remain booleans
        await mockApi(profiles, {
            delay,
            params: { status: 'active' },
            response: [{ ...profile, enabled: 'true' }],
        });
        // @ts-expect-error string unions must not accept numbers
        await mockApi(profiles, {
            delay,
            params: { status: 'active' },
            response: [{ ...profile, avatar: 1 }],
        });
        // @ts-expect-error required response fields must stay required
        await mockApi(profiles, {
            delay,
            params: { status: 'active' },
            response: [{ name: 'missing fields' }],
        });
        // @ts-expect-error arrays of objects must retain their element shape
        await mockApi(profiles, {
            delay,
            params: { status: 'active' },
            response: [{ ...profile, history: ['completed'] }],
        });
        // @ts-expect-error nested array fields must retain numeric types
        await mockApi(profiles, {
            delay,
            params: { status: 'active' },
            response: [{ ...profile, history: [{ state: 'completed', attempts: '1' }] }],
        });

        const response = {
            kind: 'profile',
            nullable: 'fixed',
            code: 200,
            enabled: true,
            mixed: 0,
            tuple: ['queued', 1],
        } as const;
        await mockApi(literals, { delay, params: {}, response });
        await mockApi(literals, {
            delay,
            params: {},
            response: {
                ...response,
                nullable: null,
                mixed: profile.status,
                tuple: [profile.status, 1],
            },
        });
        // @ts-expect-error single string literals must not widen
        await mockApi(literals, {
            delay,
            params: {},
            response: { ...response, kind: profile.status },
        });
        // @ts-expect-error a single string literal plus null is not a string union
        await mockApi(literals, {
            delay,
            params: {},
            response: { ...response, nullable: profile.status },
        });
        // @ts-expect-error numeric literal unions must not widen
        await mockApi(literals, { delay, params: {}, response: { ...response, code: 500 } });
        // @ts-expect-error boolean literals must not widen
        await mockApi(literals, { delay, params: {}, response: { ...response, enabled: false } });
        // @ts-expect-error widening string members must preserve the numeric union member
        await mockApi(literals, { delay, params: {}, response: { ...response, mixed: 1 } });
        // @ts-expect-error tuple fields must retain their non-string types
        await mockApi(literals, {
            delay,
            params: {},
            response: { ...response, tuple: [profile.status, '1'] },
        });
    }
};
