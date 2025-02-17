import { generateMock } from '@anatine/zod-mock';
import { faker } from '@faker-js/faker';
import {
  AppRoute,
  AppRouteMutation,
  AppRouteQuery,
  AppRouter,
  ContractNoBody,
  ContractNoBodyType,
  ErrorHttpStatusCode,
} from '@ts-rest/core';
import {
  http,
  HttpHandler,
  HttpResponse,
  RequestHandlerOptions,
  ResponseResolver,
} from 'msw';
import { setupServer, SetupServerApi } from 'msw/node';
import * as z from 'zod';
import { ZodObject, ZodSchema, ZodType } from 'zod';

/**
 * This function creates a mock server for the given contracts.
 *
 * The types in here will melt your brain. You have been warned!
 **/
export function mockTsRest<TAppRouter extends AppRouter>(
  host: string,
  ...contracts: TAppRouter[]
) {
  const server = setupServer();
  contracts.forEach((contract) => {
    server.use(...mockRouter(host, contract));
  });
  server.listen();
  type TAppRoute = GetAppRoutes<TAppRouter>;
  // eslint-disable-next-line jest/require-top-level-describe

  return {
    msw: {
      server,
      http,
    },
    use(...handlers: HttpHandler[]) {
      server.use(...handlers);
    },
    close: () => server.close(),

    get: makeRestfulFunction<TAppRoute, 'get'>(host, contracts, server, 'get'),
    post: makeRestfulFunction<TAppRoute, 'post'>(
      host,
      contracts,
      server,
      'post'
    ),
    delete: makeRestfulFunction<TAppRoute, 'delete'>(
      host,
      contracts,
      server,
      'delete'
    ),
    put: makeRestfulFunction<TAppRoute, 'put'>(host, contracts, server, 'put'),
    patch: makeRestfulFunction<TAppRoute, 'patch'>(
      host,
      contracts,
      server,
      'patch'
    ),
  };
}

type MutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Method = 'GET' | MutationMethod;
type GetAppRoutes<TAppRouter extends AppRouter> = {
  [K in keyof TAppRouter]: TAppRouter[K] extends AppRoute
    ? TAppRouter[K]
    : TAppRouter[K] extends AppRouter
    ? GetAppRoutes<TAppRouter[K]>
    : never;
}[keyof TAppRouter];

type GetPath<
  TAppRoute extends AppRoute,
  TMethod extends Method
> = TAppRoute extends {
  method: TMethod;
}
  ? TAppRoute['path']
  : never;

type GetStatus<
  TAppRoute extends AppRoute,
  TMethod extends Method,
  TPath extends string
> =
  | UnionKeys<GetResponses<FilterRoute<TAppRoute, TMethod, TPath>>>
  | ErrorHttpStatusCode;
type UnionKeys<T> = T extends object ? keyof T : never;

type FilterRoute<
  TAppRoute extends { path: string; method: Method },
  TMethod extends Method,
  TPath extends string
> = TAppRoute extends { method: TMethod }
  ? TAppRoute extends { path: TPath }
    ? TAppRoute
    : TPath extends string
    ? TAppRoute extends { path: string }
      ? string extends TPath
        ? TAppRoute
        : TPath extends string
        ? TAppRoute
        : never
      : never
    : never
  : never;
// TAppRoute['path'] is string and TPath is not string
type GetResponses<TAppRoute extends AppRoute> = TAppRoute['responses'];
type GetResponse<
  TAppRoute extends AppRoute,
  TMethod extends Method,
  TPath extends string,
  TStatus extends number
> = GetResponses<FilterRoute<TAppRoute, TMethod, TPath>>[TStatus];

type GetResponseSchema<
  TAppRoute extends AppRoute,
  TMethod extends Method,
  TPath extends string,
  TStatus extends number
> = GetResponse<TAppRoute, TMethod, TPath, TStatus>;

type GetBodyFromSchema<TSchema> = TSchema extends z.ZodType
  ? z.infer<TSchema>
  : TSchema extends ContractNoBodyType
  ? undefined
  : never;

type GetResponseBody<
  TAppRoute extends AppRoute,
  TMethod extends Method,
  TPath extends string,
  TStatus extends number
> = TStatus extends ErrorHttpStatusCode
  ? unknown
  : GetBodyFromSchema<GetResponseSchema<TAppRoute, TMethod, TPath, TStatus>>;
type GetRequestSchema<TAppRoute extends AppRoute> =
  TAppRoute extends AppRouteMutation ? TAppRoute['body'] : never;
type GetRequestBody<
  TAppRoute extends AppRoute,
  TMethod extends Method,
  TPath extends string
> = GetBodyFromSchema<GetRequestSchema<FilterRoute<TAppRoute, TMethod, TPath>>>;
type GetResolver<Request, Response> =
  | Response
  | ((
      info: Omit<Parameters<ResponseResolver>[0], 'request'> & {
        request: Omit<Parameters<ResponseResolver>[0]['request'], 'json'> & {
          json(): Promise<Request>;
        };
      },
      defaultResponse: Response
    ) => Promise<Response> | Response);

function makeRestfulFunction<
  TAppRoute extends AppRoute,
  TFuncName extends keyof typeof METHOD_MAP
