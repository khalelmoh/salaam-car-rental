const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Salaam Car Rental API',
    version: '1.0.0',
    description: 'Core API for authentication, fleet, bookings, finance, and settings.',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'UUID' },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          error: { type: 'string' },
          details: { nullable: true },
          requestId: { type: 'string', nullable: true },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate user and create session',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Authenticated' },
          401: {
            description: 'Invalid credentials',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/dashboard': {
      get: {
        tags: ['Dashboard'],
        security: [{ bearerAuth: [] }],
        summary: 'Get dashboard KPIs and chart data',
        responses: {
          200: { description: 'Dashboard payload' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/reports/finance': {
      get: {
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        summary: 'Get finance report with summary and optional transaction details',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'includeDetails', in: 'query', schema: { type: 'boolean' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500 } },
        ],
        responses: {
          200: { description: 'Finance report payload' },
          400: { description: 'Validation error' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/reports/customers': {
      get: {
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        summary: 'Get customer report (all customers summary or a single customer with booking details)',
        parameters: [
          { name: 'customerId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500 } },
        ],
        responses: { 200: { description: 'Customer report payload' } },
      },
    },
    '/reports/fleet': {
      get: {
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        summary: 'Get fleet report with bookings and revenue by car',
        parameters: [
          { name: 'carId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500 } },
        ],
        responses: { 200: { description: 'Fleet report payload' } },
      },
    },
    '/reports/presets': {
      get: {
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        summary: 'List saved report presets for the current user',
        responses: { 200: { description: 'Preset list' } },
      },
      post: {
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        summary: 'Create report preset',
        responses: { 201: { description: 'Preset created' } },
      },
    },
    '/reports/jobs': {
      post: {
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        summary: 'Queue an async report generation job',
        responses: { 202: { description: 'Job accepted' } },
      },
    },
    '/reports/jobs/{id}': {
      get: {
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        summary: 'Get async report job status/result',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Job status' } },
      },
    },
    '/cars': {
      get: { tags: ['Cars'], security: [{ bearerAuth: [] }], summary: 'List cars', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Cars'], security: [{ bearerAuth: [] }], summary: 'Create car', responses: { 201: { description: 'Created' } } },
    },
    '/bookings': {
      get: { tags: ['Bookings'], security: [{ bearerAuth: [] }], summary: 'List bookings', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Bookings'], security: [{ bearerAuth: [] }], summary: 'Create booking', responses: { 201: { description: 'Created' } } },
    },
    '/transactions': {
      get: { tags: ['Finance'], security: [{ bearerAuth: [] }], summary: 'List transactions', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Finance'], security: [{ bearerAuth: [] }], summary: 'Create transaction', responses: { 201: { description: 'Created' } } },
    },
    '/settings': {
      get: { tags: ['Settings'], security: [{ bearerAuth: [] }], summary: 'Get settings', responses: { 200: { description: 'OK' } } },
      put: { tags: ['Settings'], security: [{ bearerAuth: [] }], summary: 'Update settings', responses: { 200: { description: 'Updated' } } },
    },
  },
};

export function openApiJson(_req, res) {
  res.json(openApiSpec);
}

export function docsUi(_req, res) {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Salaam API Docs</title>
    <style>body{margin:0;padding:0;font-family:Arial,sans-serif} redoc{display:block;height:100vh}</style>
  </head>
  <body>
    <redoc spec-url="/api/openapi.json"></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"></script>
  </body>
</html>`;
  res.type('html').send(html);
}
