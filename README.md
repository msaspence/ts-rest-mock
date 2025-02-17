# ts-rest-mock

ts-rest-mock is a TypeScript library for creating mock servers based on your ts-rest API contracts using Mock Service Worker (MSW) and Zod schema generation. This is handy for testing and developing applications without needing a real backend.

## Installation

To use ts-rest-mock in your project, first install it along with its peer dependencies:

```
npm install --save-dev ts-rest-mock @anatine/zod-mock @faker-js/faker msw zod
```

## Usage

### Setting Up a Mock Server

To set up a mock server with `mockTsRest`, you should have defined your application router using @ts-rest/core. Here's how you can set it up:

```
import { mockTsRest } from 'ts-rest-mock';
import { myAppRouter } from './api/contracts'; // Your application router

const server = mockTsRest(
  'http://localhost:3000',
  myAppRouter
);

// Optionally set up additional request handlers
server.msw.use(
  // Custom MSW handlers can be used here
);

// To stop the server when needed
server.close();
```

### Making Mock Requests

You can create endpoints for different HTTP methods (GET, POST, PUT, DELETE, PATCH) as per your API contracts:

```
// Example: Mocking a GET request
server.get('/users', 200, {
  login: 'msaspence',
});

// Example: Mocking a POST request
server.post('/users', 201, { login: 'msaspence' });
```

Custom Response Logic
You can provide custom logic in your resolver (which can be async if needed):

```
server.post('/users', 201, (info, defaultResponse) => {
  // You can modify the response based on request info
  const responseData = {
    ...defaultResponse,
    extraField: 'value',
  };
  return responseData;
});
```

### Validations

The request and response bodies are validated against the Zod schemas defined in your API contracts.

### BodySchemaNotZodObjectError: Thrown if a response body schema is not a Zod object.

## Example

Here's a simple example demonstrating how to set up a mock server:

```
import { AppRouter } from '@ts-rest/core';
import { mockTsRest } from 'ts-rest-mock';

// Define your API routes
const router: AppRouter = {
  users: {
    method: 'GET',
    path: '/users',
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
        })
      ),
    },
  },
};

// Create a mock server
const { get, close } = mockTsRest('http://localhost:3000', router);

get('/users', 200, [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
]);

// Use the server in your tests...

// Close the server when tests are done
close();
```
