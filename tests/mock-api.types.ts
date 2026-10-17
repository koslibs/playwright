import { type MockApi } from '../dist/mock-api/index.js';

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
