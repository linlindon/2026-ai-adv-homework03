process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-only-secret';
process.env.DATABASE_PATH = ':memory:';
