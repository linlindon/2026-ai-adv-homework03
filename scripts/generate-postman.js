const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const openapiPath = path.join(rootDir, 'openapi.json');
const outputDir = path.join(rootDir, 'postman');
const outputPath = path.join(outputDir, 'flower-shop.postman_collection.json');
const spec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

function exampleFromSchema(schema = {}) {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === 'object' || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties || {}).map(([key, value]) => [key, exampleFromSchema(value)])
    );
  }
  if (schema.type === 'array') return [exampleFromSchema(schema.items)];
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum || 1;
  if (schema.type === 'boolean') return false;
  if (schema.format === 'email') return 'user@example.com';
  return 'string';
}

function hasSecurity(operation, schemeName) {
  const security = operation.security ?? spec.security ?? [];
  return security.some(requirement => Object.prototype.hasOwnProperty.call(requirement, schemeName));
}

function buildRequest(pathname, method, operation) {
  const postmanPath = pathname.replace(/\{([^}]+)\}/g, ':$1');
  const query = (operation.parameters || [])
    .filter(parameter => parameter.in === 'query')
    .map(parameter => {
      const schema = parameter.schema || {};
      const value = parameter.example ?? schema.example ?? schema.default ?? exampleFromSchema(schema);
      return `${parameter.name}=${encodeURIComponent(String(value))}`;
    });
  const url = `{{baseUrl}}${postmanPath}${query.length ? `?${query.join('&')}` : ''}`;
  const headers = [];
  const request = {
    method: method.toUpperCase(),
    header: headers,
    url,
    description: operation.description || operation.summary || '',
    auth: hasSecurity(operation, 'bearerAuth')
      ? { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] }
      : { type: 'noauth' },
  };

  if (hasSecurity(operation, 'sessionId')) {
    headers.push({ key: 'X-Session-Id', value: '{{sessionId}}', type: 'text' });
  }

  const jsonBody = operation.requestBody?.content?.['application/json'];
  if (jsonBody) {
    headers.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(jsonBody.example ?? exampleFromSchema(jsonBody.schema), null, 2),
      options: { raw: { language: 'json' } },
    };
  }

  return request;
}

const folders = new Map();
for (const [pathname, pathItem] of Object.entries(spec.paths || {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem[method];
    if (!operation) continue;
    const tag = operation.tags?.[0] || 'Other';
    if (!folders.has(tag)) folders.set(tag, []);

    const item = {
      name: operation.summary || `${method.toUpperCase()} ${pathname}`,
      request: buildRequest(pathname, method, operation),
      response: [],
    };

    if (method === 'post' && pathname === '/api/auth/login') {
      item.event = [{
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            'const response = pm.response.json();',
            'if (response?.data?.token) {',
            "  pm.collectionVariables.set('token', response.data.token);",
            '}',
          ],
        },
      }];
    }
    folders.get(tag).push(item);
  }
}

const collection = {
  info: {
    name: `${spec.info?.title || 'Flower Shop API'} - Postman Collection`,
    description: spec.info?.description || '',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [...folders.entries()].map(([name, item]) => ({ name, item })),
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3001', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'sessionId', value: 'postman-guest-session', type: 'string' },
  ],
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);
JSON.parse(fs.readFileSync(outputPath, 'utf8'));
console.log(`Postman Collection generated: ${path.relative(rootDir, outputPath)}`);
