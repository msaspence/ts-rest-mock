import { initContract } from '@ts-rest/core';
import * as z from 'zod';

import { mockTsRest } from './mockTsRest';

const c = initContract();

const contract = c.router({
  get: {
    path: '/literal-path',
    method: 'GET',
    responses: {
      404: z.object({ error: z.string() }),
      201: z.object({ literalBody: z.string() }),
    },
  },
  post: {
    path: '/post',
    method: 'POST',
    body: z.object({ postRequestBody: z.string() }),
    responses: {
      201: z.object({ postResponseBoth: z.string() }),
      202: z.object({
        postResponseBoth: z.string(),
        anotherResponse: z.string(),
      }),
      404: z.object({ error: z.string() }),
    },
  },
  string: {
    path: '/' + 'string', // Intentionally split so that it's type as `string` and not a literal
    method: 'GET',
    responses: {
      202: z.object({ stringBody: z.string() }),
      404: z.object({ error: z.string() }),
    },
  },
  nested: {
    get: {
      path: '/nested',
      method: 'GET',
      responses: {
        203: z.object({ nestedContractBody: z.string() }),
        404: z.object({ error: z.string() }),
      },
    },
    post: {
      path: '/' + 'nested-post', // Intentionally split so that it's type as `string` and not a literal
      method: 'POST',
      responses: {
        206: z.object({ nestedStringBody: z.string() }),
        402: z.object({ error: z.string() }),
      },
      body: z.object({ nestedPostRequestBody: z.string() }),
    },
  },
  deleteNoResp: {
    method: 'DELETE',
    path: `/delete-no-resp/:id`,
    pathParams: z.object({
      id: z.string(),
    }),
    body: c.noBody(),
    responses: {
      204: c.noBody(),
    },
  },
  deleteWithRep: {
    method: 'DELETE',
    path: `/delete-with-resp/:id`,
    pathParams: z.object({
      id: z.string(),
    }),
    body: c.noBody(),
    responses: {
      200: z.object({ deleteWithResponseBody: z.string() }),
    },
  },
});
const host = 'http://localhost:8000';

describe('mockTsRest', () => {
  it('return a msw server with mocked endpoints', async () => {
    expect.assertions(2);
    const { close } = mockTsRest(host, contract);
    const response = await fetch('http://localhost:8000/literal-path');
    expect(await response.json()).toMatchObject({
      literalBody: expect.stringMatching(/.+/),
    });
    expect(response.status).toBe(201);
    close();
  });

  it('can mock literal paths', async () => {
    expect.assertions(1);
    const server = mockTsRest(host, contract);
    server.get('/literal-path', 201, { literalBody: 'bar' });
    expect(
      await (await fetch('http://localhost:8000/literal-path')).json()
    ).toMatchObject({
      literalBody: 'bar',
    });
    server.close();
  });

  it('can mock a nested literal path', async () => {
    expect.assertions(1);
    const server = mockTsRest(host, contract);
    server.get('/nested', 203, { nestedContractBody: 'bar' });
    expect(
      await (await fetch('http://localhost:8000/nested')).json()
    ).toMatchObject({
      nestedContractBody: 'bar',
    });
    server.close();
  });

  it('can mock a non literal string path', async () => {
    expect.assertions(1);
    const server = mockTsRest(host, contract);
    server.get('/string', 202, {
      stringBody: 'bar',
    });
    expect(
      await (await fetch('http://localhost:8000/string')).json()
    ).toMatchObject({
      stringBody: 'bar',
    });
    server.close();
  });

  it('can mock a post request', async () => {
    expect.assertions(1);
    const server = mockTsRest(host, contract);
    server.post('/post', 201, { postResponseBoth: 'bar' });
    expect(
      await (
        await fetch('http://localhost:8000/post', {
          method: 'POST',
          body: JSON.stringify({ postRequestBody: 'bar' }),
        })
      ).json()
    ).toMatchObject({
      postResponseBoth: 'bar',
    });
    server.close();
  });

  it('can mock a nested post request', async () => {
    expect.assertions(1);
    const server = mockTsRest(host, contract);
    server.post('/nested-post', 206, { nestedStringBody: 'bar' });
    expect(
      await (
        await fetch('http://localhost:8000/nested-post', {
          method: 'POST',
          body: JSON.stringify({ nestedPostRequestBody: 'bar' }),
        })
      ).json()
    ).toMatchObject({
      nestedStringBody: 'bar',
    });
    server.close();
  });

  it('can mock a response with a function', async () => {
    expect.assertions(1);
    const server = mockTsRest(host, contract);
    server.post('/post', 201, async ({ request: { json } }) => {
      const request = await json();
      const response =
        // mockTsRest host, can't determine that this mock won't match with the
        // '/' + 'nested-post' (since that evaluates to `string` which '/post' might match)
        // so we have to check the type of the request
        'postRequestBody' in request && request.postRequestBody;
      return { postResponseBoth: response || 'never' };
    });
    expect(
      await (
        await fetch('http://localhost:8000/post', {
          method: 'POST',
          body: JSON.stringify({ postRequestBody: 'my posted value' }),
        })
      ).json()
    ).toMatchObject({
      postResponseBoth: 'my posted value',
    });
    server.close();
  });

  it('can receive default mock data for the overridden response', async () => {
    expect.assertions(1);
    const server = mockTsRest(host, contract);
    server.post('/post', 202, (_, defaultResponse) => {
      return {
        ...defaultResponse,
        postResponseBoth: 'overridden',
      };
    });
    expect(
      await (
        await fetch('http://localhost:8000/post', {
          method: 'POST',
          body: JSON.stringify({ postRequestBody: 'my posted value' }),
        })
      ).json()
    ).toMatchObject({
      postResponseBoth: 'overridden',
      anotherResponse: expect.any(String),
    });
    server.close();
  });

  it('can mock a delete request with no response body', async () => {
    expect.assertions(4);
    const server = mockTsRest(host, contract);
    const id = 'item-id';

    const deleteSpy = jest.fn((_info: { request: Request }) => {
      return undefined;
    });

    server.delete(`/delete-no-resp/:id`, 204, deleteSpy);

    const result = await fetch(`http://localhost:8000/delete-no-resp/${id}`, {
      method: 'DELETE',
    });
    const blob = await result.blob();
    const request = deleteSpy.mock.calls[0][0].request;

    expect(blob.type).toBe('');
    expect(blob.size).toBe(0);
    expect(request).toBeInstanceOf(Request);
    expect(new URL(request.url).pathname).toBe('/delete-no-resp/item-id');
    server.close();
  });

  it('can mock a delete request with a response body', async () => {
    expect.assertions(3);
    const server = mockTsRest(host, contract);
    const id = 'item-id';

    const deleteSpy = jest.fn((_info: { request: Request }) => {
      return { deleteWithResponseBody: 'good response' };
    });

    server.delete(`/delete-with-resp/:id`, 200, deleteSpy);

    const result = await fetch(`http://localhost:8000/delete-with-resp/${id}`, {
      method: 'DELETE',
    });
    const json = await result.json();
    const request = deleteSpy.mock.calls[0][0].request;

    expect(json).toMatchObject({ deleteWithResponseBody: 'good response' });
    expect(request).toBeInstanceOf(Request);
    expect(new URL(request.url).pathname).toBe('/delete-with-resp/item-id');
    server.close();
  });
});