>(
  host: string,
  contracts: AppRouter[],
  server: SetupServerApi,
  functionName: TFuncName
) {
  const method = METHOD_MAP[functionName];
  type TMethod = typeof method;

  return <
    TPath extends GetPath<TAppRoute, TMethod>,
    TStatus extends GetStatus<TAppRoute, TMethod, TPath>
  >(
    path: TPath,
    status: TStatus,
    resolver: GetResolver<
      GetRequestBody<TAppRoute, TMethod, TPath>,
      GetResponseBody<TAppRoute, TMethod, TPath, TStatus>
    >,
    options?: RequestHandlerOptions
  ) => {
    const schema = findResponseSchema(contracts, method, path, status);
    const defaultResponse = schema ? mockSchema(schema) : {};
    server.use(
      http[functionName](
        `${host}${path}`,
        async (info) => {
          const requestBody =
            method !== 'GET' &&
            method !== 'DELETE' &&
            (await info.request.json());
          const requestSchema =
            method !== 'GET' &&
            method !== 'DELETE' &&
            findRequestSchema(contracts, method, path);
          if (
            requestBody &&
            requestSchema &&
            typeof requestSchema === 'object' &&
            'parse' in requestSchema
          ) {
            requestSchema.parse(requestBody);
          }
          info.request.json = async () => Promise.resolve(requestBody);

          const responseMaybePromise = isCallback(resolver)
            ? resolver(info as never, defaultResponse)
            : resolver;
          const response = isPromise(responseMaybePromise)
            ? await responseMaybePromise
            : responseMaybePromise;

          if (schema === ContractNoBody) {
            return new HttpResponse(null, {
              status: 204,
            });
          }

          return HttpResponse.json(
            response as Exclude<typeof response, unknown>, // exclude unknown which is included to allow for simulation of external system errors eg load-balancers
            { status }
          );
        },
        options
      )
    );
  };
}

function isPromise<T>(
  maybePromise: T | Promise<T>
): maybePromise is Promise<T> {
  return maybePromise instanceof Promise;
}

function isCallback(maybeFunc: unknown): maybeFunc is Function {
  return typeof maybeFunc === 'function';
}

function findAppRoute(
  contracts: AppRouter[],
  method?: 'GET',
  path?: string
): AppRouteQuery;
function findAppRoute(
  contracts: AppRouter[],
  method?: MutationMethod,
  path?: string
): AppRouteMutation;
function findAppRoute(contracts: AppRouter[], method?: Method, path?: string) {
  const routes = getRoutes(...contracts);
  const route = routes.find((route) => {
    return (
      (path === undefined || route.path === path) &&
      (method === undefined || route.method === method)
    );
  });
  if (!route) {
    throw new Error(`Route not found: ${path}`);
  }
  return route;
}

function findRequestSchema(
  contracts: AppRouter[],
  method?: MutationMethod,
  path?: string
) {
  const route = findAppRoute(contracts, method, path);
  return route.body;
}

function findResponseSchema(
  contracts: AppRouter[],
  method: Method,
  path: string,
  status: number
): ZodType | undefined | ContractNoBodyType {
  const route =
    method === 'GET' // Type gymnastics
      ? findAppRoute(contracts, 'GET', path)
      : findAppRoute(contracts, method, path);
  const schema = route.responses[status];
  if (!(schema instanceof ZodSchema || schema === ContractNoBody)) {
    throw new Error(
      'Response schema must be a zod object or a ts-rest "No Body"'
    );
  }
  return schema;
}
function isRoute(item: AppRoute | AppRouter): item is AppRoute {
  return typeof item.path === 'string';
}

function mockRouter(host: string, router: AppRouter): HttpHandler[] {
  const routes = getRoutes(router);
  return routes.map((route) => {
    const method = METHOD_MAP_REVERSE[route.method];
    return http[method](`${host}${route.path}`, () => {
      const [status, schema] =
        Object.entries(route.responses).find(([status]) => {
          if (parseInt(status) < 400) return true;
        }) ?? [];
      if (!status) throw new NoSuccessResponsesError(route);

      if (schema instanceof ZodObject) {
        return HttpResponse.json(mockSchema(schema), {
          status: parseInt(status),
        });
      }
      throw new BodySchemaNotZodObjectError();
    });
  });
}
function getRoutes(...routers: AppRouter[]): AppRoute[] {
  return routers.flatMap((router) => {
    return Object.values(router).flatMap((item) =>
      isRoute(item) ? [item] : getRoutes(item)
    );
  });
}
function mockSchema<TSchema extends Parameters<typeof generateMock>[0]>(
  schema: TSchema | ContractNoBodyType
): z.infer<TSchema> | ContractNoBodyType {
  if (schema === ContractNoBody) return ContractNoBody;
  return generateMock(schema, {
    // Seed is intentionally undefined to make the mock data non-deterministic.
    // This is to prevent tests from relying on the default mock data.
    // Any data under test should be explicitly defined in the test.
    seed: undefined, // DO NOT SET A SEED
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    /* @ts-ignore - zod-mock uses the root faker version which is 7 but its not compatible, we get around this by passing in version 8, but the types don't match so until we upgrade faker globally we need to ignore this error */
    faker,
  });
}
const METHOD_MAP_REVERSE = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
} as const;

const METHOD_MAP = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
} as const;

class BodySchemaNotZodObjectError extends Error {
  constructor() {
    super('Body schema must be a zod object');
  }
}
class NoSuccessResponsesError extends Error {
  constructor(item: AppRoute) {
    super(`No success responses found for ${item.method} ${item.path}`);
  }
}
